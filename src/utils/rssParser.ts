import { Article, FeedSource, FilterRule } from '../db/database';
import { generateUniqueId, validateDate, logDateIssue } from './helpers';
import { shouldArticleBeHidden } from './filterUtils';

// 日志控制开关
const LOG_CONFIG = {
  ENABLE_FEED_LOGS: false,    // 订阅源获取的日志
  ENABLE_ARTICLE_LOGS: false, // 文章处理的日志
  ENABLE_DATE_LOGS: false,    // 日期处理的日志
  ENABLE_ERROR_LOGS: true,    // 错误日志（始终建议开启）
  ENABLE_JIEMODUI_LOGS: false, // 芥末堆特定的日志
  ENABLE_WARN_LOGS: false,    // 警告日志
};

// 封装日志函数，根据配置决定是否输出
const log = {
  feed: (message: string) => {
    if (LOG_CONFIG.ENABLE_FEED_LOGS) console.log(message);
  },
  article: (message: string) => {
    if (LOG_CONFIG.ENABLE_ARTICLE_LOGS) console.log(message);
  },
  date: (message: string) => {
    if (LOG_CONFIG.ENABLE_DATE_LOGS) console.log(message);
  },
  jiemodui: (message: string) => {
    if (LOG_CONFIG.ENABLE_JIEMODUI_LOGS) console.log(message);
  },
  error: (message: string, error?: any) => {
    if (LOG_CONFIG.ENABLE_ERROR_LOGS) {
      if (error) console.error(message, error);
      else console.error(message);
    }
  },
  warn: (message: string) => {
    if (LOG_CONFIG.ENABLE_WARN_LOGS) console.warn(message);
  }
};

// RSS解析器实例现在位于主进程

/**
 * 网站特定的日期处理规则
 * 可以根据需要扩展此对象，为特定网站添加自定义规则
 */
