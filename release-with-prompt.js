const fs = require('fs');
const path = require('path');
const axios = require('axios');
const readline = require('readline');

const REPO_OWNER = 'imhaisu';
const REPO_NAME = 'Readix';
const VERSION = '1.0.4';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function createRelease() {
  try {
    console.log(`🚀 准备发布 Readix v${VERSION}...`);
    
    // 获取GitHub Token
    const token = await askQuestion('请输入您的GitHub Token: ');
    
    if (!token) {
      console.error('❌ 错误: 需要提供GitHub Token');
      rl.close();
      return;
    }

    const githubApi = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    // 验证Token
    console.log('🔐 验证GitHub Token...');
    try {
      await githubApi.get('/user');
      console.log('✅ Token验证成功');
    } catch (error) {
      console.error('❌ Token验证失败，请检查Token是否正确');
      rl.close();
      return;
    }
    
    // 1. 创建Release
    console.log('📝 创建GitHub Release...');
    const releaseData = {
      tag_name: `v${VERSION}`,
      name: `Readix v${VERSION}`,
      body: `## 🚀 新版本发布

### 📦 下载
- macOS (Apple Silicon): Readix-${VERSION}-arm64.dmg
- macOS (ZIP): Readix-${VERSION}-arm64-mac.zip

### 🔄 更新内容
- 优化应用内更新功能
- 支持直接下载和安装更新
- 改进用户界面和体验

### 🛠️ 技术改进
- 完善electron-updater集成
- 增强错误处理和用户提示
- 优化更新流程`,
      draft: false,
      prerelease: false
    };

    const releaseResponse = await githubApi.post(`/repos/${REPO_OWNER}/${REPO_NAME}/releases`, releaseData);
    const releaseId = releaseResponse.data.id;
    console.log(`✅ Release创建成功，ID: ${releaseId}`);

    // 2. 上传文件
    const files = [
      {
        path: `release/Readix-${VERSION}-arm64.dmg`,
        name: `Readix-${VERSION}-arm64.dmg`,
        contentType: 'application/octet-stream'
      },
      {
        path: `release/Readix-${VERSION}-arm64-mac.zip`,
        name: `Readix-${VERSION}-arm64-mac.zip`,
        contentType: 'application/zip'
      },
      {
        path: `release/latest-mac.yml`,
        name: 'latest-mac.yml',
        contentType: 'text/yaml'
      }
    ];

    for (const file of files) {
      if (!fs.existsSync(file.path)) {
        console.log(`⚠️  文件不存在: ${file.path}`);
        continue;
      }

      console.log(`📤 上传文件: ${file.name}...`);
      
      const fileBuffer = fs.readFileSync(file.path);
      const uploadUrl = `https://uploads.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/${releaseId}/assets?name=${encodeURIComponent(file.name)}`;
      
      await githubApi.post(uploadUrl, fileBuffer, {
        headers: {
          'Content-Type': file.contentType,
          'Content-Length': fileBuffer.length
        }
      });
      
      console.log(`✅ ${file.name} 上传成功`);
    }

    console.log('\n🎉 发布完成！');
    console.log(`📋 Release页面: https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${VERSION}`);
    console.log('\n现在您可以测试更新功能了！');

  } catch (error) {
    console.error('❌ 发布失败:', error.response?.data || error.message);
    if (error.response?.status === 422) {
      console.log('💡 提示: 可能该版本已经存在，请检查GitHub Releases页面');
    }
  } finally {
    rl.close();
  }
}

createRelease(); 