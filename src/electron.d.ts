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
      getAppVersion: () => Promise<string>;
      getPlatform: () => Promise<'darwin' | 'win32' | 'linux'>;
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
      };
      titleBar: {
        doubleClickHandler: () => void;
        updateTrafficLightsPosition: (x: number, y: number) => void;
      };
      feedUtilities: {
        testFeedUrl: (url: string) => Promise<any>;
      };
      openLink: (url: string) => void;
      openFile: (path: string) => void;
      focusWindow: () => void;
      fetchFilterRules: () => Promise<any>;
      openFilterLog: () => Promise<void>;
      saveFilterRules: (rules: any) => Promise<void>;
      updateArticles: (feedId: string) => Promise<void>;
      refreshFeed: (feedId: string) => Promise<void>;
      fetchArticleContent: (url: string) => Promise<any>;
      getArticleContent: (url: string) => Promise<any>;
      getSystemFonts: () => Promise<string[]>;
      getDarkMode: () => Promise<boolean>;
      getSavedSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<void>;
      showSaveDialog: (options: any) => Promise<any>;
      exportArticles: (options: any) => Promise<any>;
      importOPML: () => Promise<any>;
      exportOPML: () => Promise<any>;
      refreshAllFeeds: (feeds: any[]) => Promise<any>;
      // AI 功能
      invokeAI: (type: 'mindmap' | 'highlight' | 'summary', content: string, contentText: string) => Promise<any>;
      streamAiSummary: (contentText: string) => void;
      onAiSummaryUpdate: (callback: (type: 'chunk' | 'end' | 'error', data?: any) => void) => () => void;
      testDoubaoApi: (apiKey: string) => Promise<any>;
      // 外部链接
      shellOpenExternal: (url: string) => Promise<void>;
      ipcRenderer: {
        on: (channel: string, listener: (...args: any[]) => void) => void;
        once: (channel: string, listener: (...args: any[]) => void) => void;
        removeListener: (channel: string, listener: (...args: any[]) => void) => void;
        removeAllListeners: (channel: string) => void;
        send: (channel: string, ...args: any[]) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
    };
  }
}

export {}; 