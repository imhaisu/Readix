import { contextBridge, ipcRenderer } from 'electron';

// 这是一个临时的解决方案，用来解决类型引用的问题。
// 理想情况下，这些共享的类型应该被定义在一个独立的文件中，
// 这样主进程和渲染进程都可以安全地引用它，而无需直接依赖 React 组件。
interface FeedSource {
  id?: string;
  title: string;
  url: string;
  iconUrl?: string;
  groupId?: string;
}

// 向渲染进程统一暴露所有API
contextBridge.exposeInMainWorld('electron', {
  // 应用信息
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // 窗口控制
  windowControls: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  },
  
  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.send('save-settings', settings),
  
  // 订阅源、文章、内容抓取
  fetchAndParseFeed: (url: string) => ipcRenderer.invoke('fetch-and-parse-feed', url),
  addFeed: (feedData: FeedSource) => ipcRenderer.invoke('add-feed', feedData),
  deleteFeed: (feedId: string) => ipcRenderer.invoke('delete-feed', feedId),
  updateFeed: (feedId: string, updates: Partial<FeedSource>) => ipcRenderer.invoke('update-feed', feedId, updates),
  getFeeds: () => ipcRenderer.invoke('get-feeds'),
  fetchArticleContent: (url: string) => ipcRenderer.invoke('fetch-article-content', url),

  // OPML
  importOpml: () => ipcRenderer.invoke('import-opml'),
  exportOpml: (opmlContent: string) => ipcRenderer.invoke('export-opml', opmlContent),

  // 系统交互
  shellOpenExternal: (url: string) => ipcRenderer.invoke('shell-open-external', url),
  getSystemIcon: (type: 'folder' | 'file') => ipcRenderer.invoke('get-system-icon', type),
  readIconFile: (filePath: string) => ipcRenderer.invoke('read-icon-file', filePath),

  // 通信与事件监听
  onMessage: (channel: string, callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
    const handler = (event: Electron.IpcRendererEvent, ...args: any[]) => callback(event, ...args);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
});

// 暴露窗口控制API
contextBridge.exposeInMainWorld('electronWindowAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
}); 