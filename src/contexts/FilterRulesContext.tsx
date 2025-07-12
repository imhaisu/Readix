import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useDatabase } from './DatabaseContext';
import { FilterRule } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { applyAllRulesToAllArticles } from '../utils/filterApplier';
import { message } from 'antd';
import { LogConfig } from '../utils/logConfig';

// 全局过滤规则的本地存储键
const GLOBAL_FILTER_RULES_KEY = 'global_filter_rules';

// 过滤规则上下文类型
interface FilterRulesContextType {
  globalFilterRules: FilterRule[];
  addGlobalFilterRule: (rule: Omit<FilterRule, 'id'>) => void;
  updateGlobalFilterRule: (id: string, changes: Partial<Omit<FilterRule, 'id'>>) => void;
  deleteGlobalFilterRule: (id: string) => void;
  isLoading: boolean;
}

// 创建上下文
const FilterRulesContext = createContext<FilterRulesContextType | undefined>(undefined);

// 提供者组件Props类型
interface FilterRulesProviderProps {
  children: ReactNode;
}

// 调试函数：检查全局过滤规则
export const debugGlobalFilterRules = () => {
  try {
    const savedRules = localStorage.getItem(GLOBAL_FILTER_RULES_KEY);
    LogConfig.debug('FILTER', '检查本地存储中的全局过滤规则:');
    LogConfig.debug('FILTER', `原始字符串: ${savedRules}`);
    
    if (savedRules) {
      try {
        const parsedRules = JSON.parse(savedRules);
        LogConfig.debug('FILTER', '解析后的规则: ', parsedRules);
        LogConfig.debug('FILTER', `规则数量: ${parsedRules.length}`);
        LogConfig.debug('FILTER', `规则类型: ${typeof parsedRules}`);
        LogConfig.debug('FILTER', `是否为数组: ${Array.isArray(parsedRules)}`);
        
        if (Array.isArray(parsedRules)) {
          parsedRules.forEach((rule, index) => {
            LogConfig.debug('FILTER', `规则 #${index + 1}:`);
            LogConfig.debug('FILTER', `  ID: ${rule.id}`);
            LogConfig.debug('FILTER', `  范围: ${rule.scope}`);
            LogConfig.debug('FILTER', `  类型: ${rule.type}`);
            LogConfig.debug('FILTER', `  关键词: ${rule.keywords}`);
            LogConfig.debug('FILTER', `  状态: ${rule.isActive ? '激活' : '未激活'}`);
          });
        }
      } catch (parseError) {
        LogConfig.error('FILTER', '解析JSON失败:', parseError);
      }
    } else {
      LogConfig.debug('FILTER', '本地存储中没有找到全局过滤规则');
    }
  } catch (error) {
    LogConfig.error('FILTER', '调试全局过滤规则时出错:', error);
  }
};

