import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Tabs, Form, InputNumber, Switch, Button, Space, Typography, message, Select, Slider, ColorPicker, Input, Divider, Modal } from 'antd';
import { SaveOutlined, ReloadOutlined, CloseOutlined, ExportOutlined, ImportOutlined } from '@ant-design/icons';
import { useSettings } from '../contexts/SettingsContext';
import { useDatabase } from '../contexts/DatabaseContext';
import styles from './SettingsPage.module.css';
import { Settings, defaultSettings } from '../types/settings';
import { FeedSource } from '../db/database';

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
  const { settings, updateSettings, resetSettings, isInitialized } = useSettings();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { db, triggerArticleListRefresh } = useDatabase();
  const [importing, setImporting] = useState(false);
  const [testingApiKey, setTestingApiKey] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (isInitialized) {
      form.setFieldsValue({
        ...settings.general,
        ...settings.advanced,
        ...settings.appearance.reading,
      });
    }
  }, [settings, isInitialized, form]);

  const onFinish = (values: any) => {
    console.log('[SettingsPage] 表单提交的值:', values);
    
    const newSettings: Settings = {
      ...settings,
      general: {
        ...settings.general,
        syncOnStartup: values.syncOnStartup,
      },
      advanced: {
        ...settings.advanced,
        maxArticlesPerFeed: values.maxArticlesPerFeed,
        doubaoApiKey: values.doubaoApiKey,
      },
      appearance: {
        ...settings.appearance,
        reading: {
            ...settings.appearance.reading,
            fontFamily: values.fontFamily,
            fontSize: values.fontSize,
            lineHeight: values.lineHeight,
            backgroundColor: values.backgroundColor,
            textColor: values.textColor,
            titleColor: values.titleColor,
            titleFontSize: values.titleFontSize,
            autoMarkAsRead: values.autoMarkAsRead,
        },
      },
    };

    updateSettings(newSettings);
    message.success('设置已保存！');
    setIsDirty(false);
  };

  const handleClose = () => {
    if (isDirty) {
      Modal.confirm({
        title: '确认放弃修改？',
        content: '您有未保存的更改，确定要离开吗？',
        okText: '确认离开',
        cancelText: '取消',
        onOk: () => navigate(-1),
      });
    } else {
      navigate(-1);
    }
  };

  const handleResetAll = () => {
    resetSettings();
    form.setFieldsValue({
      ...defaultSettings.general,
      ...defaultSettings.advanced,
      ...defaultSettings.appearance.reading,
    });
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
      triggerArticleListRefresh();
    } catch (error: any) {
      message.error(`导入失败: ${error.message}`);
    } finally {
      setImporting(false);
    }
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
          <Button icon={<CloseOutlined />} onClick={handleClose}>
            关闭
          </Button>
        </div>
      </Header>
      
      <Content className={styles.content}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          onValuesChange={() => setIsDirty(true)}
          initialValues={{
            ...settings.general,
            ...settings.advanced,
            ...settings.appearance.reading,
          }}
          className={styles.form}
        >
          <Tabs defaultActiveKey="app" className={styles.tabs}>
            <Tabs.TabPane tab="应用" key="app">
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

              <Divider />

              <div className={styles.formSection}>
                <Title level={5}>AI 功能 (实验性)</Title>
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
            </Tabs.TabPane>
            <Tabs.TabPane tab="阅读" key="reading">
              <div className={styles.formSection}>
                <Title level={5}>字体</Title>
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
              <div className={styles.formSection}>
                <Title level={5}>颜色</Title>
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
              <div className={styles.formSection}>
                  <Title level={5}>其他</Title>
                  <Form.Item name="autoMarkAsRead" valuePropName="checked" tooltip="文章滚动到底部时自动标记为已读。">
                      <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                      <Text style={{ marginLeft: 8 }}>滚动到底部自动标记为已读</Text>
                  </Form.Item>
              </div>
            </Tabs.TabPane>
          </Tabs>
          
          <Divider />

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              保存全部设置
            </Button>
          </Form.Item>
        </Form>
      </Content>
    </Layout>
  );
};

export default SettingsPage; 