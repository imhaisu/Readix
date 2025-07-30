# NewReader - 本地化轻量级RSS阅读器

NewReader是一款专注于本地阅读体验的RSS阅读软件，提供高效、美观、可定制的信息获取工具，帮助用户以更有组织的方式管理和阅读订阅内容。

## 功能特点

- **订阅源管理**：轻松添加、分组和配置RSS订阅源
- **本地存储**：所有数据保存在本地，保护您的隐私
- **多视图模式**：列表、卡片、杂志和紧凑视图满足不同阅读喜好
- **灵活布局**：单栏、双栏和三栏布局，适应不同屏幕大小
- **搜索与过滤**：强大的搜索和筛选功能，快速找到您需要的内容
- **离线阅读**：自动缓存内容，无需网络也能阅读
- **稍后阅读**：保存外部链接，整合所有阅读内容
- **Bionic Reading**：提升阅读速度和专注度的辅助模式
- **主题支持**：深色模式和浅色模式，减少眼睛疲劳
- **自动更新**：智能更新检查和管理，保持软件最新

## 技术栈

- **前端框架**：Electron, React, TypeScript
- **UI库**：Ant Design
- **数据存储**：IndexedDB (Dexie.js)

## 开发

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

### 构建应用

```bash
npm run build
```

### 打包发布

```bash
npm run package
```

## 调试与日志

NewReader 提供了灵活的日志系统，可以帮助开发者诊断问题。在开发模式下，可以通过浏览器控制台使用以下命令控制日志输出：

### 日志控制命令

```javascript
// 查看可用的日志命令
debugLogs.help()

// 设置日志级别（DEBUG, INFO, WARN, ERROR, NONE）
debugLogs.setLogLevel('DEBUG')

// 启用/禁用文章详情日志
debugLogs.enableArticleDetailLogs()
debugLogs.disableArticleDetailLogs()

// 启用/禁用图片代理日志
debugLogs.enableImageProxyLogs()
debugLogs.disableImageProxyLogs()
```

### 日志模块

系统包含以下日志模块：

- `GENERAL` - 通用日志
- `FEED` - 订阅源相关日志
- `FILTER` - 过滤规则日志
- `DATABASE` - 数据库操作日志
- `NETWORK` - 网络请求日志
- `LAYOUT` - 布局相关日志
- `HOMEPAGE` - 首页相关日志
- `ARTICLE_DETAIL` - 文章详情组件日志
- `IMAGE_PROXY` - 图片代理相关日志
- `PERFORMANCE` - 性能相关日志

## 许可证

MIT 