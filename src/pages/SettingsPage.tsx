import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Tabs, Form, InputNumber, Switch, Button, Card, Space, Typography, message, Select, Slider, ColorPicker, Input, Divider, Modal } from 'antd';
import { 
  CloseOutlined, 
  ExportOutlined, 
  ImportOutlined, 
  FilterOutlined, 
  ClearOutlined, 
  QuestionCircleOutlined,
  FontSizeOutlined,
  ReadOutlined,
  SettingOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  SyncOutlined,
  RobotOutlined,
  EyeOutlined
} from '@ant-design/icons';
import { useSettings } from '../contexts/SettingsContext';
import { useDatabase } from '../contexts/DatabaseContext';
import styles from './SettingsPage.module.css';
import { Settings } from '../types/settings';
import { FeedSource } from '../db/database';
import FilterRulesManager from '../components/FilterRulesManager';
import type { TabsProps } from 'antd';
import { cleanupOrphanedArticles } from '../utils/cleanupHelper';
import { debounce } from 'lodash';
import UpdateManager from '../components/UpdateManager';
import UpdateManagerDev from '../components/UpdateManagerDev';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

const generateOpml = (feeds: FeedSource[]): string => {
  let opmlDoc = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Readix Subscriptions</title>\n  </head>\n  <body>\n`;
  feeds.forEach(feed => {
    opmlDoc += `    <outline type="rss" text="${feed.title}" title="${feed.title}" xmlUrl="${feed.url}" />\n`;
  });
  opmlDoc += `  </body>\n</opml>`;
  return opmlDoc;
};

const SettingsPage: React.FC = () => {
  const { settings, updateSettings, isInitialized } = useSettings();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { db, triggerArticleListRefresh } = useDatabase();
  const [importing, setImporting] = useState(false);
  const [testingApiKey, setTestingApiKey] = useState(false);
  const [activeTab, setActiveTab] = useState('reading');  // 默认打开"阅读体验"选项卡
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [cleaningArticles, setCleaningArticles] = useState(false);

  useEffect(() => {
    if (isInitialized) {
      form.setFieldsValue({
        ...settings.general,
        ...settings.advanced,
        ...settings.appearance.reading,
      });
    }
  }, [settings, isInitialized, form]);

  // 自动保存设置的防抖函数，防止频繁保存
  const debouncedSaveSettings = useCallback(
    debounce((values: any) => {
      console.log('[SettingsPage] 自动保存设置:', values);
      
      // 构建完整的设置对象，确保所有字段都被包含
      const newSettings: Settings = {
        ...settings,
        general: {
          ...settings.general,
          syncOnStartup: values.syncOnStartup ?? settings.general.syncOnStartup,
          autoCleanup: values.autoCleanup ?? settings.general.autoCleanup,
          cleanupUnreadDays: values.cleanupUnreadDays ?? settings.general.cleanupUnreadDays,
          cleanupReadDays: values.cleanupReadDays ?? settings.general.cleanupReadDays,
          retentionDays: values.retentionDays ?? settings.general.retentionDays,
          defaultViewMode: values.defaultViewMode ?? settings.general.defaultViewMode,
          updateFrequency: values.updateFrequency ?? settings.general.updateFrequency,
          layoutMode: values.layoutMode ?? settings.general.layoutMode,
          sidebarWidth: values.sidebarWidth ?? settings.general.sidebarWidth,
        },
        advanced: {
          ...settings.advanced,
          maxArticlesPerFeed: values.maxArticlesPerFeed ?? settings.advanced.maxArticlesPerFeed,
          doubaoApiKey: values.doubaoApiKey ?? settings.advanced.doubaoApiKey,
          enableNotifications: values.enableNotifications ?? settings.advanced.enableNotifications,
          startMinimized: values.startMinimized ?? settings.advanced.startMinimized,
          keyboardShortcuts: values.keyboardShortcuts ?? settings.advanced.keyboardShortcuts,
          gestures: values.gestures ?? settings.advanced.gestures,
        },
        appearance: {
          ...settings.appearance,
          reading: {
            ...settings.appearance.reading,
            fontFamily: values.fontFamily ?? settings.appearance.reading.fontFamily,
            fontSize: values.fontSize ?? settings.appearance.reading.fontSize,
            lineHeight: values.lineHeight ?? settings.appearance.reading.lineHeight,
            backgroundColor: values.backgroundColor ?? settings.appearance.reading.backgroundColor,
            textColor: values.textColor ?? settings.appearance.reading.textColor,
            titleColor: values.titleColor ?? settings.appearance.reading.titleColor,
            titleFontSize: values.titleFontSize ?? settings.appearance.reading.titleFontSize,
            autoMarkAsRead: values.autoMarkAsRead ?? settings.appearance.reading.autoMarkAsRead,
          }
        },
        layout: { ...settings.layout },
        features: { ...settings.features },
        devOptions: {
          ...settings.devOptions,
          useNewArticleList: values.devOptions?.useNewArticleList ?? settings.devOptions?.useNewArticleList,
        }
      };

      updateSettings(newSettings);
    }, 500),
    [settings, updateSettings]
  );

  // 当表单值变化时，自动保存
  const handleValuesChange = (changedValues: any, allValues: any) => {
    debouncedSaveSettings(allValues);
  };

  const handleClose = () => {
    navigate(-1);
  };

  const handleExportOpml = async () => {
    if (!db) {
      message.error('数据库未初始化，无法导出。');
      return;
    }
    try {
      const feeds = await db.feeds.toArray();
      const opmlDoc = generateOpml(feeds);
      
      if (window.electron && window.electron.exportOPML) {
        await window.electron.exportOPML(opmlDoc);
      } else {
        message.error('导出功能仅在Electron环境中可用。');
      }
    } catch (error: any) {
      message.error(`导出失败: ${error.message}`);
    }
  };

  const handleImportOpml = async () => {
    try {
      setImporting(true);
      message.info('正在导入OPML文件...');

      if (!window.electron || !window.electron.importOPML) {
        message.error('未找到导入功能，请确保在Electron环境中运行。');
        setImporting(false);
        return;
      }
      
      const result = await window.electron.importOPML();

      if (result && !result.success) {
        message.error(result.error || '导入失败，未知错误。');
      }
      triggerArticleListRefresh();
    } catch (error: any) {
      message.error(`导入失败: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleCleanupOrphanedArticles = async () => {
    if (!db) {
      message.error('数据库未初始化，无法清理。');
      return;
    }

    Modal.confirm({
      title: '清理孤儿文章',
      content: '此操作将删除所有没有对应订阅源的文章。这些文章可能是由于删除订阅源时未正确清理导致的。确定要继续吗？',
      okText: '确认清理',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          setCleaningOrphans(true);
          message.loading({ content: '正在清理...', key: 'cleanup' });
          
          const count = await cleanupOrphanedArticles(db);
          
          if (count > 0) {
            message.success({ content: `成功清理了 ${count} 篇孤儿文章！`, key: 'cleanup' });
            triggerArticleListRefresh();
          } else {
            message.info({ content: '没有找到需要清理的孤儿文章。', key: 'cleanup' });
          }
        } catch (error: any) {
          message.error({ content: `清理失败: ${error.message}`, key: 'cleanup' });
        } finally {
          setCleaningOrphans(false);
        }
      }
    });
  };

  const handleManualCleanup = async () => {
    if (!db) {
      message.error('数据库未初始化，无法清理。');
      return;
    }

    Modal.confirm({
      title: '立即清理过期文章',
      content: '此操作将根据您在设置中配置的保留天数，立即清理所有过期的文章。确定要继续吗？',
      okText: '确认清理',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          setCleaningArticles(true);
          message.loading({ content: '正在清理...', key: 'manual-cleanup' });
          
          // 导入清理函数
          const { cleanupArticlesByReadStatus, cleanupOldArticles } = await import('../utils/cleanupHelper');
          let count = 0;
          
          // 获取表单的当前值，而不是依赖于保存的设置
          const readDays = form.getFieldValue('cleanupReadDays') || 0;
          const unreadDays = form.getFieldValue('cleanupUnreadDays') || 0;
          const retentionDays = form.getFieldValue('retentionDays') || 0;
          
          // 记录清理配置
          console.log('[SettingsPage] 执行手动清理，配置:', {
            readDays,
            unreadDays,
            retentionDays
          });
          
          // 使用表单当前值执行清理
          if (readDays > 0 || unreadDays > 0) {
            count = await cleanupArticlesByReadStatus(db, readDays, unreadDays);
          }
          else if (retentionDays > 0) {
            await cleanupOldArticles(db, retentionDays);
            count = 1; // 这里不知道实际清理了多少，但至少清理了一些
          }
          
          if (count > 0 || retentionDays > 0) {
            message.success({ content: `成功清理过期文章！`, key: 'manual-cleanup' });
            triggerArticleListRefresh();
          } else {
            message.info({ content: '没有找到需要清理的过期文章。', key: 'manual-cleanup' });
          }
        } catch (error: any) {
          message.error({ content: `清理失败: ${error.message}`, key: 'manual-cleanup' });
        } finally {
          setCleaningArticles(false);
        }
      }
    });
  };

  const handleTestApiKey = async () => {
    const apiKey = form.getFieldValue('doubaoApiKey');
    if (!apiKey) {
      message.warning('请输入 API Key 后再测试');
      return;
    }
    setTestingApiKey(true);
    message.loading({ content: '正在测试连接...', key: 'api-test' });
    const result = await window.electron.testDoubaoApi(apiKey);
    if (result.success) {
      message.success({ content: '连接成功！API Key 有效。', key: 'api-test' });
    } else {
      message.error({ content: `连接失败: ${result.error}`, key: 'api-test' });
    }
    setTestingApiKey(false);
  };

  // 添加验证设置功能
  const handleVerifySettings = async () => {
    try {
      // 通过electron获取最新的设置
      const storedSettings = await window.electron.getSettings();
      
      if (storedSettings) {
        // 检查关键设置项
        const autoCleanupSaved = storedSettings.general?.autoCleanup;
        const syncOnStartupSaved = storedSettings.general?.syncOnStartup;
        
        message.info(
          <div>
            <div>设置验证结果：</div>
            <div>启动时同步订阅源: {syncOnStartupSaved ? '已启用' : '未启用'}</div>
            <div>自动文章清理: {autoCleanupSaved ? '已启用' : '未启用'}</div>
            <div>已读文章保留天数: {storedSettings.general?.cleanupReadDays}</div>
            <div>未读文章保留天数: {storedSettings.general?.cleanupUnreadDays}</div>
          </div>,
          5
        );
      } else {
        message.warning('未找到已保存的设置');
      }
    } catch (error) {
      console.error('验证设置时出错:', error);
      message.error('验证设置失败');
    }
  };

  if (!isInitialized) {
    return <div>加载设置中...</div>;
  }

  // 定义Tabs的items
  const tabItems: TabsProps['items'] = [
    {
      key: 'reading',
      label: <span><ReadOutlined /> 阅读体验</span>,
      children: (
        <>
          <Card className={styles.settingCard}>
            <div className={styles.formSection}>
              <Title level={5}><FontSizeOutlined /> 显示设置</Title>
              <Form.Item name="fontFamily" label="正文字体">
                <Select>
                  <Option value='system-ui, sans-serif'>系统默认</Option>
                  <Option value='Georgia, serif'>Georgia</Option>
                  <Option value='Times New Roman, serif'>Times New Roman</Option>
                  <Option value='Arial, sans-serif'>Arial</Option>
                  <Option value='Verdana, sans-serif'>Verdana</Option>
                </Select>
              </Form.Item>
              <Form.Item name="fontSize" label="字号">
                <Slider min={12} max={24} />
              </Form.Item>
              <Form.Item name="lineHeight" label="行高">
                <Slider min={1.2} max={2.0} step={0.1} />
              </Form.Item>
            </div>
            
            <Divider style={{ margin: '20px 0' }} />
            
            <div className={styles.formSection}>
              <Title level={5}><EyeOutlined /> 颜色设置</Title>
              <Space>
                <Form.Item name="backgroundColor" label="背景色">
                  <ColorPicker />
                </Form.Item>
                <Form.Item name="textColor" label="正文色">
                  <ColorPicker />
                </Form.Item>
                <Form.Item name="titleColor" label="标题色">
                  <ColorPicker />
                </Form.Item>
              </Space>
            </div>
            
            <Divider style={{ margin: '20px 0' }} />
            
            <div className={styles.formSection}>
              <Title level={5}><SettingOutlined /> 阅读行为</Title>
              <Form.Item name="autoMarkAsRead" valuePropName="checked" tooltip="文章滚动到底部时自动标记为已读。">
                <div>
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  <Text style={{ marginLeft: 8 }}>滚动到底部自动标记为已读</Text>
                </div>
              </Form.Item>
            </div>
          </Card>
        </>
      )
    },
    {
      key: 'content',
      label: <span><DatabaseOutlined /> 内容管理</span>,
      children: (
        <>
          <Card className={styles.settingCard}>
            <div className={styles.formSection}>
              <Title level={5}><SyncOutlined /> 订阅源设置</Title>
              {/* 注释掉有问题的设置项 
              <Form.Item name="syncOnStartup" valuePropName="checked" tooltip="启动应用时自动同步所有订阅源。">
                <div>
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  <Text style={{ marginLeft: 8 }}>启动时同步订阅源</Text>
                </div>
              </Form.Item>
              */}
              <Form.Item name="maxArticlesPerFeed" label="每个订阅源最大文章数" tooltip="设置为0表示无限制。当订阅源的文章数超过此限制时，最旧的文章将被自动删除。">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              
              {/* 移除订阅源列表版本选择开关，因为现在只使用新版组件 */}
            </div>
            
            <Divider style={{ margin: '20px 0' }} />
            
            <div className={styles.formSection}>
              <Title level={5}><DeleteOutlined /> 文章清理</Title>
              {/* 注释掉有问题的设置项 
              <Form.Item name="autoCleanup" valuePropName="checked" tooltip="启用后，系统会根据下面的设置自动清理文章。">
                <div>
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  <Text style={{ marginLeft: 8 }}>启用自动文章清理</Text>
                </div>
              </Form.Item>
              */}
              <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                您可以设置保留天数，然后手动执行清理操作。
              </Text>
              <Form.Item name="cleanupReadDays" label="已读文章保留天数" tooltip="设置为0表示不自动清理。超过此天数的已读文章（除标星/收藏/有笔记外）将被自动删除。">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="cleanupUnreadDays" label="未读文章保留天数" tooltip="设置为0表示不自动清理。超过此天数的未读文章（除标星/收藏/有笔记外）将被自动删除。">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="retentionDays" label="所有文章保留天数" tooltip="设置为0表示不自动清理。超过此天数的文章（除标星/收藏/有笔记外）将被自动删除。">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              
              <Form.Item
                label="立即清理"
                help="根据上方设置的天数立即执行一次文章清理。会保留已加注释、已收藏和稍后读的文章。"
              >
                <Button 
                  icon={<ClearOutlined />} 
                  onClick={handleManualCleanup} 
                  loading={cleaningArticles}
                  danger
                >
                  立即清理过期文章
                </Button>
              </Form.Item>
            </div>
          </Card>
        </>
      )
    },
    {
      key: 'data',
      label: <span><SyncOutlined /> 数据与同步</span>,
      children: (
        <>
          <Card className={styles.settingCard}>
            <div className={styles.formSection}>
              <Title level={5}><ExportOutlined /> 数据导入导出</Title>
              <Form.Item
                label="订阅数据"
                help="将您的所有订阅源导出为 OPML 文件，以便在其他阅读器或本应用中进行备份和恢复。"
              >
                <Space>
                  <Button icon={<ExportOutlined />} onClick={handleExportOpml} loading={importing}>
                    导出为 OPML
                  </Button>
                  <Button icon={<ImportOutlined />} onClick={handleImportOpml} loading={importing}>
                    从 OPML 导入
                  </Button>
                </Space>
              </Form.Item>
            </div>
            
            <Divider style={{ margin: '20px 0' }} />
            
            <div className={styles.formSection}>
              <Title level={5}><ClearOutlined /> 数据维护</Title>
              <Form.Item
                label="数据清理"
                help="清理没有对应订阅源的'孤儿'文章，这些文章可能是由于删除订阅源时未正确清理导致的。"
              >
                <Button 
                  icon={<ClearOutlined />} 
                  onClick={handleCleanupOrphanedArticles} 
                  loading={cleaningOrphans}
                  danger
                >
                  清理孤儿文章
                </Button>
              </Form.Item>
              <Form.Item
                label="验证设置"
                help="检查设置是否已正确保存到系统中。"
              >
                <Button 
                  icon={<QuestionCircleOutlined />} 
                  onClick={handleVerifySettings}
                >
                  验证设置保存状态
                </Button>
              </Form.Item>
            </div>
          </Card>

          {process.env.NODE_ENV === 'development' ? (
            <UpdateManagerDev className={styles.settingCard} />
          ) : (
            <UpdateManager className={styles.settingCard} />
          )}
        </>
      )
    },
    {
      key: 'advanced',
      label: <span><SettingOutlined /> 高级功能</span>,
      children: (
        <>
          <Card className={styles.settingCard}>
            <div className={styles.formSection}>
              <Title level={5}><RobotOutlined /> AI 功能 (实验性)</Title>
              <Form.Item
                label="豆包 API Key"
                name="doubaoApiKey"
                tooltip="前往豆包开放平台申请你的 API Key，以启用 AI 强读功能"
                extra={
                  <Button onClick={handleTestApiKey} style={{ marginTop: 8 }} loading={testingApiKey}>
                    测试连接
                  </Button>
                }
              >
                <Input.Password placeholder="请在这里输入你的 API Key" />
              </Form.Item>
            </div>
          </Card>
          
          {/* 新增开发者选项区块 */}
          <Card className={styles.settingCard} style={{ marginTop: 20 }}>
            <div className={styles.formSection}>
              <Title level={5}><SettingOutlined /> 开发者选项</Title>
              <Text type="secondary">
                以下选项用于测试和开发目的，可能会影响应用的稳定性。
              </Text>
              
              {/* 移除文章列表V2切换选项，因为我们只使用V2版本 */}
            </div>
          </Card>
          
          <Card className={styles.settingCard} style={{ marginTop: 20 }}>
            <div className={styles.formSection}>
              <Title level={5}><FilterOutlined /> 全局过滤规则</Title>
              <Text type="secondary">
                设置全局过滤规则，对所有订阅源的文章进行过滤。被过滤的文章不会在列表中显示，但仍保存在数据库中。
              </Text>
              <div style={{ marginTop: 16 }}>
                <FilterRulesManager />
              </div>
            </div>
          </Card>
        </>
      )
    }
  ];

  return (
    <Layout className={styles.settingsLayout}>
      <Header className={styles.header}>
        <div className={styles.headerTitle}>设置</div>
        <div className={styles.headerControls}>
          <Button type="text" icon={<CloseOutlined />} onClick={handleClose} />
        </div>
      </Header>
      
      <Content className={styles.content}>
        <Form
          form={form}
          layout="vertical"
          onValuesChange={handleValuesChange}
          initialValues={{
            ...settings.general,
            ...settings.advanced,
            ...settings.appearance.reading,
          }}
          className={styles.form}
        >
          <Tabs 
            activeKey={activeTab} 
            onChange={setActiveTab} 
            className={styles.tabs}
            type="card"
            items={tabItems}
          />
          
          <div className={styles.autoSaveNote}>
            <Text type="secondary">
              <QuestionCircleOutlined style={{ marginRight: 8 }} />
              设置会在修改后自动保存
            </Text>
          </div>
        </Form>
      </Content>
    </Layout>
  );
};

export default SettingsPage; 