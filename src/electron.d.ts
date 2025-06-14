// src/electron.d.ts

// 定义通过 preload.ts 暴露到渲染进程的 electronAPI 的类型
export interface IElectronAPI {
  getSettings: () => any; // 同步获取设置
  saveSettings: (settings: any) => void;
  restartApp: () => void;
  
  // 特定于 'refresh-all' 事件的监听器
  onRefreshAll: (callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => () => void;
  
  // 通用消息监听器
  onMessage: (channel: string, callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => () => void;
  
  // 发送消息到主进程的 'app-message' 通道
  sendAppMessage: (payload: { type: string; data?: any }) => void;

  // RSS 解析相关
  parseRssFeed: (feedUrl: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  getRssFeedInfo: (feedUrl: string) => Promise<{ success: boolean; data?: { title?: string; url?: string; description?: string; icon?: string }; error?: string }>;
  getLocalIconBase64: (iconPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  
  // 新增：获取平台信息
  getPlatform: () => Promise<'darwin' | 'win32' | 'linux'>;
  // 新增：在外部浏览器打开链接的API
  shellOpenExternal: (url: string) => Promise<void>;
  
  // 窗口控制 (这些可能实际上在 window.electronWindow 上)
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isWindowMaximized: () => Promise<boolean>;

  // 新增：导出OPML
  exportOpml: (opmlContent: string) => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean; }>;
  importOpml: () => Promise<{ success: boolean; content?: string; error?: string; canceled?: boolean; }>;
}

// 为 electronWindowAPI 添加类型定义
export interface IElectronWindowAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
    electronWindow?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
    };
    electronWindowAPI: IElectronWindowAPI;
  }
} 