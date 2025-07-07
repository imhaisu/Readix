import Dexie from 'dexie';
import { Article, FeedSource } from '../db/database';
import { RssDatabase } from '../db/database';

export const cleanupOldArticles = async (db: RssDatabase, retentionDays: number): Promise<void> => {
  if (!db || !db.isOpen()) {
    console.log('Article cleanup skipped: DB not available or not open.');
    return;
  }
  if (retentionDays === 0) { // 0 means keep indefinitely
    console.log('Article cleanup skipped: Retention period is set to indefinite.');
    return;
  }

  const retentionMilliseconds = retentionDays * 24 * 60 * 60 * 1000;
  const cutoffTimestamp = Date.now() - retentionMilliseconds;

  try {
    let articlesToDeleteQuery = db.articles
      .where('publishDate').below(cutoffTimestamp)
      .and((article: Article) => article.isStarred !== 'true');

    const articlesToDelete = await articlesToDeleteQuery.toArray();

    if (articlesToDelete.length > 0) {
      const idsToDelete = articlesToDelete.map(article => article.id as string);
      await db.articles.bulkDelete(idsToDelete);
      console.log(`[Cleanup] Successfully deleted ${articlesToDelete.length} old (non-starred) articles older than ${retentionDays} days.`);
      
      // 更新相关 feed 的未读计数
      const feedIdsAffected = new Set<string>();
      articlesToDelete.forEach((article: Article) => {
        if (article.sourceId && article.isRead !== 'true') { // 只考虑被删除的是未读文章的情况
          feedIdsAffected.add(article.sourceId);
        }
      });

      for (const feedId of feedIdsAffected) {
        const unreadCount = await db.articles.where({ sourceId: feedId, isRead: 'false' }).count();
        await db.feeds.update(feedId, { unreadCount });
      }
      if(feedIdsAffected.size > 0){
        console.log(`[Cleanup] Updated unread counts for ${feedIdsAffected.size} affected feeds.`);
      }

    } else {
      console.log('[Cleanup] No old (non-starred) articles found to delete.');
    }
  }
  catch (error) {
    console.error('[Cleanup] Error cleaning up old articles:', error);
  }
};

/**
 * 清理没有对应订阅源的"孤儿"文章
 * @param db 数据库实例
 * @returns 清理的文章数量
 */
export const cleanupOrphanedArticles = async (db: RssDatabase): Promise<number> => {
  if (!db || !db.isOpen()) {
    console.log('[Cleanup] 清理孤儿文章跳过: 数据库不可用或未打开。');
    return 0;
  }

  try {
    console.log('[Cleanup] 开始清理没有对应订阅源的文章...');
    
    // 获取所有订阅源ID
    const feeds = await db.feeds.toArray();
    const feedIds = new Set(feeds.map((feed: FeedSource) => feed.id).filter((id): id is string => id !== undefined));
    
    // 获取所有文章
    const articles = await db.articles.toArray();
    
    // 找出没有对应订阅源的文章
    const orphanedArticles = articles.filter((article: Article) => {
      // 如果文章没有sourceId或者sourceId对应的订阅源不存在，则认为是孤儿文章
      return !article.sourceId || !feedIds.has(article.sourceId);
    });
    
    if (orphanedArticles.length > 0) {
      console.log(`[Cleanup] 找到 ${orphanedArticles.length} 篇没有对应订阅源的文章，准备清理...`);
      
      // 获取要删除的文章ID
      const idsToDelete = orphanedArticles.map(article => article.id);
      
      // 批量删除这些文章
      await db.articles.bulkDelete(idsToDelete);
      
      console.log(`[Cleanup] 成功清理 ${orphanedArticles.length} 篇孤儿文章。`);
      return orphanedArticles.length;
    } else {
      console.log('[Cleanup] 没有找到孤儿文章，无需清理。');
      return 0;
    }
  } catch (error) {
    console.error('[Cleanup] 清理孤儿文章时出错:', error);
    return 0;
  }
};

/**
 * 智能检测与清理重复文章
 * @param db 数据库实例
 * @returns 清理的文章数量
 */
export const detectAndCleanupDuplicateArticles = async (db: RssDatabase): Promise<number> => {
  console.log('[Cleanup] 开始智能检测与清理重复文章...');
  
  try {
    // 获取所有文章
    const allArticles = await db.articles.toArray();
    
    // 创建文章内容指纹映射
    const articleFingerprints = new Map<string, Article[]>();
    
    // 对每篇文章生成指纹
    allArticles.forEach(article => {
      // 提取标题和链接的核心部分作为指纹
      const title = article.title.replace(/\s+/g, '').toLowerCase();
      const url = article.url
        .replace(/https?:\/\//, '')
        .replace(/www\./, '')
        .replace(/\?.*$/, '');
      
      // 指纹为标题+URL组合的哈希
      const fingerprint = `${article.sourceId}#${title}#${url}`;
      
      if (!articleFingerprints.has(fingerprint)) {
        articleFingerprints.set(fingerprint, []);
      }
      
      articleFingerprints.get(fingerprint)!.push(article);
    });
    
    // 找出需要删除的重复文章
    const articlesToDelete: string[] = [];
    
    articleFingerprints.forEach((duplicates, fingerprint) => {
      if (duplicates.length > 1) {
        // 按照优先级排序：保留已读、有注释、被标星的文章
        duplicates.sort((a, b) => {
          // 1. 首先考虑是否有注释或标星
          const aHasAnnotations = a.annotations && a.annotations.length > 0;
          const bHasAnnotations = b.annotations && b.annotations.length > 0;
          
          if (aHasAnnotations && !bHasAnnotations) return -1;
          if (!aHasAnnotations && bHasAnnotations) return 1;
          
          if (a.isStarred === 'true' && b.isStarred !== 'true') return -1;
          if (a.isStarred !== 'true' && b.isStarred === 'true') return 1;
          
          // 2. 已读文章优先于未读文章（防止未读计数异常）
          if (a.isRead === 'true' && b.isRead !== 'true') return -1;
          if (a.isRead !== 'true' && b.isRead === 'true') return 1;
          
          // 3. 如果以上条件都相同，保留发布日期较新的
          return b.publishDate - a.publishDate;
        });
        
        // 保留排序后的第一篇，删除其余的
        for (let i = 1; i < duplicates.length; i++) {
          articlesToDelete.push(duplicates[i].id);
        }
      }
    });
    
    // 批量删除重复文章
    if (articlesToDelete.length > 0) {
      await db.articles.bulkDelete(articlesToDelete);
      console.log(`[Cleanup] 已成功清理 ${articlesToDelete.length} 篇重复文章`);
      
      // 更新受影响的订阅源计数
      await updateAffectedFeedCounts(db);
      
      return articlesToDelete.length;
    }
    
    console.log('[Cleanup] 未发现需要清理的重复文章');
    return 0;
  } catch (error) {
    console.error('[Cleanup] 检测和清理重复文章失败:', error);
    return 0;
  }
};

/**
 * 更新受影响的订阅源计数
 * @param db 数据库实例
 */
async function updateAffectedFeedCounts(db: RssDatabase): Promise<void> {
  const feeds = await db.feeds.toArray();
  for (const feed of feeds) {
    if (feed.id) {
      const unreadCount = await db.articles.where({
        sourceId: feed.id,
        isRead: 'false',
        isHidden: false
      }).count();
      
      await db.feeds.update(feed.id, { unreadCount });
    }
  }
  console.log('[Cleanup] 已更新所有受影响订阅源的未读计数');
} 