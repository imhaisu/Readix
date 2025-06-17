import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { deepMerge } from '../utils/helpers';
import { Settings, defaultSettings } from '../types/settings';

// 设置上下文类型
interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>, isSilent?: boolean) => void;
  updateGeneralSettings: (newSettings: Partial<Settings['general']>) => void;
  updateReadingSettings: (newSettings: Partial<Settings['reading']>) => void;
  updateAdvancedSettings: (newSettings: Partial<Settings['advanced']>) => void;
  updateReadLaterSettings: (newSettings: Partial<Settings['readLater']>) => void;
  resetSettings: () => void;
  isInitialized: boolean;
}

// 创建上下文
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// 提供者组件Props类型
interface SettingsProviderProps {
  children: ReactNode;
}

// 设置提供者组件
export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [initialized, setInitialized] = useState(false);
  const didInit = useRef(false);

  // 从本地存储加载设置
  useEffect(() => {
    if (didInit.current) {
      return;
    }
    didInit.current = true;

    const initializeSettings = async () => {
      console.log('[SettingsContext] 开始初始化设置...');
      console.log('[SettingsContext] window.electron 是否存在:', !!window.electron);
      
      if (window.electron) {
        console.log('[SettingsContext] 使用 Electron Store 获取设置');
        try {
          const savedSettings = await window.electron.getSettings();
          if (savedSettings && Object.keys(savedSettings).length > 0) {
            console.log('[SettingsContext] 从 Electron Store 加载的设置:', savedSettings);
            setSettings(savedSettings);
          }
        } catch (error) {
          console.error('[SettingsContext] 从 Electron Store 获取设置时出错:', error);
        }
      } else {
        console.log('[SettingsContext] 使用 localStorage 获取设置');
        const savedSettings = localStorage.getItem('settings');
        console.log('[SettingsContext] localStorage 中的设置:', savedSettings);
        if (savedSettings) {
          try {
            const parsedSettings = JSON.parse(savedSettings);
            const mergedSettings = deepMerge(defaultSettings, parsedSettings);
            console.log('[SettingsContext] 解析并合并后的设置:', mergedSettings);
            setSettings(mergedSettings);
          } catch (e) {
            console.error('[SettingsContext] 解析设置时出错:', e);
          }
        }
      }
      console.log('[SettingsContext] 设置初始化完成，标记为已初始化');
      setInitialized(true);
    };

    initializeSettings();
  }, []);

  // 保存设置到存储
  const saveSettings = (newSettings: Settings) => {
    if (window.electron) {
      window.electron.saveSettings(newSettings);
    } else {
      localStorage.setItem('settings', JSON.stringify(newSettings));
    }
  };

  const updateSettings = (newSettings: Partial<Settings>, isSilent?: boolean) => {
    const updatedSettings = deepMerge(settings, newSettings);
    setSettings(updatedSettings);
    saveSettings(updatedSettings);
  };

  const updateGeneralSettings = (newGeneralSettings: Partial<Settings['general']>) => {
    const newSettings = { 
      ...settings, 
      general: { ...settings.general, ...newGeneralSettings } 
    };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const updateReadingSettings = (newReadingSettings: Partial<Settings['reading']>) => {
    const newSettings = { 
      ...settings, 
      reading: { ...settings.reading, ...newReadingSettings } 
    };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const updateAdvancedSettings = (newAdvancedSettings: Partial<Settings['advanced']>) => {
    const newSettings = { 
      ...settings, 
      advanced: { ...settings.advanced, ...newAdvancedSettings } 
    };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const updateReadLaterSettings = (newReadLaterSettings: Partial<Settings['readLater']>) => {
    const newSettings = { 
      ...settings, 
      readLater: { ...settings.readLater, ...newReadLaterSettings } 
    };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    saveSettings(defaultSettings);
  };

  const value = {
    settings,
    updateSettings,
    updateGeneralSettings,
    updateReadingSettings,
    updateAdvancedSettings,
    updateReadLaterSettings,
    resetSettings,
    isInitialized: initialized
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

// 自定义钩子，用于组件中获取设置上下文
export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}; 