import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell, dialog } from 'electron';
import path from 'path';
import * as url from 'url';
import fs from 'fs';
import fsPromises from 'fs/promises';
import Store from 'electron-store';
import Parser from 'rss-parser';
import axios from 'axios';
import crypto from 'crypto';
import type { Settings } from '../src/types/settings'; // 导入类型

// 初始化配置存储
const store = new Store< { settings: Settings } >();

const faviconsDir = path.join(app.getPath('userData'), 'favicons');

// 控制应用生命周期和创建原生浏览器窗口的模块
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  // 确保 favicons 目录存在
  if (!fs.existsSync(faviconsDir)) {
    fs.mkdirSync(faviconsDir, { recursive: true });
    console.log(`[Main Process] Created favicons directory at: ${faviconsDir}`);
  }

  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false, // 先不显示窗口，等待加载完成
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      webSecurity: true // 总是启用web安全
    },
    // 在 macOS 上，任务栏中的应用图标是系统默认提供的
    titleBarStyle: 'hidden', // 在 macOS 上使用自定义标题栏
    titleBarOverlay: true,
  });

  // 添加窗口加载状态监听器
  mainWindow.webContents.on('did-start-loading', () => {
    console.log('[Main Process] Window started loading...');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main Process] Window finished loading successfully');
    if (mainWindow) {
      mainWindow.show(); // 加载完成后显示窗口
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[Main Process] Failed to load URL:', validatedURL);
    console.error('[Main Process] Error Code:', errorCode);
    console.error('[Main Process] Error Description:', errorDescription);
    
    // 尝试显示错误页面或重新加载
    if (mainWindow) {
      mainWindow.show(); // 即使失败也显示窗口，这样用户可以看到开发者工具
    }
  });

  mainWindow.webContents.on('dom-ready', () => {
    console.log('[Main Process] DOM ready');
  });

  // 设置内容安全策略 (CSP)
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const newHeaders = { ...details.responseHeaders };
    
    // 移除 Electron 默认的不安全 CSP
    delete newHeaders['content-security-policy'];
    
    const scriptSrc = ["'self'"];
    const connectSrc = ["'self'", "https:"];

    if (isDevelopment) {
      // 开发模式下，Vite HMR 需要 'unsafe-inline'
      scriptSrc.push("'unsafe-inline'");
      // 开发模式下，Vite HMR 通过 WebSocket 连接
      connectSrc.push("ws:");
    }

    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc.join(' ')}`,
      "style-src 'self' 'unsafe-inline'", // antd 等UI库需要 'unsafe-inline'
      "img-src 'self' data: https:",
      `connect-src ${connectSrc.join(' ')}`,
      "object-src 'none'",
      "frame-src 'none'",
    ].join('; ');

    newHeaders['Content-Security-Policy'] = [csp];

    callback({ responseHeaders: newHeaders });
  });

  // 加载应用
  if (isDevelopment) {
    // 开发模式下，加载 localhost URL
    const devURL = 'http://localhost:3000';
    console.log('[Main Process] Development mode - loading:', devURL);
    mainWindow.loadURL(devURL);
    // 打开开发者工具
    // mainWindow.webContents.openDevTools();
  } else {
    // 生产模式下，加载打包后的静态文件
    // 直接加载renderer目录中的index.html，这样所有相对路径都是正确的
    const prodPath = path.join(__dirname, '../renderer/index.html');
    const prodURL = url.pathToFileURL(prodPath).toString();
    
    console.log('[Main Process] Production mode');
    console.log('[Main Process] __dirname:', __dirname);
    console.log('[Main Process] Resolved HTML path:', prodPath);
    console.log('[Main Process] Production URL to load:', prodURL);
    console.log('[Main Process] File exists check:', fs.existsSync(prodPath));
    
    // 检查关键文件是否存在
    if (fs.existsSync(prodPath)) {
      console.log('[Main Process] HTML file found, loading...');
      mainWindow.loadURL(prodURL);
    } else {
      console.error('[Main Process] HTML file not found at:', prodPath);
      // 尝试其他可能的路径
      const alternatePath = path.join(__dirname, '../index.html');
      console.log('[Main Process] Trying alternate path:', alternatePath);
      if (fs.existsSync(alternatePath)) {
        const alternateURL = url.pathToFileURL(alternatePath).toString();
        console.log('[Main Process] Alternate file found, loading:', alternateURL);
        mainWindow.loadURL(alternateURL);
      } else {
        console.error('[Main Process] No valid HTML file found');
        // 显示错误信息
        mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
          <html>
            <head><title>加载错误</title></head>
            <body>
              <h1>应用加载失败</h1>
              <p>无法找到应用文件。请检查构建是否正确完成。</p>
              <p>预期路径: ${prodPath}</p>
              <p>备选路径: ${alternatePath}</p>
            </body>
          </html>
        `));
      }
    }
    
    // 在生产模式下也打开开发者工具，方便调试白屏问题
    // mainWindow.webContents.openDevTools();
  }

  // 当窗口关闭时取消引用
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 暂时禁用系统托盘图标，直到解决图标问题
  // createTray();
}

