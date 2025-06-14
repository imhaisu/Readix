import React, { useState } from 'react';
import { Modal, Form, Input, Button, Select, message, Avatar } from 'antd';
import { LinkOutlined, GlobalOutlined } from '@ant-design/icons';
import { useDatabase, FeedSource, Group } from '../contexts/DatabaseContext';
import { getFeedInfo } from '../utils/rssParser';
import { generateUniqueId } from '../utils/helpers';

const { Option } = Select;

interface AddFeedModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: (feed: FeedSource) => void;
  groups: Group[];
}

// 辅助函数：确保URL有协议头
const ensureProtocol = (url: string): string => {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
};

const AddFeedModal: React.FC<AddFeedModalProps> = ({ 
  visible, 
  onCancel, 
  onSuccess,
  groups
}) => {
  const { db } = useDatabase();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [previewIconUrl, setPreviewIconUrl] = useState<string>('');

  // 获取订阅源信息
  const handleGetFeedInfo = async () => {
    let url = form.getFieldValue('url');
    if (!url) {
      message.error('请输入RSS订阅源URL');
      return;
    }
    url = ensureProtocol(url); // 确保有协议头
    form.setFieldsValue({ url }); // 更新表单中的URL，以防用户输入的是无协议头的

    setFetchingInfo(true);
    try {
      const feedInfo = await getFeedInfo(url); // 使用处理过的URL
      if (feedInfo && feedInfo.title) { // 检查 feedInfo 是否为 null 以及是否有 title
        form.setFieldsValue({ 
          title: feedInfo.title,
          iconUrl: feedInfo.iconUrl || '' // 自动填充 iconUrl，如果不存在则为空字符串
        });
        setPreviewIconUrl(feedInfo.iconUrl || '');
        message.success('获取订阅源信息成功');
      } else {
        // 如果 feedInfo 为 null 或者没有 title，也视为获取失败
        message.error('获取订阅源信息失败，请检查URL或该源不包含标题');
      }
    } catch (error) {
      message.error('获取订阅源信息失败，请检查URL');
    } finally {
      setFetchingInfo(false);
    }
  };

  // 处理图标URL输入变化
  const handleIconUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setFieldsValue({ iconUrl: value });
    setPreviewIconUrl(value);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (!db) {
        message.error('数据库未初始化');
        setLoading(false); 
        return;
      }
      
      const finalUrl = ensureProtocol(values.url); 

      // 检查订阅源是否已存在
      const existingFeed = await db.feeds.where('url').equals(finalUrl).first();
      if (existingFeed) {
        message.error('该订阅源已存在！');
        setLoading(false);
        return;
      }

      // 构建订阅源对象
      const feed: FeedSource = {
        id: generateUniqueId(),
        title: values.title,
        url: finalUrl, // 使用处理过的URL
        iconUrl: values.iconUrl || undefined,
        groupId: values.groupId || undefined,
        updateFrequency: values.updateFrequency || 30,
        lastUpdated: new Date(),
        viewMode: values.viewMode || 'full',
        unreadCount: 0,
        active: true,
        bionicReading: false
      };

      // 添加到数据库
      await db.feeds.add(feed);
      
      message.success('添加订阅源成功');
      onSuccess(feed);
      form.resetFields();
      setPreviewIconUrl('');
    } catch (error) {
      console.error('添加订阅源失败:', error);
      message.error('添加订阅源失败');
    } finally {
      setLoading(false);
    }
  };

  // 处理模态框关闭
  const handleCancel = () => {
    form.resetFields();
    setPreviewIconUrl('');
    onCancel();
  };

  return (
    <Modal
      title="添加RSS订阅源"
      open={visible}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          取消
        </Button>,
        <Button 
          key="submit" 
          type="primary" 
          loading={loading}
          onClick={handleSubmit}
        >
          添加
        </Button>
      ]}
    >
      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item
          label="RSS订阅源URL"
          name="url"
          rules={[{ required: true, message: '请输入RSS订阅源URL' }]}
        >
          <Input 
            prefix={<LinkOutlined />} 
            placeholder="https://example.com/feed.xml"
            addonAfter={
              <Button 
                type="link" 
                size="small" 
                onClick={handleGetFeedInfo}
                loading={fetchingInfo}
              >
                获取信息
              </Button>
            }
          />
        </Form.Item>

        <Form.Item
          label="标题"
          name="title"
          rules={[{ required: true, message: '请输入订阅源标题' }]}
        >
          <Input placeholder="订阅源标题" />
        </Form.Item>

        <Form.Item
          label="分组"
          name="groupId"
        >
          <Select placeholder="选择分组（可选）" allowClear>
            {groups.map(group => (
              <Option key={group.id} value={group.id}>{group.name}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item label="图标预览">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Avatar 
              src={previewIconUrl} 
              size={32} 
              icon={<GlobalOutlined />}
              style={{ 
                border: '1px solid #f0f0f0',
                backgroundColor: '#fafafa'
              }}
            />
            <span style={{ color: '#666', fontSize: '14px' }}>
              {previewIconUrl ? '图标预览' : '暂无图标'}
            </span>
          </div>
        </Form.Item>

        <Form.Item
          label="图标URL"
          name="iconUrl"
        >
          <Input 
            placeholder="图标URL（可选，点击'获取信息'自动填充）" 
            onChange={handleIconUrlChange}
          />
        </Form.Item>

        <Form.Item
          label="更新频率（分钟）"
          name="updateFrequency"
          initialValue={30}
        >
          <Select>
            <Option value={15}>15分钟</Option>
            <Option value={30}>30分钟</Option>
            <Option value={60}>1小时</Option>
            <Option value={120}>2小时</Option>
            <Option value={240}>4小时</Option>
            <Option value={720}>12小时</Option>
            <Option value={1440}>24小时</Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="默认视图模式"
          name="viewMode"
          initialValue="full"
        >
          <Select>
            <Option value="full">全文模式</Option>
            <Option value="web">网页模式</Option>
            <Option value="original">原始模式</Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AddFeedModal; 