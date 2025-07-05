import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useDatabase } from './DatabaseContext';
import { FilterRule } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { applyGlobalFilterRules } from '../utils/filterUtils';
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
        LogConfig.info('FILTER', '从本地存储加载全局过滤规则:', savedRules);
        if (savedRules) {
          const parsedRules = JSON.parse(savedRules) as FilterRule[];
          LogConfig.info('FILTER', '解析后的全局过滤规则:', JSON.stringify(parsedRules));
          setGlobalFilterRules(parsedRules);
        } else {
          LogConfig.info('FILTER', '本地存储中没有找到全局过滤规则');
        }
      } catch (error) {
        LogConfig.error('FILTER', '加载全局过滤规则失败:', error);
        // 如果加载失败，重置为空数组
        setGlobalFilterRules([]);
      }
    };

    loadGlobalRules();
  }, []);

  // 保存全局过滤规则到本地存储
  const saveGlobalRules = (rules: FilterRule[]) => {
    try {
      LogConfig.info('FILTER', '保存全局过滤规则到本地存储:', JSON.stringify(rules));
      localStorage.setItem(GLOBAL_FILTER_RULES_KEY, JSON.stringify(rules));
    } catch (error) {
      LogConfig.error('FILTER', '保存全局过滤规则失败:', error);
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
    
    message.success('全局规则已添加，正在应用...');
  };

  // 更新全局过滤规则
  const updateGlobalFilterRule = (id: string, changes: Partial<Omit<FilterRule, 'id'>>) => {
    const updatedRules = globalFilterRules.map(rule => 
      rule.id === id ? { ...rule, ...changes } : rule
    );
    setGlobalFilterRules(updatedRules);
    saveGlobalRules(updatedRules);
    
    message.success('全局规则已更新，正在应用...');
  };

  // 删除全局过滤规则
  const deleteGlobalFilterRule = (id: string) => {
    const updatedRules = globalFilterRules.filter(rule => rule.id !== id);
    setGlobalFilterRules(updatedRules);
    saveGlobalRules(updatedRules);
    
    message.success('全局规则已删除，正在应用...');
  };

  // 应用全局过滤规则
  const applyGlobalRules = async (): Promise<number> => {
    if (!db || !isInitialized) {
      LogConfig.warn('FILTER', '数据库未初始化，无法应用全局过滤规则');
      return 0;
    }

    LogConfig.info('FILTER', '开始应用全局过滤规则:', JSON.stringify(globalFilterRules));
    setIsLoading(true);
    try {
      const updatedCount = await applyGlobalFilterRules(db, globalFilterRules);
      LogConfig.info('FILTER', `应用全局过滤规则完成，更新了 ${updatedCount} 篇文章`);
      
      // 触发文章列表和计数刷新
      triggerArticleListRefresh();
      triggerFeedCountRefresh();
      
      return updatedCount;
    } catch (error) {
      LogConfig.error('FILTER', '应用全局过滤规则失败:', error);
      message.error('应用全局规则失败');
      return 0;
    } finally {
      setIsLoading(false);
    }
  };

  // 当全局规则变化时自动应用
  useEffect(() => {
    if (db && isInitialized && globalFilterRules.length > 0) {
      LogConfig.info('FILTER', '全局过滤规则变化，立即应用');
      
      // 立即应用全局规则
      applyGlobalRules().then(count => {
        // 移除这里的toast提示，仅在手动操作时显示
        // if (count > 0) {
        //   message.success(`全局规则已应用，更新了 ${count} 篇文章`);
        // }
      });
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