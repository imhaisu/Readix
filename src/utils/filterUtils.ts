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
    
    // 获取要检查的关键词，转为小写
    const keywordsLower = rule.keywords.toLowerCase();
    
    // 打印调试信息
    console.log(`[FilterDebug] 检查文章 "${article.title.substring(0, 20)}..." 是否包含关键词 "${rule.keywords}"，比较内容: "${contentToCheck.substring(0, 50)}..."`);
    
    // 分割关键词（按空格分割）
    const keywords = keywordsLower.split(/\s+/).filter(k => k.length > 0);
    
    // 如果没有有效关键词，则规则不适用
    if (keywords.length === 0) {
      return false;
    }
    
    // 检查是否任何关键词匹配（OR逻辑）
    let hasMatch = false;
    let matchedKeyword = '';
    
    for (const keyword of keywords) {
      // 直接使用字符串的includes方法进行子字符串匹配
      const isMatched = contentToCheck.includes(keyword);
      console.log(`[FilterDebug] 关键词 "${keyword}" 与内容匹配: ${isMatched}`);
      
      if (isMatched) {
        hasMatch = true;
        matchedKeyword = keyword;
        break;
      }
    }
    
    // 根据规则类型返回结果
    const result = rule.type === 'contains' ? hasMatch : !hasMatch;
    
    // 如果匹配了特定的关键词，输出详细日志
    if (result) {
      const sourceId = article.sourceId || 'unknown';
      const matchReason = hasMatch 
        ? `匹配关键词"${matchedKeyword}"` 
        : `不包含任何关键词`;
      
      console.log(`[FilterRule] 文章"${article.title.substring(0, 30)}..."(来源ID:${sourceId})：${rule.type === 'contains' ? '包含' : '不包含'}规则匹配 - ${matchReason}`);
    }
    
    return result;
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
    console.log(`[FilterUtils] 无法应用过滤规则：数据库未初始化或feedId不存在`);
    return 0;
  }

  console.log(`[FilterUtils] 开始为订阅源 ${feedId} 应用过滤规则:`, JSON.stringify(rules));
  
  // 只考虑激活的规则
  const activeRules = rules.filter(rule => rule.isActive);
  console.log(`[FilterUtils] 活跃的过滤规则数量: ${activeRules.length}/${rules.length}`);

  try {
    // 获取该订阅源的所有文章
    const articles = await db.articles.where('sourceId').equals(feedId).toArray();
    console.log(`[FilterUtils] 订阅源 ${feedId} 的文章总数: ${articles.length}`);
    
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
        console.log(`[FilterUtils] 文章 "${article.title}" (ID: ${article.id}) 的过滤状态将从 ${article.isHidden} 变为 ${shouldBeHidden} (由订阅源规则决定)`);
      }
    }
    
    console.log(`[FilterUtils] 需要更新过滤状态的文章数量: ${articlesToUpdate.length}`);
    
    // 保存当前规则到数据库
    if (rules.length > 0) {
      console.log(`[FilterUtils] 保存 ${rules.length} 条规则到订阅源 ${feedId}`);
      
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
            console.log(`[FilterUtils] 成功保存规则到订阅源，保存后规则数量: ${updatedFeed.filterRules.length}`);
            
            // 检查规则数量是否一致
            if (updatedFeed.filterRules.length !== validatedRules.length) {
              console.warn(`[FilterUtils] 警告: 保存的规则数量(${validatedRules.length})与数据库中的(${updatedFeed.filterRules.length})不一致!`);
            }
          } else {
            console.error(`[FilterUtils] 保存规则后，未能读取到有效的规则数组`);
          }
        }
      } catch (saveError) {
        console.error(`[FilterUtils] 保存规则到数据库时出错:`, saveError);
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
          console.log(`[FilterUtils] 已更新文章 ${update.id} 的过滤状态为 ${update.isHidden}`);
        }
      });
      
      console.log(`[FilterUtils] 已更新 ${articlesToUpdate.length} 篇文章的过滤状态`);
      
      // 触发一个额外的数据库操作，确保变更被提交
      await db.feeds.update(feedId, { lastRuleApplied: new Date().toISOString() });
    } else {
      console.log(`[FilterUtils] 没有文章需要更新过滤状态`);
    }
    
    // 计算未读数量
    await recalculateFeedUnreadCount(db, feedId);
    
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
    console.log(`[FilterUtils] 无法应用全局过滤规则：数据库未初始化`);
    return 0;
  }

  console.log(`[FilterUtils] 开始应用全局过滤规则:`, JSON.stringify(rules));
  
  // 只考虑激活的规则
  const activeRules = rules.filter(rule => rule.isActive);
  console.log(`[FilterUtils] 活跃的全局过滤规则数量: ${activeRules.length}/${rules.length}`);

  try {
    // 获取所有文章
    const articles = await db.articles.toArray();
    console.log(`[FilterUtils] 数据库中的文章总数: ${articles.length}`);
    
    // 获取所有订阅源及其过滤规则
    const feeds = await db.feeds.toArray();
    const feedRulesMap = new Map<string, FilterRule[]>();
    
    // 将每个订阅源的过滤规则存入Map，方便查找
    for (const feed of feeds) {
      if (feed.id && feed.filterRules && Array.isArray(feed.filterRules)) {
        feedRulesMap.set(feed.id, feed.filterRules);
      }
    }
    
    console.log(`[FilterUtils] 加载了 ${feedRulesMap.size} 个订阅源的过滤规则`);
    
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
              console.log(`[FilterUtils] 文章 "${article.title}" (ID: ${article.id}) 被订阅源规则隐藏，状态从 ${article.isHidden} 变为 true`);
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
          console.log(`[FilterUtils] 文章 "${article.title}" (ID: ${article.id}, 来源: ${article.sourceId}) 的过滤状态将从 ${article.isHidden} 变为 ${shouldBeHidden} (全局规则决定)`);
        } else if (articlesToUpdate.length === 11) {
          console.log(`[FilterUtils] 还有更多文章需要更新，不再一一列出...`);
        }
      }
    }
    
    console.log(`[FilterUtils] 需要更新过滤状态的文章数量: ${articlesToUpdate.length}`);
    
    // 批量更新文章
    if (articlesToUpdate.length > 0) {
      await db.transaction('rw', db.articles, async () => {
        for (const update of articlesToUpdate) {
          await db.articles.update(update.id, { isHidden: update.isHidden });
        }
      });
      
      console.log(`[FilterUtils] 已更新 ${articlesToUpdate.length} 篇文章的过滤状态`);
    } else {
      console.log(`[FilterUtils] 没有文章需要更新过滤状态`);
    }
    
    // 更新所有订阅源的未读计数
    console.log(`[FilterUtils] 开始更新所有订阅源的未读计数`);
    console.log(`[FilterUtils] 订阅源总数: ${feeds.length}`);
    
    for (const feed of feeds) {
      if (feed.id) {
        const oldCount = feed.unreadCount;
        const newCount = await recalculateFeedUnreadCount(db, feed.id);
        if (oldCount !== newCount) {
          console.log(`[FilterUtils] 订阅源 "${feed.title}" (ID: ${feed.id}) 的未读计数从 ${oldCount} 更新为 ${newCount}`);
        }
      }
    }
    
    return articlesToUpdate.length;
  } catch (error) {
    console.error(`[FilterUtils] 应用全局过滤规则时出错:`, error);
    return 0;
  }
};

