const axios = require('axios');

// 测试实际的GitHub API更新检查
async function testRealUpdateCheck() {
  console.log('🚀 测试实际的GitHub API更新检查...\n');
  
  try {
    console.log('📋 当前版本: 0.1.8');
    console.log('🔍 正在检查GitHub releases...');
    
    const response = await axios.get('https://api.github.com/repos/imhaisu/NewReader/releases', {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'ReadixApp'
      },
      timeout: 10000
    });
    
    if (response.status === 200 && response.data.length > 0) {
      console.log(`✅ GitHub API响应成功，找到 ${response.data.length} 个releases`);
      
      // 过滤非草稿版本并按发布日期排序
      const releases = response.data
        .filter(release => !release.draft && release.published_at)
        .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
      
      if (releases.length === 0) {
        console.log('⚠️  没有找到已发布的版本');
        return;
      }
      
      console.log('\n📋 最新版本信息:');
      const latestRelease = releases[0];
      console.log(`  - 版本: ${latestRelease.tag_name}`);
      console.log(`  - 名称: ${latestRelease.name}`);
      console.log(`  - 发布日期: ${latestRelease.published_at}`);
      console.log(`  - 发布说明: ${latestRelease.body ? latestRelease.body.substring(0, 100) + '...' : '无'}`);
      console.log(`  - 资源数量: ${latestRelease.assets ? latestRelease.assets.length : 0}`);
      
      // 版本比较
      const currentVersion = '0.1.8';
      const latestVersion = latestRelease.tag_name.replace('v', '');
      
      function compareVersions(versionA, versionB) {
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
      
      const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;
      
      console.log('\n📊 版本比较结果:');
      console.log(`  - 当前版本: ${currentVersion}`);
      console.log(`  - 最新版本: ${latestVersion}`);
      console.log(`  - 需要更新: ${isUpdateAvailable ? '是' : '否'}`);
      
      if (isUpdateAvailable) {
        console.log('\n🎉 发现新版本!');
        
        // 检查下载资源
        const assets = latestRelease.assets || [];
        const platform = process.platform;
        
        console.log(`\n📋 平台特定下载资源 (${platform}):`);
        
        if (platform === 'darwin') {
          const dmgAsset = assets.find(asset => asset.name.endsWith('.dmg'));
          const zipAsset = assets.find(asset => asset.name.endsWith('.zip'));
          
          if (dmgAsset) {
            console.log(`  ✅ DMG: ${dmgAsset.name} (${(dmgAsset.size / 1024 / 1024).toFixed(1)}MB)`);
            console.log(`     下载链接: ${dmgAsset.browser_download_url}`);
          }
          if (zipAsset) {
            console.log(`  ✅ ZIP: ${zipAsset.name} (${(zipAsset.size / 1024 / 1024).toFixed(1)}MB)`);
            console.log(`     下载链接: ${zipAsset.browser_download_url}`);
          }
          if (!dmgAsset && !zipAsset) {
            console.log('  ⚠️  未找到macOS下载资源');
          }
        } else if (platform === 'win32') {
          const exeAsset = assets.find(asset => asset.name.endsWith('.exe'));
          const msiAsset = assets.find(asset => asset.name.endsWith('.msi'));
          
          if (exeAsset) {
            console.log(`  ✅ EXE: ${exeAsset.name} (${(exeAsset.size / 1024 / 1024).toFixed(1)}MB)`);
            console.log(`     下载链接: ${exeAsset.browser_download_url}`);
          }
          if (msiAsset) {
            console.log(`  ✅ MSI: ${msiAsset.name} (${(msiAsset.size / 1024 / 1024).toFixed(1)}MB)`);
            console.log(`     下载链接: ${msiAsset.browser_download_url}`);
          }
          if (!exeAsset && !msiAsset) {
            console.log('  ⚠️  未找到Windows下载资源');
          }
        } else if (platform === 'linux') {
          const appImageAsset = assets.find(asset => asset.name.endsWith('.AppImage'));
          const debAsset = assets.find(asset => asset.name.endsWith('.deb'));
          
          if (appImageAsset) {
            console.log(`  ✅ AppImage: ${appImageAsset.name} (${(appImageAsset.size / 1024 / 1024).toFixed(1)}MB)`);
            console.log(`     下载链接: ${appImageAsset.browser_download_url}`);
          }
          if (debAsset) {
            console.log(`  ✅ DEB: ${debAsset.name} (${(debAsset.size / 1024 / 1024).toFixed(1)}MB)`);
            console.log(`     下载链接: ${debAsset.browser_download_url}`);
          }
          if (!appImageAsset && !debAsset) {
            console.log('  ⚠️  未找到Linux下载资源');
          }
        }
        
        console.log(`\n📋 所有可用资源:`);
        assets.forEach((asset, index) => {
          console.log(`  ${index + 1}. ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)}MB)`);
          console.log(`     下载链接: ${asset.browser_download_url}`);
        });
        
      } else {
        console.log('\n✅ 已是最新版本');
      }
      
      // 显示最近的几个版本
      console.log('\n📋 最近的版本历史:');
      releases.slice(0, 5).forEach((release, index) => {
        const version = release.tag_name.replace('v', '');
        const date = new Date(release.published_at).toLocaleDateString('zh-CN');
        console.log(`  ${index + 1}. ${release.tag_name} (${date})`);
      });
      
    } else {
      console.log('❌ GitHub API请求失败或没有releases');
    }
    
  } catch (error) {
    console.error('❌ 检查更新时出错:', error.message);
    
    if (error.response) {
      console.error(`HTTP状态: ${error.response.status}`);
      if (error.response.status === 404) {
        console.log('💡 提示: 可能是仓库不存在或私有仓库');
      } else if (error.response.status === 403) {
        console.log('💡 提示: 可能是API请求频率限制');
      }
    } else if (error.code === 'ENOTFOUND') {
      console.log('💡 提示: 网络连接问题');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('💡 提示: 请求超时');
    }
  }
}

// 运行测试
testRealUpdateCheck().then(() => {
  console.log('\n🎉 实际更新检查测试完成!');
  console.log('\n💡 如果测试通过，说明更新功能可以正常工作');
  console.log('💡 如果测试失败，请检查网络连接和GitHub仓库设置');
}); 