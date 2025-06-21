import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

// 定义筛选器的可能值
export type FilterType = 'all' | 'unread' | 'starred';

// 定义 Context 的类型
interface FilterContextType {
  filter: FilterType;
  setFilter: (filter: FilterType) => void;
}

// 创建 Context，并提供一个默认值
const FilterContext = createContext<FilterContextType | undefined>(undefined);

// 定义 Provider 的 props 类型
interface FilterProviderProps {
  children: ReactNode;
}

// 创建 Provider 组件
export const FilterProvider: React.FC<FilterProviderProps> = ({ children }) => {
  // 从 localStorage 初始化 state，这和我们在 HomePage 中做的一样
  const [filter, setFilterState] = useState<FilterType>(() => {
    const savedFilter = localStorage.getItem('activeListFilter');
    return (savedFilter === 'all' || savedFilter === 'unread' || savedFilter === 'starred') ? savedFilter : 'all';
  });

  // 当 filter 状态改变时，保存到 localStorage
  useEffect(() => {
    localStorage.setItem('activeListFilter', filter);
  }, [filter]);

  // 创建一个包装过的 setFilter 函数，用于更新状态
  const setFilter = (newFilter: FilterType) => {
    setFilterState(newFilter);
  };

  return (
    <FilterContext.Provider value={{ filter, setFilter }}>
      {children}
    </FilterContext.Provider>
  );
};

// 创建一个自定义 Hook，方便在组件中使用
export const useFilter = (): FilterContextType => {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error('useFilter 必须在 FilterProvider 内部使用');
  }
  return context;
}; 