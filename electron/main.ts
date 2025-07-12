import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell, dialog, screen } from 'electron';
import path from 'path';
import * as url from 'url';
import fs from 'fs';
import fsPromises from 'fs/promises';
import Store from 'electron-store';
import Parser from 'rss-parser';
import axios from 'axios';
import crypto from 'crypto';
import type { Settings } from '../src/types/settings'; // 导入类型
import fetch from 'node-fetch';
import { execSync } from 'child_process';

// AI 服务配置
const AI_MODEL = 'doubao-seed-1-6-250615';
const AI_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

// 初始化配置存储
const store = new Store< { settings: Settings } >();

const faviconsDir = path.join(app.getPath('userData'), 'favicons');

// 控制应用生命周期和创建原生浏览器窗口的模块
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;

// 在文件前部添加ensureDirectoriesExist函数
// 确保必要的目录存在
const ensureDirectoriesExist = () => {
  // 确保faviconsDir存在
  if (!fs.existsSync(faviconsDir)) {
    fs.mkdirSync(faviconsDir, { recursive: true });
    console.log(`[Main Process] 已创建图标缓存目录: ${faviconsDir}`);
  }
  
  // 可以在这里添加其他需要确保存在的目录
};

const createWindow = () => {
  // 定义 Store 的 schema 以获得类型安全
  const store = new Store<{ windowBounds: { width: number; height: number; x?: number; y?: number } }>({
    defaults: {
      windowBounds: { width: 1280, height: 900 }
    }
  });

  let { width, height, x, y } = store.get('windowBounds');

  // 确保窗口在可见区域内
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: displayWidth, height: displayHeight } = primaryDisplay.workAreaSize;

  const isWithinBounds = (val: number | undefined, max: number) => val !== undefined && val >= 0 && val < max;

  if (!isWithinBounds(x, displayWidth) || !isWithinBounds(y, displayHeight)) {
      x = undefined;
      y = undefined;
      width = 1280;
      height = 900;
  }


  // 确保 favicons 目录存在
  if (!fs.existsSync(faviconsDir)) {
    fs.mkdirSync(faviconsDir, { recursive: true });
    console.log(`[Main Process] Created favicons directory at: ${faviconsDir}`);
  }

  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 800, // 设置一个合理的最小宽度
    minHeight: 650,
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
    trafficLightPosition: { x: 20, y: 16 }, // 调整窗口控制按钮位置，向右移动并居中对齐
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
      "img-src 'self' data: https: http:", // 添加http:允许加载http协议的图片
      `connect-src ${connectSrc.join(' ')}`,
      "object-src 'self'",
      "frame-src https://player.youku.com",
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

  // 添加窗口关闭事件监听器，保存窗口大小和位置
  mainWindow.on('close', () => {
    if (mainWindow) { // 检查 mainWindow 是否存在
      store.set('windowBounds', mainWindow.getBounds());
    }
  });

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
      let iconPath = '';
      
      if (isDevelopment) {
        // 在开发模式下，CWD (当前工作目录) 就是项目的根目录
        const icnsDevPath = path.join(process.cwd(), 'assets', 'icons.icns');
        const pngDevPath = path.join(process.cwd(), 'public', 'icon.png');
        
        // 在 macOS 上优先使用用户指定的 .icns 文件
        if (process.platform === 'darwin' && fs.existsSync(icnsDevPath)) {
          iconPath = icnsDevPath;
        } else if (fs.existsSync(pngDevPath)) {
          // 在其他系统或 .icns 不存在时，回退到 .png
          iconPath = pngDevPath;
        }
      } else {
        // 在生产环境中, 图标文件会被复制到 renderer 的输出目录
        // __dirname 是当前执行文件所在的目录 (例如 dist/electron)
        const baseIconPath = path.join(__dirname, '../renderer');
        
        const pngProdPath = path.join(baseIconPath, 'icon.png');
        const icnsProdPath = path.join(baseIconPath, 'icon.icns');

        if (fs.existsSync(pngProdPath)) {
          iconPath = pngProdPath;
        } else if (process.platform === 'darwin' && fs.existsSync(icnsProdPath)) {
          iconPath = icnsProdPath;
        }
      }
      
      if (iconPath) {
        const image = nativeImage.createFromPath(iconPath);
        // 在 macOS 上, 将图片设置为模板图像, 以便它能适应系统主题（暗/亮模式）
        if (process.platform === 'darwin') {
          image.setTemplateImage(true);
        }

        tray = new Tray(image);
        
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
          { type: 'separator' },
          { label: '退出', click: () => app.quit() }
        ]);

        tray.setToolTip('Readix');
        tray.setContextMenu(contextMenu);

        // macOS 上的特殊处理
        if (process.platform === 'darwin') {
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
        }
      } else {
        console.log('[Main Process] Tray icon not found, skipping tray creation.');
      }
    } catch (error) {
      console.error('创建托盘图标时出错:', error);
    }
  }
}