/**
 * 测试函数：验证订阅源过滤规则在数据库中的存储情况
 * @param db 数据库实例
 */
export const debugFeedFilterRules = async (db: any): Promise<void> => {
  if (!db) {
    console.log(`[FilterUtils] 无法调试过滤规则：数据库未初始化`);
    return;
  }

  try {
    // 获取所有订阅源
    const feeds = await db.feeds.toArray();
    console.log(`[FilterUtils] 订阅源总数: ${feeds.length}`);
    
    // 检查每个订阅源的过滤规则
    for (const feed of feeds) {
      if (feed.id) {
        console.log(`-----------------------------------------------`);
        console.log(`[FilterUtils] 订阅源 "${feed.title}" (ID: ${feed.id}):`);
        
        // 检查是否有过滤规则
        if (feed.filterRules && Array.isArray(feed.filterRules) && feed.filterRules.length > 0) {
          console.log(`[FilterUtils] 发现 ${feed.filterRules.length} 条过滤规则:`);
          
          // 打印每条规则的详细信息
          feed.filterRules.forEach((rule: FilterRule, index: number) => {
            console.log(`[FilterUtils]   规则 #${index + 1}:`);
            console.log(`[FilterUtils]     ID: ${rule.id}`);
            console.log(`[FilterUtils]     范围: ${rule.scope}`);
            console.log(`[FilterUtils]     类型: ${rule.type}`);
            console.log(`[FilterUtils]     关键词: ${rule.keywords}`);
            console.log(`[FilterUtils]     状态: ${rule.isActive ? '激活' : '未激活'}`);
          });
          
          // 检查激活的规则数量
          const activeRules = feed.filterRules.filter((rule: FilterRule) => rule.isActive);
          console.log(`[FilterUtils]   其中激活的规则: ${activeRules.length}/${feed.filterRules.length}`);
        } else {
          console.log(`[FilterUtils] 没有找到过滤规则`);
        }
      }
    }
    
    console.log(`-----------------------------------------------`);
    console.log(`[FilterUtils] 调试信息结束`);
  } catch (error) {
    console.error(`[FilterUtils] 调试过滤规则时出错:`, error);
  }
};

