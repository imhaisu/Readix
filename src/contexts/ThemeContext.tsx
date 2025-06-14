import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// 主题类型
type ThemeType = 'light' | 'dark' | 'system';

// 上下文类型
interface ThemeContextType {
  theme: ThemeType; // 当前主题
  actualTheme: 'light' | 'dark'; // 实际应用的主题
  setTheme: (theme: ThemeType) => void;
}

// 创建上下文
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// 提供者组件Props类型
interface ThemeProviderProps {
  children: ReactNode;
}

// 从系统获取主题偏好
const getSystemTheme = (): 'light' | 'dark' => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

// 主题提供者组件
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeType>('system');
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>(getSystemTheme());

  // 监听系统主题变化
  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      const handleChange = (e: MediaQueryListEvent) => {
        setActualTheme(e.matches ? 'dark' : 'light');
      };
      
      mediaQuery.addEventListener('change', handleChange);
      
      // 初始设置
      setActualTheme(getSystemTheme());
      
      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    } else {
      setActualTheme(theme as 'light' | 'dark');
    }
  }, [theme]);

  // 处理主题变更
  const handleThemeChange = (newTheme: ThemeType) => {
    setTheme(newTheme);
    localStorage.setItem('theme-preference', newTheme);
  };

  // 从本地存储中恢复主题设置
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme-preference');
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system')) {
      setTheme(savedTheme as ThemeType);
    }
  }, []);

  const value = {
    theme,
    actualTheme,
    setTheme: handleThemeChange,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// 自定义钩子，用于组件中获取主题上下文
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}; 