import { contextBridge, ipcRenderer } from 'electron';

// 向渲染进程暴露API
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取设置 (异步)
  getSettings: () => {
    console.log('[Preload] 调用 get-settings');
    return ipcRenderer.invoke('get-settings');
  },
  
  // 保存设置 (异步)
  saveSettings: (settings: any) => {
    console.log('[Preload] 调用 save-settings, 数据:', settings);
    ipcRenderer.send('save-settings', settings);
  },
  
  // 重启应用
  restartApp: () => {
    ipcRenderer.send('app-message', { type: 'restart-app' });
  },
  
  // 特定于 'refresh-all' 事件的监听器 (原 onMessage)
  onRefreshAll: (callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
    const handler = (event: Electron.IpcRendererEvent, ...args: any[]) => callback(event, ...args);
    ipcRenderer.on('refresh-all', handler);
    return () => {
      ipcRenderer.removeListener('refresh-all', handler);
    };
  },

  // 通用消息监听器 (原 receive)，返回一个取消订阅的函数
  onMessage: (channel: string, callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
    const handler = (event: Electron.IpcRendererEvent, ...args: any[]) => callback(event, ...args);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },

  // 发送消息到主进程的 'app-message' 通道 (原 app)
  sendAppMessage: (payload: { type: string; data?: any }) => {
    ipcRenderer.send('app-message', payload);
  },

  // RSS 解析相关 (调用主进程)
  parseRssFeed: (feedUrl: string) => ipcRenderer.invoke('parse-rss-feed', feedUrl),
  getRssFeedInfo: (feedUrl: string) => ipcRenderer.invoke('get-rss-feed-info', feedUrl),
  getLocalIconBase64: (iconPath: string) => ipcRenderer.invoke('get-local-icon-base64', iconPath),
  // 新增：获取当前操作系统平台
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  // 新增：在外部浏览器打开链接
  shellOpenExternal: (url: string) => ipcRenderer.invoke('shell-open-external', url),
  // 新增：导出 OPML 文件
  exportOpml: (opmlContent: string) => ipcRenderer.invoke('export-opml', opmlContent),
  // 新增：导入 OPML 文件
  importOpml: () => ipcRenderer.invoke('import-opml'),
});

// 暴露窗口控制API
contextBridge.exposeInMainWorld('electronWindowAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
}); 