function createTray() {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    try {
      // 尝试创建托盘图标，如果失败则跳过
      let iconPath = '';
      
      if (isDevelopment) {
        // 尝试先找 .png，不存在则尝试 .svg
        const pngPath = path.join(process.cwd(), 'public/icon.png');
        const svgPath = path.join(process.cwd(), 'public/icon.svg');
        
        iconPath = fs.existsSync(pngPath) ? pngPath : (fs.existsSync(svgPath) ? svgPath : '');
      } else {
        // 生产环境路径
        const pngPath = path.join(__dirname, '../renderer/icon.png');
        const svgPath = path.join(__dirname, '../renderer/icon.svg');
        
        iconPath = fs.existsSync(pngPath) ? pngPath : (fs.existsSync(svgPath) ? svgPath : '');
      }
      
      if (iconPath && fs.existsSync(iconPath)) {
        tray = new Tray(iconPath);
        
        const contextMenu = Menu.buildFromTemplate([
          { 
            label: '打开 Readix', 
            click: () => {
              if (mainWindow) {
                mainWindow.show();
              } else {
                createWindow();
              }
            }
          },
          { 
            label: '刷新全部', 
            click: () => {
              if (mainWindow) {
                mainWindow.webContents.send('refresh-all');
              }
            }
          },
          { type: 'separator' },
          { 
            label: '退出', 
            click: () => {
              app.quit();
            }
          }
        ]);
        tray.setToolTip('Readix');
        tray.setContextMenu(contextMenu);
        
        tray.on('click', () => {
          if (mainWindow) {
            if (mainWindow.isVisible()) {
              mainWindow.hide();
            } else {
              mainWindow.show();
            }
          } else {
            createWindow();
          }
        });
      } else {
        console.warn('未找到有效的图标文件，跳过托盘图标创建。');
      }
    } catch (error) {
      console.error('创建托盘图标时出错:', error);
      // 忽略错误，应用可以没有托盘图标正常运行
    }
  }
}

// 这段程序将会在 Electron 结束初始化
// 和创建浏览器窗口的时候调用
// 部分 API 在 ready 事件触发后才能使用
app.whenReady().then(createWindow);

// 除了 macOS 外，当所有窗口都被关闭的时候退出程序。 macOS 中用户通常期望应用在没有窗口可见的情况下继续运行，除非用户显式退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // 在 macOS 上，当点击 dock 图标并且该应用没有打开的窗口时，通常在应用程序中重新创建一个窗口
  if (mainWindow === null) {
    createWindow();
  }
});

// RSS 解析器实例
const rssParser = new Parser();

// 处理来自渲染进程的 RSS 解析请求
ipcMain.handle('parse-rss-feed', async (event, feedUrl) => {
  console.log(`[Main Process] Received request to parse RSS feed: ${feedUrl}`); // 记录接收到的 URL
  try {
    const feed = await rssParser.parseURL(feedUrl);
    console.log(`[Main Process] Successfully parsed RSS feed: ${feedUrl}, found ${feed.items?.length || 0} items.`); // 记录成功和条目数
    return { success: true, data: feed };
  } catch (error: any) { // 明确错误类型为 any 或 Error
    console.error(`[Main Process] Failed to parse RSS feed [${feedUrl}]:`, error); // 记录详细错误
    return { success: false, error: error.message || 'Unknown error during RSS parsing' };
  }
});