// 这段程序将会在 Electron 结束初始化
// 和创建浏览器窗口的时候调用
// 部分 API 在 ready 事件触发后才能使用
app.whenReady().then(() => {
  // 首先确保用户数据目录存在
  ensureDirectoriesExist();
  
  // 创建主窗口
  createWindow();
  
  // 创建系统托盘图标
  createTray();

  // 设置V8内存限制调整
  // 注意：这些值可能需要根据实际情况调整
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
  
  // 添加未捕获异常处理
  process.on('uncaughtException', (error) => {
    console.error('[Main Process] 未捕获异常:', error);
    // 可以在这里记录错误，但不终止应用
  });
  
  // 监控内存使用
  const memoryMonitor = setInterval(() => {
    const memUsage = process.memoryUsage();
    // 如果RSS内存超过600MB，触发垃圾收集
    if (memUsage.rss > 600 * 1024 * 1024) {
      console.log('[Main Process] 检测到高内存使用，触发垃圾收集');
      if (global.gc) {
        global.gc();
      }
    }
  }, 60000); // 每分钟检查一次
  
  // 清理函数
  app.on('will-quit', () => {
    clearInterval(memoryMonitor);
  });
});

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

// 统一的、健壮的 Feed 拉取和解析逻辑
async function fetchAndParseFeed(feedUrl: string) {
  let normalizedUrl = feedUrl.trim();
  if (!/^(https?):\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  const fetchWithProtocol = async (protocolUrl: string) => {
    const response = await axios.get(protocolUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/rss+xml,application/xml,text/xml,application/atom+xml',
      },
      responseType: 'text',
      timeout: 15000,
      maxRedirects: 5,
    });
    return response.data;
  };

  let feedText = '';
  try {
    feedText = await fetchWithProtocol(normalizedUrl);
  } catch (error) {
    if (normalizedUrl.startsWith('https://')) {
      const httpUrl = normalizedUrl.replace('https://', 'http://');
      feedText = await fetchWithProtocol(httpUrl);
    } else {
      throw error;
    }
  }

  const parsedFeed = await rssParser.parseString(feedText);

  // 添加内存优化 - 限制处理的文章数量
  if (parsedFeed.items && parsedFeed.items.length > 30) {
    console.log(`[Main Process] 大量文章(${parsedFeed.items.length})处理，实施分批优化`);
    
    // 保存原始长度
    const originalLength = parsedFeed.items.length;
    
    // 只保留最新的30篇文章进行处理
    parsedFeed.items = parsedFeed.items.slice(0, 30);
    
    console.log(`[Main Process] 已优化处理：从${originalLength}篇减少到${parsedFeed.items.length}篇`);
  }

  // 修复相对 URL
  const baseLink = parsedFeed.link || feedUrl;
  if (parsedFeed.items) {
    parsedFeed.items.forEach(item => {
      const itemBaseUrl = item.link || baseLink;
      
      // 1. 修复 enclosure 中的相对 URL
      if (item.enclosure && item.enclosure.url) {
        try {
          item.enclosure.url = new URL(item.enclosure.url, itemBaseUrl).href;
        } catch (e) {
          console.error(`修正 enclosure URL 失败: ${item.enclosure.url}`, e);
        }
      }

      // 2. 修复内容中的相对 URL (图片和链接)
      const contentKey = 'content:encoded' in item ? 'content:encoded' : 'content';
      if (item[contentKey]) {
        try {
          const { JSDOM } = require('jsdom');
          const dom = new JSDOM(item[contentKey], { url: itemBaseUrl });
          const document = dom.window.document;

          document.querySelectorAll('img').forEach((img: any) => {
            const src = img.getAttribute('src');
            if (src) {
              img.setAttribute('src', new URL(src, itemBaseUrl).href);
            }
          });

          document.querySelectorAll('a').forEach((a: any) => {
            const href = a.getAttribute('href');
            if (href) {
              a.setAttribute('href', new URL(href, itemBaseUrl).href);
            }
          });
          
          item[contentKey] = document.body.innerHTML;
        } catch (e) {
           console.error(`修正文章内容中的相对 URL 失败:`, e);
        }
      }
    });
  }

  return parsedFeed;
}

