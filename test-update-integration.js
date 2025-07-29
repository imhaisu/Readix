const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');

// 模拟Electron应用环境
class MockElectronApp {
  constructor() {
    this.version = '0.1.8';
    this.platform = process.platform;
    this.isPackaged = false;
  }
  
  getVersion() {
    return this.version;
  }
  
  getPath(name) {
    const paths = {
      userData: path.join(__dirname, 'mock-user-data'),
      temp: path.join(__dirname, 'mock-temp')
    };
    return paths[name] || __dirname;
  }
}

// 模拟主窗口
class MockMainWindow {
  constructor() {
    this.webContents = {
      send: (channel, data) => {
        console.log(`📤 [MockWindow] 发送消息到 ${channel}:`, data);
      }
    };
  }
}

// 模拟更新检查逻辑
class UpdateChecker {
  constructor() {
    this.app = new MockElectronApp();
    this.mainWindow = new MockMainWindow();
    this.isDevelopment = !this.app.isPackaged;
  }
  
  async checkForUpdates() {
    if (this.isDevelopment) {
      console.log('开发模式下不支持自动更新');
      return { success: false, error: '开发模式下不支持自动更新' };
    }
    
    try {
      console.log('手动检查GitHub更新');
      const currentVersion = this.app.getVersion();
      console.log(`当前版本: ${currentVersion}`);
      
      // 使用本地测试服务器
      const response = await axios.get('http://localhost:3001/repos/imhaisu/NewReader/releases', {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'ReadixApp'
        },
        timeout: 10000
      });
      
      if (response.status === 200 && response.data.length > 0) {
        const releases = response.data
          .filter(release => !release.draft && release.published_at)
          .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
        
        if (releases.length === 0) {
          console.log('没有找到已发布的版本');
          this.mainWindow.webContents.send('update-status', { status: 'not-available' });
          return { success: true, updateAvailable: false, message: '当前已是最新版本' };
        }
        
        const latestRelease = releases[0];
        const latestVersion = latestRelease.tag_name.replace('v', '');
        const releaseNotes = latestRelease.body || '';
        const releaseDate = latestRelease.published_at;
        
        console.log(`最新版本: ${latestVersion}`);
        console.log(`发布说明: ${releaseNotes}`);
        
        const isUpdateAvailable = this.compareVersions(latestVersion, currentVersion) > 0;
        
        if (isUpdateAvailable) {
          console.log('发现新版本');
          
          const assets = latestRelease.assets || [];
          let downloadUrl = '';
          
          if (this.app.platform === 'darwin') {
            const dmgAsset = assets.find(asset => asset.name.endsWith('.dmg'));
            if (dmgAsset) {
              downloadUrl = dmgAsset.browser_download_url;
              console.log(`找到macOS DMG下载地址: ${downloadUrl}`);
            }
          } else if (this.app.platform === 'win32') {
            const winAsset = assets.find(asset => asset.name.endsWith('.exe') || asset.name.endsWith('.msi'));
            if (winAsset) {
              downloadUrl = winAsset.browser_download_url;
              console.log(`找到Windows下载地址: ${downloadUrl}`);
            }
          } else if (this.app.platform === 'linux') {
            const linuxAsset = assets.find(asset => asset.name.endsWith('.AppImage') || asset.name.endsWith('.deb'));
            if (linuxAsset) {
              downloadUrl = linuxAsset.browser_download_url;
              console.log(`找到Linux下载地址: ${downloadUrl}`);
            }
          }
          
          if (this.mainWindow && downloadUrl) {
            this.mainWindow.webContents.send('update-status', { 
              status: 'available',
              version: latestVersion,
              releaseDate: releaseDate,
              releaseNotes: releaseNotes,
              downloadUrl: downloadUrl
            });
          } else if (!downloadUrl) {
            console.log(`没有找到适合当前平台(${this.app.platform})的下载资源`);
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
          console.log('已是最新版本');
          this.mainWindow.webContents.send('update-status', { status: 'not-available' });
          return { success: true, updateAvailable: false, message: '当前已是最新版本' };
        }
      } else {
        console.log('GitHub API请求失败或没有releases:', response.status);
        this.mainWindow.webContents.send('update-status', { 
          status: 'not-available', 
          message: '当前已是最新版本' 
        });
        return { success: true, updateAvailable: false, message: '当前已是最新版本' };
      }
    } catch (error) {
      console.error('检查更新出错:', error);
      
      let userFriendlyMessage = '检查更新失败，请稍后再试';
      
      if (error.response) {
        if (error.response.status === 404) {
          userFriendlyMessage = '当前已是最新版本';
          this.mainWindow.webContents.send('update-status', { status: 'not-available' });
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
      
      this.mainWindow.webContents.send('update-status', { 
        status: 'error', 
        error: userFriendlyMessage 
      });
      
      return { success: false, error: userFriendlyMessage };
    }
  }
  
  compareVersions(versionA, versionB) {
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
}

// 运行集成测试
async function runIntegrationTest() {
  console.log('🚀 开始集成测试...');
  
  const updateChecker = new UpdateChecker();
  
  // 测试1: 开发模式检查
  console.log('\n🔍 测试1: 开发模式检查');
  const devResult = await updateChecker.checkForUpdates();
  console.log('开发模式结果:', devResult);
  
  // 测试2: 生产模式检查（模拟）
  console.log('\n🔍 测试2: 生产模式检查');
  updateChecker.isDevelopment = false;
  const prodResult = await updateChecker.checkForUpdates();
  console.log('生产模式结果:', prodResult);
  
  console.log('\n✅ 集成测试完成!');
}

// 如果直接运行此文件
if (require.main === module) {
  runIntegrationTest().catch(console.error);
}

module.exports = { UpdateChecker, MockElectronApp, MockMainWindow }; 