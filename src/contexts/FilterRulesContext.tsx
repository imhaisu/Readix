import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useDatabase } from './DatabaseContext';
import { FilterRule } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { applyGlobalFilterRules } from '../utils/filterUtils';

// 全局过滤规则的本地存储键
const GLOBAL_FILTER_RULES_KEY = 'global_filter_rules';

// 过滤规则上下文类型
interface FilterRulesContextType {
  globalFilterRules: FilterRule[];
  addGlobalFilterRule: (rule: Omit<FilterRule, 'id'>) => void;
  updateGlobalFilterRule: (id: string, changes: Partial<Omit<FilterRule, 'id'>>) => void;
  deleteGlobalFilterRule: (id: string) => void;
  applyGlobalRules: () => Promise<number>;
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
    console.log('[DEBUG] 检查本地存储中的全局过滤规则:');
    console.log(`[DEBUG] 原始字符串: ${savedRules}`);
    
    if (savedRules) {
      try {
        const parsedRules = JSON.parse(savedRules);
        console.log(`[DEBUG] 解析后的规则: `, parsedRules);
        console.log(`[DEBUG] 规则数量: ${parsedRules.length}`);
        console.log(`[DEBUG] 规则类型: ${typeof parsedRules}`);
        console.log(`[DEBUG] 是否为数组: ${Array.isArray(parsedRules)}`);
        
        if (Array.isArray(parsedRules)) {
          parsedRules.forEach((rule, index) => {
            console.log(`[DEBUG] 规则 #${index + 1}:`);
            console.log(`[DEBUG]   ID: ${rule.id}`);
            console.log(`[DEBUG]   范围: ${rule.scope}`);
            console.log(`[DEBUG]   类型: ${rule.type}`);
            console.log(`[DEBUG]   关键词: ${rule.keywords}`);
            console.log(`[DEBUG]   状态: ${rule.isActive ? '激活' : '未激活'}`);
          });
        }
      } catch (parseError) {
        console.error('[DEBUG] 解析JSON失败:', parseError);
      }
    } else {
      console.log('[DEBUG] 本地存储中没有找到全局过滤规则');
    }
  } catch (error) {
    console.error('[DEBUG] 调试全局过滤规则时出错:', error);
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
        console.log('[FilterRulesContext] 从本地存储加载全局过滤规则:', savedRules);
        if (savedRules) {
          const parsedRules = JSON.parse(savedRules) as FilterRule[];
          console.log('[FilterRulesContext] 解析后的全局过滤规则:', JSON.stringify(parsedRules));
          setGlobalFilterRules(parsedRules);
        } else {
          console.log('[FilterRulesContext] 本地存储中没有找到全局过滤规则');
        }
      } catch (error) {
        console.error('[FilterRulesContext] 加载全局过滤规则失败:', error);
        // 如果加载失败，重置为空数组
        setGlobalFilterRules([]);
      }
    };

    loadGlobalRules();
  }, []);

  // 保存全局过滤规则到本地存储
  const saveGlobalRules = (rules: FilterRule[]) => {
    try {
      console.log('[FilterRulesContext] 保存全局过滤规则到本地存储:', JSON.stringify(rules));
      localStorage.setItem(GLOBAL_FILTER_RULES_KEY, JSON.stringify(rules));
    } catch (error) {
      console.error('[FilterRulesContext] 保存全局过滤规则失败:', error);
    }
  };

  // 添加全局过滤规则
  const addGlobalFilterRule = (rule: Omit<FilterRule, 'id'>) => {
    const newRule: FilterRule = {
      ...rule,
      id: uuidv4()
    };
    const updatedRules = [...globalFilterRules, newRule];
    setGlobalFilterRules(updatedRules);
    saveGlobalRules(updatedRules);
  };

  // 更新全局过滤规则
  const updateGlobalFilterRule = (id: string, changes: Partial<Omit<FilterRule, 'id'>>) => {
    const updatedRules = globalFilterRules.map(rule => 
      rule.id === id ? { ...rule, ...changes } : rule
    );
    setGlobalFilterRules(updatedRules);
    saveGlobalRules(updatedRules);
  };

  // 删除全局过滤规则
  const deleteGlobalFilterRule = (id: string) => {
    const updatedRules = globalFilterRules.filter(rule => rule.id !== id);
    setGlobalFilterRules(updatedRules);
    saveGlobalRules(updatedRules);
  };

  // 应用全局过滤规则
  const applyGlobalRules = async (): Promise<number> => {
    if (!db || !isInitialized) {
      console.log('[FilterRulesContext] 数据库未初始化，无法应用全局过滤规则');
      return 0;
    }

    console.log('[FilterRulesContext] 开始应用全局过滤规则:', JSON.stringify(globalFilterRules));
    setIsLoading(true);
    try {
      const updatedCount = await applyGlobalFilterRules(db, globalFilterRules);
      console.log(`[FilterRulesContext] 应用全局过滤规则完成，更新了 ${updatedCount} 篇文章`);
      
      // 触发文章列表和计数刷新
      triggerArticleListRefresh();
      triggerFeedCountRefresh();
      
      return updatedCount;
    } catch (error) {
      console.error('[FilterRulesContext] 应用全局过滤规则失败:', error);
      return 0;
    } finally {
      setIsLoading(false);
    }
  };

  // 当全局规则变化时自动应用
  useEffect(() => {
    if (db && isInitialized && globalFilterRules.length > 0) {
      console.log('[FilterRulesContext] 全局过滤规则变化，准备应用:', JSON.stringify(globalFilterRules));
      
      // 延迟应用全局规则，确保订阅源规则已经加载
      const timer = setTimeout(() => {
        console.log('[FilterRulesContext] 开始应用延迟的全局过滤规则');
        applyGlobalRules();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [db, isInitialized, globalFilterRules]);

  const value = {
    globalFilterRules,
    addGlobalFilterRule,
    updateGlobalFilterRule,
    deleteGlobalFilterRule,
    applyGlobalRules,
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