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
  parseRssFeed: (url: string) => ipcRenderer.invoke('parse-rss-feed', url),
  getRssFeedInfo: (url: string) => ipcRenderer.invoke('get-rss-feed-info', url),
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
  getLocalIconBase64: (filePath: string) => ipcRenderer.invoke('get-local-icon-base64', filePath),

  // 通信与事件监听
  onMessage: (channel: string, callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
    const handler = (event: Electron.IpcRendererEvent, ...args: any[]) => callback(event, ...args);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
  
  // AI 功能
  invokeAI: (type: 'summary' | 'mindmap' | 'highlight', content: string, contentText: string) => ipcRenderer.invoke('invokeAI', type, content, contentText),
  testDoubaoApi: (apiKey: string) => ipcRenderer.invoke('test-doubao-api', apiKey),
  streamAiSummary: (contentText: string) => ipcRenderer.send('stream-ai-summary', contentText),
  onAiSummaryUpdate: (callback: (type: 'chunk' | 'end' | 'error', data?: any) => void) => {
    const chunkHandler = (_: any, data: any) => callback('chunk', data);
    const endHandler = () => callback('end');
    const errorHandler = (_: any, error: any) => callback('error', error);

    ipcRenderer.on('ai-summary-stream-chunk', chunkHandler);
    ipcRenderer.on('ai-summary-stream-end', endHandler);
    ipcRenderer.on('ai-summary-stream-error', errorHandler);

    // 返回一个清理函数，用于移除监听器
    return () => {
      ipcRenderer.removeListener('ai-summary-stream-chunk', chunkHandler);
      ipcRenderer.removeListener('ai-summary-stream-end', endHandler);
      ipcRenderer.removeListener('ai-summary-stream-error', errorHandler);
    };
  },
  
  // 添加ipcRenderer接口，使前端能够使用主进程的功能
  ipcRenderer: {
    on: (channel: string, func: (...args: any[]) => void) => {
      const validChannels = ['ai-summary-update', 'filter-log-entry', 'new-articles'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    once: (channel: string, func: (...args: any[]) => void) => {
      const validChannels = ['ai-summary-update', 'filter-log-entry', 'new-articles'];
      if (validChannels.includes(channel)) {
        ipcRenderer.once(channel, (event, ...args) => func(...args));
      }
    },
    removeListener: (channel: string, listener: (...args: any[]) => void) => {
      const validChannels = ['ai-summary-update', 'filter-log-entry', 'new-articles'];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, listener);
      }
    },
    removeAllListeners: (channel: string) => {
      const validChannels = ['ai-summary-update', 'filter-log-entry', 'new-articles'];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel);
      }
    },
    send: (channel: string, ...args: any[]) => {
      const validChannels = ['update-filter-log', 'clear-filter-log'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },
    invoke: (channel: string, ...args: any[]) => {
      const validChannels = [
        'fetch-article-content', 
        'get-article-content', 
        'fetch-filter-rules', 
        'save-filter-rules',
        'proxy-image'
      ];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      return Promise.reject(new Error(`Invalid channel: ${channel}`));
    }
  }
});

// 暴露窗口控制API
contextBridge.exposeInMainWorld('electronWindowAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
}); 