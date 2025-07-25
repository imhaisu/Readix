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
import { autoUpdater } from 'electron-updater';
import electronLog from 'electron-log';

// 设置electron-log
electronLog.transports.file.level = 'debug';
const log = electronLog;

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

  // 配置自动更新
  if (!isDevelopment) {
    configureAutoUpdater();
  }
});

// 配置自动更新
function configureAutoUpdater() {
  // 手动设置更新URL
  const feedURL = `https://github.com/imhaisu/NewReader/releases/latest/download`;
  console.log('[Main Process] 设置更新URL:', feedURL);
  
  // 防止重复下载和安装
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  
  // 禁用自动下载
  autoUpdater.allowPrerelease = false;
  
  // 设置Logger详细程度
  const log = require('electron-log');
  log.transports.file.level = 'debug';
  console.log('[Main Process] 配置自动更新...');
  console.log('[Main Process] 当前应用版本:', app.getVersion());
  console.log('[Main Process] 更新日志路径:', log.transports.file.getFile().path);
  
  // 添加详细的错误日志，但向用户展示友好的错误信息
  autoUpdater.on('error', (err) => {
    console.error('[Main Process] 更新出错:', err);
    console.error('[Main Process] 错误详情:', err.toString());
    if (err.stack) {
      console.error('[Main Process] 错误堆栈:', err.stack);
    }
    // TypeScript较旧版本不支持Error.cause，使用any类型绕过
    const anyErr = err as any;
    if (anyErr.cause) {
      console.error('[Main Process] 错误原因:', anyErr.cause);
    }
    if (err.message) {
      console.error('[Main Process] 错误消息:', err.message);
    }
    
    // 检查错误类型，转换为用户友好的消息
    let userFriendlyMessage = '检查更新失败，请稍后再试';
    
    // 判断是否为404错误（latest-mac.yml或其他文件未找到）
    if (err.message && (
        err.message.includes('404') || 
        err.message.includes('latest-mac.yml') ||
        err.message.includes('Cannot find') ||
        err.message.includes('update info'))) {
      // 向用户显示"当前已是最新版本"而非错误
      console.log('[Main Process] 发现404错误，转换为友好提示');
      mainWindow?.webContents.send('update-status', { status: 'not-available', message: '当前已是最新版本' });
      return;
    }
    
    // 其他错误类型的友好处理
    if (err.message && err.message.includes('net::ERR_INTERNET_DISCONNECTED')) {
      userFriendlyMessage = '网络连接问题，请检查您的网络设置';
    } else if (err.message && err.message.includes('net::ERR_CONNECTION_TIMED_OUT')) {
      userFriendlyMessage = '连接超时，请检查您的网络设置';
    }
    
    mainWindow?.webContents.send('update-status', { 
      status: 'error', 
      error: userFriendlyMessage 
    });
  });

  // 设置更新事件监听
  autoUpdater.on('checking-for-update', () => {
    console.log('[Main Process] 正在检查更新...');
    try {
      const feedURL = autoUpdater.getFeedURL();
      console.log('[Main Process] 更新URL:', feedURL || '未设置');
    } catch (error) {
      console.error('[Main Process] 获取更新URL出错:', error);
    }
    mainWindow?.webContents.send('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Main Process] 发现新版本:', info.version);
    mainWindow?.webContents.send('update-status', { 
      status: 'available', 
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });

    // 弹出对话框询问用户是否下载更新
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '发现新版本',
        message: `Readix ${info.version} 已发布，是否现在更新？`,
        detail: `发布日期: ${info.releaseDate || '未知'}\n${info.releaseNotes || ''}`,
        buttons: ['是', '否'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) {
          // 用户确认下载，开始下载更新
          autoUpdater.downloadUpdate().catch(err => {
            console.error('[Main Process] 下载更新失败:', err);
            // 下载失败时也提供友好提示
            mainWindow?.webContents.send('update-status', { 
              status: 'error', 
              error: '下载更新失败，请稍后再试' 
            });
          });
        }
      }).catch(err => {
        console.error('[Main Process] 显示对话框失败:', err);
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Main Process] 已是最新版本');
    mainWindow?.webContents.send('update-status', { 
      status: 'not-available',
      message: '当前已是最新版本' 
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const progress = {
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total
    };
    console.log(`[Main Process] 下载进度: ${progress.percent.toFixed(2)}%`);
    mainWindow?.webContents.send('update-status', { status: 'downloading', progress });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Main Process] 更新已下载，准备安装');
    mainWindow?.webContents.send('update-status', { status: 'downloaded' });
    
    // 通知用户更新已下载，询问是否立即安装
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '更新已下载',
        message: '新版本已下载完成，立即安装并重启应用?',
        buttons: ['立即安装', '稍后安装'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) {
          // 用户确认安装，退出并安装更新
          autoUpdater.quitAndInstall(false, true);
        }
      }).catch(err => {
        console.error('[Main Process] 显示更新下载完成对话框失败:', err);
      });
    }
  });

  // 启动时检查更新
  setTimeout(() => {
    console.log('[Main Process] 启动后自动检查更新');
    try {
      autoUpdater.checkForUpdates().catch(err => {
        console.error('[Main Process] 检查更新失败:', err);
        // 错误时不向用户显示技术错误，而是统一友好提示
        // 错误处理会通过autoUpdater.on('error')事件处理
      });
    } catch (error) {
      console.error('[Main Process] 检查更新过程中出现异常:', error);
    }
  }, 3000); // 延迟3秒检查，避免影响启动速度
}

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
        console.error(`[Main Process] Icon file not found: ${localPath}`);
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

