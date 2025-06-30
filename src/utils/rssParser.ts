import { Article, FeedSource } from '../db/database';
import { generateUniqueId, validateDate, logDateIssue } from './helpers';

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
const fixFeedDateIssues = (feedUrl: string, item: any, defaultDate: Date): { date: Date, isFirstFetchDate: boolean } => {
  // 减少日志输出，只保留关键信息
  const isJiemodui = feedUrl.includes('jiemodui.com');
  const isDebugMode = isJiemodui && LOG_CONFIG.ENABLE_JIEMODUI_LOGS; // 只对芥末堆网站启用详细日志
  
  if (isDebugMode) {
    log.date(`[RSS Parser] 处理文章日期: "${item.title}", 原始日期: ${item.pubDate || item.isoDate || '无'}`);
  }
  
  // 检查是否有特定网站的规则
  const siteRule = Object.entries(siteSpecificDateRules).find(([domain]) => feedUrl.includes(domain))?.[1];
  
  // 如果网站规则指定优先使用原始日期，且原始日期存在，则直接使用
  if (siteRule?.useOriginalDate && (item.pubDate || item.isoDate)) {
    const date = new Date(item.pubDate || item.isoDate);
    if (!isNaN(date.getTime())) {
      if (isDebugMode) {
        log.date(`[RSS Parser] 根据网站规则使用原始日期: ${date.toLocaleDateString()} 对于文章: ${item.title}`);
      }
      return { date, isFirstFetchDate: false };
    }
  }
  
  // 尝试使用网站特定的日期提取器
  if (siteRule?.dateExtractors) {
    for (const extractor of siteRule.dateExtractors) {
      try {
        const date = extractor(item);
        if (date) {
          if (isDebugMode) {
            log.date(`[RSS Parser] 使用网站特定规则提取日期: ${date.toLocaleDateString()} 对于文章: ${item.title}`);
          }
          return { date, isFirstFetchDate: false };
        }
      } catch (e) {
        if (isDebugMode) {
          log.warn(`[RSS Parser] 网站特定日期提取器出错:`, e);
        }
      }
    }
  }
  
  // 尝试通用日期提取器
  for (const extractor of dateExtractors) {
    try {
      const date = extractor(item);
      if (date) {
        return { date, isFirstFetchDate: false };
      }
    } catch (e) {
      if (isDebugMode) {
        log.warn(`[RSS Parser] 日期提取器出错:`, e);
      }
    }
  }
  
  // 如果所有方法都失败，使用当前日期，但标记为首次获取时间
  if (isDebugMode) {
    log.date(`[RSS Parser] 无法提取日期，使用首次获取时间: ${item.title}`);
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
 * 获取并解析RSS源 (通过主进程)
 * @param feed 订阅源信息
 * @returns 解析后的文章列表
 */
export const fetchRssFeed = async (feedSource: FeedSource): Promise<Article[]> => {
  if (!window.electron) {
    log.error('Electron API 不可用');
    return [];
  }
  try {
    log.feed(`[RSS Parser] 开始获取订阅源: ${feedSource.url}`);
    const result = await window.electron.parseRssFeed(feedSource.url);
    if (!result || !result.success || !result.data) {
      log.error(`解析RSS源失败 (来自主进程): ${feedSource.url}`, result?.error);
      return [];
    }

    const feedData = result.data;
    log.feed(`[RSS Parser] 成功获取订阅源: ${feedSource.url}, 包含 ${feedData.items?.length || 0} 篇文章`);
    
    // 检查是否是芥末堆网站
    const isJiemodui = feedSource.url.includes('jiemodui.com');
    
    // 如果是芥末堆网站，尝试获取现有文章的日期信息
    let existingArticlesMap = new Map<string, number>();
    if (isJiemodui && feedSource.id) {
      try {
        // 使用数据库上下文获取数据库实例
        const db = await import('../db/database').then(module => module.dbInstance);
        if (db) {
          const existingArticles = await db.articles.where('sourceId').equals(feedSource.id).toArray();
          existingArticlesMap = new Map(
            existingArticles.map((article: Article) => {
              // 使用标题作为键，因为芥末堆的ID可能会变
              const titleKey = article.title.replace(/\s+/g, '');
              return [titleKey, article.publishDate];
            })
          );
          log.jiemodui(`[RSS Parser] 芥末堆: 加载了 ${existingArticlesMap.size} 篇现有文章的日期信息`);
        }
      } catch (e) {
        log.error('[RSS Parser] 获取现有芥末堆文章失败:', e);
      }
    }
    
    // 解析文章内容
    const articles: Article[] = (feedData.items || []).map((item: any) => {
      const content = item.contentEncoded || item.content || item.description || '';
      let imageUrl: string | undefined = undefined;
      if (item.media && item.media.$ && item.media.$.url) {
        imageUrl = item.media.$.url;
      } else if (item.enclosure && item.enclosure.url && item.enclosure.type?.startsWith('image/')){
        imageUrl = item.enclosure.url;
      } else if (content) {
        const imgMatch = content.match(/<img[^>]+src=['\"]([^'\">]+)['\"]/i);
        if (imgMatch && imgMatch[1]) {
          imageUrl = imgMatch[1];
        }
      }
      
      const author = item.creator || item.author || feedData.title;
      
      // 为文章生成稳定的唯一ID
      const articleUniqueIdentifier = generateArticleId(item, feedSource);
      
      // 确保 publishDate 有效
      let rawPubDate = item.pubDate || item.isoDate;
      let publishDateObj = rawPubDate ? new Date(rawPubDate) : new Date(); 
      if (isNaN(publishDateObj.getTime())) {
        // 只有芥末堆网站才记录日期解析错误
        if (isJiemodui) {
          log.warn(`芥末堆: 文章"${item.title || '无标题'}"的日期格式无效: ${rawPubDate}`);
        }
        publishDateObj = new Date();
      }
      
      // 特殊处理芥末堆文章的日期
      let date: Date;
      let isFirstFetchDate = false;
      
      if (isJiemodui) {
        // 尝试使用现有的日期
        const titleKey = item.title.replace(/\s+/g, '');
        const existingDate = existingArticlesMap.get(titleKey);
        
        if (existingDate) {
          // 如果数据库中已有该文章，使用数据库中的日期
          date = new Date(existingDate);
          log.jiemodui(`[RSS Parser] 芥末堆: "${item.title}" - 使用现有日期: ${new Date(existingDate).toLocaleDateString()}`);
        } else {
          // 如果是新文章，尝试从内容中提取日期
          let extractedDate: Date | null = null;
          
          // 尝试从内容中提取中文日期格式（YYYY年MM月DD日）
          if (content) {
            const match = content.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
            if (match) {
              const year = parseInt(match[1], 10);
              const month = parseInt(match[2], 10) - 1;
              const day = parseInt(match[3], 10);
              
              extractedDate = new Date(year, month, day);
              if (isValidReasonableDate(extractedDate)) {
                log.jiemodui(`[RSS Parser] 芥末堆: "${item.title}" - 从内容提取日期: ${extractedDate.toLocaleDateString()}`);
              } else {
                extractedDate = null;
              }
            }
          }
          
          if (!extractedDate) {
            // 如果无法提取日期，使用当前日期但减去一个随机的小时数，避免所有文章都显示相同时间
            const randomHours = Math.floor(Math.random() * 12); // 0-11小时的随机值
            date = new Date();
            date.setHours(date.getHours() - randomHours);
            isFirstFetchDate = true;
            log.jiemodui(`[RSS Parser] 芥末堆: "${item.title}" - 新文章使用随机偏移时间`);
          } else {
            date = extractedDate;
          }
        }
      } else {
        // 非芥末堆文章，使用正常的日期处理逻辑，但减少日志输出
        const dateResult = fixFeedDateIssues(feedSource.url, item, publishDateObj);
        date = dateResult.date;
        isFirstFetchDate = dateResult.isFirstFetchDate;
      }

      // 只对芥末堆网站或有问题的日期记录日志
      if ((isJiemodui && LOG_CONFIG.ENABLE_JIEMODUI_LOGS) || (isFirstFetchDate && LOG_CONFIG.ENABLE_DATE_LOGS)) {
        logDateIssue(
          `订阅源: ${feedSource.url}`,
          item.title || '无标题',
          rawPubDate,
          date,
          isFirstFetchDate
        );
      }

      const contentText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const summary = contentText.substring(0, 200) + (contentText.length > 200 ? '...' : '');
      
      const article = {
        id: articleUniqueIdentifier,
        sourceId: feedSource.id,
        title: item.title || '无标题',
        url: item.link || '',
        author,
        publishDate: date.getTime(), // 存储时间戳
        fetchDate: Date.now(), // 记录当前获取时间的时间戳
        originalPubDate: rawPubDate || '',
        isFirstFetchDate: isFirstFetchDate, // 添加标记，表示是否使用了首次获取时间作为发布时间
        content,
        contentText,
        summary,
        imageUrl,
        isRead: 'false',
        isStarred: 'false',
        isHidden: false,
        tags: [],
        guid: item.guid, // 也保存原始 guid (如果存在)
      };
      
      // 只对芥末堆网站记录详细的文章处理日志
      if (isJiemodui) {
        log.jiemodui(`[RSS Parser] 芥末堆: 处理文章 "${article.title}", ID: ${article.id.substring(0, 20)}...`);
      }
      
      return article;
    });
    
    return articles;
  } catch (error) {
    log.error(`调用主进程解析RSS源时出错: ${feedSource.url}`, error);
    return [];
  }
};

/**
 * 刷新所有订阅源
 * @param feeds 订阅源列表
 * @param onProgress 进度回调
 * @param onComplete 完成回调
 */
export const refreshAllFeeds = async (
  feeds: FeedSource[],
  onProgress?: (feed: FeedSource, articles: Article[]) => void,
  onComplete?: (results: { feed: FeedSource, articles: Article[] }[]) => void
) => {
  const results: { feed: FeedSource, articles: Article[] }[] = [];
  
  for (const feed of feeds) {
    try {
      // 注意：这里调用的是更新后的 fetchRssFeed，它会通过 IPC 与主进程通信
      const articles = await fetchRssFeed(feed);
      results.push({ feed, articles });
      
      if (onProgress) {
        onProgress(feed, articles);
      }
    } catch (error) {
      log.error(`刷新订阅源失败: ${feed.url}`, error);
      results.push({ feed, articles: [] }); // 即使失败也记录，以便UI可以反映
      
      if (onProgress) {
        onProgress(feed, []);
      }
    }
  }
  
  if (onComplete) {
    onComplete(results);
  }
  
  return results;
};

/**
 * 从URL获取RSS源信息 (通过主进程)
 * @param url RSS源URL
 * @returns 源信息 (包含 title, url, iconUrl)
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