// 处理来自渲染进程的获取 RSS 源信息请求
ipcMain.handle('get-rss-feed-info', async (event, feedUrl) => {
  console.log(`[Main Process] Received request to get RSS feed info: ${feedUrl}`);
  try {
    const feed = await rssParser.parseURL(feedUrl);
    let iconPathToReturn = ''; // 最终返回给渲染进程的图标路径
    const originalIconUrl = feed.image?.url;

    // 帮助函数：下载并缓存图标
    const downloadAndCacheIcon = async (iconUrlToFetch: string, baseFilename: string) => {
      try {
        let extension = '.png'; // 默认扩展名
        try {
          const parsedUrl = new URL(iconUrlToFetch);
          const ext = path.extname(parsedUrl.pathname);
          // 过滤掉不合理的扩展名
          if (ext && ext.length > 1 && ext.length < 6) {
            extension = ext;
          }
        } catch (e) {
          console.warn(`[Main Process] 无法从URL (${iconUrlToFetch}) 解析扩展名, 将默认使用 .png`);
        }
        
        const localIconFileName = `${baseFilename}${extension}`;
        const localIconPath = path.join(faviconsDir, localIconFileName);

        if (fs.existsSync(localIconPath)) {
          console.log(`[Main Process] 在缓存中找到图标 ${feedUrl}: ${localIconPath}`);
          return url.pathToFileURL(localIconPath).toString();
        } else {
          console.log(`[Main Process] 正在从 ${iconUrlToFetch} 为 ${feedUrl} 下载图标`);
          const response = await axios.get(iconUrlToFetch, { 
            responseType: 'arraybuffer',
            timeout: 10000, // 设置10秒超时
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });
          await fsPromises.writeFile(localIconPath, response.data);
          console.log(`[Main Process] 图标已下载并保存到 ${localIconPath}`);
          return url.pathToFileURL(localIconPath).toString();
        }
      } catch (downloadError: any) {
        console.error(`[Main Process] 从 ${iconUrlToFetch} 为 ${feedUrl} 下载或保存图标失败. 错误: ${downloadError.message}`);
        return ''; // 下载失败返回空字符串
      }
    };

    // 1. 尝试从 Feed 本身获取图标
    if (originalIconUrl) {
      const hash = crypto.createHash('md5').update(feedUrl).digest('hex');
      iconPathToReturn = await downloadAndCacheIcon(originalIconUrl, hash);
    } 
    
    // 2. 如果失败，则回退到获取 Favicon
    if (!iconPathToReturn) {
      console.log(`[Main Process] 从 Feed 源中获取图标失败, 回退到 favicon.`);
      try {
        // 使用 feed.link 或 feedUrl 来确定域名
        const targetUrl = feed.link || feedUrl;
        const domain = new URL(targetUrl).hostname;
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        const hash = crypto.createHash('md5').update(domain).digest('hex');
        iconPathToReturn = await downloadAndCacheIcon(faviconUrl, hash);
      } catch (fallbackError: any) {
        console.error(`[Main Process] ${feedUrl} 的 Favicon 回退失败. 错误: ${fallbackError.message}`);
      }
    }

    const feedInfo = {
      title: feed.title,
      link: feed.link,
      description: feed.description,
      icon: iconPathToReturn,
    };
    console.log(`[Main Process] Processed RSS feed info for: ${feedUrl}`, feedInfo);
    return {
      success: true,
      data: feedInfo,
    };
  } catch (error: any) {
    console.error(`[Main Process] Failed to get RSS feed info for [${feedUrl}]:`, error);
    return { success: false, error: error.message || 'Unknown error during getting feed info' };
  }
});

// 新增：处理获取设置 (异步)
ipcMain.handle('get-settings', async () => {
  console.log('[Main Process] 收到 get-settings 请求');
  const settings = store.get('settings');
  console.log('[Main Process] 返回设置:', settings);
  return settings;
});

// 新增：处理保存设置
ipcMain.on('save-settings', (_, settings) => {
  console.log('[Main Process] 收到 save-settings 请求, 数据:', settings);
  store.set('settings', settings);
});

// 处理来自渲染进程的消息
ipcMain.on('app-message', (event, arg) => {
  switch (arg.type) {
    case 'restart-app':
      app.relaunch();
      app.exit(0);
    default:
      console.log('未知消息类型:', arg.type);
  }
});

