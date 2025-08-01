#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const axios = require('axios');
const readline = require('readline');

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

class QuickRelease {
  constructor() {
    this.packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    this.currentVersion = this.packageJson.version;
    this.repoOwner = 'imhaisu';
    this.repoName = 'Readix';
  }

  async start() {
    console.log('⚡ 快速发布工具');
    console.log('================');
    console.log(`当前版本: ${this.currentVersion}`);
    
    try {
      // 1. 自动计算新版本号
      const newVersion = this.calculateNextVersion();
      console.log(`📦 新版本号: ${newVersion}`);
      
      // 2. 获取GitHub Token
      const token = await this.getGitHubToken();
      if (!token) {
        console.log('❌ 未提供GitHub Token，退出');
        return;
      }

      // 3. 确认发布
      const confirm = await askQuestion(`确认发布 v${newVersion}? (y/N): `);
      if (confirm.toLowerCase() !== 'y') {
        console.log('❌ 用户取消发布');
        return;
      }

      console.log('\n🚀 开始自动化发布流程...');

      // 4. 更新版本号
      await this.updateVersion(newVersion);

      // 5. 构建和打包
      await this.buildAndPackage();

      // 6. 生成yml文件
      await this.generateYml();

      // 7. 发布到GitHub
      await this.publishToGitHub(newVersion, token);

      console.log('\n🎉 发布完成！');
      console.log(`📋 Release页面: https://github.com/${this.repoOwner}/${this.repoName}/releases/tag/v${newVersion}`);

    } catch (error) {
      console.error('❌ 发布失败:', error.message);
    } finally {
      rl.close();
    }
  }

  calculateNextVersion() {
    const [major, minor, patch] = this.currentVersion.split('.').map(Number);
    return `${major}.${minor}.${patch + 1}`;
  }

  async getGitHubToken() {
    const token = await askQuestion('请输入GitHub Token: ');
    
    if (!token) return null;

    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      console.log(`✅ Token验证成功，用户: ${response.data.login}`);
      return token;
    } catch (error) {
      console.log('❌ Token验证失败');
      return null;
    }
  }

  async updateVersion(newVersion) {
    console.log('📝 更新版本号...');
    
    this.packageJson.version = newVersion;
    fs.writeFileSync('./package.json', JSON.stringify(this.packageJson, null, 2));
    
    try {
      // 检查Git状态
      const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
      if (gitStatus.trim()) {
        console.log('📝 提交所有更改...');
        execSync('git add .', { stdio: 'inherit' });
        execSync(`git commit -m "release: v${newVersion}"`, { stdio: 'inherit' });
      } else {
        console.log('📝 提交版本号更改...');
        execSync('git add package.json', { stdio: 'inherit' });
        execSync(`git commit -m "release: v${newVersion}"`, { stdio: 'inherit' });
      }
      
      // 创建标签
      console.log(`📝 创建标签 v${newVersion}...`);
      execSync(`git tag v${newVersion}`, { stdio: 'inherit' });
      
      // 推送到远程仓库
      console.log('📤 推送到远程仓库...');
      execSync('git push origin main', { stdio: 'inherit' });
      execSync(`git push origin v${newVersion}`, { stdio: 'inherit' });
      
      console.log('✅ 版本号更新和Git操作完成');
    } catch (error) {
      console.log('⚠️ Git操作失败，请手动执行以下命令:');
      console.log(`  git add .`);
      console.log(`  git commit -m "release: v${newVersion}"`);
      console.log(`  git tag v${newVersion}`);
      console.log(`  git push origin main`);
      console.log(`  git push origin v${newVersion}`);
      throw new Error('Git操作失败，请手动处理');
    }
  }

  async buildAndPackage() {
    console.log('🔨 构建和打包应用...');
    
    try {
      execSync('npm run build', { stdio: 'inherit' });
      console.log('✅ 构建完成');
      
      execSync('npm run package:mac', { stdio: 'inherit' });
      console.log('✅ 打包完成');
    } catch (error) {
      throw new Error('构建或打包失败');
    }
  }

  async generateYml() {
    console.log('📄 生成latest-mac.yml...');
    
    try {
      execSync('node generate-yml.js', { stdio: 'inherit' });
      console.log('✅ latest-mac.yml生成完成');
    } catch (error) {
      throw new Error('latest-mac.yml生成失败');
    }
  }

  async publishToGitHub(newVersion, token) {
    console.log('🚀 发布到GitHub...');
    
    const githubApi = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    try {
      // 创建Release
      const releaseData = {
        tag_name: `v${newVersion}`,
        name: `Readix v${newVersion}`,
        body: this.generateReleaseNotes(newVersion),
        draft: false,
        prerelease: false
      };

      const releaseResponse = await githubApi.post(`/repos/${this.repoOwner}/${this.repoName}/releases`, releaseData);
      const releaseId = releaseResponse.data.id;
      console.log(`✅ Release创建成功`);

      // 上传文件
      const files = [
        {
          path: `release/Readix-${newVersion}-arm64.dmg`,
          name: `Readix-${newVersion}-arm64.dmg`,
          contentType: 'application/octet-stream'
        },
        {
          path: `release/Readix-${newVersion}-arm64-mac.zip`,
          name: `Readix-${newVersion}-arm64-mac.zip`,
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
          console.log(`⚠️ 文件不存在: ${file.path}`);
          continue;
        }

        console.log(`📤 上传: ${file.name}`);
        
        const fileBuffer = fs.readFileSync(file.path);
        const uploadUrl = `https://uploads.github.com/repos/${this.repoOwner}/${this.repoName}/releases/${releaseId}/assets?name=${encodeURIComponent(file.name)}`;
        
        await githubApi.post(uploadUrl, fileBuffer, {
          headers: {
            'Content-Type': file.contentType,
            'Content-Length': fileBuffer.length
          }
        });
        
        console.log(`✅ ${file.name} 上传成功`);
      }

    } catch (error) {
      if (error.response?.status === 422) {
        throw new Error(`版本 v${newVersion} 可能已经存在`);
      }
      throw error;
    }
  }

  generateReleaseNotes(version) {
    return `## 🚀 Readix v${version}

### 📦 下载
- macOS (Apple Silicon): Readix-${version}-arm64.dmg
- macOS (ZIP): Readix-${version}-arm64-mac.zip

### 🔄 更新内容
- 优化应用内更新体验
- 改进用户界面设计
- 增强错误处理机制
- 完善更新流程

### 📝 发布信息
- 版本: ${version}
- 发布日期: ${new Date().toISOString().split('T')[0]}
- 构建时间: ${new Date().toLocaleString('zh-CN')}`;
  }
}

// 启动快速发布
const quickRelease = new QuickRelease();
quickRelease.start(); 