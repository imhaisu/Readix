import { Article, FilterRule, FeedSource } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { logInfo, logDebug, logWarn, logError } from './filterLogger';

/**
 * 检查文章是否应该被过滤（隐藏）
 * @param article 要检查的文章
 * @param rules 应用的过滤规则
 * @returns 如果文章应该被隐藏，则返回true
 * 
 * 规则行为说明：
 * 1. "隐藏"(not_contains)规则：如果文章匹配任何一条"隐藏"规则，则隐藏文章
 * 2. "只显示"(contains)规则：如果存在"只显示"规则，文章必须匹配至少一条才会显示，否则隐藏
 * 3. 当同时存在两种规则时，"隐藏"规则优先级更高
 */
export const shouldArticleBeHidden = (article: Article, rules: FilterRule[]): boolean => {
  // 如果没有规则或没有激活的规则，则不隐藏
  if (!rules || rules.length === 0) {
    return false;
  }

  const activeRules = rules.filter(rule => rule.isActive);
  if (activeRules.length === 0) {
    return false;
  }

  // 分离出"隐藏"和"只显示"规则
  const hideRules = activeRules.filter(rule => rule.type === 'not_contains');
  const showOnlyRules = activeRules.filter(rule => rule.type === 'contains');

  // 详细日志，帮助调试
  logDebug(`对文章 "${article.title.substring(0, 20)}..." 应用过滤规则:`, {
    articleId: article.id,
    hideRulesCount: hideRules.length,
    showOnlyRulesCount: showOnlyRules.length
  });

  // 步骤1: 检查"隐藏"规则 - 优先级最高
  // 如果匹配任何一条"隐藏"规则，则立即隐藏
  for (const rule of hideRules) {
    if (checkMatch(article, rule)) {
      logDebug(`文章 "${article.title.substring(0, 20)}..." 匹配隐藏规则 (关键词: "${rule.keywords}")，将被隐藏`, {
        articleId: article.id,
        ruleId: rule.id,
        ruleType: 'not_contains'
      });
      return true;
    }
  }

  // 步骤2: 检查"只显示"规则
  // 如果存在"只显示"规则，但文章不匹配任何一条，则隐藏
  if (showOnlyRules.length > 0) {
    // 检查是否匹配任何一条"只显示"规则
    const matchesAnyShowRule = showOnlyRules.some(rule => checkMatch(article, rule));
    
    if (!matchesAnyShowRule) {
      logDebug(`文章 "${article.title.substring(0, 20)}..." 不匹配任何"只显示"规则，将被隐藏`, {
        articleId: article.id,
        showRulesCount: showOnlyRules.length
      });
      return true; // 不匹配任何"只显示"规则，所以隐藏
    } else {
      logDebug(`文章 "${article.title.substring(0, 20)}..." 匹配至少一条"只显示"规则，将被显示`, {
        articleId: article.id
      });
    }
  }
  
  // 如果通过了所有检查，则不隐藏
  return false;
};

/**
 * 内部辅助函数，检查单条规则是否匹配
 * @param article 文章对象
 * @param rule 过滤规则
 * @returns 是否匹配
 */
const checkMatch = (article: Article, rule: FilterRule): boolean => {
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
  const keywordsLower = rule.keywords.toLowerCase();
  
  // 分割关键词（按空格分割）
  const keywords = keywordsLower.split(/\s+/).filter(k => k.length > 0);
  
  if (keywords.length === 0) {
    return false;
  }

  // 记录详细日志
  logDebug(`检查文章 "${article.title.substring(0, 20)}..." 是否匹配规则:`, {
    ruleType: rule.type,
    ruleScope: rule.scope,
    keywords: keywords.join(', '),
    keywordLogic: rule.keywordLogic || 'OR'
  });

  // 根据 keywordLogic 执行匹配
  if (rule.keywordLogic === 'AND') {
    // AND 逻辑：必须所有关键词都存在
    const result = keywords.every(keyword => contentToCheck.includes(keyword));
    logDebug(`AND逻辑匹配结果: ${result ? '匹配' : '不匹配'}`);
    return result;
  } else {
    // OR 逻辑（默认）：任何一个关键词匹配即算成功
    const result = keywords.some(keyword => contentToCheck.includes(keyword));
    logDebug(`OR逻辑匹配结果: ${result ? '匹配' : '不匹配'}`);
    return result;
  }
};

/**
 * 为订阅源中的所有文章应用过滤规则
 * @param db 数据库实例
 * @param feedId 订阅源ID
 * @param rules 过滤规则
 */
