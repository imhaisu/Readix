// src/electron.d.ts

interface FeedSource {
  id?: string;
  title: string;
  url: string;
  iconUrl?: string;
  groupId?: string;
}

declare global {
  interface Window {
    electron: {
      // 应用信息
      getAppVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      
      // 窗口控制
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
      };
      
      // 设置
      getSettings: () => Promise<any>;
      saveSettings: (settings: any) => void;
      
      // RSS 相关
      parseRssFeed: (url: string) => Promise<any>;
      getRssFeedInfo: (url: string) => Promise<any>;
      
      // 文章内容获取
      fetchArticleContent: (url: string) => Promise<any>;
      
      // OPML 导入导出
      importOPML: () => Promise<any>;
      exportOPML: (opmlContent: string) => Promise<any>;
      
      // 系统交互
      shellOpenExternal: (url: string) => Promise<boolean>;
      getLocalIconBase64: (iconPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;

      // 应用更新
      checkForUpdates: () => Promise<{ success: boolean; error?: string; updateInfo?: any }>;
      checkForUpdatesManual: () => Promise<{
        success: boolean;
        error?: string;
        updateAvailable?: boolean;
        version?: string;
        releaseDate?: string;
        releaseNotes?: string;
        downloadUrl?: string;
        message?: string;
      }>;
      onUpdateStatus: (callback: (event: any, status: any) => void) => () => void;
      offUpdateStatus: (callback: (event: any, status: any) => void) => void;

      // AI相关
      invokeAI: (type: string, content: string, contentText: string) => Promise<any>;
      testDoubaoApi: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
      streamAiSummary: (contentText: string) => void;
      onAiSummaryUpdate: (callback: (type: string, data?: any) => void) => () => void;
      offAiSummaryUpdate: (callback: (type: string, data?: any) => void) => void;
      
      // IPC通信
      ipcRenderer: {
        on: (channel: string, func: (...args: any[]) => void) => void;
        once: (channel: string, func: (...args: any[]) => void) => void;
        removeListener: (channel: string, func: (...args: any[]) => void) => void;
        removeAllListeners: (channel: string) => void;
        send: (channel: string, ...args: any[]) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
    };
    electronWindowAPI: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
    };
  }
}

export {}; 