// 添加域名请求限制跟踪器
const domainRequestTracker: Record<string, { lastRequest: number, pendingRequests: number }> = {};

// 添加文章内容缓存系统
const articleContentCache = new Map<string, {content: string, title: string, timestamp: number}>();
const CACHE_MAX_SIZE = 100; // 最多缓存100篇文章
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

// 域名限流配置，有些域名需要更严格的限流
const DOMAIN_RATE_LIMITS: Record<string, {interval: number, maxPending: number}> = {
  'tmtpost.com': {interval: 5000, maxPending: 1},  // 钛媒体：5秒间隔，最多1个挂起请求
  'default': {interval: 2000, maxPending: 2}       // 默认：2秒间隔，最多2个挂起请求
};

// 清理过期缓存
const cleanupCache = () => {
  const now = Date.now();
  let expiredCount = 0;
  for (const [key, value] of articleContentCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      articleContentCache.delete(key);
      expiredCount++;
    }
  }
  if (expiredCount > 0) {
    console.log(`[Main Process] 已清理 ${expiredCount} 条过期文章缓存`);
  }
  
  // 如果缓存太大，删除最旧的条目
  if (articleContentCache.size > CACHE_MAX_SIZE) {
    // 按时间戳排序
    const sortedEntries = [...articleContentCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
    // 删除最旧的条目，直到缓存大小达到目标
    const entriesToDelete = sortedEntries.slice(0, articleContentCache.size - CACHE_MAX_SIZE);
    for (const [key] of entriesToDelete) {
      articleContentCache.delete(key);
    }
    console.log(`[Main Process] 已删除 ${entriesToDelete.length} 条最旧的文章缓存`);
  }
};

// 每小时清理一次缓存
setInterval(cleanupCache, 60 * 60 * 1000);