// 新增：处理 OPML 导出
ipcMain.handle('export-opml', async (_, opmlContent: string) => {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (!mainWindow) {
    return { success: false, error: '主窗口未找到' };
  }

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出订阅到 OPML 文件',
    defaultPath: 'readix-subscriptions.opml',
    filters: [{ name: 'OPML 文件', extensions: ['opml', 'xml'] }],
  });

  if (canceled || !filePath) {
    return { success: false, canceled: true };
  }

  try {
    await fsPromises.writeFile(filePath, opmlContent, 'utf-8');
    return { success: true, path: filePath };
  } catch (error) {
    console.error('保存 OPML 文件失败:', error);
    return { success: false, error: (error as Error).message };
  }
});

// 新增：处理 OPML 导入
ipcMain.handle('import-opml', async () => {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (!mainWindow) {
    return { success: false, error: '主窗口未找到' };
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '从 OPML 文件导入订阅',
    filters: [{ name: 'OPML 文件', extensions: ['opml', 'xml'] }],
    properties: ['openFile'],
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const filePath = filePaths[0];
  try {
    const opmlContent = await fsPromises.readFile(filePath, 'utf-8');
    return { success: true, content: opmlContent };
  } catch (error) {
    console.error('读取 OPML 文件失败:', error);
    return { success: false, error: (error as Error).message };
  }
});

// 新增: 获取操作系统平台
ipcMain.handle('get-platform', () => {
  return process.platform;
});

// 窗口控制 IPC 监听器
ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('window-is-maximized', async () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// 新增：处理获取 favicon 的请求
ipcMain.handle('get-favicon', async (_, feedUrl) => {
  let iconPathToReturn = ''; // 定义并初始化 iconPathToReturn
  try {
    const parsedUrl = new URL(feedUrl);
    const domain = parsedUrl.hostname;
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    const localIconFileName = `${crypto.createHash('md5').update(domain).digest('hex')}.png`;
    const localIconPath = path.join(faviconsDir, localIconFileName);

    if (fs.existsSync(localIconPath)) {
      console.log(`[Main Process] Icon for ${feedUrl} found in cache: ${localIconPath}`);
      iconPathToReturn = url.pathToFileURL(localIconPath).toString();
    } else {
      console.log(`[Main Process] Downloading favicon from ${faviconUrl} for ${feedUrl}`);
      const response = await axios.get(faviconUrl, {
        responseType: 'arraybuffer',
        timeout: 10000 // 设置10秒超时
      });
      fs.writeFileSync(localIconPath, response.data);
      iconPathToReturn = url.pathToFileURL(localIconPath).toString();
      console.log(`[Main Process] Icon downloaded and saved to ${localIconPath}`);
    }

    return { success: true, data: iconPathToReturn };
  } catch (error: any) { // 将 error 显式声明为 any 类型
    console.error(`[Main Process] Failed to get favicon for ${feedUrl}:`, error);
    return { success: false, error: error.message || 'Unknown error during getting favicon' };
  }
});

// 新增：处理获取本地图标文件的base64数据
ipcMain.handle('get-local-icon-base64', async (_, iconPath: string) => {
  try {
    // 检查路径是否是file://协议
    if (iconPath.startsWith('file://')) {
      // 将file://路径转换为本地文件路径
      const localPath = url.fileURLToPath(iconPath);
      
      if (fs.existsSync(localPath)) {
        const imageBuffer = fs.readFileSync(localPath);
        const base64Data = imageBuffer.toString('base64');
        
        // 根据文件扩展名确定MIME类型
        const ext = path.extname(localPath).toLowerCase();
        let mimeType = 'image/png'; // 默认
        if (ext === '.jpg' || ext === '.jpeg') {
          mimeType = 'image/jpeg';
        } else if (ext === '.gif') {
          mimeType = 'image/gif';
        } else if (ext === '.svg') {
          mimeType = 'image/svg+xml';
        } else if (ext === '.webp') {
          mimeType = 'image/webp';
        }
        
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        return { success: true, data: dataUrl };
      } else {
        return { success: false, error: 'File not found' };
      }
    } else {
      // 如果不是file://协议，直接返回原路径
      return { success: true, data: iconPath };
    }
  } catch (error: any) {
    console.error(`[Main Process] Failed to read local icon file: ${iconPath}`, error);
    return { success: false, error: error.message || 'Unknown error reading icon file' };
  }
}); 