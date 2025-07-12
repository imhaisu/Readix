import { Article, FilterRule, TopicFilterRule } from '../db/database';
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

// 计算阅读时间（粗略估计：按照300字/分钟的阅读速度）
export const estimateReadingTime = (content: string): number => {
  if (!content) return 0;
  
  // 去除HTML标签
  const textContent = content.replace(/<[^>]*>/g, '');
  // 中文字符按字数计算，英文单词按单词数计算
  const chineseChars = textContent.match(/[\u4e00-\u9fa5]/g) || [];
  const words = textContent.match(/[a-zA-Z]+/g) || [];
  
  // 中文字符数 + 英文单词数
  const totalUnits = chineseChars.length + words.length;
  
  // 按照300字/分钟计算
  return Math.ceil(totalUnits / 300);
};

// 提取文章的域名
export const extractDomain = (url: string): string => {
  try {
    const domainMatch = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n]+)/im);
    return domainMatch ? domainMatch[1] : '';
  } catch (error) {
    console.error('URL解析错误', error);
    return '';
  }
};

// 检查文章是否包含图片
export const hasImages = (content: string): boolean => {
  return /<img[^>]*>/i.test(content);
};

// 应用单个过滤规则
export const applyTopicFilterRule = (article: Article, rule: TopicFilterRule): boolean => {
  if (!rule.isActive) return true; // 规则未启用，默认通过
  
  const { field, operation, value } = rule;
  
  switch (field) {
    case 'title':
      return applyStringRule(article.title, operation, value as string);
      
    case 'content':
      return applyStringRule(article.content, operation, value as string);
      
    case 'summary':
      return applyStringRule(article.summary || '', operation, value as string);
      
    case 'author':
      return applyStringRule(article.author || '', operation, value as string);
      
    case 'publishDate':
      const pubDate = new Date(article.publishDate).getTime();
      if (operation === 'between' && Array.isArray(value)) {
        const now = Date.now();
        // 将天数转换为毫秒
        const [min, max] = value as [number, number];
        const minDate = now - max * 24 * 60 * 60 * 1000; // 较早的日期
        const maxDate = now - min * 24 * 60 * 60 * 1000; // 较晚的日期
        return pubDate >= minDate && pubDate <= maxDate;
      }
      return applyNumberRule(pubDate, operation, value as number);
      
    case 'readingTime':
      const readingTime = estimateReadingTime(article.content);
      return applyNumberRule(readingTime, operation, value as number);
      
    case 'hasImages':
      const articleHasImages = hasImages(article.content);
      return operation === 'exists' ? articleHasImages : !articleHasImages;
      
    case 'domain':
      const domain = extractDomain(article.url);
      return applyStringRule(domain, operation, value as string);
      
    case 'tags':
      if (!article.tags || article.tags.length === 0) return operation === 'not_contains';
      return applyArrayStringRule(article.tags, operation, value as string);
      
    default:
      return true;
  }
};

// 应用字符串规则
const applyStringRule = (text: string, operation: string, value: string): boolean => {
  const lowerText = text.toLowerCase();
  const lowerValue = value.toLowerCase();
  
  // 处理多个关键词（逗号分隔）
  if (operation === 'contains' || operation === 'not_contains') {
    const keywords = lowerValue.split(',').map(k => k.trim()).filter(Boolean);
    const containsAny = keywords.some(keyword => lowerText.includes(keyword));
    return operation === 'contains' ? containsAny : !containsAny;
  }
  
  // 精确匹配
  if (operation === 'equals') return lowerText === lowerValue;
  if (operation === 'not_equals') return lowerText !== lowerValue;
  
  return true;
};

// 应用数字规则
const applyNumberRule = (num: number, operation: string, value: number): boolean => {
  if (operation === 'greater_than') return num > value;
  if (operation === 'less_than') return num < value;
  return true;
};

// 应用字符串数组规则
const applyArrayStringRule = (arr: string[], operation: string, value: string): boolean => {
  const keywords = value.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
  
  if (operation === 'contains') {
    return keywords.some(keyword => 
      arr.some(tag => tag.toLowerCase().includes(keyword))
    );
  }
  
  if (operation === 'not_contains') {
    return !keywords.some(keyword => 
      arr.some(tag => tag.toLowerCase().includes(keyword))
    );
  }
  
  if (operation === 'equals') {
    return arr.some(tag => keywords.includes(tag.toLowerCase()));
  }
  
  if (operation === 'not_equals') {
    return !arr.some(tag => keywords.includes(tag.toLowerCase()));
  }
  
  return true;
};

// 应用主题的所有过滤规则
export const applyTopicFilterRules = (article: Article, rules: TopicFilterRule[]): boolean => {
  if (!rules || rules.length === 0) return true;
  
  // 分为AND和OR两组规则
  const andRules = rules.filter(rule => rule.isActive && rule.logic === 'AND');
  const orRules = rules.filter(rule => rule.isActive && rule.logic === 'OR');
  
  // AND规则必须全部通过
  const passAnd = andRules.every(rule => applyTopicFilterRule(article, rule));
  if (!passAnd) return false;
  
  // OR规则至少要有一个通过（如果有OR规则的话）
  if (orRules.length > 0) {
    const passOr = orRules.some(rule => applyTopicFilterRule(article, rule));
    return passOr;
  }
  
  return true;
}; 