ipcMain.handle('fetch-article-content', async (event, articleUrl) => {
  try {
    // 生成缓存键
    const cacheKey = articleUrl;
    
    // 检查内存缓存
    if (articleContentCache.has(cacheKey)) {
      const cachedData = articleContentCache.get(cacheKey)!;
      console.log(`[Main Process] 从内存缓存获取文章: ${articleUrl}`);
      return {
        title: cachedData.title,
        content: cachedData.content
      };
    }

    const { JSDOM } = await import('jsdom');
    const { Readability } = await import('@mozilla/readability');
    
    // 提取网站域名作为referrer
    const url = new URL(articleUrl);
    const originUrl = url.origin;
    const domain = url.hostname;
    
    // 检查域名请求限制
    const domainKey = originUrl;
    const now = Date.now();
    if (!domainRequestTracker[domainKey]) {
      domainRequestTracker[domainKey] = { lastRequest: 0, pendingRequests: 0 };
    }
    
    const tracker = domainRequestTracker[domainKey];
    
    // 确定适用于该域名的限流配置
    const domainConfig = DOMAIN_RATE_LIMITS[domain] || 
                         DOMAIN_RATE_LIMITS[domain.replace('www.', '')] || 
                         DOMAIN_RATE_LIMITS.default;
    
    // 如果距离上次请求少于限定时间且已有挂起请求超过限制，则拒绝新请求
    if (now - tracker.lastRequest < domainConfig.interval && 
        tracker.pendingRequests >= domainConfig.maxPending) {
      console.log(`[Main Process] 短时间内对 ${domainKey} 的请求过多，已拒绝新请求`);
      return null;
    }
    
    // 更新请求记录
    tracker.lastRequest = now;
    tracker.pendingRequests++;
    
    try {
      console.log(`[Main Process] 正在获取文章: ${articleUrl}`);
      
      // 对于特定站点，添加特殊的请求头
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': originUrl,
      };
      
      // 为某些站点添加特殊的请求头
      if (domain.includes('tmtpost.com')) {
        headers['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
        headers['Cache-Control'] = 'no-cache';
      }
      
      // 使用axios手动获取网页内容，这样我们可以设置超时
      const response = await axios.get(articleUrl, {
        headers,
        timeout: 15000 // 15秒超时
      });
      
      const dom = new JSDOM(response.data, {
        url: articleUrl,
        referrer: originUrl,
        contentType: response.headers['content-type'],
        resources: "usable"
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

        // 更新请求计数
        tracker.pendingRequests--;
        
        // 处理结果
        const result = {
          title: article.title,
          content: document.body.innerHTML, // 返回处理过的HTML
        };
        
                  // 保存到缓存
          articleContentCache.set(cacheKey, {
            content: result.content,
            title: result.title || '',  // 确保title总是有值
            timestamp: Date.now()
          });
        
        console.log(`[Main Process] 成功获取文章并缓存: ${articleUrl}`);
        return result;
      } else {
        // 更新请求计数
        tracker.pendingRequests--;
        return null;
      }
    } catch (error) {
      // 出错时减少挂起请求计数
      tracker.pendingRequests--;
      console.error('获取和解析文章失败:', error);
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

// 添加检查更新的IPC处理程序
ipcMain.handle('check-for-updates', async () => {
  if (isDevelopment) {
    return { success: false, error: '开发模式下不支持自动更新' };
  }
  
  try {
    console.log('[Main Process] 手动检查更新...');
    const result = await autoUpdater.checkForUpdates();
    if (!result) {
      return { success: false, error: '检查更新失败，未收到响应' };
    }
    return { success: true, updateInfo: result.updateInfo };
  } catch (error: any) {
    console.error('[Main Process] 手动检查更新失败:', error);
    return { success: false, error: error.message };
  }
});

// 添加IPC处理程序以检查GitHub上的最新版本
ipcMain.handle('check-for-updates-manual', async () => {
  if (isDevelopment) {
    log.info('开发模式下不支持自动更新');
    return { success: false, error: '开发模式下不支持自动更新' };
  }
  
  try {
    log.info('手动检查GitHub更新');
    // 获取当前版本
    const currentVersion = app.getVersion();
    log.info(`当前版本: ${currentVersion}`);
    
    // 从GitHub API获取所有版本信息 - 使用公共API，不需要认证
    const response = await axios.get('https://api.github.com/repos/imhaisu/NewReader/releases', {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'ReadixApp'
      },
      timeout: 10000 // 10秒超时
    });
    
    if (response.status === 200 && response.data.length > 0) {
      // 过滤非草稿版本并按发布日期排序
      const releases = response.data
        .filter((release: any) => !release.draft && release.published_at)
        .sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
      
      if (releases.length === 0) {
        log.info('没有找到已发布的版本');
        mainWindow?.webContents.send('update-status', { status: 'not-available' });
        return { success: true, updateAvailable: false, message: '当前已是最新版本' };
      }
      
      // 获取最新版本
      const latestRelease = releases[0];
      const latestVersion = latestRelease.tag_name.replace('v', '');
      const releaseNotes = latestRelease.body || '';
      const releaseDate = latestRelease.published_at;
      
      log.info(`最新版本: ${latestVersion}`);
      log.info(`发布说明: ${releaseNotes}`);
      
      // 版本比较
      const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;
      
      if (isUpdateAvailable) {
        log.info('发现新版本');
        
        // 获取下载资源
        const assets = latestRelease.assets || [];
        let downloadUrl = '';
        
        // 根据平台选择下载URL
        if (process.platform === 'darwin') {
          // macOS - 寻找DMG文件
          const dmgAsset = assets.find((asset: any) => asset.name.endsWith('.dmg'));
          if (dmgAsset) {
            downloadUrl = dmgAsset.browser_download_url;
            log.info(`找到macOS DMG下载地址: ${downloadUrl}`);
          }
        } else if (process.platform === 'win32') {
          // Windows - 寻找EXE或MSI文件
          const winAsset = assets.find((asset: any) => asset.name.endsWith('.exe') || asset.name.endsWith('.msi'));
          if (winAsset) {
            downloadUrl = winAsset.browser_download_url;
            log.info(`找到Windows下载地址: ${downloadUrl}`);
          }
        } else if (process.platform === 'linux') {
          // Linux - 寻找AppImage或deb文件
          const linuxAsset = assets.find((asset: any) => asset.name.endsWith('.AppImage') || asset.name.endsWith('.deb'));
          if (linuxAsset) {
            downloadUrl = linuxAsset.browser_download_url;
            log.info(`找到Linux下载地址: ${downloadUrl}`);
          }
        }
        
        // 通知用户有新版本
        if (mainWindow && downloadUrl) {
          mainWindow.webContents.send('update-status', { 
            status: 'available',
            version: latestVersion,
            releaseDate: releaseDate,
            releaseNotes: releaseNotes,
            downloadUrl: downloadUrl
          });
          
          const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '发现新版本',
            message: `Readix ${latestVersion} 已发布，是否打开下载页面？`,
            detail: `发布日期: ${releaseDate || '未知'}\n${releaseNotes || ''}`,
            buttons: ['是', '否'],
            defaultId: 0
          });
          
          if (response === 0) {
            // 用户确认，打开下载链接
            await shell.openExternal(downloadUrl);
          }
        } else if (!downloadUrl) {
          log.warn(`没有找到适合当前平台(${process.platform})的下载资源`);
          // 使用release页面作为备用
          downloadUrl = latestRelease.html_url;
        }
        
        return { 
          success: true, 
          updateAvailable: true,
          version: latestVersion,
          releaseDate: releaseDate,
          releaseNotes: releaseNotes,
          downloadUrl: downloadUrl || latestRelease.html_url
        };
      } else {
        log.info('已是最新版本');
        mainWindow?.webContents.send('update-status', { status: 'not-available' });
        return { success: true, updateAvailable: false, message: '当前已是最新版本' };
      }
    } else {
      log.error('GitHub API请求失败或没有releases:', response.status);
      // 友好错误提示
      mainWindow?.webContents.send('update-status', { 
        status: 'not-available', 
        message: '当前已是最新版本' 
      });
      return { success: true, updateAvailable: false, message: '当前已是最新版本' };
    }
  } catch (error: any) {
    log.error('检查更新出错:', error);
    
    // 详细记录错误信息以便调试
    if (error.response) {
      log.error(`HTTP状态: ${error.response.status}`);
      log.error(`响应数据: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      log.error(`请求错误: ${error.message}`);
      log.error(`错误代码: ${error.code}`);
    } else {
      log.error(`错误: ${error.message}`);
    }
    
    // 根据错误类型返回用户友好的消息
    let userFriendlyMessage = '检查更新失败，请稍后再试';
    
    if (error.response) {
      if (error.response.status === 404) {
        userFriendlyMessage = '当前已是最新版本';
        mainWindow?.webContents.send('update-status', { status: 'not-available' });
        return { success: true, updateAvailable: false, message: userFriendlyMessage };
      } else if (error.response.status === 403) {
        userFriendlyMessage = '请求频率受限，请稍后再试';
      } else if (error.response.status >= 500) {
        userFriendlyMessage = '更新服务器暂时不可用，请稍后再试';
      }
    } else if (error.code === 'ENOTFOUND') {
      userFriendlyMessage = '网络连接问题，请检查您的网络设置';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      userFriendlyMessage = '连接超时，请检查您的网络设置';
    }
    
    // 发送友好的错误消息到前端
    mainWindow?.webContents.send('update-status', { 
      status: 'error', 
      error: userFriendlyMessage 
    });
    
    return { success: false, error: userFriendlyMessage };
  }
});

// 版本比较函数
function compareVersions(versionA: string, versionB: string): number {
  const partsA = versionA.split('.').map(Number);
  const partsB = versionB.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  
  return 0;
}

// 添加图片代理处理程序
ipcMain.handle('proxy-image', async (_, imageUrl) => {
  try {
    console.log(`[Main Process] 代理图片请求: ${imageUrl}`);
    
    // 构建请求头
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    
    // 获取URL的origin作为默认Referer
    const urlOrigin = new URL(imageUrl).origin;
    headers['Referer'] = urlOrigin;
    
    // 特别处理少数派网站图片
    if (imageUrl.includes('sspai.com') || imageUrl.includes('cdnfile.sspai.com')) {
      console.log(`[Main Process] 检测到少数派图片，应用特殊处理: ${imageUrl}`);
      headers['Referer'] = 'https://sspai.com/';
      headers['Origin'] = 'https://sspai.com';
      headers['Accept'] = '*/*'; // 接受任何内容类型
      
      // 如果图片URL包含参数，尝试清理URL参数
      if (imageUrl.includes('?')) {
        const cleanUrl = imageUrl.split('?')[0];
        console.log(`[Main Process] 清理少数派图片URL参数: ${cleanUrl}`);
        imageUrl = cleanUrl;
      }
    }
    
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: headers
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