// 处理来自渲染进程的 RSS 解析请求 (刷新用)
ipcMain.handle('parse-rss-feed', async (event, feedUrl) => {
  console.log(`[Main Process] PARSE-RSS-FEED: Request to parse: ${feedUrl}`);
  try {
    const feed = await fetchAndParseFeed(feedUrl);
    console.log(`[Main Process] PARSE-RSS-FEED: Successfully parsed: ${feedUrl}, found ${feed.items?.length || 0} items.`);
    return { success: true, data: feed };
  } catch (error: any) {
    console.error(`[Main Process] PARSE-RSS-FEED: Failed to parse: [${feedUrl}]:`, error.message);
    return { success: false, error: error.message || 'Unknown error during RSS parsing' };
  }
});


// 处理来自渲染进程的获取 RSS 源信息请求 (添加用)
ipcMain.handle('get-rss-feed-info', async (event, feedUrl) => {
  console.log(`[Main Process] GET-RSS-FEED-INFO: Request to get info for: "${feedUrl}"`);
  try {
    const feed = await fetchAndParseFeed(feedUrl);
    console.log(`[Main Process] GET-RSS-FEED-INFO: Successfully parsed XML for "${feedUrl}"`);
    
    let iconPathToReturn = '';
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
        // 使用Google的favicon服务替代faviconkit
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
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
    console.log(`[Main Process] GET-RSS-FEED-INFO: Processed info for: ${feedUrl}`, feedInfo);
    return {
      success: true,
      data: feedInfo,
    };
  } catch (error: any) {
    console.error(`[Main Process] GET-RSS-FEED-INFO: An error occurred for URL [${feedUrl}].`);
    return { success: false, error: error.message || 'Unknown error during getting feed info' };
  }
});

// 新增：处理获取设置 (异步)
ipcMain.handle('get-settings', async () => {
  // console.log('[Main Process] 收到 get-settings 请求');
  const settings = store.get('settings');
  // console.log('[Main Process] 返回设置:', settings);
  return settings;
});

