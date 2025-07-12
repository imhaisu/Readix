import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, message } from 'antd';
import { v4 as uuidv4 } from 'uuid';
import { FeedSource, Topic, TopicFeed } from '../db/database';
import { useDatabase } from '../contexts/DatabaseContext';

interface AddTopicModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (topic: Topic) => void;
  editingTopic?: Topic | null;
}

const AddTopicModal: React.FC<AddTopicModalProps> = ({ 
  visible, 
  onClose, 
  onSuccess,
  editingTopic 
}) => {
  const [form] = Form.useForm();
  const { db } = useDatabase();
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const isEditMode = !!editingTopic;

  // 获取所有订阅源
  useEffect(() => {
    const loadFeeds = async () => {
      if (!db) return;
      
      try {
        // 获取所有订阅源
        const allFeeds = await db.feeds.toArray();
        setFeeds(allFeeds);
        
        // 如果是编辑模式，获取已关联的订阅源
        if (editingTopic?.id) {
          const topicFeeds = await db.topicFeeds.where('topicId').equals(editingTopic.id).toArray();
          const feedIds = topicFeeds.map(tf => tf.feedId);
          setSelectedFeedIds(feedIds);
          
          // 设置表单的初始值
          form.setFieldsValue({
            name: editingTopic.name,
            description: editingTopic.description || '',
            feedIds: feedIds
          });
        }
      } catch (error) {
        console.error('获取订阅源失败:', error);
        message.error('获取订阅源列表失败');
      }
    };
    
    if (visible) {
      loadFeeds();
    }
  }, [db, visible, editingTopic, form]);

  const handleCancel = () => {
    form.resetFields();
    setSelectedFeedIds([]);
    onClose();
  };

  const handleSubmit = async () => {
    if (!db) return;
    
    try {
      const values = await form.validateFields();
      setConfirmLoading(true);
      
      const { name, description, feedIds } = values;
      
      let topicId: string;
      
      // 创建或更新主题
      if (isEditMode && editingTopic?.id) {
        topicId = editingTopic.id;
        await db.topics.update(topicId, {
          name,
          description,
          // 保留原有的创建时间
        });
      } else {
        topicId = uuidv4();
        await db.topics.add({
          id: topicId,
          name,
          description,
          createdAt: Date.now(),
          order: 0 // 可以后续调整排序
        });
      }

      // 处理主题与订阅源的关联
      if (isEditMode && editingTopic?.id) {
        // 如果是编辑模式，先删除原有的关联
        await db.topicFeeds.where('topicId').equals(topicId).delete();
      }
      
      // 添加新的关联
      const topicFeeds = (feedIds as string[]).map((feedId: string) => ({
        id: uuidv4(),
        topicId,
        feedId
      }));
      
      await db.topicFeeds.bulkAdd(topicFeeds);
      
      // 获取刚创建/更新的主题完整信息
      const topic = await db.topics.get(topicId);
      
      if (topic) {
        message.success(isEditMode ? '主题更新成功' : '主题创建成功');
        onSuccess(topic);
      }
    } catch (error) {
      console.error('保存主题失败:', error);
      message.error(isEditMode ? '更新主题失败' : '创建主题失败');
    } finally {
      setConfirmLoading(false);
      handleCancel();
    }
  };

  return (
    <Modal
      title={isEditMode ? "编辑主题" : "创建主题"}
      open={visible}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>取消</Button>,
        <Button key="submit" type="primary" loading={confirmLoading} onClick={handleSubmit}>
          {isEditMode ? '更新' : '创建'}
        </Button>
      ]}
    >
      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item
          name="name"
          label="主题名称"
          rules={[{ required: true, message: '请输入主题名称' }]}
        >
          <Input placeholder="输入主题名称" maxLength={50} />
        </Form.Item>
        
        <Form.Item
          name="description"
          label="主题描述"
        >
          <Input.TextArea placeholder="简要描述该主题" maxLength={200} />
        </Form.Item>
        
        <Form.Item
          name="feedIds"
          label="选择订阅源"
          rules={[{ required: true, message: '请至少选择一个订阅源' }]}
        >
          <Select
            mode="multiple"
            placeholder="选择包含在此主题的订阅源"
            onChange={(values: string[]) => setSelectedFeedIds(values)}
            style={{ width: '100%' }}
          >
            {feeds.map(feed => (
              <Select.Option key={feed.id} value={feed.id!}>
                {feed.title}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AddTopicModal; 