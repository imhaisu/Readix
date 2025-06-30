import { Article, FeedSource } from '../db/database';
import { generateUniqueId } from './helpers';

// RSS解析器实例现在位于主进程

/**
 * 检查并修复特定订阅源的日期问题
 * @param feedUrl 订阅源URL
 * @param item RSS项目
 * @param defaultDate 默认日期
 * @returns 修复后的日期对象和一个标志，表示是否使用了首次获取时间
 */
const fixFeedDateIssues = (feedUrl: string, item: any, defaultDate: Date): { date: Date, isFirstFetchDate: boolean } => {
  console.log(`[RSS Parser] 处理文章日期: "${item.title}", 原始日期: ${item.pubDate || item.isoDate || '无'}, 默认日期: ${defaultDate.toISOString()}`);
  
  // 首先检查原始日期是否有效
  const rawPubDate = item.pubDate || item.isoDate;
  if (rawPubDate) {
    const parsedDate = new Date(rawPubDate);
    if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 2000) {
      console.log(`[RSS Parser] 使用有效的原始日期: ${parsedDate.toISOString()} 对于文章: ${item.title}`);
      return { date: parsedDate, isFirstFetchDate: false };
    }
  }
  
  // 尝试从链接中提取日期信息（适用于所有RSS源）
  if (item.link) {
    try {
      // 尝试匹配模式1: /数字.html (可能是时间戳)
      let match = item.link.match(/\/(\d+)\.html$/);
      if (match && match[1]) {
        const timestamp = parseInt(match[1], 10);
        if (!isNaN(timestamp) && timestamp > 1000000000) { // 确保是有效的时间戳
          const date = new Date(timestamp * 1000); // 转换为毫秒
          if (!isNaN(date.getTime()) && date.getFullYear() > 2000) {
            console.log(`[RSS Parser] 从链接中提取到日期(模式1): ${date.toISOString()} 对于文章: ${item.title}`);
            return { date, isFirstFetchDate: false };
          }
        }
      }
      
      // 尝试匹配模式2: /YYYY/MM/DD/ (常见的日期格式)
      match = item.link.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
      if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // 月份从0开始
        const day = parseInt(match[3], 10);
        
        if (year > 2000 && month >= 0 && month < 12 && day > 0 && day <= 31) {
          const date = new Date(year, month, day);
          if (!isNaN(date.getTime())) {
            console.log(`[RSS Parser] 从链接中提取到日期(模式2): ${date.toISOString()} 对于文章: ${item.title}`);
            return { date, isFirstFetchDate: false };
          }
        }
      }
      
      // 尝试从内容中提取日期
      if (item.content || item.contentEncoded || item.description) {
        const content = item.contentEncoded || item.content || item.description;
        // 尝试匹配常见的日期格式，如：2023年10月1日 或 2023-10-01
        const dateMatch = content.match(/(\d{4})[年-](\d{1,2})[月-](\d{1,2})[日\s]/);
        if (dateMatch) {
          const year = parseInt(dateMatch[1], 10);
          const month = parseInt(dateMatch[2], 10) - 1;
          const day = parseInt(dateMatch[3], 10);
          
          if (year > 2000 && month >= 0 && month < 12 && day > 0 && day <= 31) {
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
              console.log(`[RSS Parser] 从内容中提取到日期: ${date.toISOString()} 对于文章: ${item.title}`);
              return { date, isFirstFetchDate: false };
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[RSS Parser] 从链接提取日期失败: ${item.link}`, e);
    }
  }
  
  // 如果所有方法都失败，使用当前日期，但标记为首次获取时间
  // 这样后续刷新时可以保持这个时间不变
  const currentDate = new Date(); // 使用当前日期
  console.log(`[RSS Parser] 无法提取日期，使用首次获取时间 ${currentDate.toISOString()}: ${item.title}`);
  return { date: currentDate, isFirstFetchDate: true };
};

/**
 * 获取并解析RSS源 (通过主进程)
 * @param feed 订阅源信息
 * @returns 解析后的文章列表
 */
export const fetchRssFeed = async (feedSource: FeedSource): Promise<Article[]> => {
  if (!window.electron) {
    console.error('Electron API 不可用');
    return [];
  }
  try {
    console.log(`[RSS Parser] 开始获取订阅源: ${feedSource.url}`);
    const result = await window.electron.parseRssFeed(feedSource.url);
    if (!result || !result.success || !result.data) {
      console.error(`解析RSS源失败 (来自主进程): ${feedSource.url}`, result?.error);
      return [];
    }

    const feedData = result.data;
    console.log(`[RSS Parser] 成功获取订阅源: ${feedSource.url}, 包含 ${feedData.items?.length || 0} 篇文章`);
    
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
      
      // 确保 publishDate 有效
      let rawPubDate = item.pubDate || item.isoDate;
      let publishDateObj = rawPubDate ? new Date(rawPubDate) : new Date(); 
      if (isNaN(publishDateObj.getTime())) {
        console.warn(`Invalid date encountered for item "${item.title || 'Unknown title'}" from feed "${feedSource.url}". Defaulting to current time. Original date string: ${rawPubDate}`);
        publishDateObj = new Date();
      }
      
      // 应用特定订阅源的日期修复
      const { date, isFirstFetchDate } = fixFeedDateIssues(feedSource.url, item, publishDateObj);

      const contentText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const summary = contentText.substring(0, 200) + (contentText.length > 200 ? '...' : '');
      
      // 为文章生成稳定的唯一ID
      let articleUniqueIdentifier = '';
      
      // 特殊处理芥末堆
      if (feedSource.url.includes('jiemodui.com')) {
        // 对于芥末堆，使用标题和链接的组合作为唯一ID
        const titleHash = item.title ? item.title.replace(/\s+/g, '') : '';
        const linkHash = item.link ? item.link.replace(/https?:\/\//, '').replace(/www\./, '') : '';
        
        // 确保ID的稳定性和唯一性
        articleUniqueIdentifier = `jiemodui_${titleHash}_${linkHash}`;
        console.log(`[RSS Parser] 芥末堆文章ID: ${articleUniqueIdentifier}`);
      } else {
        // 其他源的处理
        if (item.guid) {
          // 优先使用guid作为唯一标识
          articleUniqueIdentifier = item.guid;
        } else if (item.link) {
          // 如果没有guid，使用链接作为唯一标识
          articleUniqueIdentifier = item.link;
        } else {
          // 如果既没有guid也没有link，使用标题和源URL生成唯一标识
          articleUniqueIdentifier = `${feedSource.url}#${item.title}`;
        }
      }

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
      
      console.log(`[RSS Parser] 处理文章: "${article.title}", ID: ${article.id}, 日期: ${new Date(article.publishDate).toISOString()}`);
      return article;
    });
    
    return articles;
  } catch (error) {
    console.error(`调用主进程解析RSS源时出错: ${feedSource.url}`, error);
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
      console.error(`刷新订阅源失败: ${feed.url}`, error);
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
    console.error('Electron API 不可用');
    return null;
  }
  try {
    const result = await window.electron.getRssFeedInfo(url);
    if (!result || !result.success || !result.data) {
      console.error(`获取RSS源信息失败 (来自主进程): ${url}`, result?.error);
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
    console.error(`调用主进程获取RSS源信息时出错: ${url}`, error);
    // @ts-ignore
    throw new Error(`无法解析该RSS源: ${error.message || error}`);
  }
}; 