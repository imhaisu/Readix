import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Tabs, Form, InputNumber, Switch, Button, Space, Typography, message, Select, Slider, ColorPicker } from 'antd';
import { SaveOutlined, ReloadOutlined, CloseOutlined, ExportOutlined, ImportOutlined } from '@ant-design/icons';
import { useSettings } from '../contexts/SettingsContext';
import { useDatabase } from '../contexts/DatabaseContext';
import styles from './SettingsPage.module.css';
import { Settings } from '../types/settings';

const { Header, Content } = Layout;
const { TabPane } = Tabs;
const { Title, Text } = Typography;
const { Option } = Select;

const SettingsPage: React.FC = () => {
  const { settings, updateGeneralSettings, updateReadingSettings, updateAdvancedSettings, resetSettings } = useSettings();
  const navigate = useNavigate();
  const [appForm] = Form.useForm();
  const [readingForm] = Form.useForm();
  const { db, triggerRefresh } = useDatabase();

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
      message.error('数据库未准备好，请稍后再试。');
      return;
    }
  
    try {
      const feeds = await db.feeds.toArray();
      const groups = await db.groups.toArray();
      
      let opmlDoc = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Readix Subscriptions</title>\n  </head>\n  <body>\n`;
  
      const groupedFeeds = new Set();
      for (const group of groups) {
        opmlDoc += `    <outline text="${group.name}" title="${group.name}">\n`;
        const feedsInGroup = feeds.filter(f => f.groupId === group.id);
        feedsInGroup.forEach(feed => {
          opmlDoc += `      <outline type="rss" text="${feed.title}" title="${feed.title}" xmlUrl="${feed.url}" />\n`;
          if (feed.id) groupedFeeds.add(feed.id);
        });
        opmlDoc += `    </outline>\n`;
      }
  
      const ungroupedFeeds = feeds.filter(f => !f.groupId || !groupedFeeds.has(f.id!));
      ungroupedFeeds.forEach(feed => {
        opmlDoc += `    <outline type="rss" text="${feed.title}" title="${feed.title}" xmlUrl="${feed.url}" />\n`;
      });
  
      opmlDoc += `  </body>\n</opml>`;
  
      if (window.electronAPI && window.electronAPI.exportOpml) {
        const result = await window.electronAPI.exportOpml(opmlDoc);
        if (result.success) {
          message.success(`订阅已成功导出到: ${result.path}`);
        } else if (!result.canceled) {
          message.error(`导出失败: ${result.error}`);
        }
      } else {
        message.error('未找到导出功能，请确保您在Electron环境内。');
      }
    } catch (error) {
      console.error('生成OPML文件时出错:', error);
      message.error('生成OPML文件时出错。');
    }
  };
  
  const handleImportOpml = async () => {
    if (!db) {
      message.error('数据库未准备好，请稍后再试。');
      return;
    }
  
    if (!window.electronAPI || !window.electronAPI.importOpml) {
      message.error('未找到导入功能，请确保您在Electron环境内。');
      return;
    }
  
    const result = await window.electronAPI.importOpml();
  
    if (!result.success || result.canceled) {
      if (result.error && !result.canceled) {
        message.error(`导入失败: ${result.error}`);
      }
      return;
    }
  
    const opmlContent = result.content;
    if (!opmlContent) {
      message.error('未能读取文件内容。');
      return;
    }
  
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(opmlContent, 'text/xml');
      const body = xmlDoc.querySelector('body');
      if (!body) {
        message.error('无效的 OPML 文件：缺少 <body> 标签。');
        return;
      }
  
      const existingFeeds = await db.feeds.toArray();
      const existingFeedUrls = new Set(existingFeeds.map(f => f.url));
      let newFeedsCount = 0;
      let newGroupsCount = 0;
  
      const processOutline = async (outlineElement: Element, parentGroupId?: number) => {
        const xmlUrl = outlineElement.getAttribute('xmlUrl');
        const text = outlineElement.getAttribute('text') || outlineElement.getAttribute('title');
        const children = Array.from(outlineElement.children).filter(
          (c) => c.tagName.toLowerCase() === 'outline'
        );

        // It's a feed if it has an xmlUrl
        if (xmlUrl) {
          if (!existingFeedUrls.has(xmlUrl)) {
            await db.feeds.add({
              url: xmlUrl,
              title: text || '无标题',
              groupId: parentGroupId,
              updateFrequency: 30,
              lastUpdated: new Date(0),
              viewMode: 'full',
              unreadCount: 0,
              active: true,
              bionicReading: false,
            });
            existingFeedUrls.add(xmlUrl);
            newFeedsCount++;
          }
        } 
        // It's a group if it has a title and child outline elements
        else if (text && children.length > 0) {
          let group = await db.groups.where({ name: text }).first();
          let currentGroupId: number;
          if (!group) {
            const order = (await db.groups.count()) + 1;
            const newGroupId = await db.groups.add({
              name: text,
              collapsed: false,
              order: order,
            });
            currentGroupId = newGroupId as number;
            newGroupsCount++;
          } else {
            currentGroupId = group.id!;
          }

          for (const child of children) {
            await processOutline(child, currentGroupId);
          }
        } 
        // It could also be a container for ungrouped feeds
        else {
          for (const child of children) {
            await processOutline(child, parentGroupId); // Pass the parent's group id
          }
        }
      };
  
      for (const outline of Array.from(body.children)) {
        if (outline.tagName.toLowerCase() === 'outline') {
          await processOutline(outline);
        }
      }
  
      let successMessage = '';
      if (newFeedsCount > 0) successMessage += `成功导入 ${newFeedsCount} 个新订阅源。`;
      if (newGroupsCount > 0) successMessage += ` 创建了 ${newGroupsCount} 个新分组。`;
  
      if (successMessage) {
        message.success(successMessage.trim());
        triggerRefresh();
      } else {
        message.info('没有发现新的订阅源或分组可以导入。');
      }
    } catch (error) {
      console.error('解析OPML文件时出错:', error);
      message.error('解析OPML文件时出错，文件格式可能不正确。');
    }
  };

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
                    <Button icon={<ExportOutlined />} onClick={handleExportOpml}>
                      导出为 OPML
                    </Button>
                    <Button icon={<ImportOutlined />} onClick={handleImportOpml}>
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