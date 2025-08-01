const fs = require('fs');
const path = require('path');

// 读取package.json获取版本号
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const version = packageJson.version;

console.log(`准备发布版本: ${version}`);
console.log('\n需要上传到GitHub的文件:');

// 检查文件是否存在
const files = [
  `release/Readix-${version}-arm64.dmg`,
  `release/Readix-${version}-arm64-mac.zip`,
  `release/latest-mac.yml`
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    const stats = fs.statSync(file);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`✓ ${file} (${sizeInMB} MB)`);
  } else {
    console.log(`✗ ${file} (文件不存在)`);
  }
});

console.log('\n发布步骤:');
console.log('1. 打开 https://github.com/imhaisu/Readix');
console.log('2. 点击 "Releases"');
console.log('3. 点击 "Create a new release"');
console.log('4. 填写信息:');
console.log(`   - Tag version: v${version}`);
console.log(`   - Release title: Readix v${version}`);
console.log('   - Description: 更新说明');
console.log('5. 上传上述文件');
console.log('6. 点击 "Publish release"');

console.log('\n发布完成后，您就可以测试更新功能了！'); 