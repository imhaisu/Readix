import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Form } from 'antd';
import SidebarLayout from './layouts/SidebarLayout';
import TitleBar from './components/TitleBar';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import ReadLaterPage from './pages/ReadLaterPage';
import { useSettings } from './contexts/SettingsContext';
import { useDatabase } from './contexts/DatabaseContext';
import { TitleBarProvider, useTitleBar } from './contexts/TitleBarContext';
import { FilterProvider } from './contexts/FilterContext';
import PulsingLoader from './components/PulsingLoader';
import { LayoutProvider } from './contexts/LayoutContext';

const AppContent: React.FC = () => {
  const { isInitialized: settingsInitialized } = useSettings();
  const { isInitialized: dbInitialized } = useDatabase();
  const { customControls } = useTitleBar();

  // 同时检查两个上下文是否都已初始化
  const isInitialized = settingsInitialized && dbInitialized;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[App] AppContent 渲染，isInitialized:', isInitialized);
  }
  
  if (!isInitialized) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[App] 上下文未初始化，显示加载中...');
    }
    return <PulsingLoader />;
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[App] 上下文已初始化，渲染主要内容');
  }
  
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
  return (
    <Form.Provider>
      <FilterProvider>
        <TitleBarProvider>
          <LayoutProvider>
            <div className="app-container">
              <AppContent />
            </div>
          </LayoutProvider>
        </TitleBarProvider>
      </FilterProvider>
    </Form.Provider>
  );
};

export default App; 