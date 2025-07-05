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
import { FilterRulesProvider } from './contexts/FilterRulesContext';
import PulsingLoader from './components/PulsingLoader';
import { LayoutProvider } from './contexts/LayoutContext';
import { applyAllRulesToAllArticles } from './utils/filterApplier';
import { message } from 'antd';

const AppContent: React.FC = () => {
  const { isInitialized: settingsInitialized } = useSettings();
  const { db, isInitialized: dbInitialized, triggerArticleListRefresh, triggerFeedCountRefresh } = useDatabase();
  
  // 同时检查两个上下文是否都已初始化
  const isInitialized = settingsInitialized && dbInitialized;

  useEffect(() => {
    if (isInitialized && db) {
      console.log('App is initialized, running filter check...');
      
      applyAllRulesToAllArticles(db).then(updatedCount => {
        if (updatedCount > 0) {
          triggerArticleListRefresh();
          triggerFeedCountRefresh();
        }
      }).catch(error => {
        console.error('Failed to apply all rules on startup:', error);
      });
    }
  }, [isInitialized, db, triggerArticleListRefresh, triggerFeedCountRefresh]);
  
  if (!isInitialized) {
    return <PulsingLoader />;
  }
  
  return (
    <FilterRulesProvider>
      <FilterProvider>
        <Layout className="main-content">
          <Outlet />
        </Layout>
      </FilterProvider>
    </FilterRulesProvider>
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