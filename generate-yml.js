const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execSync } = require('child_process');

// 读取package.json获取版本号
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const version = packageJson.version;

// 检查release目录是否存在
const releaseDir = path.join(__dirname, 'release');
if (!fs.existsSync(releaseDir)) {
  console.error('错误: release目录不存在，请先构建应用');
  process.exit(1);
}

// 检查DMG和ZIP文件是否存在
const dmgFile = path.join(releaseDir, `Readix-${version}-arm64.dmg`);
const zipFile = path.join(releaseDir, `Readix-${version}-arm64-mac.zip`);

if (!fs.existsSync(dmgFile)) {
  console.error(`错误: DMG文件不存在: ${dmgFile}`);
  process.exit(1);
}

if (!fs.existsSync(zipFile)) {
  console.error(`错误: ZIP文件不存在: ${zipFile}`);
  process.exit(1);
}

// 计算文件哈希和大小
function getFileInfo(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha512');
  hashSum.update(fileBuffer);
  const hash = hashSum.digest('hex');
  const size = fs.statSync(filePath).size;
  return { hash, size };
}

const dmgInfo = getFileInfo(dmgFile);
const zipInfo = getFileInfo(zipFile);

// 生成latest-mac.yml内容
const ymlContent = `version: ${version}
files:
  - url: Readix-${version}-arm64.dmg
    sha512: ${dmgInfo.hash}
    size: ${dmgInfo.size}
  - url: Readix-${version}-arm64-mac.zip
    sha512: ${zipInfo.hash}
    size: ${zipInfo.size}
path: Readix-${version}-arm64.dmg
sha512: ${dmgInfo.hash}
releaseDate: ${new Date().toISOString()}
`;

// 写入latest-mac.yml文件
const ymlPath = path.join(releaseDir, 'latest-mac.yml');
fs.writeFileSync(ymlPath, ymlContent);

console.log(`成功生成latest-mac.yml文件: ${ymlPath}`);
console.log('文件内容:');
console.log(ymlContent); 