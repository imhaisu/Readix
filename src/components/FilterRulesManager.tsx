import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Popconfirm, message, Tabs, Spin, Space, Tooltip, Radio } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, FileTextOutlined } from '@ant-design/icons';
import { useFilterRules } from '../contexts/FilterRulesContext';
import { useDatabase } from '../contexts/DatabaseContext';
import { FilterRule, FeedSource } from '../db/database';
import { createFilterRule } from '../utils/filterUtils';
import { applyAllRulesToAllArticles } from '../utils/filterApplier';
import { v4 as uuidv4 } from 'uuid';
import styles from './FilterRulesManager.module.css';
import FilterLogViewer from './FilterLogViewer';

const { Option } = Select;

interface FilterRulesManagerProps {
  feedId?: string;
  feedTitle?: string;
}

const FilterRulesManager: React.FC<FilterRulesManagerProps> = ({ feedId, feedTitle }) => {
  const { db, isInitialized, triggerFeedCountRefresh, triggerArticleListRefresh } = useDatabase();
  const { globalFilterRules, addGlobalFilterRule, updateGlobalFilterRule, deleteGlobalFilterRule, isLoading: isGlobalRulesLoading } = useFilterRules();
  
  const [form] = Form.useForm();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(feedId ? 'feed' : 'global');
  const [feedRules, setFeedRules] = useState<FilterRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);

  // 加载订阅源的过滤规则
  useEffect(() => {
    const loadFeedRules = async () => {
      if (!db || !isInitialized || !feedId) {
        setFeedRules([]);
        return;
      }

      setIsLoading(true);
      try {
        const feed = await db.feeds.get(feedId);
        if (feed && feed.filterRules) {
          setFeedRules(feed.filterRules);
        } else {
          setFeedRules([]);
        }
      } catch (error) {
        setFeedRules([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadFeedRules();
  }, [db, isInitialized, feedId]);

  // 保存订阅源的过滤规则
  const saveFeedRules = async (rules: FilterRule[]) => {
    if (!db || !isInitialized || !feedId) {
      return;
    }

    setIsLoading(true);
    try {
      // 确保rules是数组且每个元素都有所需的字段
      const validatedRules = Array.isArray(rules) ? rules.map(rule => {
        // 确保每个规则都有必要的字段
        if (!rule.id) {
          rule.id = uuidv4();
        }
        return {
          id: rule.id,
          scope: rule.scope || 'title',
          type: rule.type || 'contains',
          keywords: rule.keywords || '',
          isActive: rule.isActive !== false,  // 默认为true
          keywordLogic: rule.keywordLogic || 'OR',
        };
      }) : [];
      
      // 保存到数据库
      await db.feeds.update(feedId, { filterRules: validatedRules });
      
      // 验证是否保存成功
      const updatedFeed = await db.feeds.get(feedId);
      
      setFeedRules(validatedRules);
      
      // 应用规则到所有文章，而不仅仅是当前订阅源的文章
      const updatedCount = await applyAllRulesToAllArticles(db);
      
      // 触发刷新
      triggerFeedCountRefresh();
      triggerArticleListRefresh();
    } catch (error) {
      // 保存失败，无需处理
    } finally {
      setIsLoading(false);
    }
  };

  // 添加订阅源过滤规则
  const addFeedRule = (rule: Omit<FilterRule, 'id'>) => {
    const newRule = createFilterRule(rule.scope, rule.type, rule.keywords, rule.isActive, rule.keywordLogic);
    const updatedRules = [...feedRules, newRule];
    saveFeedRules(updatedRules);
  };

  // 更新订阅源过滤规则
  const updateFeedRule = (id: string, changes: Partial<Omit<FilterRule, 'id'>>) => {
    const updatedRules = feedRules.map(rule => 
      rule.id === id ? { ...rule, ...changes } : rule
    );
    saveFeedRules(updatedRules);
  };

  // 删除订阅源过滤规则
  const deleteFeedRule = (id: string) => {
    const updatedRules = feedRules.filter(rule => rule.id !== id);
    saveFeedRules(updatedRules);
  };

  // 处理表单提交
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const ruleData = {
        scope: values.scope,
        type: values.type,
        keywords: values.keywords,
        isActive: values.isActive !== false, // 默认为true
        keywordLogic: values.keywordLogic || 'OR',
      };

      if (editingRuleId) {
        if (activeTab === 'global') {
          updateGlobalFilterRule(editingRuleId, ruleData);
        } else {
          updateFeedRule(editingRuleId, ruleData);
        }
      } else {
        if (activeTab === 'global') {
          addGlobalFilterRule(ruleData);
        } else {
          addFeedRule(ruleData);
        }
      }

      setIsModalVisible(false);
      form.resetFields();
      setEditingRuleId(null);
    } catch (error) {
      // 表单验证失败，无需处理
    }
  };

  // 编辑规则
  const editRule = (rule: FilterRule) => {
    setEditingRuleId(rule.id);
    form.setFieldsValue({
      scope: rule.scope,
      type: rule.type,
      keywords: rule.keywords,
      isActive: rule.isActive,
      keywordLogic: rule.keywordLogic || 'OR',
    });
    setIsModalVisible(true);
  };

  // 创建表格列定义
  const columns = [
    {
      title: '范围',
      dataIndex: 'scope',
      render: (scope: string) => {
        switch (scope) {
          case 'title': return '标题';
          case 'content': return '内容';
          case 'author': return '作者';
          default: return scope;
        }
      }
    },
    {
      title: '类型',
      dataIndex: 'type',
      render: (type: string) => {
        switch (type) {
          case 'contains': return '只显示';
          case 'not_contains': return '隐藏';
          default: return type;
        }
      }
    },
    {
      title: '关键词',
      dataIndex: 'keywords',
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      render: (isActive: boolean, record: FilterRule) => (
        <Switch 
          checked={isActive} 
          onChange={(checked) => {
            if (activeTab === 'global') {
              updateGlobalFilterRule(record.id, { isActive: checked });
            } else {
              updateFeedRule(record.id, { isActive: checked });
            }
          }}
        />
      )
    },
    {
      title: '操作',
      render: (_: any, record: FilterRule) => (
        <>
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => editRule(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这条规则吗？"
            onConfirm={() => {
              if (activeTab === 'global') {
                deleteGlobalFilterRule(record.id);
              } else {
                deleteFeedRule(record.id);
              }
            }}
          >
            <Button 
              type="text" 
              danger 
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </>
      )
    }
  ];

  const renderFeedRulesTab = () => (
    <div className={styles.tabContent}>
      <div className={styles.header}>
        <h3>订阅源阅读偏好</h3>
        <Space>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => {
              setEditingRuleId(null);
              form.resetFields();
              form.setFieldsValue({
                scope: 'title',
                type: 'contains',
                keywords: '',
                isActive: false,
                keywordLogic: 'OR',
              });
              setIsModalVisible(true);
            }}
          >
            添加偏好
          </Button>
        </Space>
      </div>
      <Spin spinning={isLoading}>
        <Table 
          dataSource={feedRules} 
          columns={columns}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: '没有阅读偏好' }}
        />
      </Spin>
    </div>
  );

  const renderGlobalRulesTab = () => (
    <div className={styles.tabContent}>
      <div className={styles.header}>
        <h3>全局阅读偏好</h3>
        <Space>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => {
              setEditingRuleId(null);
              form.resetFields();
              form.setFieldsValue({
                scope: 'title',
                type: 'contains',
                keywords: '',
                isActive: false,
                keywordLogic: 'OR',
              });
              setIsModalVisible(true);
            }}
          >
            添加偏好
          </Button>
        </Space>
      </div>
      <Spin spinning={isGlobalRulesLoading}>
        <Table 
          dataSource={globalFilterRules} 
          columns={columns}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: '没有全局阅读偏好' }}
        />
      </Spin>
    </div>
  );

  const tabItems = [];

  if (feedId) {
    tabItems.push({
      key: 'feed',
      label: `订阅源规则 (${feedTitle || '未命名'})`,
      children: renderFeedRulesTab(),
    });
  }

  tabItems.push({
    key: 'global',
    label: '全局规则',
    children: renderGlobalRulesTab(),
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>过滤规则管理</h3>
        <Button 
          type="default" 
          icon={<FileTextOutlined />} 
          onClick={() => setIsLogViewerOpen(true)}
        >
          查看日志
        </Button>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <Modal
        title={editingRuleId ? "编辑阅读偏好" : "添加阅读偏好"}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalVisible(false);
          setEditingRuleId(null);
          form.resetFields();
        }}
        styles={{
          body: { padding: '16px 24px' }
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" name="filterRuleForm" initialValues={{ isActive: false, keywordLogic: 'OR' }}>
          <Form.Item
            name="scope"
            label="范围"
            rules={[{ required: true, message: '请选择规则范围' }]}
          >
            <Select placeholder="选择范围">
              <Select.Option value="title">标题</Select.Option>
              <Select.Option value="content">内容</Select.Option>
              <Select.Option value="author">作者</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: '请选择规则类型' }]}
          >
            <Select placeholder="选择类型">
              <Select.Option value="contains">只显示包含关键词的文章</Select.Option>
              <Select.Option value="not_contains">隐藏包含关键词的文章</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="keywords"
            label="关键词 (用空格分隔)"
            rules={[{ required: true, message: '请输入关键词' }]}
          >
            <Input.TextArea rows={2} placeholder="例如: 科技 公司" />
          </Form.Item>
          <Form.Item name="keywordLogic" label="关键词匹配逻辑">
            <Radio.Group>
              <Radio value="OR">匹配任意一个 (或)</Radio>
              <Radio value="AND">匹配全部 (与)</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="isActive" label="状态" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {isLogViewerOpen && (
        <FilterLogViewer 
          isOpen={isLogViewerOpen} 
          onClose={() => setIsLogViewerOpen(false)} 
        />
      )}
    </div>
  );
};

export default FilterRulesManager; 