/**
 * 强制应用所有订阅源的过滤规则
 * 这个函数会遍历所有订阅源，应用它们各自的过滤规则
 * @param db 数据库实例
 */
export const forceApplyAllFeedRules = async (db: any): Promise<number> => {
  if (!db) {
    console.log('[FilterUtils] 无法应用规则：数据库未初始化');
    return 0;
  }
  
  console.log('[FilterUtils] 开始强制应用所有订阅源的过滤规则...');
  
  try {
    // 获取所有订阅源
    const feeds = await db.feeds.toArray();
    console.log(`[FilterUtils] 找到 ${feeds.length} 个订阅源`);
    
    let totalUpdated = 0;
    
    // 遍历每个订阅源
    for (const feed of feeds) {
      if (!feed.id) continue;
      
      // 检查是否有过滤规则
      if (feed.filterRules && Array.isArray(feed.filterRules) && feed.filterRules.length > 0) {
        console.log(`[FilterUtils] 为订阅源 "${feed.title}" 应用 ${feed.filterRules.length} 条规则`);
        
        // 获取该订阅源的所有文章
        const articles = await db.articles.where('sourceId').equals(feed.id).toArray();
        console.log(`[FilterUtils] 订阅源 "${feed.title}" 有 ${articles.length} 篇文章`);
        
        // 记录需要更新的文章
        const articlesToUpdate: { id: string, isHidden: boolean }[] = [];
        
        // 检查每篇文章
        for (const article of articles) {
          // 进行详细的调试
          console.log(`[FilterDebug] 正在检查文章: "${article.title.substring(0, 30)}..."`);
          
          const shouldBeHidden = shouldArticleBeHidden(article, feed.filterRules);
          
          // 检查文章是否应该被过滤但当前未被过滤
          if (shouldBeHidden !== article.isHidden) {
            articlesToUpdate.push({
              id: article.id,
              isHidden: shouldBeHidden
            });
            
            // 记录日志（限制数量）
            if (articlesToUpdate.length <= 5) {
              console.log(`[FilterUtils] 文章 "${article.title}" 的过滤状态将从 ${article.isHidden} 变为 ${shouldBeHidden} (由订阅源规则决定)`);
            } else if (articlesToUpdate.length === 6) {
              console.log(`[FilterUtils] 还有更多文章需要更新，不再一一列出...`);
            }
          }
        }
        
        // 批量更新文章
        if (articlesToUpdate.length > 0) {
          await db.transaction('rw', db.articles, async () => {
            for (const update of articlesToUpdate) {
              // 设置isHidden状态，并添加一个更新时间戳，强制触发UI刷新
              await db.articles.update(update.id, { 
                isHidden: update.isHidden,
                lastUpdated: new Date().toISOString() // 添加时间戳强制刷新
              });
              
              // 额外记录日志
              console.log(`[FilterUtils] 已更新文章 ${update.id} 的过滤状态为 ${update.isHidden}`);
            }
          });
          
          // 触发一个额外的数据库操作，确保变更被提交
          await db.feeds.update(feed.id, { lastRuleApplied: new Date().toISOString() });
          
          console.log(`[FilterUtils] 已更新订阅源 "${feed.title}" 的 ${articlesToUpdate.length} 篇文章的过滤状态`);
          totalUpdated += articlesToUpdate.length;
        } else {
          console.log(`[FilterUtils] 订阅源 "${feed.title}" 没有文章需要更新过滤状态`);
        }
      }
    }
    
    console.log(`[FilterUtils] 强制应用规则完成，共更新 ${totalUpdated} 篇文章`);
    
    // 如果有更新，执行一个全局刷新操作
    if (totalUpdated > 0) {
      console.log(`[FilterUtils] 执行全局刷新操作...`);
      await db.settings.update('general', { lastFilterUpdate: new Date().toISOString() });
    }
    
    return totalUpdated;
  } catch (error) {
    console.error('[FilterUtils] 强制应用规则时出错:', error);
    return 0;
  }
};

