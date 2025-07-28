import { FeedSource, Article } from '../db/database';

/**
 * 处理文章更新时保留已有的阅读状态和星标状态
 * @param db 数据库实例
 * @param feed 订阅源
 * @param articles 新获取的文章
 */
export const preserveArticleStatus = async (
  db: any,
  feed: FeedSource,
  articles: Article[]
): Promise<void> => {
  if (!db || !articles.length) return;
  
  try {
    // 1. 获取数据库中已存在的文章
    const existingArticleIds = articles.map(a => a.id);
    const existingArticles = await db.articles
      .where('id')
      .anyOf(existingArticleIds)
      .toArray();
    
    // 2. 创建映射表，方便快速查找
    const existingArticlesMap = new Map<string, Article>(
      existingArticles.map((a: Article) => [a.id, a])
    );
    
    // 3. 处理新获取的文章，保留已有文章的状态
    const processedArticles = articles.map(article => {
      const existingArticle = existingArticlesMap.get(article.id);
      if (existingArticle) {
        // 保留现有的阅读状态、星标状态和其他用户数据
        const updatedArticle = {
          ...article,
          isRead: existingArticle.isRead,
          isStarred: existingArticle.isStarred,
          isReadLater: existingArticle.isReadLater,
          tags: existingArticle.tags,
        };
        
        // 如果现有文章的isFirstFetchDate为true，表示之前使用了获取时间作为文章时间
        // 或者文章本来就没有时间，我们应该保留原来的时间戳，而不是用新的时间覆盖
        if (existingArticle.isFirstFetchDate) {
          updatedArticle.publishDate = existingArticle.publishDate;
          updatedArticle.isFirstFetchDate = true;
        }
        
        return updatedArticle;
      }
      return article;
    });
    
    // 4. 更新数据库
    await db.articles.bulkPut(processedArticles);
    
    // 5. 更新未读计数
    if (feed.id) {
      // 计算未读数量
      const unreadCount = await db.articles
        .where({ sourceId: feed.id, isRead: 'false' })
        .filter((article: Article) => article.isHidden !== true)
        .count();
      
      // 更新订阅源的未读计数
      await db.feeds.update(feed.id, { unreadCount });
    }
  } catch (error) {
    console.error('保留文章状态时出错:', error);
  }
}; 