export const applyFilterRulesToFeed = async (db: any, feedId: string, rules: FilterRule[]): Promise<number> => {
  if (!db || !feedId) {
    logWarn(`无法应用过滤规则：数据库未初始化或feedId不存在`);
    return 0;
  }

  logInfo(`开始为订阅源 ${feedId} 应用过滤规则`, { rulesCount: rules.length });
  
  // 只考虑激活的规则
  const activeRules = rules.filter(rule => rule.isActive);
  logInfo(`活跃的过滤规则数量: ${activeRules.length}/${rules.length}`);

  try {
    // 获取该订阅源的所有文章
    const articles = await db.articles.where('sourceId').equals(feedId).toArray();
    logInfo(`订阅源 ${feedId} 的文章总数: ${articles.length}`);
    
    // 记录需要更新的文章ID和它们的新状态
    const articlesToUpdate: { id: string, isHidden: boolean }[] = [];
    
    // 保存原始过滤状态，以便在应用后进行恢复
    const originalStates = new Map<string, boolean>();
    
    // 检查每篇文章是否应该被过滤
    for (const article of articles) {
      // 保存文章的原始过滤状态
      originalStates.set(article.id, article.isHidden === true);
      
      const shouldBeHidden = shouldArticleBeHidden(article, rules);
      
      // 如果过滤状态发生变化，则添加到更新列表
      if (article.isHidden !== shouldBeHidden) {
        articlesToUpdate.push({
          id: article.id,
          isHidden: shouldBeHidden
        });
        logInfo(`文章 "${article.title}" (ID: ${article.id}) 的过滤状态将从 ${article.isHidden} 变为 ${shouldBeHidden} (由订阅源规则决定)`);
      }
    }
    
    logInfo(`需要更新过滤状态的文章数量: ${articlesToUpdate.length}`);
    
    // 保存当前规则到数据库
    if (rules.length > 0) {
      logInfo(`保存 ${rules.length} 条规则到订阅源 ${feedId}`);
      
      // 确保rules是有效的数组
      const validatedRules = Array.isArray(rules) ? [...rules] : [];
      
      // 尝试保存订阅源过滤规则
      try {
        const feed = await db.feeds.get(feedId);
        if (feed) {
          // 确保feed.filterRules是数组
          feed.filterRules = validatedRules;
          await db.feeds.update(feedId, { filterRules: validatedRules });
          
          // 验证是否保存成功
          const updatedFeed = await db.feeds.get(feedId);
          if (updatedFeed && Array.isArray(updatedFeed.filterRules)) {
            logInfo(`成功保存规则到订阅源，保存后规则数量: ${updatedFeed.filterRules.length}`);
            
            // 检查规则数量是否一致
            if (updatedFeed.filterRules.length !== validatedRules.length) {
              logWarn(`警告: 保存的规则数量(${validatedRules.length})与数据库中的(${updatedFeed.filterRules.length})不一致!`);
            }
          } else {
            logError(`保存规则后，未能读取到有效的规则数组`);
          }
        }
      } catch (saveError) {
        logError(`保存规则到数据库时出错:`, saveError);
      }
    }
    
    // 批量更新文章
    if (articlesToUpdate.length > 0) {
      // 使用事务确保原子性更新
      await db.transaction('rw', db.articles, async () => {
        for (const update of articlesToUpdate) {
          // 设置isHidden状态，并添加一个更新时间戳，强制触发UI刷新
          await db.articles.update(update.id, { 
            isHidden: update.isHidden,
            lastUpdated: new Date().toISOString() // 添加时间戳强制刷新
          });
          
          // 额外记录日志
          logDebug(`已更新文章 ${update.id} 的过滤状态为 ${update.isHidden}`);
        }
      });
      
      logInfo(`已更新 ${articlesToUpdate.length} 篇文章的过滤状态`);
      
      // 触发一个额外的数据库操作，确保变更被提交
      await db.feeds.update(feedId, { lastRuleApplied: new Date().toISOString() });
    } else {
      logInfo(`没有文章需要更新过滤状态`);
    }
    
    // 计算未读数量
    await recalculateFeedUnreadCount(db, feedId);
    
    return articlesToUpdate.length;
  } catch (error) {
    logError(`应用过滤规则时出错:`, error);
    return 0;
  }
};

/**
 * 创建一个新的过滤规则对象
 */