const siteSpecificDateRules: Record<string, {
  dateExtractors?: ((item: any) => Date | null)[],
  idGenerator?: (item: any, feedUrl: string) => string,
  useOriginalDate?: boolean // 是否优先使用原始日期（即使看起来不正确）
}> = {
  // 芥末堆特殊处理
  'jiemodui.com': {
    idGenerator: (item, feedUrl) => {
      const titleHash = item.title ? item.title.replace(/\s+/g, '') : '';
      const linkHash = item.link ? item.link.replace(/https?:\/\//, '').replace(/www\./, '') : '';
      return `jiemodui_${titleHash}_${linkHash}`;
    },
    // 添加芥末堆特定的日期提取器
    dateExtractors: [
      // 尝试从链接中提取日期（如果有）
      (item: any): Date | null => {
        if (!item.link) return null;
        
        // 尝试匹配链接中的日期格式，例如 /YYYY/MM/DD/ 或类似模式
        const match = item.link.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
        if (match) {
          const year = parseInt(match[1], 10);
          const month = parseInt(match[2], 10) - 1; // 月份从0开始
          const day = parseInt(match[3], 10);
          
          const date = new Date(year, month, day);
          if (isValidReasonableDate(date)) {
            // console.log(`[RSS Parser] 从芥末堆链接中提取到日期: ${date.toISOString()} 对于文章: ${item.title}`);
            return date;
          }
        }
        return null;
      },
      // 尝试从内容中提取日期
      (item: any): Date | null => {
        const content = item.contentEncoded || item.content || item.description;
        if (!content) return null;
        
        // 芥末堆文章通常在内容开头有日期，格式如 "2023年06月30日"
        const match = content.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (match) {
          const year = parseInt(match[1], 10);
          const month = parseInt(match[2], 10) - 1;
          const day = parseInt(match[3], 10);
          
          const date = new Date(year, month, day);
          if (isValidReasonableDate(date)) {
            // console.log(`[RSS Parser] 从芥末堆内容中提取到日期: ${date.toISOString()} 对于文章: ${item.title}`);
            return date;
          }
        }
        return null;
      }
    ],
    // 设置为false，因为芥末堆的原始日期格式有问题
    useOriginalDate: false
  },
  // 可以添加更多网站的特殊规则
};

/**
 * 检查日期是否合理有效
 * @param date 日期对象
 * @returns 日期是否有效且合理
 */
const isValidReasonableDate = (date: Date): boolean => {
  const validation = validateDate(date);
  return validation.isValid;
};

/**
 * 通用日期提取函数集合
 * 按优先级排序，从高到低
 */
const dateExtractors = [
  // 1. 从原始日期字段提取
  (item: any): Date | null => {
    const rawDate = item.pubDate || item.isoDate;
    if (!rawDate) return null;
    
    const date = new Date(rawDate);
    if (isValidReasonableDate(date)) {
      // 禁用日志输出
      // console.log(`[RSS Parser] 使用有效的原始日期: ${date.toISOString()} 对于文章: ${item.title}`);
      return date;
    }
    return null;
  },
  
  // 2. 从链接中提取YYYY/MM/DD格式
  (item: any): Date | null => {
    if (!item.link) return null;
    
    const match = item.link.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 月份从0开始
      const day = parseInt(match[3], 10);
      
      const date = new Date(year, month, day);
      if (isValidReasonableDate(date)) {
        // console.log(`[RSS Parser] 从链接中提取到日期(YYYY/MM/DD): ${date.toISOString()} 对于文章: ${item.title}`);
        return date;
      }
    }
    return null;
  },
  
  // 3. 从链接中提取YYYY-MM-DD格式
  (item: any): Date | null => {
    if (!item.link) return null;
    
    const match = item.link.match(/\/(\d{4})-(\d{1,2})-(\d{1,2})\//);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      
      const date = new Date(year, month, day);
      if (isValidReasonableDate(date)) {
        // console.log(`[RSS Parser] 从链接中提取到日期(YYYY-MM-DD): ${date.toISOString()} 对于文章: ${item.title}`);
        return date;
      }
    }
    return null;
  },
  
  // 4. 从链接中提取YYYYMMDD格式
  (item: any): Date | null => {
    if (!item.link) return null;
    
    const match = item.link.match(/\/(\d{4})(\d{2})(\d{2})\//);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      
      const date = new Date(year, month, day);
      if (isValidReasonableDate(date)) {
        // console.log(`[RSS Parser] 从链接中提取到日期(YYYYMMDD): ${date.toISOString()} 对于文章: ${item.title}`);
        return date;
      }
    }
    return null;
  },
  
  // 5. 从链接中提取Unix时间戳
  (item: any): Date | null => {
    if (!item.link) return null;
    
    const match = item.link.match(/\/(\d{10,13})(\.html|\/|\?|$)/);
    if (match && match[1]) {
      const timestamp = parseInt(match[1], 10);
      // 检查是否是合理的时间戳（2000年之后，不超过现在）
      if (timestamp > 946684800) { // 2000-01-01 的时间戳
        // 根据长度判断是秒还是毫秒
        const date = new Date(timestamp < 20000000000 ? timestamp * 1000 : timestamp);
        if (isValidReasonableDate(date)) {
          // console.log(`[RSS Parser] 从链接中提取到时间戳: ${date.toISOString()} 对于文章: ${item.title}`);
          return date;
        }
      }
    }
    return null;
  },
  
  // 6. 从内容中提取中文日期格式（YYYY年MM月DD日）
  (item: any): Date | null => {
    const content = item.contentEncoded || item.content || item.description;
    if (!content) return null;
    
    const match = content.match(/(\d{4})[年\-](\d{1,2})[月\-](\d{1,2})[日\s]/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      
      const date = new Date(year, month, day);
      if (isValidReasonableDate(date)) {
        // console.log(`[RSS Parser] 从内容中提取到中文日期: ${date.toISOString()} 对于文章: ${item.title}`);
        return date;
      }
    }
    return null;
  },
  
  // 7. 从内容中提取标准日期格式（DD Month YYYY 或 Month DD, YYYY）
  (item: any): Date | null => {
    const content = item.contentEncoded || item.content || item.description;
    if (!content) return null;
    
    // 匹配 "25 December 2023" 或 "December 25, 2023" 格式
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 
                   'August', 'September', 'October', 'November', 'December'];
    const monthPattern = months.join('|');
    
    const pattern1 = new RegExp(`(\\d{1,2})\\s+(${monthPattern})\\s+(\\d{4})`, 'i');
    const pattern2 = new RegExp(`(${monthPattern})\\s+(\\d{1,2}),\\s+(\\d{4})`, 'i');
    
    let match = content.match(pattern1);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = months.findIndex(m => m.toLowerCase() === match[2].toLowerCase());
      const year = parseInt(match[3], 10);
      
      if (month !== -1) {
        const date = new Date(year, month, day);
        if (isValidReasonableDate(date)) {
          // console.log(`[RSS Parser] 从内容中提取到英文日期(格式1): ${date.toISOString()} 对于文章: ${item.title}`);
          return date;
        }
      }
    }
    
    match = content.match(pattern2);
    if (match) {
      const month = months.findIndex(m => m.toLowerCase() === match[1].toLowerCase());
      const day = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      
      if (month !== -1) {
        const date = new Date(year, month, day);
        if (isValidReasonableDate(date)) {
          // console.log(`[RSS Parser] 从内容中提取到英文日期(格式2): ${date.toISOString()} 对于文章: ${item.title}`);
          return date;
        }
      }
    }
    
    return null;
  }
];

