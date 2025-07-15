import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, message, Tabs, Space } from 'antd';
import { v4 as uuidv4 } from 'uuid';
import { FeedSource, Topic, TopicFeed, TopicFilterRule } from '../db/database';
import { useDatabase } from '../contexts/DatabaseContext';
import TopicFilterRulesEditor from './TopicFilterRulesEditor';
import { topicIcons } from '../utils/topicIconUtils';

interface AddTopicModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (topic: Topic) => void;
  editingTopic?: Topic | null;
  initialActiveTab?: string;
}

const AddTopicModal: React.FC<AddTopicModalProps> = ({ 
  visible, 
  onClose, 
  onSuccess,
  editingTopic,
  initialActiveTab = '1'
}) => {
  const [form] = Form.useForm();
  const { db } = useDatabase();
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
  const [filterRules, setFilterRules] = useState<TopicFilterRule[]>([]);
  const [selectedIcon, setSelectedIcon] = useState<string>('tag');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(initialActiveTab);

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
          
          // 加载过滤规则
          setFilterRules(editingTopic.filterRules || []);
          
          // 设置选择的图标
          if (editingTopic.iconName) {
            setSelectedIcon(editingTopic.iconName);
          }
          
          // 设置表单的初始值
          form.setFieldsValue({
            name: editingTopic.name,
            description: editingTopic.description || '',
            feedIds: feedIds,
            iconName: editingTopic.iconName || 'tag'
          });
        } else {
          // 新建模式，重置过滤规则
          setFilterRules([]);
          setSelectedIcon('tag');
          form.setFieldsValue({
            iconName: 'tag'
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
    setFilterRules([]);
    setActiveTab('1');
    setSelectedIcon('tag');
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
        console.log('更新主题:', {
          id: topicId,
          name,
          description,
          filterRules,
          iconName: selectedIcon,
          feedIds
        });
        await db.topics.update(topicId, {
          name,
          description,
          filterRules, // 保存过滤规则
          iconName: selectedIcon, // 保存选择的图标
          // 保留原有的创建时间
        });
      } else {
        topicId = uuidv4();
        console.log('创建主题:', {
          id: topicId,
          name,
          description,
          filterRules,
          iconName: selectedIcon,
          feedIds
        });
        await db.topics.add({
          id: topicId,
          name,
          description,
          filterRules, // 保存过滤规则
          iconName: selectedIcon, // 保存选择的图标
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
      const topicFeeds = feedIds.map((feedId: string) => ({
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

  // 处理规则变更
  const handleFilterRulesChange = (updatedRules: TopicFilterRule[]) => {
    console.log('主题过滤规则更新:', updatedRules);
    setFilterRules(updatedRules);
  };

  const handleIconSelect = (iconName: string) => {
    setSelectedIcon(iconName);
    form.setFieldsValue({ iconName });
  };

  // 渲染基本信息tab
  const renderBasicInfo = () => (
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
        name="iconName"
        label="主题图标"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {topicIcons.map(icon => (
              <div key={icon.name}>
                <Button
                  type={selectedIcon === icon.name ? "primary" : "default"}
                  onClick={() => handleIconSelect(icon.name)}
                  style={{ 
                    width: 80, 
                    height: 80,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 0'
                  }}
                >
                  <icon.component style={{ fontSize: 24, marginBottom: 4 }} />
                  <span style={{ fontSize: 12 }}>{icon.label}</span>
                </Button>
              </div>
            ))}
          </div>
        </div>
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
  );

  // 渲染过滤规则tab
  const renderFilterRules = () => (
    <TopicFilterRulesEditor 
      rules={filterRules}
      onChange={handleFilterRulesChange}
      onIconChange={(iconName) => setSelectedIcon(iconName)}
    />
  );

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
      width={700}
      styles={{
        body: { padding: '16px 24px', maxHeight: '70vh', overflowY: 'auto' }
      }}
    >
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab} 
        items={[
          {
            key: '1',
            label: '基本信息',
            children: renderBasicInfo()
          },
          {
            key: '2',
            label: '阅读偏好',
            children: renderFilterRules()
          }
        ]} 
        style={{ marginBottom: 0 }}
      />
    </Modal>
  );
};

export default AddTopicModal; 