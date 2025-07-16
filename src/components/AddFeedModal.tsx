import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Select, message, Spin, Radio, Tooltip } from 'antd';
import { LinkOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useDatabase, FeedSource, Group } from '../contexts/DatabaseContext';

interface AddFeedModalProps {
  open: boolean;
  onOk: (feed: FeedSource) => void;
  onCancel: () => void;
  groups: Group[];
}

const AddFeedModal: React.FC<AddFeedModalProps> = ({ open, onOk, onCancel, groups }) => {
  const [form] = Form.useForm();
  const { db } = useDatabase();
  const [loading, setLoading] = useState(false);
  const [feedInfo, setFeedInfo] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setFeedInfo(null);
      setLoading(false);
    }
  }, [open, form]);

  const handleFetchInfo = async () => {
    try {
      const url = form.getFieldValue('url');
      if (!url) {
        message.error('请输入订阅源链接');
        return;
      }
      setLoading(true);
      const result = await window.electron.getRssFeedInfo(url);

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

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const info = await window.electron.getRssFeedInfo(values.url);
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

      console.log(`[AddFeedModal] 添加新订阅源: ${values.title}, defaultViewMode=${values.defaultViewMode}, viewMode=${newFeed.viewMode}`);

      if (db) {
        await db.feeds.add(newFeed);
        message.success('订阅源添加成功！');
        onOk(newFeed);
      }
    } catch (error) {
      console.error('Failed to add feed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="添加订阅源"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="添加"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnHidden
    >
      <Spin spinning={loading} tip="正在解析链接...">
        <Form form={form} layout="vertical" name="add_feed_form" initialValues={{ defaultViewMode: 'fulltext' }}>
          <Form.Item
            name="url"
            label="订阅源链接"
            rules={[{ required: true, message: '请输入订阅源链接' }]}
          >
            <Input.Search
              placeholder="https://example.com/feed.xml"
              enterButton="解析"
              onSearch={handleFetchInfo}
            />
          </Form.Item>

          {feedInfo && (
            <>
              <Form.Item
                name="title"
                label="标题"
                rules={[{ required: true, message: '请输入标题' }]}
              >
                <Input placeholder="解析成功后会自动填充" />
              </Form.Item>

              <Form.Item name="groupId" label="添加到分组 (可选)">
                <Select placeholder="不选择则为根目录" allowClear>
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
                  <span>
                    默认阅读模式&nbsp;
                    <Tooltip title="摘要模式只显示Feed提供的简介，全文模式会尝试抓取原文所有内容。此项可在之后编辑。">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </span>
                }
              >
                <Radio.Group>
                  <Radio.Button value="summary">摘要</Radio.Button>
                  <Radio.Button value="fulltext">全文</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </>
          )}
        </Form>
      </Spin>
    </Modal>
  );
};

export default AddFeedModal; 