/**
 * 检查并修复特定订阅源的日期问题
 * @param feedUrl 订阅源URL
 * @param item RSS项目
 * @param defaultDate 默认日期
 * @returns 修复后的日期对象和一个标志，表示是否使用了首次获取时间
 */
const fixFeedDateIssues = (feedUrl: string, item: any): { date: Date, isFirstFetchDate: boolean } => {
  const defaultDate = new Date();
  const siteRule = siteSpecificDateRules[new URL(feedUrl).hostname] || {};
  
  // 1. 网站特定日期提取器
  if (siteRule.dateExtractors) {
    for (const extractor of siteRule.dateExtractors) {
      try {
        const date = extractor(item);
        if (date) {
          return { date, isFirstFetchDate: false };
        }
      } catch (e) {
        if (LOG_CONFIG.ENABLE_ERROR_LOGS) {
          log.error(`网站特定日期提取器出错:`, e);
        }
      }
    }
  }
  
  // 2. 通用日期提取器
  for (const extractor of dateExtractors) {
    try {
      const date = extractor(item);
      if (date) {
        return { date, isFirstFetchDate: false };
      }
    } catch (e) {
      if (LOG_CONFIG.ENABLE_ERROR_LOGS) {
        log.error(`日期提取器出错:`, e);
      }
    }
  }
  
  // 如果所有方法都失败，使用当前日期，但标记为首次获取时间
  if (LOG_CONFIG.ENABLE_ERROR_LOGS) {
    log.error(`无法提取日期，使用首次获取时间: ${item.title}`);
  }
  return { date: defaultDate, isFirstFetchDate: true };
};

/**
 * 为文章生成唯一ID
 * @param item RSS项目
 * @param feedSource 订阅源信息
 * @returns 唯一ID
 */
const generateArticleId = (item: any, feedSource: FeedSource): string => {
  // 检查是否有特定网站的ID生成规则
  const siteRule = Object.entries(siteSpecificDateRules).find(([domain]) => 
    feedSource.url.includes(domain))?.[1];
  
  if (siteRule?.idGenerator) {
    const id = siteRule.idGenerator(item, feedSource.url);
    // 禁用日志输出
    // console.log(`[RSS Parser] 使用网站特定规则生成ID: ${id}`);
    return id;
  }
  
  // 通用ID生成逻辑
  if (item.guid) {
    // 优先使用guid作为唯一标识
    return item.guid;
  } else if (item.link) {
    // 如果没有guid，使用链接作为唯一标识
    return item.link;
  } else {
    // 如果既没有guid也没有link，使用标题和源URL生成唯一标识
    return `${feedSource.url}#${item.title}`;
  }
};

/**
 * 解析单个RSS订阅源，并返回文章列表
 * @param feedSource 订阅源信息
 * @returns 解析后的文章数组
 */
