import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from 'antd';
import SidebarLayout from './layouts/SidebarLayout';
import TitleBar from './components/TitleBar';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import ReadLaterPage from './pages/ReadLaterPage';
import { useTheme } from './contexts/ThemeContext';
import { useSettings } from './contexts/SettingsContext';
import { useDatabase } from './contexts/DatabaseContext';
import { TitleBarProvider, useTitleBar } from './contexts/TitleBarContext';
import { FilterProvider } from './contexts/FilterContext';
import PulsingLoader from './components/PulsingLoader';

const AppContent: React.FC = () => {
  const { initialized } = useSettings();
  const { initDatabase } = useDatabase();
  const { customControls } = useTitleBar();

  console.log('[App] AppContent 渲染，initialized:', initialized);

  useEffect(() => {
    console.log('[App] 开始初始化数据库...');
    initDatabase();
  }, [initDatabase]);

  if (!initialized) {
    console.log('[App] 设置未初始化，显示加载中...');
    return <PulsingLoader />;
  }

  console.log('[App] 设置已初始化，渲染主要内容');
  return (
    <>
      <TitleBar customControls={customControls} />
      <Layout className="main-content">
        <Routes>
          <Route path="/" element={<SidebarLayout />}>
            <Route index element={<HomePage />} />
            <Route path="feed/:feedId" element={<HomePage />} />
            <Route path="group/:groupId" element={<HomePage />} />
            <Route path="starred" element={<HomePage filter="starred" />} />
            <Route path="unread" element={<HomePage filter="unread" />} />
            <Route path="all" element={<HomePage filter="all" />} />
            <Route path="readlater" element={<ReadLaterPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </>
  );
}

const App: React.FC = () => {
  const { theme } = useTheme();
  console.log('[App] App 组件渲染，主题:', theme);
  return (
    <FilterProvider>
      <TitleBarProvider>
        <div className={`app-container ${theme === 'dark' ? 'dark-theme' : ''}`}>
          <AppContent />
        </div>
      </TitleBarProvider>
    </FilterProvider>
  );
};

export default App; 