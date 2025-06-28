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
      getPlatform: () => Promise<'darwin' | 'win32' | 'linux'>;

      // 窗口控制
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
      };
      
      // 设置
      getSettings: () => Promise<any>; // 这里的 any 可以替换为更具体的 Settings 类型
      saveSettings: (settings: any) => void;
      
      // 订阅源、文章、内容抓取
      parseRssFeed: (url: string) => Promise<any>;
      getRssFeedInfo: (url: string) => Promise<any>;
      addFeed: (feedData: FeedSource) => Promise<any>; // 替换为具体的返回值类型
      deleteFeed: (feedId: string) => Promise<void>;
      updateFeed: (feedId: string, updates: Partial<FeedSource>) => Promise<void>;
      getFeeds: () => Promise<FeedSource[]>; // 假设返回 FeedSource 数组
      fetchArticleContent: (url: string) => Promise<{ title: string; content: string } | null>;

      // OPML
      importOpml: () => Promise<any>; // 替换为具体的 OPML 导入结果类型
      exportOpml: (opmlContent: string) => Promise<void>;

      // 系统交互
      shellOpenExternal: (url: string) => Promise<void>;
      getSystemIcon: (type: 'folder' | 'file') => Promise<string>; // 假设返回 base64 字符串
      getLocalIconBase64: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;

      // 通信与事件监听
      onMessage: (channel: string, callback: (...args: any[]) => void) => () => void;

      // AI 功能
      invokeAI: (type: 'summary' | 'mindmap' | 'highlight', content: string, contentText: string) => Promise<{ success: boolean; data?: any; error?: string }>;
      testDoubaoApi: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
      streamAiSummary: (contentText: string) => void;
      onAiSummaryUpdate: (callback: (type: 'chunk' | 'end' | 'error', data?: any) => void) => () => void;
    };
  }
}

export {}; 