export const createFilterRule = (
  scope: 'title' | 'content' | 'author', 
  type: 'contains' | 'not_contains', 
  keywords: string, 
  isActive: boolean = false,
  keywordLogic: 'OR' | 'AND' = 'OR'
): FilterRule => {
  return {
    id: uuidv4(),
    scope,
    type,
    keywords,
    isActive,
    keywordLogic,
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
    logError(`重新计算未读计数时出错:`, error);
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
    logWarn(`无法应用全局过滤规则：数据库未初始化`);
    return 0;
  }

  logInfo(`开始应用全局过滤规则`, { rulesCount: rules.length });
  
  // 只考虑激活的规则
  const activeRules = rules.filter(rule => rule.isActive);
  logInfo(`活跃的全局过滤规则数量: ${activeRules.length}/${rules.length}`);

  try {
    // 获取所有文章
    const articles = await db.articles.toArray();
    logInfo(`数据库中的文章总数: ${articles.length}`);
    
    // 获取所有订阅源及其过滤规则
    const feeds = await db.feeds.toArray();
    const feedRulesMap = new Map<string, FilterRule[]>();
    
    // 将每个订阅源的过滤规则存入Map，方便查找
    for (const feed of feeds) {
      if (feed.id && feed.filterRules && Array.isArray(feed.filterRules)) {
        feedRulesMap.set(feed.id, feed.filterRules);
      }
    }
    
    logInfo(`加载了 ${feedRulesMap.size} 个订阅源的过滤规则`);
    
    // 记录需要更新的文章ID和它们的新状态
    const articlesToUpdate: { id: string, isHidden: boolean }[] = [];
    
    // 检查每篇文章是否应该被过滤
    for (const article of articles) {
      // 首先检查文章所属订阅源的过滤规则
      let shouldBeHidden = false;
      
      // 如果文章有sourceId且订阅源有过滤规则，先应用订阅源规则
      if (article.sourceId && feedRulesMap.has(article.sourceId)) {
        const feedRules = feedRulesMap.get(article.sourceId) || [];
        shouldBeHidden = shouldArticleBeHidden(article, feedRules);
        
        // 如果订阅源规则已经决定隐藏文章，则无需应用全局规则
        if (shouldBeHidden) {
          // 如果过滤状态发生变化，则添加到更新列表
          if (article.isHidden !== shouldBeHidden) {
            articlesToUpdate.push({
              id: article.id,
              isHidden: true // 由订阅源规则决定隐藏
            });
            
            // 记录日志
            if (articlesToUpdate.length <= 10) {
              logInfo(`文章 "${article.title}" (ID: ${article.id}) 被订阅源规则隐藏，状态从 ${article.isHidden} 变为 true`);
            }
          }
          continue; // 跳过全局规则检查
        }
      }
      
      // 如果订阅源规则未决定隐藏，再应用全局规则
      const hiddenByGlobal = shouldArticleBeHidden(article, rules);
      
      // 最终状态：如果被任一规则隐藏则隐藏
      shouldBeHidden = hiddenByGlobal;
      
      // 如果过滤状态发生变化，则添加到更新列表
      if (article.isHidden !== shouldBeHidden) {
        articlesToUpdate.push({
          id: article.id,
          isHidden: shouldBeHidden
        });
        
        // 只记录前10条，避免日志过多
        if (articlesToUpdate.length <= 10) {
          logInfo(`文章 "${article.title}" (ID: ${article.id}, 来源: ${article.sourceId}) 的过滤状态将从 ${article.isHidden} 变为 ${shouldBeHidden} (全局规则决定)`);
        } else if (articlesToUpdate.length === 11) {
          logInfo(`还有更多文章需要更新，不再一一列出...`);
        }
      }
    }
    
    logInfo(`需要更新过滤状态的文章数量: ${articlesToUpdate.length}`);
    
    // 批量更新文章
    if (articlesToUpdate.length > 0) {
      await db.transaction('rw', db.articles, async () => {
        for (const update of articlesToUpdate) {
          await db.articles.update(update.id, { isHidden: update.isHidden });
        }
      });
      
      logInfo(`已更新 ${articlesToUpdate.length} 篇文章的过滤状态`);
    } else {
      logInfo(`没有文章需要更新过滤状态`);
    }
    
    // 更新所有订阅源的未读计数
    logInfo(`开始更新所有订阅源的未读计数`);
    logInfo(`订阅源总数: ${feeds.length}`);
    
    for (const feed of feeds) {
      if (feed.id) {
        const oldCount = feed.unreadCount;
        const newCount = await recalculateFeedUnreadCount(db, feed.id);
        if (oldCount !== newCount) {
          logInfo(`订阅源 "${feed.title}" (ID: ${feed.id}) 的未读计数从 ${oldCount} 更新为 ${newCount}`);
        }
      }
    }
    
    return articlesToUpdate.length;
  } catch (error) {
    logError(`应用全局过滤规则时出错:`, error);
    return 0;
  }
};

/**
 * 测试函数：验证订阅源过滤规则在数据库中的存储情况
 * @param db 数据库实例
 */
