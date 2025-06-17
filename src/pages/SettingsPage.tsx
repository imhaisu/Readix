import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Tabs, Form, InputNumber, Switch, Button, Space, Typography, message, Select, Slider, ColorPicker, Input, Divider } from 'antd';
import { SaveOutlined, ReloadOutlined, CloseOutlined, ExportOutlined, ImportOutlined } from '@ant-design/icons';
import { useSettings } from '../contexts/SettingsContext';
import { useDatabase } from '../contexts/DatabaseContext';
import styles from './SettingsPage.module.css';
import { Settings } from '../types/settings';
import { FeedSource } from '../contexts/DatabaseContext';

const { Header, Content } = Layout;
const { TabPane } = Tabs;
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
  const { settings, updateGeneralSettings, updateReadingSettings, updateAdvancedSettings, resetSettings, isInitialized } = useSettings();
  const navigate = useNavigate();
  const [appForm] = Form.useForm();
  const [readingForm] = Form.useForm();
  const { db, triggerRefresh } = useDatabase();
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (isInitialized) {
      appForm.setFieldsValue({ ...settings.general, ...settings.advanced });
      readingForm.setFieldsValue(settings.reading);
    }
  }, [settings, isInitialized, appForm, readingForm]);

  const handleAppSubmit = (values: any) => {
    const generalSettings = {
      syncOnStartup: values.syncOnStartup,
    };
    const advancedSettings = {
      maxArticlesPerFeed: values.maxArticlesPerFeed,
    };
    
    updateGeneralSettings(generalSettings);
    updateAdvancedSettings(advancedSettings);
    message.success('应用设置已保存！');
  };

  const handleReadingSubmit = (values: Settings['reading']) => {
    updateReadingSettings(values);
    message.success('阅读设置已保存！');
  };

  const handleResetAll = () => {
    resetSettings();
    appForm.setFieldsValue({ ...settings.general, ...settings.advanced });
    readingForm.setFieldsValue(settings.reading);
    message.success('所有设置已重置为默认值。');
  };

  const handleExportOpml = async () => {
    if (!db) {
      message.error('数据库未初始化，无法导出。');
      return;
    }
    try {
      const feeds = await db.feeds.toArray();
      const opmlDoc = generateOpml(feeds);
      
      if (window.electron && window.electron.exportOpml) {
        await window.electron.exportOpml(opmlDoc);
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

      if (!window.electron || !window.electron.importOpml) {
        message.error('未找到导入功能，请确保在Electron环境中运行。');
        setImporting(false);
        return;
      }
      
      const result = await window.electron.importOpml();

      if (result && !result.success) {
        message.error(result.error || '导入失败，未知错误。');
      }
      // Success message is handled by main process after feeds are added.
      triggerRefresh();
    } catch (error: any) {
      message.error(`导入失败: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  if (!isInitialized) {
    return <div>加载设置中...</div>;
  }

  return (
    <Layout className={styles.settingsLayout}>
      <Header className={styles.header}>
        <div className={styles.headerTitle}>设置</div>
        <div className={styles.headerControls}>
          <Button icon={<ReloadOutlined />} onClick={handleResetAll} danger>
            重置
          </Button>
          <Button icon={<CloseOutlined />} onClick={() => navigate(-1)}>
            关闭
          </Button>
        </div>
      </Header>
      
      <Content className={styles.content}>
        <Tabs defaultActiveKey="app" className={styles.tabs}>
          <TabPane tab="应用" key="app">
            <Form
              form={appForm}
              layout="vertical"
              initialValues={{ ...settings.general, ...settings.advanced }}
              onFinish={handleAppSubmit}
              className={styles.form}
            >
              <div className={styles.formSection}>
                <Title level={5}>行为</Title>
                <Form.Item name="syncOnStartup" valuePropName="checked" tooltip="启动应用时自动同步所有订阅源。">
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  <Text style={{ marginLeft: 8 }}>启动时同步订阅源</Text>
                </Form.Item>
              </div>

              <div className={styles.formSection}>
                <Title level={5}>性能</Title>
                <Form.Item name="maxArticlesPerFeed" label="每个订阅源最大文章数" tooltip="设置为0表示无限制。当订阅源的文章数超过此限制时，最旧的文章将被自动删除。">
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </div>

              <div className={styles.formSection}>
                <Title level={5}>数据管理</Title>
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
              
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                  保存应用设置
                </Button>
              </Form.Item>
            </Form>
          </TabPane>
          <TabPane tab="阅读" key="reading">
            <Form
              form={readingForm}
              layout="vertical"
              initialValues={settings.reading}
              onFinish={handleReadingSubmit}
              className={styles.form}
            >
              <div className={styles.formSection}>
                <Title level={5}>字体</Title>
                <Form.Item name="fontFamily" label="正文字体">
                  <Select>
                    <Option value="system-ui, sans-serif">系统默认</Option>
                    <Option value="Georgia, serif">Georgia</Option>
                    <Option value="Times New Roman, serif">Times New Roman</Option>
                    <Option value="Arial, sans-serif">Arial</Option>
                    <Option value="Verdana, sans-serif">Verdana</Option>
                  </Select>
                </Form.Item>
                <Form.Item name="fontSize" label="字号">
                  <Slider min={12} max={24} />
                </Form.Item>
                <Form.Item name="lineHeight" label="行高">
                  <Slider min={1.2} max={2.0} step={0.1} />
                </Form.Item>
              </div>
              <div className={styles.formSection}>
                <Title level={5}>颜色</Title>
                <Form.Item name="textColor" label="文本颜色">
                  <ColorPicker />
                </Form.Item>
                <Form.Item name="backgroundColor" label="背景颜色">
                  <ColorPicker />
                </Form.Item>
              </div>
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                  保存阅读设置
                </Button>
              </Form.Item>
            </Form>
          </TabPane>
        </Tabs>
      </Content>
    </Layout>
  );
};

export default SettingsPage; 