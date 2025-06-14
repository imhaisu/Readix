import Dexie from 'dexie';
import { RssDatabase, Article } from '../contexts/DatabaseContext'; // Adjust path if necessary

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
      .and(article => article.isStarred !== 'true');

    const articlesToDelete = await articlesToDeleteQuery.toArray();

    if (articlesToDelete.length > 0) {
      const idsToDelete = articlesToDelete.map(article => article.id as string);
      await db.articles.bulkDelete(idsToDelete);
      console.log(`[Cleanup] Successfully deleted ${articlesToDelete.length} old (non-starred) articles older than ${retentionDays} days.`);
      
      // 更新相关 feed 的未读计数
      const feedIdsAffected = new Set<string>();
      articlesToDelete.forEach(article => {
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
  } catch (error) {
    if (error instanceof Dexie.ModifyError) {
        console.error('[Cleanup] Failed to delete some articles during cleanup:', error.failures.length, 'failures.');
    } else {
        console.error('[Cleanup] Error during article cleanup:', error);
    }
  }
}; 