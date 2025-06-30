import { Article, FilterRule, FeedSource } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

/**
 * 检查文章是否应该被过滤（隐藏）
 * @param article 要检查的文章
 * @param rules 应用的过滤规则
 * @returns 如果文章应该被隐藏，则返回true
 */
export const shouldArticleBeHidden = (article: Article, rules: FilterRule[]): boolean => {
  if (!rules || rules.length === 0) {
    return false;
  }

  // 只考虑激活的规则
  const activeRules = rules.filter(rule => rule.isActive);
  if (activeRules.length === 0) {
    return false;
  }

  // 检查每条规则
  return activeRules.some(rule => {
    // 确定要检查的内容
    let contentToCheck = '';
    switch (rule.scope) {
      case 'title':
        contentToCheck = article.title || '';
        break;
      case 'content':
        contentToCheck = article.content || '';
        break;
      case 'author':
        contentToCheck = article.author || '';
        break;
      default:
        return false;
    }

    // 转为小写进行不区分大小写的比较
    contentToCheck = contentToCheck.toLowerCase();
    
    // 分割关键词（按空格分割）
    const keywords = rule.keywords.toLowerCase().split(/\s+/).filter(k => k.length > 0);
    
    // 如果没有有效关键词，则规则不适用
    if (keywords.length === 0) {
      return false;
    }
    
    // 检查是否任何关键词匹配（OR逻辑）
    const hasMatch = keywords.some(keyword => contentToCheck.includes(keyword));
    
    // 根据规则类型返回结果
    return rule.type === 'contains' ? hasMatch : !hasMatch;
  });
};

/**
 * 为订阅源中的所有文章应用过滤规则
 * @param db 数据库实例
 * @param feedId 订阅源ID
 * @param rules 过滤规则
 */
export const applyFilterRulesToFeed = async (db: any, feedId: string, rules: FilterRule[]): Promise<number> => {
  if (!db || !feedId) {
    return 0;
  }

  try {
    // 获取该订阅源的所有文章
    const articles = await db.articles.where('sourceId').equals(feedId).toArray();
    
    // 记录需要更新的文章ID和它们的新状态
    const articlesToUpdate: { id: string, isHidden: boolean }[] = [];
    
    // 检查每篇文章是否应该被过滤
    for (const article of articles) {
      const shouldBeHidden = shouldArticleBeHidden(article, rules);
      
      // 如果过滤状态发生变化，则添加到更新列表
      if (article.isHidden !== shouldBeHidden) {
        articlesToUpdate.push({
          id: article.id,
          isHidden: shouldBeHidden
        });
      }
    }
    
    // 批量更新文章
    if (articlesToUpdate.length > 0) {
      await db.transaction('rw', db.articles, async () => {
        for (const update of articlesToUpdate) {
          await db.articles.update(update.id, { isHidden: update.isHidden });
        }
      });
      
      console.log(`[FilterUtils] 已更新 ${articlesToUpdate.length} 篇文章的过滤状态`);
    }
    
    return articlesToUpdate.length;
  } catch (error) {
    console.error(`[FilterUtils] 应用过滤规则时出错:`, error);
    return 0;
  }
};

/**
 * 创建新的过滤规则
 * @param scope 过滤范围
 * @param type 过滤类型
 * @param keywords 关键词
 * @param isActive 是否激活
 * @returns 新的过滤规则对象
 */
export const createFilterRule = (
  scope: 'title' | 'content' | 'author', 
  type: 'contains' | 'not_contains', 
  keywords: string, 
  isActive: boolean = true
): FilterRule => {
  return {
    id: uuidv4(),
    scope,
    type,
    keywords,
    isActive
  };
};

/**
 * 重新计算订阅源的未读计数（排除被隐藏的文章）
 * @param db 数据库实例
 * @param feedId 订阅源ID
 */
export const recalculateFeedUnreadCount = async (db: any, feedId: string): Promise<number> => {
  if (!db || !feedId) {
    return 0;
  }

  try {
    // 计算未读且未隐藏的文章数量
    const unreadCount = await db.articles
      .where('sourceId').equals(feedId)
      .and((article: Article) => article.isRead === 'false' && article.isHidden !== true)
      .count();
    
    // 更新订阅源的未读计数
    await db.feeds.update(feedId, { unreadCount });
    
    return unreadCount;
  } catch (error) {
    console.error(`[FilterUtils] 重新计算未读计数时出错:`, error);
    return 0;
  }
};

/**
 * 应用全局过滤规则到所有文章
 * @param db 数据库实例
 * @param rules 全局过滤规则
 */
export const applyGlobalFilterRules = async (db: any, rules: FilterRule[]): Promise<number> => {
  if (!db) {
    return 0;
  }

  try {
    // 获取所有文章
    const articles = await db.articles.toArray();
    
    // 记录需要更新的文章ID和它们的新状态
    const articlesToUpdate: { id: string, isHidden: boolean }[] = [];
    
    // 检查每篇文章是否应该被过滤
    for (const article of articles) {
      const shouldBeHidden = shouldArticleBeHidden(article, rules);
      
      // 如果过滤状态发生变化，则添加到更新列表
      if (article.isHidden !== shouldBeHidden) {
        articlesToUpdate.push({
          id: article.id,
          isHidden: shouldBeHidden
        });
      }
    }
    
    // 批量更新文章
    if (articlesToUpdate.length > 0) {
      await db.transaction('rw', db.articles, async () => {
        for (const update of articlesToUpdate) {
          await db.articles.update(update.id, { isHidden: update.isHidden });
        }
      });
      
      console.log(`[FilterUtils] 已更新 ${articlesToUpdate.length} 篇文章的全局过滤状态`);
    }
    
    // 更新所有订阅源的未读计数
    const feeds = await db.feeds.toArray();
    for (const feed of feeds) {
      if (feed.id) {
        await recalculateFeedUnreadCount(db, feed.id);
      }
    }
    
    return articlesToUpdate.length;
  } catch (error) {
    console.error(`[FilterUtils] 应用全局过滤规则时出错:`, error);
    return 0;
  }
}; 