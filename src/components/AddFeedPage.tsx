import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Select, message, Spin, Radio, Tooltip, Card } from 'antd';
import { LinkOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useDatabase } from '../contexts/DatabaseContext';
import { FeedSource, Group } from '../db/database';
import styles from './AddFeedPage.module.css';

interface AddFeedPageProps {
  groups: Group[];
  onSuccess: (feed: FeedSource) => void;
}

const AddFeedPage: React.FC<AddFeedPageProps> = ({ groups, onSuccess }) => {
  const [form] = Form.useForm();
  const { db, triggerFeedCountRefresh, triggerArticleListRefresh } = useDatabase();
  const [loading, setLoading] = useState(false);
  const [feedInfo, setFeedInfo] = useState<{ title: string; url: string } | null>(null);

  const handleFetchInfo = async () => {
    try {
      const url = form.getFieldValue('url');
      if (!url) {
        message.error('请输入订阅源链接');
        return;
      }
      setLoading(true);
      const result = await window.electron.ipcRenderer.invoke('get-rss-feed-info', url);

      if (result.success && result.data) {
        message.success('解析成功！');
        setFeedInfo({ title: result.data.title, url: result.data.link || url });
        form.setFieldsValue({
          title: result.data.title,
        });
      } else {
        message.error(result.error || '无法解析此链接，请确认它是一个有效的 RSS/Atom/JSON Feed');
        setFeedInfo(null);
      }
    } catch (error: any) {
      message.error(`解析失败: ${error.message}`);
      setFeedInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const info = await window.electron.ipcRenderer.invoke('get-rss-feed-info', values.url);
      if (!info.success || !info.data) {
          message.error('无法添加，请先确认链接可以被成功解析。');
          setLoading(false);
          return;
      }

      const newFeed: FeedSource = {
        id: crypto.randomUUID(),
        title: values.title,
        url: values.url,
        iconUrl: info.data.icon,
        groupId: values.groupId || undefined,
        updateFrequency: 3600,
        lastUpdated: new Date(0),
        unreadCount: 0,
        active: true,
        bionicReading: false,
        viewMode: values.defaultViewMode === 'fulltext' ? 'full' : 'original',
        defaultViewMode: values.defaultViewMode,
      };

      console.log(`[AddFeedPage] 添加新订阅源: ${values.title}, defaultViewMode=${values.defaultViewMode}, viewMode=${newFeed.viewMode}`);

      if (db) {
        await db.feeds.add(newFeed);
        // 不再立即触发数据刷新，由父组件决定何时刷新
        // triggerFeedCountRefresh();
        // triggerArticleListRefresh();
        
        message.success('订阅源添加成功！');
        form.resetFields();
        setFeedInfo(null);
        onSuccess(newFeed);
      }
    } catch (error) {
      console.error('Failed to add feed:', error);
      message.error('添加订阅源失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.addFeedPage}>
      <Card variant="borderless" className={styles.addFeedCard}>
        <Spin spinning={loading} tip="正在解析链接...">
          <Form form={form} layout="vertical" name="add_feed_form" initialValues={{ defaultViewMode: 'fulltext' }} size="small">
            <Form.Item
              name="url"
              label="订阅源链接"
              rules={[{ required: true, message: '请输入订阅源链接' }]}
            >
              <div className={styles.inputWrapper}>
                <Input.Search
                  placeholder="https://example.com/feed.xml"
                  enterButton="解析"
                  size="small"
                  onSearch={handleFetchInfo}
                />
              </div>
            </Form.Item>

            {feedInfo && (
              <>
                <Form.Item
                  name="title"
                  label="标题"
                  rules={[{ required: true, message: '请输入标题' }]}
                >
                  <Input size="small" placeholder="解析成功后会自动填充" />
                </Form.Item>

                <Form.Item name="groupId" label="添加到分组 (可选)">
                  <Select placeholder="不选择则为根目录" allowClear size="small">
                    {groups.map((g) => (
                      <Select.Option key={g.id} value={g.id!}>
                        {g.name}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item 
                  name="defaultViewMode" 
                  label={
                    <span className={styles.formLabel}>
                      默认阅读模式&nbsp;
                      <Tooltip title="摘要模式只显示Feed提供的简介，全文模式会尝试抓取原文所有内容。此项可在之后编辑。">
                        <InfoCircleOutlined />
                      </Tooltip>
                    </span>
                  }
                >
                  <Radio.Group size="small">
                    <Radio.Button value="summary">摘要</Radio.Button>
                    <Radio.Button value="fulltext">全文</Radio.Button>
                  </Radio.Group>
                </Form.Item>

                <Form.Item>
                  <div className={styles.buttonContainer}>
                    <Button type="primary" onClick={handleSubmit} size="small">
                      添加
                    </Button>
                  </div>
                </Form.Item>
              </>
            )}
          </Form>
        </Spin>
      </Card>
    </div>
  );
};

export default AddFeedPage; 