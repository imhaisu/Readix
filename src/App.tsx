import React, { useEffect } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout, Form } from 'antd';
import SidebarLayout from './layouts/SidebarLayout';
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
  
  // 同时检查两个上下文是否都已初始化
  const isInitialized = settingsInitialized && dbInitialized;
  
  if (!isInitialized) {
    return <PulsingLoader />;
  }
  
  return (
    <FilterProvider>
      <Layout className="main-content">
        <Outlet />
      </Layout>
    </FilterProvider>
  );
}

const App: React.FC = () => {
  return (
    <Form.Provider>
      <TitleBarProvider>
        <LayoutProvider>
          <div className="app-container">
            <AppContent />
          </div>
        </LayoutProvider>
      </TitleBarProvider>
    </Form.Provider>
  );
};

export default App; 