/**
 * 检查并修复所有订阅源的过滤规则，确保它们正确应用
 * 在应用启动时调用此函数以确保规则一致性
 * @param db 数据库实例
 */
export const checkAndFixAllFeedRules = async (db: any): Promise<void> => {
  if (!db) {
    console.log('[FilterUtils] 无法检查规则：数据库未初始化');
    return;
  }
  
  console.log('[FilterUtils] 开始检查所有订阅源的过滤规则...');
  
  try {
    // 获取所有订阅源
    const feeds = await db.feeds.toArray();
    console.log(`[FilterUtils] 找到 ${feeds.length} 个订阅源需要检查`);
    
    let totalInconsistencies = 0;
    
    // 遍历每个订阅源
    for (const feed of feeds) {
      if (!feed.id) continue;
      
      // 检查是否有过滤规则
      if (feed.filterRules && Array.isArray(feed.filterRules) && feed.filterRules.length > 0) {
        console.log(`[FilterUtils] 检查订阅源 "${feed.title}" 的 ${feed.filterRules.length} 条规则`);
        
        // 获取该订阅源的所有文章
        const articles = await db.articles.where('sourceId').equals(feed.id).toArray();
        
        // 记录需要修复的文章
        const articlesToFix: { id: string, isHidden: boolean }[] = [];
        
        // 检查每篇文章
        for (const article of articles) {
          const shouldBeHidden = shouldArticleBeHidden(article, feed.filterRules);
          
          // 如果实际状态与应有状态不符
          if (shouldBeHidden !== article.isHidden) {
            articlesToFix.push({
              id: article.id,
              isHidden: shouldBeHidden
            });
            
            // 记录前几条不一致的情况
            if (articlesToFix.length <= 3) {
              console.log(`[FilterUtils] 发现不一致: 文章 "${article.title}" 应为 ${shouldBeHidden} 但当前为 ${article.isHidden}`);
            } else if (articlesToFix.length === 4) {
              console.log(`[FilterUtils] 还有更多不一致...`);
            }
          }
        }
        
        // 修复不一致的文章
        if (articlesToFix.length > 0) {
          console.log(`[FilterUtils] 修复订阅源 "${feed.title}" 的 ${articlesToFix.length} 篇文章`);
          totalInconsistencies += articlesToFix.length;
          
          await db.transaction('rw', db.articles, async () => {
            for (const fix of articlesToFix) {
              await db.articles.update(fix.id, { isHidden: fix.isHidden });
            }
          });
        } else {
          console.log(`[FilterUtils] 订阅源 "${feed.title}" 的所有文章过滤状态都是一致的`);
        }
      }
    }
    
    console.log(`[FilterUtils] 检查完成，修复了 ${totalInconsistencies} 个不一致问题`);
  } catch (error) {
    console.error('[FilterUtils] 检查和修复规则时出错:', error);
  }
}; 