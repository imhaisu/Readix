import { Article, FeedSource } from '../db/database';
import { generateUniqueId } from './helpers';

// 通用的日期处理函数，处理异常日期
function normalizePublishDate(rawDate: string | undefined, feedUrl: string): Date {
  // 如果没有日期，返回当前时间
  if (!rawDate) {
    return new Date();
  }
  
  // 尝试解析日期
  const parsedDate = new Date(rawDate);
  
  // 检查日期是否有效
  if (isNaN(parsedDate.getTime())) {
    console.warn(`无效的日期格式: "${rawDate}" 来自 "${feedUrl}"，使用当前时间替代`);
    return new Date();
  }
  
  // 检查是否为未来日期（允许最多提前1小时，处理时区差异）
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  if (parsedDate > oneHourLater) {
    console.warn(`检测到未来日期: "${rawDate}" 来自 "${feedUrl}"，调整为当前时间`);
    return now;
  }
  
  // 检查是否为过早的日期（如1970年）
  const year2000 = new Date('2000-01-01');
  if (parsedDate < year2000) {
    console.warn(`检测到过早的日期: "${rawDate}" 来自 "${feedUrl}"，调整为当前时间`);
    return now;
  }
  
  // 日期正常，返回解析后的日期
  return parsedDate;
}

// RSS解析器实例现在位于主进程

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
    const result = await window.electron.parseRssFeed(feedSource.url);
    if (!result || !result.success || !result.data) {
      console.error(`解析RSS源失败 (来自主进程): ${feedSource.url}`, result?.error);
      return [];
    }

    const feedData = result.data;
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
      
      // 使用通用日期处理函数
      const rawPubDate = item.pubDate || item.isoDate;
      const publishDateObj = normalizePublishDate(rawPubDate, feedSource.url);

      const contentText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const summary = contentText.substring(0, 200) + (contentText.length > 200 ? '...' : '');
      
      // 使用 guid 或 link 作为文章的唯一ID
      const articleUniqueIdentifier = item.guid || item.link || `${feedSource.url}#${item.title}${publishDateObj.toISOString()}`;

      return {
        id: articleUniqueIdentifier, // 使用 guid 或 link
        sourceId: feedSource.id,
        title: item.title || '无标题',
        url: item.link || '',
        author,
        publishDate: publishDateObj.getTime(), // 修改：存储时间戳
        fetchDate: Date.now(), // 新增：记录当前获取时间的时间戳
        content,
        contentText,
        summary,
        imageUrl,
        isRead: 'false',     // 修复：添加默认值
        isStarred: 'false',  // 修复：添加默认值
        isHidden: false,
        tags: [],
        guid: item.guid, // 也保存原始 guid (如果存在)
      };
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