// 新增：处理保存设置
ipcMain.on('save-settings', (event, settings) => {
  // console.log('[Main Process] 收到 save-settings 请求, 数据:', settings);
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
ipcMain.handle('get-favicon', async (_, url) => {
  let iconPathToReturn = ''; // 定义并初始化 iconPathToReturn
  try {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;
    
    // 使用Google的favicon服务替代faviconkit
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    
    const localIconFileName = `${crypto.createHash('md5').update(domain).digest('hex')}.png`;
    const localIconPath = path.join(faviconsDir, localIconFileName);

    if (fs.existsSync(localIconPath)) {
      console.log(`[Main Process] Icon for ${url} found in cache: ${localIconPath}`);
      iconPathToReturn = url.pathToFileURL(localIconPath).toString();
    } else {
      console.log(`[Main Process] Downloading favicon from ${faviconUrl} for ${url}`);
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
    console.error(`[Main Process] Failed to get favicon for ${url}:`, error);
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

ipcMain.handle('fetch-article-content', async (event, articleUrl) => {
  try {
    const { JSDOM } = await import('jsdom');
    const { Readability } = await import('@mozilla/readability');
    
    // 提取网站域名作为referrer
    const originUrl = new URL(articleUrl).origin;
    
    const dom = await JSDOM.fromURL(articleUrl, {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      referrer: originUrl, // 使用文章URL的origin作为referrer
      resources: "usable" // 允许加载外部资源
    });
    
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    if (article && article.content) {
      // 创建一个新的 JSDOM 实例来处理相对路径
      const contentDom = new JSDOM(article.content, { url: articleUrl });
      const document = contentDom.window.document;

      // 处理图片
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        const src = img.getAttribute('src');
        if (src) {
          try {
            // 处理数据URL和已经是绝对URL的情况
            if (src.startsWith('data:') || src.match(/^https?:\/\//i)) {
              // 不需要修改，已经是绝对路径或数据URL
            } else {
              const absoluteSrc = new URL(src, articleUrl).href;
              img.setAttribute('src', absoluteSrc);
            }
            
            // 改进图片错误处理，添加更多的备选方案
            img.setAttribute('onerror', `
              this.onerror=null; 
              console.error('图片加载失败: ' + this.src); 
              // 尝试创建备用图片URL
              if(this.src.includes('cdnfile.sspai.com')) {
                // 如果是少数派图片链接尝试修改URL
                this.src = this.src.replace('imageView2/2/w/1120/q/40/interlace/1/ignore-error/1', '');
              } else {
                this.style.display='none';
              }
            `);
            
            // 确保图片不会超出容器宽度
            img.setAttribute('style', 'max-width: 100%; height: auto;');
          } catch (e) {
            console.error(`无效的图片 URL ${src} 在 ${articleUrl}:`, e);
            img.setAttribute('alt', '无法加载的图片');
          }
        }
      });
      
      // 处理其他元素的相对链接，例如 <a> 标签
      const links = document.querySelectorAll('a');
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
          try {
            if (!href.match(/^https?:\/\//i) && !href.startsWith('#')) {
              const absoluteHref = new URL(href, articleUrl).href;
              link.setAttribute('href', absoluteHref);
            }
          } catch (e) {
            console.error(`无效的链接 URL ${href} 在 ${articleUrl}:`, e);
          }
        }
      });
      
      // 处理具有背景图片的元素
      const elementsWithBgImage = document.querySelectorAll('[style*="background-image"]');
      elementsWithBgImage.forEach(el => {
        const style = el.getAttribute('style');
        if (style) {
          const urlMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i);
          if (urlMatch && urlMatch[1]) {
            try {
              if (!urlMatch[1].match(/^https?:\/\//i) && !urlMatch[1].startsWith('data:')) {
                const absoluteUrl = new URL(urlMatch[1], articleUrl).href;
                const newStyle = style.replace(urlMatch[1], absoluteUrl);
                el.setAttribute('style', newStyle);
              }
            } catch (e) {
              console.error(`无效的背景图片 URL ${urlMatch[1]} 在 ${articleUrl}:`, e);
            }
          }
        }
      });

      return {
        title: article.title,
        content: document.body.innerHTML, // 返回处理过的HTML
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error('获取和解析文章失败:', error);
    return null;
  }
});

ipcMain.handle('invokeAI', async (event, type, content, contentText) => {
  const settings = store.get('settings');
  const apiKey = settings?.advanced?.doubaoApiKey;

  if (!apiKey) {
    return { success: false, error: '请在设置中配置您的豆包 API Key' };
  }

  const model = AI_MODEL;
  const url = AI_API_URL;

  let systemPrompt = '';
  let userPrompt = '';

  switch (type) {
    case 'mindmap':
      systemPrompt = `你是一个高度智能的思维导图专家。你的任务是分析用户提供的文章，并将其转化为一个结构清晰、内容精炼的思维导图。请遵循以下规则：
1.  **高度概括**：只提取最高层级的核心概念和关键要点。
2.  **极致精简**：每个节点（每行文字）应为简短的短语或关键词，避免出现长句。
3.  **层级清晰**：使用 Markdown 的无序列表格式（-、*）来表示层级关系，最多不超过4层。
4.  **专注于结构**：你的输出应该是纯粹的 Markdown，不包含任何额外的解释或标题。
5.  **输出语言与输入一致**：如果输入是中文，则输出中文导图。`;
      userPrompt = `请为以下文章生成思维导图的Markdown表示：\n\n${contentText}`;
      break;
    case 'highlight':
      systemPrompt = `你是一个智能文本分析器。请从用户提供的文本中，抽取出10到15个最重要、最核心的句子。你的输出必须是一个符合JSON格式的字符串数组(string[])，数组中的每个字符串都必须是原文中存在的、未经修改的句子。不要添加任何解释或多余的文字，只返回JSON数组。`;
      userPrompt = `请分析以下文本并提取关键句：\n\n${contentText}`;
      break;
    default:
      return { success: false, error: '无效的 AI 操作类型' };
  }

  try {
    const response = await axios.post(
      url,
      {
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const result = response.data.choices[0].message.content;
    
    if (type === 'highlight') {
      try {
        // 尝试从返回结果中提取 JSON 部分
        const jsonMatch = result.match(/\[.*\]/s);
        if (!jsonMatch) {
          throw new Error('无法在返回结果中找到有效的JSON数组。');
        }
        const sentences = JSON.parse(jsonMatch[0]);
        if (Array.isArray(sentences) && sentences.every(s => typeof s === 'string')) {
          return { success: true, data: sentences };
        } else {
          throw new Error('AI 返回的不是一个有效的字符串数组。');
        }
      } catch (e: any) {
        console.error('解析高亮结果失败:', e.message);
        console.error('AI 原始返回:', result);
        return { success: false, error: '智能高亮返回格式错误，无法解析。' };
      }
    }

    return { success: true, data: result };

  } catch (error: any) {
    console.error('AI 调用失败:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.error?.message || '调用AI服务失败，请检查网络或API Key。';
    return { success: false, error: errorMessage };
  }
});

// 新增：专门处理流式AI摘要
ipcMain.on('stream-ai-summary', async (event, contentText) => {
  const settings = store.get('settings');
  const apiKey = settings?.advanced?.doubaoApiKey;

  if (!apiKey) {
    mainWindow?.webContents.send('ai-summary-stream-error', '请在设置中配置您的豆包 API Key');
    return;
  }

  const model = AI_MODEL;
  const url = AI_API_URL;

  try {
    const response = await axios.post(
      url,
      {
        model: model,
        messages: [
          { role: 'system', content: '你是一个专业的文章价值分析助手。请从产品经理的视角，分析用户提供的文章内容，重点说明这篇文章对产品经理工作的实际价值和可应用的洞见。回答要简洁、实用、有针对性，字数在300字以内。' },
          { role: 'user', content: `我是一个产品经理，请帮我从我的视角分析这篇文章读了有啥用：\n\n${contentText}` },
        ],
        stream: true,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
      }
    );

    response.data.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      const lines = text.split('\n').filter(line => line.trim() !== '');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6);
          if (jsonStr === '[DONE]') {
            mainWindow?.webContents.send('ai-summary-stream-end');
            return;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              mainWindow?.webContents.send('ai-summary-stream-chunk', { type: 'chunk', data: delta });
            }
          } catch (e) {
            console.error('解析AI流式数据失败:', e);
          }
        }
      }
    });

    response.data.on('end', () => {
      mainWindow?.webContents.send('ai-summary-stream-end');
    });

    response.data.on('error', (err: Error) => {
      console.error('AI流式传输错误:', err);
      mainWindow?.webContents.send('ai-summary-stream-error', err.message);
    });

  } catch (error: any) {
    console.error('AI 调用失败:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.error?.message || '调用AI服务失败，请检查网络或API Key。';
    mainWindow?.webContents.send('ai-summary-stream-error', errorMessage);
  }
});

ipcMain.handle('test-doubao-api', async (event, apiKey) => {
  if (!apiKey) {
    return { success: false, error: 'API Key 不能为空' };
  }

  const model = AI_MODEL;
  const url = AI_API_URL;

  try {
    await axios.post(
      url,
      {
        model: model,
        messages: [{ role: 'user', content: 'Say hello.' }],
        max_tokens: 10,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10秒超时
      }
    );
    return { success: true };
  } catch (error: any) {
    console.error('API Key 测试失败:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.error?.message || '无法连接到AI服务，请检查API Key或网络连接。';
    return { success: false, error: errorMessage };
  }
});

// 添加shell-open-external处理程序
ipcMain.handle('shell-open-external', async (_, url) => {
  try {
    // 验证URL是否合法
    const validUrl = new URL(url);
    // 只允许http和https协议
    if (validUrl.protocol !== 'http:' && validUrl.protocol !== 'https:') {
      throw new Error('只允许HTTP和HTTPS协议');
    }
    // 打开外部链接
    await shell.openExternal(url);
    return true;
  } catch (error) {
    console.error('[Main Process] 打开外部链接失败:', error);
    throw error;
  }
});

// 添加图片代理处理程序
ipcMain.handle('proxy-image', async (_, imageUrl) => {
  try {
    console.log(`[Main Process] 代理图片请求: ${imageUrl}`);
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': new URL(imageUrl).origin
      }
    });
    
    // 确定MIME类型
    let mimeType = 'image/jpeg'; // 默认MIME类型
    const contentType = response.headers['content-type'];
    if (contentType) {
      mimeType = contentType;
    } else {
      // 根据URL后缀尝试确定MIME类型
      if (imageUrl.endsWith('.png')) mimeType = 'image/png';
      else if (imageUrl.endsWith('.gif')) mimeType = 'image/gif';
      else if (imageUrl.endsWith('.webp')) mimeType = 'image/webp';
      else if (imageUrl.endsWith('.svg')) mimeType = 'image/svg+xml';
    }

    // 转换为base64
    const base64Data = Buffer.from(response.data, 'binary').toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Data}`;
    
    console.log(`[Main Process] 图片代理成功: ${imageUrl}`);
    return dataUrl;
  } catch (error) {
    console.error(`[Main Process] 图片代理失败: ${imageUrl}`, error);
    return null;
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here. 