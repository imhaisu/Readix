import { Article, FilterRule } from '../db/database';
import { shouldArticleBeHidden, recalculateFeedUnreadCount } from './filterUtils';
import { logInfo, logDebug, logWarn, logError } from './filterLogger';

/**
 * 终极过滤函数：应用所有规则到所有文章
 * 这是系统的"过滤总管"，用于启动时检查和手动刷新
 * @param db 数据库实例
 */
export const applyAllRulesToAllArticles = async (db: any): Promise<number> => {
  if (!db) {
    logWarn('[FilterApplier] 无法执行最终过滤：数据库未初始化');
    return 0;
  }

  logInfo('[FilterApplier] 开始执行全局过滤管道...');

  try {
    // 1. 获取所有全局规则
    const globalRulesJson = localStorage.getItem('global_filter_rules');
    const globalRules: FilterRule[] = globalRulesJson ? JSON.parse(globalRulesJson) : [];
    const activeGlobalRules = globalRules.filter((r: FilterRule) => r.isActive);
    logInfo(`[FilterApplier] 加载了 ${activeGlobalRules.length}/${globalRules.length} 条激活的全局规则。`);
    
    // 输出全局规则详情
    if (activeGlobalRules.length > 0) {
      activeGlobalRules.forEach((rule: FilterRule, index: number) => {
        logInfo(`[FilterApplier] 全局规则 #${index + 1}: ${rule.type === 'contains' ? '只显示' : '隐藏'} 包含 "${rule.keywords}" 的${rule.scope === 'title' ? '标题' : rule.scope === 'content' ? '内容' : '作者'}`);
      });
    }

    // 2. 获取所有订阅源及其规则
    const feeds = await db.feeds.toArray();
    const feedRulesMap = new Map<string, FilterRule[]>();
    let totalFeedRules = 0;
    let totalActiveFeedRules = 0;
    
    for (const feed of feeds) {
      if (feed.id && Array.isArray(feed.filterRules)) {
        const feedRules = feed.filterRules;
        const activeFeedRules = feedRules.filter((r: FilterRule) => r.isActive);
        
        totalFeedRules += feedRules.length;
        totalActiveFeedRules += activeFeedRules.length;
        
        if (feedRules.length > 0) {
          feedRulesMap.set(feed.id, feedRules);
          
          if (activeFeedRules.length > 0) {
            logInfo(`[FilterApplier] 订阅源 "${feed.title}" 有 ${activeFeedRules.length}/${feedRules.length} 条激活规则`);
            
            // 输出该订阅源的规则详情
            activeFeedRules.forEach((rule: FilterRule, index: number) => {
              logInfo(`[FilterApplier]   - 规则 #${index + 1}: ${rule.type === 'contains' ? '只显示' : '隐藏'} 包含 "${rule.keywords}" 的${rule.scope === 'title' ? '标题' : rule.scope === 'content' ? '内容' : '作者'}`);
            });
          }
        }
      }
    }
    logInfo(`[FilterApplier] 加载了 ${feedRulesMap.size} 个订阅源的特定规则，共 ${totalActiveFeedRules}/${totalFeedRules} 条激活规则。`);

    // 3. 获取所有文章
    const allArticles = await db.articles.toArray();
    logInfo(`[FilterApplier] 需要检查的文章总数: ${allArticles.length}`);

    const articlesToUpdate: { id: string, isHidden: boolean }[] = [];
    let hiddenByFeedRules = 0;
    let hiddenByGlobalRules = 0;

    // 4. 核心过滤逻辑
    for (const article of allArticles) {
      const sourceId = article.sourceId;
      let shouldBeHidden = false;
      let ruleSource = '';

      // 4.1 首先应用订阅源规则
      if (sourceId && feedRulesMap.has(sourceId)) {
        const feedRules = feedRulesMap.get(sourceId) || [];
        const activeFeedRules = feedRules.filter(r => r.isActive);
        
        if (activeFeedRules.length > 0) {
          shouldBeHidden = shouldArticleBeHidden(article, activeFeedRules);
          if (shouldBeHidden) {
            hiddenByFeedRules++;
            ruleSource = '订阅源规则';
          }
        }
      }
      
      // 4.2 如果订阅源规则没有隐藏文章，再应用全局规则
      if (!shouldBeHidden && activeGlobalRules.length > 0) {
        shouldBeHidden = shouldArticleBeHidden(article, activeGlobalRules);
        if (shouldBeHidden) {
          hiddenByGlobalRules++;
          ruleSource = '全局规则';
        }
      }

      // 5. 检查状态是否需要更新
      if (article.isHidden !== shouldBeHidden) {
        articlesToUpdate.push({ id: article.id, isHidden: shouldBeHidden });
        
        // 记录状态变化的文章
        logDebug(`[FilterApplier] 文章 "${article.title.substring(0, 30)}..." 的状态将从 ${article.isHidden ? '隐藏' : '显示'} 变为 ${shouldBeHidden ? '隐藏' : '显示'} (由${ruleSource}决定)`);
      }
    }

    logInfo(`[FilterApplier] 发现 ${articlesToUpdate.length} 篇文章的过滤状态需要更新。`);
    logInfo(`[FilterApplier] 其中 ${hiddenByFeedRules} 篇由订阅源规则隐藏，${hiddenByGlobalRules} 篇由全局规则隐藏。`);

    // 6. 批量更新数据库
    if (articlesToUpdate.length > 0) {
      try {
        // 使用事务确保原子性更新
        await db.transaction('rw', db.articles, async () => {
          for (const update of articlesToUpdate) {
            await db.articles.update(update.id, { 
              isHidden: update.isHidden,
              lastUpdated: new Date().toISOString() // 添加时间戳强制刷新
            });
          }
        });
        
        logInfo(`[FilterApplier] 成功更新了 ${articlesToUpdate.length} 篇文章的过滤状态`);
        
        // 更新一个全局标记，表示过滤规则已应用
        localStorage.setItem('last_filter_applied', new Date().toISOString());
      } catch (error) {
        logError(`[FilterApplier] 更新文章过滤状态时出错:`, error);
      }
    } else {
      logInfo(`[FilterApplier] 没有文章需要更新过滤状态`);
    }
    
    // 返回更新的文章数量
    return articlesToUpdate.length;

  } catch (error) {
    logError('[FilterApplier] 执行全局过滤管道时出错:', error);
    return 0;
  }
}; 