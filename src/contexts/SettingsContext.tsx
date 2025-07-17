import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { mergeWith } from 'lodash';
import { Settings, defaultSettings, GeneralSettings, AppearanceSettings, AdvancedSettings, LayoutSettings } from '../types/settings';
import { message } from 'antd';

type Theme = 'light' | 'dark' | 'system';

// 定义 Context 的类型
interface SettingsContextType {
  settings: Settings;
  isInitialized: boolean;
  theme: Theme;
  updateSettings: (settings: Partial<Settings>) => void;
  updateGeneralSettings: (settings: Partial<GeneralSettings>) => void;
  updateAppearanceSettings: (settings: Partial<AppearanceSettings>) => void;
  updateAdvancedSettings: (settings: Partial<AdvancedSettings>) => void;
  updateLayoutSettings: (settings: Partial<LayoutSettings>) => void;
  resetSettings: () => void;
  setTheme: (theme: Theme) => void;
}

// 创建上下文，并使用导入的默认设置
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// 提供者组件Props类型
interface SettingsProviderProps {
  children: React.ReactNode;
}

// 设置提供者组件
export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isInitialized, setIsInitialized] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');

  // 从本地存储加载设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // 使用正确的API名称
        const storedSettings = await window.electron.getSettings();
        if (storedSettings) {
          console.log('[SettingsContext] 加载到保存的设置:', storedSettings);
          const mergedSettings = mergeWith({}, defaultSettings, storedSettings, (objValue, srcValue) => {
            if (Array.isArray(objValue)) {
              return srcValue; // 对于数组，直接使用新值替换旧值
            }
          });
          setSettings(mergedSettings);
        } else {
          console.log('[SettingsContext] 未找到保存的设置，使用默认值');
          setSettings(defaultSettings);
        }
      } catch (error) {
        console.error('加载设置失败，使用默认值', error);
        setSettings(defaultSettings);
      } finally {
        setIsInitialized(true);
      }
    };

    loadSettings();
  }, []);

  // 当设置变化时，持久化存储
  useEffect(() => {
    if (isInitialized) {
      try {
        // 保存设置到electron存储
        window.electron.saveSettings(settings);
        console.log('[SettingsContext] 设置已保存:', settings);
      } catch (error) {
        console.error('[SettingsContext] 保存设置失败:', error);
      }
    }
  }, [settings, isInitialized]);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings(prev => {
      // 使用 lodash.merge 进行深度合并
      const mergedSettings = mergeWith({}, prev, newSettings, (objValue, srcValue) => {
        if (Array.isArray(objValue)) {
          return srcValue; // 对于数组，直接使用新值替换旧值
        }
      });
      console.log('[SettingsContext] Settings saved:', mergedSettings);
      if (window.electron && window.electron.saveSettings) {
        window.electron.saveSettings(mergedSettings);
      }
      return mergedSettings;
    });
  }, []);

  // 更新通用设置
  const updateGeneralSettings = useCallback((newGeneralSettings: Partial<GeneralSettings>) => {
    setSettings(prev => ({ ...prev, general: mergeWith({}, prev.general, newGeneralSettings, (objValue, srcValue) => {
      if (Array.isArray(objValue)) {
        return srcValue; // 对于数组，直接使用新值替换旧值
      }
    }) }));
  }, []);

  // 更新外观设置
  const updateAppearanceSettings = useCallback((newAppearanceSettings: Partial<AppearanceSettings>) => {
    setSettings(prev => ({ ...prev, appearance: mergeWith({}, prev.appearance, newAppearanceSettings, (objValue, srcValue) => {
      if (Array.isArray(objValue)) {
        return srcValue; // 对于数组，直接使用新值替换旧值
      }
    }) }));
  }, []);

  // 更新高级设置
  const updateAdvancedSettings = useCallback((newAdvancedSettings: Partial<AdvancedSettings>) => {
    setSettings(prev => ({ ...prev, advanced: mergeWith({}, prev.advanced, newAdvancedSettings, (objValue, srcValue) => {
      if (Array.isArray(objValue)) {
        return srcValue; // 对于数组，直接使用新值替换旧值
      }
    }) }));
  }, []);

  // 更新布局设置
  const updateLayoutSettings = useCallback((newLayoutSettings: Partial<LayoutSettings>) => {
    setSettings(prev => ({ ...prev, layout: mergeWith({}, prev.layout, newLayoutSettings, (objValue, srcValue) => {
      if (Array.isArray(objValue)) {
        return srcValue; // 对于数组，直接使用新值替换旧值
      }
    }) }));
  }, []);

  // 重置所有设置
  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
    message.success('所有设置已恢复为默认值。');
  }, []);

  const contextValue = {
    settings,
    isInitialized,
    theme,
    updateSettings,
    updateGeneralSettings,
    updateAppearanceSettings,
    updateAdvancedSettings,
    updateLayoutSettings,
    resetSettings,
    setTheme,
  };

  return (
    <SettingsContext.Provider value={contextValue}>
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