// 过滤规则提供者组件
export const FilterRulesProvider: React.FC<FilterRulesProviderProps> = ({ children }) => {
  const { db, isInitialized, triggerArticleListRefresh, triggerFeedCountRefresh } = useDatabase();
  const [globalFilterRules, setGlobalFilterRules] = useState<FilterRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 加载全局过滤规则
  useEffect(() => {
    const loadGlobalRules = () => {
      try {
        const savedRules = localStorage.getItem(GLOBAL_FILTER_RULES_KEY);
        LogConfig.info('FILTER', '从本地存储加载全局阅读偏好:', savedRules);
        if (savedRules) {
          const parsedRules = JSON.parse(savedRules) as FilterRule[];
          LogConfig.info('FILTER', '解析后的全局阅读偏好:', JSON.stringify(parsedRules));
          setGlobalFilterRules(parsedRules);
        } else {
          LogConfig.info('FILTER', '本地存储中没有找到全局阅读偏好');
        }
      } catch (error) {
        LogConfig.error('FILTER', '加载全局阅读偏好失败:', error);
        // 如果加载失败，重置为空数组
        setGlobalFilterRules([]);
      }
    };

    loadGlobalRules();
  }, []);

  // 在数据库初始化后自动应用所有规则
  useEffect(() => {
    if (db && isInitialized) {
      LogConfig.info('FILTER', '数据库已初始化，自动应用所有过滤规则');
      // 延迟一点执行，确保其他组件已经加载完成
      const timer = setTimeout(() => {
        // 先检查并输出所有规则
        debugGlobalFilterRules();
        
        // 获取所有订阅源规则并输出
        db.feeds.toArray().then(feeds => {
          let totalRules = 0;
          let feedsWithRules = 0;
          
          feeds.forEach(feed => {
            if (feed.filterRules && Array.isArray(feed.filterRules) && feed.filterRules.length > 0) {
              const activeRules = feed.filterRules.filter(r => r.isActive);
              LogConfig.info('FILTER', `订阅源 "${feed.title}" 有 ${activeRules.length}/${feed.filterRules.length} 条激活规则`);
              totalRules += feed.filterRules.length;
              feedsWithRules++;
            }
          });
          
          LogConfig.info('FILTER', `共有 ${feedsWithRules}/${feeds.length} 个订阅源设置了过滤规则，总计 ${totalRules} 条规则`);
        });
        
        // 应用所有规则
        applyAllRulesToAllArticles(db).then(count => {
          LogConfig.info('FILTER', `应用启动时应用规则完成，处理了 ${count} 篇文章`);
          if (count > 0) {
            triggerArticleListRefresh();
            triggerFeedCountRefresh();
          }
        }).catch(error => {
          LogConfig.error('FILTER', '应用启动时应用规则失败:', error);
        });
      }, 1500); // 增加延迟时间，确保数据库完全初始化
      
      return () => clearTimeout(timer);
    }
  }, [db, isInitialized, triggerArticleListRefresh, triggerFeedCountRefresh]);

  // 保存全局过滤规则到本地存储
  const saveGlobalRules = (rules: FilterRule[]) => {
    try {
      LogConfig.info('FILTER', '保存全局阅读偏好到本地存储:', JSON.stringify(rules));
      localStorage.setItem(GLOBAL_FILTER_RULES_KEY, JSON.stringify(rules));
    } catch (error) {
      LogConfig.error('FILTER', '保存全局阅读偏好失败:', error);
    }
  };

  // 统一的规则应用触发器
  const triggerRuleApplication = () => {
    if (!db || !isInitialized) {
      LogConfig.warn('FILTER', '数据库未初始化，无法应用规则');
      return;
    }
    
    setIsLoading(true);

    applyAllRulesToAllArticles(db).then(count => {
      triggerArticleListRefresh();
      triggerFeedCountRefresh();
    }).catch(error => {
      console.error('Failed to apply rules:', error);
    }).finally(() => {
      setIsLoading(false);
    });
  };

  // 添加全局过滤规则
  const addGlobalFilterRule = (rule: Omit<FilterRule, 'id'>) => {
    const newRule: FilterRule = {
      id: uuidv4(),
      scope: rule.scope,
      type: rule.type,
      keywords: rule.keywords,
      isActive: rule.isActive,
      keywordLogic: rule.keywordLogic || 'OR',
    };
    const updatedRules = [...globalFilterRules, newRule];
    setGlobalFilterRules(updatedRules);
    saveGlobalRules(updatedRules);
    triggerRuleApplication();
  };

  // 更新全局过滤规则
  const updateGlobalFilterRule = (id: string, changes: Partial<Omit<FilterRule, 'id'>>) => {
    const updatedRules = globalFilterRules.map(rule => 
      rule.id === id ? { ...rule, ...changes, keywordLogic: changes.keywordLogic || rule.keywordLogic || 'OR' } : rule
    );
    setGlobalFilterRules(updatedRules);
    saveGlobalRules(updatedRules);
    triggerRuleApplication();
  };

  // 删除全局过滤规则
  const deleteGlobalFilterRule = (id: string) => {
    const updatedRules = globalFilterRules.filter(rule => rule.id !== id);
    setGlobalFilterRules(updatedRules);
    saveGlobalRules(updatedRules);
    triggerRuleApplication();
  };

  const value = {
    globalFilterRules,
    addGlobalFilterRule,
    updateGlobalFilterRule,
    deleteGlobalFilterRule,
    isLoading
  };

  return <FilterRulesContext.Provider value={value}>{children}</FilterRulesContext.Provider>;
};

// 自定义钩子，用于组件中获取过滤规则上下文
export const useFilterRules = (): FilterRulesContextType => {
  const context = useContext(FilterRulesContext);
  if (context === undefined) {
    throw new Error('useFilterRules must be used within a FilterRulesProvider');
  }
  return context;
}; 