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
import { LayoutProvider } from './contexts/LayoutContext';
import { applyAllRulesToAllArticles, applyTopicFilterRules } from './utils/filterApplier';
import { diagnoseTopicFilters } from './utils/filterUtils';
import { message } from 'antd';
import { v4 as uuidv4 } from 'uuid';
import { diagnoseArticleTopicFilter } from './utils/filterUtils';

// 全局诊断辅助工具
declare global {
    interface Window {
    debugTools: {
      diagnoseTopicFilters: (topicId?: string) => void;
      listAllTopics: () => Promise<void>;
      viewTopicDetails: (topicId: string) => Promise<void>;
      fixTopicFilters: (topicId: string, fixAction: 'reset' | 'enable' | 'fix') => Promise<void>;
      testTopicFilters: (topicId: string) => Promise<void>;
      testArticleInTopic: (topicId: string, articleId: string) => Promise<void>;
      checkTopicRulesFormat: (topicId: string) => Promise<void>;
      getTopicFeeds: (topicId: string) => Promise<void>;
      forceRefreshTopicView: () => void;
    };
    applyTopicFilterRules?: (article: any, rules: any) => boolean;
  }
}

const AppContent: React.FC = () => {
  const { isInitialized: settingsInitialized } = useSettings();
  const { db, isInitialized: dbInitialized, triggerArticleListRefresh, triggerFeedCountRefresh } = useDatabase();
  
  // 同时检查两个上下文是否都已初始化
  const isInitialized = settingsInitialized && dbInitialized;

  useEffect(() => {
    if (isInitialized && db) {
      console.log('App is initialized, running filter check...');
      
      // 注册全局诊断工具
      window.debugTools = {
        diagnoseTopicFilters: (topicId?: string) => diagnoseTopicFilters(db, topicId),
        
        // 列出所有主题
        listAllTopics: async () => {
          console.group('所有主题');
          try {
            const topics = await db.topics.toArray();
            console.table(topics.map(t => ({
              id: t.id,
              name: t.name,
              rulesCount: t.filterRules?.length || 0,
              activeRules: t.filterRules?.filter(r => r.isActive).length || 0,
              createdAt: new Date(t.createdAt).toLocaleString()
            })));
            console.log('如需查看详情，使用: window.debugTools.viewTopicDetails("主题ID")');
          } catch (error) {
            console.error('获取主题失败:', error);
          }
          console.groupEnd();
        },
        
        // 查看主题详情
        viewTopicDetails: async (topicId: string) => {
          try {
            const topic = await db.topics.get(topicId);
            if (!topic) {
              console.error(`未找到ID为 ${topicId} 的主题`);
              return;
            }
            
            console.group(`主题详情: ${topic.name}`);
            console.log('基本信息:', {
              id: topic.id,
              name: topic.name,
              description: topic.description,
              iconName: topic.iconName,
              createdAt: new Date(topic.createdAt).toLocaleString()
            });
            
            // 获取主题的订阅源
            const topicFeeds = await db.topicFeeds.where('topicId').equals(topicId).toArray();
            console.log(`包含 ${topicFeeds.length} 个订阅源`);
            
            // 显示过滤规则
            const rules = topic.filterRules || [];
            console.log(`包含 ${rules.length} 条过滤规则，${rules.filter(r => r.isActive).length} 条已启用`);
            
            if (rules.length > 0) {
              console.group('过滤规则详情:');
              rules.forEach((rule, index) => {
                console.log(`[${index+1}] ${rule.isActive ? '✅' : '❌'} ${rule.field} ${rule.operation} ${rule.value} (${rule.logic})`);
              });
              console.groupEnd();
              console.log('如需修复规则，使用: window.debugTools.fixTopicFilters("主题ID", "fix")');
            }
          } catch (error) {
            console.error('获取主题详情失败:', error);
          }
          console.groupEnd();
        },
        
        // 修复主题过滤规则
        fixTopicFilters: async (topicId: string, fixAction: 'reset' | 'enable' | 'fix') => {
          try {
            const topic = await db.topics.get(topicId);
            if (!topic) {
              console.error(`未找到ID为 ${topicId} 的主题`);
              return;
            }
            
            let rules = topic.filterRules || [];
            const oldRulesCount = rules.length;
            const oldActiveCount = rules.filter(r => r.isActive).length;
            
            if (fixAction === 'reset') {
              // 重置所有规则
              rules = [];
            } else if (fixAction === 'enable') {
              // 启用所有规则
              rules = rules.map(rule => ({...rule, isActive: true}));
            } else if (fixAction === 'fix') {
              // 检查并修复规则格式
              rules = rules.map(rule => {
                // 确保所有必要字段都存在
                return {
                  ...rule,
                  id: rule.id || uuidv4(),
                  logic: rule.logic || 'AND',
                  isActive: true
                };
              });
            }
            
            // 更新主题
            await db.topics.update(topicId, { filterRules: rules });
            
            console.log(`主题 "${topic.name}" 过滤规则已修复:`, {
              操作: fixAction,
              规则数量变化: `${oldRulesCount} -> ${rules.length}`,
              激活规则变化: `${oldActiveCount} -> ${rules.filter(r => r.isActive).length}`
            });
            
          } catch (error) {
            console.error('修复主题过滤规则失败:', error);
          }
        },
        
        // 测试主题过滤规则
        testTopicFilters: async (topicId: string) => {
          try {
            const topic = await db.topics.get(topicId);
            if (!topic) {
              console.error(`未找到ID为 ${topicId} 的主题`);
              return;
            }
            
            const rules = topic.filterRules || [];
            if (rules.length === 0) {
              console.log(`主题 "${topic.name}" 没有设置过滤规则`);
              return;
            }
            
            // 获取主题包含的订阅源
            const topicFeeds = await db.topicFeeds.where('topicId').equals(topicId).toArray();
            const feedIds = topicFeeds.map(tf => tf.feedId);
            
            if (feedIds.length === 0) {
              console.log(`主题 "${topic.name}" 没有关联任何订阅源`);
              return;
            }
            
            // 获取所有文章
            let articles: any[] = [];
            for (const feedId of feedIds) {
              const feedArticles = await db.articles.where('sourceId').equals(feedId).limit(10).toArray();
              articles = articles.concat(feedArticles);
            }
            
            if (articles.length === 0) {
              console.log(`未找到主题 "${topic.name}" 关联订阅源的文章`);
              return;
            }
            
            console.group(`测试主题 "${topic.name}" 的过滤规则`);
            console.log(`共测试 ${articles.length} 篇文章`);
            
            let passCount = 0;
            let failCount = 0;
            
            // 测试每篇文章
            for (const article of articles) {
              const result = applyTopicFilterRules(article, rules);
                
              if (result) {
                passCount++;
                console.log(`✅ 通过: "${article.title}"`);
              } else {
                failCount++;
                console.log(`❌ 未通过: "${article.title}"`);
              }
            }
            
            console.log(`测试结果: ${passCount} 篇通过, ${failCount} 篇未通过`);
            console.groupEnd();
            
          } catch (error) {
            console.error('测试过滤规则失败:', error);
          }
        },

        // 添加测试单个文章的函数
        testArticleInTopic: async (topicId: string, articleId: string) => {
          try {
            await diagnoseArticleTopicFilter(db, topicId, articleId);
          } catch (error) {
            console.error('测试文章在主题中失败:', error);
          }
        },
        
        // 添加检查主题规则格式的函数
        checkTopicRulesFormat: async (topicId: string) => {
          try {
            const topic = await db.topics.get(topicId);
            if (!topic) {
              console.error(`未找到ID为 ${topicId} 的主题`);
              return;
            }
            
            console.group(`检查主题 "${topic.name}" 的规则格式`);
            const rules = topic.filterRules || [];
            
            if (rules.length === 0) {
              console.log('该主题没有设置过滤规则');
              console.groupEnd();
              return;
            }
            
            console.log(`共有 ${rules.length} 条规则，${rules.filter(r => r.isActive).length} 条已启用`);
            
            // 检查每条规则的格式
            rules.forEach((rule, index) => {
              console.group(`规则 #${index + 1}:`);
              console.log(`- ID: ${rule.id || '缺少ID!'}`);
              console.log(`- 字段: ${rule.field || '缺少字段!'}`);
              console.log(`- 操作: ${rule.operation || '缺少操作!'}`);
              console.log(`- 值: ${rule.value || '缺少值!'}`);
              console.log(`- 逻辑: ${rule.logic || '缺少逻辑! (默认AND)'}`);
              console.log(`- 状态: ${rule.isActive ? '启用' : '禁用'}`);
              
              // 检查值的格式
              if (rule.field === 'title' || rule.field === 'content' || rule.field === 'summary') {
                if (rule.operation === 'contains' || rule.operation === 'not_contains') {
                  const value = String(rule.value || '');
                  console.log('- 关键词分析:');
                  const parts = value.split(',').map(p => p.trim()).filter(Boolean);
                  console.log(`  - 逗号分隔部分: ${parts.length} 个`);
                  
                  parts.forEach((part, i) => {
                    console.log(`  - 部分 #${i+1}: "${part}" (${part.includes(' ') ? '包含空格' : '单个词'})`);
                    if (part.includes(' ')) {
                      const words = part.split(/\s+/).filter(Boolean);
                      console.log(`    - 包含 ${words.length} 个词: ${words.join(', ')}`);
                    }
                  });
                }
              }
              
              console.groupEnd();
            });
            
            console.groupEnd();
          } catch (error) {
            console.error('检查主题规则格式失败:', error);
          }
        },
        
        // 获取主题关联的订阅源
        getTopicFeeds: async (topicId: string) => {
          try {
            const topic = await db.topics.get(topicId);
            if (!topic) {
              console.error(`未找到ID为 ${topicId} 的主题`);
              return;
            }
            
            console.group(`主题 "${topic.name}" 关联的订阅源`);
            
            // 获取主题关联的订阅源
            const topicFeeds = await db.topicFeeds.where('topicId').equals(topicId).toArray();
            
            if (topicFeeds.length === 0) {
              console.log('该主题未关联任何订阅源');
              console.groupEnd();
              return;
            }
            
            console.log(`共关联 ${topicFeeds.length} 个订阅源:`);
            
            // 获取所有订阅源
            const allFeeds = await db.feeds.toArray();
            const feedMap = new Map(allFeeds.map(feed => [feed.id, feed]));
            
            // 显示每个订阅源的信息
            for (const tf of topicFeeds) {
              const feed = feedMap.get(tf.feedId);
              if (feed) {
                console.log(`- ${feed.title} (ID: ${feed.id})`);
              } else {
                console.log(`- 未找到ID为 ${tf.feedId} 的订阅源`);
              }
            }
            
            console.groupEnd();
          } catch (error) {
            console.error('获取主题关联的订阅源失败:', error);
          }
        },
        
        // 强制刷新主题视图
        forceRefreshTopicView: () => {
          console.log('强制刷新主题视图...');
          // 触发文章列表刷新
          window.dispatchEvent(new CustomEvent('refresh-article-list'));
          console.log('刷新事件已触发，请检查主题视图是否正确显示');
        }
      };

      // 暴露过滤函数以便调试
      window.applyTopicFilterRules = applyTopicFilterRules;

      // 仅在开发环境下输出调试信息
      if (process.env.NODE_ENV === 'development') {
        console.info('调试工具已启用，使用以下命令诊断主题过滤:');
        console.info('- window.debugTools.listAllTopics() - 列出所有主题');
        console.info('- window.debugTools.viewTopicDetails("主题ID") - 查看主题详情');
        console.info('- window.debugTools.diagnoseTopicFilters("主题ID") - 诊断主题过滤规则');
        console.info('- window.debugTools.fixTopicFilters("主题ID", "fix") - 修复主题过滤规则');
        console.info('- window.debugTools.testTopicFilters("主题ID") - 测试主题过滤规则');
        console.info('- window.debugTools.testArticleInTopic("主题ID", "文章ID") - 测试特定文章是否符合主题规则');
        console.info('- window.debugTools.checkTopicRulesFormat("主题ID") - 检查主题规则格式和关键词');
        console.info('- window.debugTools.getTopicFeeds("主题ID") - 查看主题关联的订阅源');
        console.info('- window.debugTools.forceRefreshTopicView() - 强制刷新主题视图');
      }
      
      // 在应用启动时一次性应用所有过滤规则
      const isDevEnv = process.env.NODE_ENV === 'development';
      if (isDevEnv) {
        console.log('应用启动: 应用所有过滤规则...');
      }
      
      applyAllRulesToAllArticles(db).then(updatedCount => {
        if (isDevEnv) {
          console.log(`应用启动: 应用过滤规则完成，${updatedCount} 篇文章状态已更新`);
        }
        
        if (updatedCount > 0) {
          // 仅触发一次刷新，避免重复
          if (isDevEnv) {
            console.log('应用启动: 触发文章列表刷新');
          }
          triggerArticleListRefresh();
          triggerFeedCountRefresh();
        }
      }).catch(error => {
        console.error('应用启动: 应用过滤规则失败:', error);
      });
    }
  }, [isInitialized, db, triggerArticleListRefresh, triggerFeedCountRefresh]);
  
  if (!isInitialized) {
    // 替换为空白内容，不显示加载动画
    return <div className="app-initializing" />;
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