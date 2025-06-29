import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import './index.css';
import { ThemeProvider } from './contexts/ThemeContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { DatabaseProvider } from './contexts/DatabaseContext';
import App from './App';

import SidebarLayout from './layouts/SidebarLayout';
import HomePage from './pages/HomePage';
import ReadLaterPage from './pages/ReadLaterPage';
import SettingsPage from './pages/SettingsPage';

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
            { index: true, element: <HomePage /> },
            { path: 'feed/:feedId', element: <HomePage /> },
            { path: 'group/:groupId', element: <HomePage /> },
            { path: 'starred', element: <HomePage filter="starred" /> },
            { path: 'unread', element: <HomePage filter="unread" /> },
            { path: 'all', element: <HomePage filter="all" /> },
            { path: 'readlater', element: <ReadLaterPage /> },
            { path: 'settings', element: <SettingsPage /> },
          ],
        },
      ],
    },
    {
      path: '*',
      element: <Navigate to="/" replace />,
    },
  ]
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