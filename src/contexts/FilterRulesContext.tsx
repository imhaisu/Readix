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
        if (savedRules) {
          const parsedRules = JSON.parse(savedRules) as FilterRule[];
          setGlobalFilterRules(parsedRules);
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
      return 0;
    }

    setIsLoading(true);
    try {
      const updatedCount = await applyGlobalFilterRules(db, globalFilterRules);
      
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
      applyGlobalRules();
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