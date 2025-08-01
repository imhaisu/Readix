const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 读取package.json获取版本号
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const version = packageJson.version;
console.log(`当前版本: ${version}`);

// 检查release目录是否存在
const releaseDir = path.join(__dirname, 'release');
if (!fs.existsSync(releaseDir)) {
  console.error('错误: release目录不存在，请先构建应用');
  process.exit(1);
}

// 检查必要文件是否存在
const dmgFile = path.join(releaseDir, `Readix-${version}-arm64.dmg`);
const zipFile = path.join(releaseDir, `Readix-${version}-arm64-mac.zip`);
const ymlFile = path.join(releaseDir, 'latest-mac.yml');

if (!fs.existsSync(dmgFile)) {
  console.error(`错误: DMG文件不存在: ${dmgFile}`);
  process.exit(1);
}

if (!fs.existsSync(zipFile)) {
  console.error(`错误: ZIP文件不存在: ${zipFile}`);
  process.exit(1);
}

if (!fs.existsSync(ymlFile)) {
  console.error(`错误: YML文件不存在: ${ymlFile}`);
  process.exit(1);
}

// 创建本地HTTP服务器来模拟GitHub Releases
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname;
  
  console.log(`收到请求: ${req.method} ${pathname}`);
  
  // 设置CORS头，允许所有来源
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // 处理latest-mac.yml请求
  if (pathname === '/latest-mac.yml') {
    const ymlContent = fs.readFileSync(ymlFile, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/yaml' });
    res.end(ymlContent);
    console.log('已发送 latest-mac.yml');
    return;
  }
  
  // 处理DMG文件请求
  if (pathname === `/Readix-${version}-arm64.dmg`) {
    const dmgContent = fs.readFileSync(dmgFile);
    res.writeHead(200, { 
      'Content-Type': 'application/octet-stream',
      'Content-Length': dmgContent.length
    });
    res.end(dmgContent);
    console.log('已发送 DMG 文件');
    return;
  }
  
  // 处理ZIP文件请求
  if (pathname === `/Readix-${version}-arm64-mac.zip`) {
    const zipContent = fs.readFileSync(zipFile);
    res.writeHead(200, { 
      'Content-Type': 'application/zip',
      'Content-Length': zipContent.length
    });
    res.end(zipContent);
    console.log('已发送 ZIP 文件');
    return;
  }
  
  // 处理其他请求
  res.writeHead(404);
  res.end('Not Found');
});

const PORT = 8080;
server.listen(PORT, () => {
  console.log(`测试更新服务器已启动: http://localhost:${PORT}`);
  console.log(`\n要测试更新，请修改electron/main.ts中的feedURL为:`);
  console.log(`const feedURL = 'http://localhost:${PORT}';`);
  console.log(`\n然后重新构建应用并测试更新功能。`);
  console.log(`\n可用的测试URL:`);
  console.log(`- latest-mac.yml: http://localhost:${PORT}/latest-mac.yml`);
  console.log(`- DMG文件: http://localhost:${PORT}/Readix-${version}-arm64.dmg`);
  console.log(`- ZIP文件: http://localhost:${PORT}/Readix-${version}-arm64-mac.zip`);
  console.log(`\n按Ctrl+C停止服务器`);
}); 