export const debugFeedFilterRules = async (db: any): Promise<void> => {
  if (!db) {
    logWarn(`无法调试过滤规则：数据库未初始化`);
    return;
  }

  try {
    // 获取所有订阅源
    const feeds = await db.feeds.toArray();
    logInfo(`订阅源总数: ${feeds.length}`);
    
    // 检查每个订阅源的过滤规则
    for (const feed of feeds) {
      if (feed.id) {
        logInfo(`-----------------------------------------------`);
        logInfo(`订阅源 "${feed.title}" (ID: ${feed.id})`);
        
        // 检查过滤规则
        if (feed.filterRules && Array.isArray(feed.filterRules)) {
          logInfo(`过滤规则数量: ${feed.filterRules.length}`);
          
          // 输出每条规则的详情
          feed.filterRules.forEach((rule: FilterRule, index: number) => {
            logInfo(`规则 #${index + 1}:`);
            logInfo(`  - ID: ${rule.id}`);
            logInfo(`  - 范围: ${rule.scope}`);
            logInfo(`  - 类型: ${rule.type}`);
            logInfo(`  - 关键词: ${rule.keywords}`);
            logInfo(`  - 激活状态: ${rule.isActive}`);
            logInfo(`  - 关键词逻辑: ${rule.keywordLogic || 'OR'}`);
          });
        } else {
          logInfo(`该订阅源没有过滤规则`);
        }
      }
    }
    
    logInfo(`-----------------------------------------------`);
    logInfo(`调试完成`);
  } catch (error) {
    logError(`调试过滤规则时出错:`, error);
  }
};

/**
 * 强制为所有订阅源应用过滤规则
 * @param db 数据库实例
 */
export const forceApplyAllFeedRules = async (db: any): Promise<void> => {
  if (!db) {
    logWarn(`无法应用规则：数据库未初始化`);
    return;
  }
  
  try {
    // 获取所有订阅源
    const feeds = await db.feeds.toArray();
    logInfo(`开始为 ${feeds.length} 个订阅源强制应用过滤规则`);
    
    for (const feed of feeds) {
      if (feed.id && feed.filterRules && Array.isArray(feed.filterRules)) {
        logInfo(`应用规则到订阅源: ${feed.title} (ID: ${feed.id}), 规则数量: ${feed.filterRules.length}`);
        await applyFilterRulesToFeed(db, feed.id, feed.filterRules);
      }
    }
    
    logInfo(`所有订阅源的过滤规则已应用完成`);
  } catch (error) {
    logError(`强制应用所有规则时出错:`, error);
  }
};

/**
 * 检查并修复所有订阅源的过滤规则
 * @param db 数据库实例
 */
export const checkAndFixAllFeedRules = async (db: any): Promise<void> => {
  if (!db) {
    logWarn(`无法检查规则：数据库未初始化`);
    return;
  }
  
  try {
    // 获取所有订阅源
    const feeds = await db.feeds.toArray();
    logInfo(`开始检查 ${feeds.length} 个订阅源的过滤规则`);
    
    let fixedCount = 0;
    
    for (const feed of feeds) {
      if (feed.id) {
        // 检查filterRules是否为有效数组
        if (!feed.filterRules || !Array.isArray(feed.filterRules)) {
          logInfo(`修复订阅源 "${feed.title}" (ID: ${feed.id}) 的过滤规则：初始化为空数组`);
          await db.feeds.update(feed.id, { filterRules: [] });
          fixedCount++;
        } else {
          // 检查每条规则的有效性
          const validRules = feed.filterRules.filter((rule: any) => {
            return rule && 
                   typeof rule === 'object' && 
                   rule.id && 
                   rule.scope && 
                   rule.type && 
                   typeof rule.keywords === 'string';
          });
          
          // 如果有无效规则，更新为有效规则
          if (validRules.length !== feed.filterRules.length) {
            logInfo(`修复订阅源 "${feed.title}" (ID: ${feed.id}) 的过滤规则：移除 ${feed.filterRules.length - validRules.length} 条无效规则`);
            await db.feeds.update(feed.id, { filterRules: validRules });
            fixedCount++;
          }
        }
      }
    }
    
    logInfo(`检查完成，修复了 ${fixedCount} 个订阅源的过滤规则`);
  } catch (error) {
    logError(`检查和修复规则时出错:`, error);
  }
};

/**
 * 应用所有过滤规则到所有文章
 * 这是一个总管函数，会应用全局规则和每个订阅源的规则
 * @param db 数据库实例
 * @param globalRules 全局过滤规则
 */
export const applyAllRulesToAllArticles = async (db: any, globalRules: FilterRule[]): Promise<void> => {
  if (!db) {
    logWarn(`无法应用规则：数据库未初始化`);
    return;
  }
  
  try {
    logInfo(`开始应用所有过滤规则到所有文章`);
    
    // 首先应用全局规则
    logInfo(`应用全局过滤规则...`);
    await applyGlobalFilterRules(db, globalRules);
    
    // 然后应用每个订阅源的规则
    logInfo(`应用各订阅源的过滤规则...`);
    await forceApplyAllFeedRules(db);
    
    logInfo(`所有过滤规则已应用完成`);
  } catch (error) {
    logError(`应用所有规则时出错:`, error);
  }
};