export const fetchRssFeed = async (
  feedSource: FeedSource,
): Promise<Article[]> => {
  log.feed(`\n--- 开始获取订阅源: ${feedSource.title} ---`);
  log.feed(`URL: ${feedSource.url}`);

  try {
    const result = await window.electron.parseRssFeed(feedSource.url);
    if (!result || !result.success || !result.data) {
      log.error(`获取或解析失败: ${feedSource.title}`);
      return [];
    }
    const feed = result.data;

    log.feed(`成功获取并解析: ${feedSource.title}，找到 ${feed.items.length} 篇文章`);

    const articles: Article[] = [];
    
    // 获取该订阅源的过滤规则
    const feedRules = feedSource.filterRules || [];
    // 获取全局过滤规则（如果存在）
    let globalRules: FilterRule[] = [];
    try {
      const globalRulesJson = localStorage.getItem('global_filter_rules');
      if (globalRulesJson) {
        globalRules = JSON.parse(globalRulesJson);
      }
    } catch (error) {
      log.error('解析全局过滤规则失败:', error);
    }
    
    // 合并规则
    const combinedRules = [...feedRules, ...globalRules].filter(rule => rule.isActive);
    log.feed(`应用 ${combinedRules.length} 条过滤规则 (${feedRules.length} 条订阅源规则, ${globalRules.length} 条全局规则)`);
    
    for (const item of feed.items) {
      if (!item.title || !item.link) {
        log.warn(`文章缺少标题或链接，已跳过。标题: ${item.title}, 链接: ${item.link}`);
        continue;
      }

      const { date: publishedDate, isFirstFetchDate } = fixFeedDateIssues(feedSource.url, item);
      
      const article: Article = {
        id: generateArticleId(item, feedSource),
        title: item.title,
        url: item.link,
        author: item.author || item.creator || '',
        publishDate: publishedDate.getTime(),
        fetchDate: Date.now(),
        content: item.content || item.contentSnippet || item.contentEncoded || '',
        isRead: 'false',
        isStarred: 'false',
        sourceId: feedSource.id || '',
        isFirstFetchDate: isFirstFetchDate,
      };

      // 应用过滤规则，设置isHidden属性
      if (combinedRules.length > 0) {
        article.isHidden = shouldArticleBeHidden(article, combinedRules);
        if (article.isHidden) {
          log.feed(`文章 "${article.title.substring(0, 30)}..." 被过滤规则隐藏`);
        }
      }

      if (LOG_CONFIG.ENABLE_ARTICLE_LOGS) {
        log.article(`处理文章: ${article.title}`);
        log.article(`  - ID: ${article.id}`);
        log.article(`  - 日期: ${article.publishDate}`);
        log.article(`  - 过滤状态: ${article.isHidden ? '隐藏' : '显示'}`);
      }
      
      articles.push(article);
    }
    
    log.feed(`--- 订阅源处理完毕: ${feedSource.title} ---`);
    return articles;

  } catch (error) {
    log.error(`在 fetchRssFeed 中发生错误 (${feedSource.title}):`, error);
    return [];
  }
};

/**
 * 刷新所有订阅源
 * @param feeds
 * @param onProgress
 * @param onComplete
 */
export const refreshAllFeeds = async (
  feeds: FeedSource[],
  onProgress?: (feed: FeedSource, articles: Article[]) => void,
  onComplete?: (results: { feed: FeedSource, articles: Article[] }[]) => void
) => {
  const results: { feed: FeedSource, articles: Article[] }[] = [];
  
  for (const feed of feeds) {
    try {
      const articles = await fetchRssFeed(feed);
      results.push({ feed, articles });
      if (onProgress) {
        onProgress(feed, articles);
      }
    } catch (error) {
      log.error(`刷新订阅源 "${feed.title}" 时失败:`, error);
    }
  }

  if (onComplete) {
    onComplete(results);
  }
};

/**
 * 获取订阅源信息，用于添加新订阅源时的预览
 * @param url 订阅源URL
 * @returns 包含标题、描述等信息的对象
 */
export const getFeedInfo = async (url: string): Promise<Partial<FeedSource> | null> => {
  if (!window.electron) {
    log.error('Electron API 不可用');
    return null;
  }
  try {
    const result = await window.electron.getRssFeedInfo(url);
    if (!result || !result.success || !result.data) {
      log.error(`获取RSS源信息失败 (来自主进程): ${url}`, result?.error);
      throw new Error(result?.error || '无法获取该RSS源信息');
    }
    // 主进程返回的数据结构是 { title, url, description, icon }
    // 我们需要映射到 FeedSource 的部分字段，特别是 iconUrl
    return {
      title: result.data.title || '未命名订阅源',
      url: result.data.url || url,
      iconUrl: result.data.icon, // 主进程返回的是 icon 字段
      // description: result.data.description, // 如果需要描述也可以加上
    };
  } catch (error) {
    log.error(`调用主进程获取RSS源信息时出错: ${url}`, error);
    // @ts-ignore
    throw new Error(`无法解析该RSS源: ${error.message || error}`);
  }
};

/**
 * 输出警告信息
 * @param message 警告消息
 */
const warn = (message: string) => {
  log.warn(message);
}; 