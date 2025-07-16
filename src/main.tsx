import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import './index.css';
import { ThemeProvider } from './contexts/ThemeContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { DatabaseProvider } from './contexts/DatabaseContext';
import App from './App';
import { LogConfig, LogLevel } from './utils/logConfig';
import { setConsoleLogging } from './utils/filterLogger';

import SidebarLayout from './layouts/SidebarLayout';
import HomePage from './pages/HomePage';
import ReadLaterPage from './pages/ReadLaterPage';
import SettingsPage from './pages/SettingsPage';
import NotesPage from './pages/NotesPage';

// 初始化日志设置
LogConfig.setLevel(LogLevel.ERROR); // 在生产环境中只显示错误日志
LogConfig.disableAllModules(); // 先禁用所有模块
LogConfig.setModuleEnabled('FILTER', false); // 确保FILTER模块也被禁用
LogConfig.setModuleEnabled('ARTICLE_DETAIL', false); // 禁用文章详情组件的日志
LogConfig.setModuleEnabled('IMAGE_PROXY', false); // 禁用图片代理日志

// 开发环境下可以通过控制台手动开启日志
if (process.env.NODE_ENV === 'development') {
  console.log('[初始化] 日志系统已配置，日志级别：ERROR，过滤器日志已禁用');
  
  // 添加开发环境下的日志控制函数
  (window as any).debugLogs = {
    enableArticleDetailLogs: () => {
      LogConfig.setModuleEnabled('ARTICLE_DETAIL', true);
      console.log('[调试] 文章详情日志已启用');
    },
    disableArticleDetailLogs: () => {
      LogConfig.setModuleEnabled('ARTICLE_DETAIL', false);
      console.log('[调试] 文章详情日志已禁用');
    },
    enableImageProxyLogs: () => {
      LogConfig.setModuleEnabled('IMAGE_PROXY', true);
      console.log('[调试] 图片代理日志已启用');
    },
    disableImageProxyLogs: () => {
      LogConfig.setModuleEnabled('IMAGE_PROXY', false);
      console.log('[调试] 图片代理日志已禁用');
    },
    setLogLevel: (level: string) => {
      const logLevel = LogLevel[level as keyof typeof LogLevel];
      if (logLevel !== undefined) {
        LogConfig.setLevel(logLevel);
        console.log(`[调试] 日志级别已设置为: ${level}`);
      } else {
        console.error(`[调试] 无效的日志级别: ${level}`);
      }
    },
    // 添加一个帮助函数，显示可用的日志控制命令
    help: () => {
      console.log(`
[调试日志帮助]
可用命令:
- debugLogs.enableArticleDetailLogs() - 启用文章详情日志
- debugLogs.disableArticleDetailLogs() - 禁用文章详情日志
- debugLogs.enableImageProxyLogs() - 启用图片代理日志
- debugLogs.disableImageProxyLogs() - 禁用图片代理日志
- debugLogs.setLogLevel(level) - 设置日志级别，可选值: DEBUG, INFO, WARN, ERROR, NONE
      `);
    }
  };
}

// 全局错误处理
window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.error);
  console.error('[Global Error] Stack:', event.error?.stack);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
});

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: [
        {
          path: '/',
          element: <SidebarLayout />,
          children: [
            { index: true, element: <HomePage filter="all" /> },
            { path: 'feed/:feedId', element: <HomePage /> },
            { path: 'group/:groupId', element: <HomePage /> },
            { path: 'topic/:topicId', element: <HomePage /> }, // 新增：主题路由
            { path: 'starred', element: <HomePage filter="starred" /> },
            { path: 'unread', element: <HomePage filter="unread" /> },
            { path: 'all', element: <HomePage filter="all" /> },
            { path: 'today', element: <HomePage filter="today" /> },
            { path: 'readlater', element: <ReadLaterPage /> },
            { path: 'notes', element: <NotesPage /> },
            { path: 'settings', element: <SettingsPage /> },
          ],
        },
      ],
    },
    {
      path: '*',
      element: <Navigate to="/" replace />,
    },
  ],
  {
    // 添加future标志来解决React Router警告
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true
    } as any
  }
);

// 渲染应用
// console.log('[App] 开始初始化应用...');

const rootElement = document.getElementById('root');
if (rootElement) {
  // console.log('[App] 根元素找到，开始渲染...');
  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <React.StrictMode>
      <ConfigProvider locale={zhCN}>
        <ThemeProvider>
          <SettingsProvider>
            <DatabaseProvider>
              <RouterProvider router={router} />
            </DatabaseProvider>
          </SettingsProvider>
        </ThemeProvider>
      </ConfigProvider>
    </React.StrictMode>
  );

  // console.log('[App] 应用渲染完成');
} else {
  console.error('[App] 根元素未找到！');
} 