import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LayoutContextProps {
  isFeedListVisible: boolean;
  setIsFeedListVisible: (visible: boolean) => void;
  isArticleListVisible: boolean;
  setIsArticleListVisible: (visible: boolean) => void;
}

const LayoutContext = createContext<LayoutContextProps | undefined>(undefined);

export const LayoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isFeedListVisible, setIsFeedListVisible] = useState(true);
  const [isArticleListVisible, setIsArticleListVisible] = useState(true);

  const value = {
    isFeedListVisible,
    setIsFeedListVisible,
    isArticleListVisible,
    setIsArticleListVisible,
  };

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
};

export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}; 