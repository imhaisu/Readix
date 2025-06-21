import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Settings, defaultSettings } from '../types/settings';
import { deepMerge } from '../utils/helpers'; // 假设你有一个 deepMerge 工具函数

// 设置上下文类型
interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  updateGeneralSettings: (newSettings: Partial<Settings['general']>) => void;
  updateAppearanceSettings: (newSettings: Partial<Settings['appearance']>) => void;
  updateAdvancedSettings: (newSettings: Partial<Settings['advanced']>) => void;
  updateLayoutSettings: (newSettings: Partial<Settings['layout']>) => void; // 新增
  resetSettings: () => void;
  isInitialized: boolean;
}

// 创建上下文，并使用导入的默认设置
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// 提供者组件Props类型
interface SettingsProviderProps {
  children: ReactNode;
}

// 设置提供者组件
export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isInitialized, setIsInitialized] = useState(false);

  // 从本地存储加载设置
  useEffect(() => {
    const initializeSettings = async () => {
      try {
        const savedSettings = localStorage.getItem('settings');
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings);
          // 使用 deepMerge 来合并，防止部分设置丢失
          const mergedSettings = deepMerge(defaultSettings, parsedSettings);
          setSettings(mergedSettings);
        }
      } catch (error) {
        console.error('[SettingsContext] Failed to load settings:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    initializeSettings();
  }, []);

  const saveSettings = (newSettings: Settings) => {
    try {
      localStorage.setItem('settings', JSON.stringify(newSettings));
    } catch (error) {
      console.error('[SettingsContext] Failed to save settings:', error);
    }
  };

  const updateSettings = (newSettings: Partial<Settings>) => {
    const updatedSettings = deepMerge(settings, newSettings);
    setSettings(updatedSettings);
    saveSettings(updatedSettings);
  };

  const createSettingUpdater = <K extends keyof Settings>(key: K) => (
    (newValues: Partial<Settings[K]>) => {
      const newSettings = {
        ...settings,
        [key]: {
          ...settings[key],
          ...newValues,
        },
      };
      setSettings(newSettings);
      saveSettings(newSettings);
    }
  );

  const updateGeneralSettings = createSettingUpdater('general');
  const updateAppearanceSettings = createSettingUpdater('appearance');
  const updateAdvancedSettings = createSettingUpdater('advanced');
  const updateLayoutSettings = createSettingUpdater('layout');

  const resetSettings = () => {
    setSettings(defaultSettings);
    saveSettings(defaultSettings);
  };

  const value = {
    settings,
    updateSettings,
    updateGeneralSettings,
    updateAppearanceSettings,
    updateAdvancedSettings,
    updateLayoutSettings, // 新增
    resetSettings,
    isInitialized,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

// 自定义钩子，用于组件中获取设置上下文
export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}; 