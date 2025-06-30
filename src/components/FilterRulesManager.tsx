import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Popconfirm, message, Tabs, Spin } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useFilterRules } from '../contexts/FilterRulesContext';
import { useDatabase } from '../contexts/DatabaseContext';
import { FilterRule, FeedSource } from '../db/database';
import { createFilterRule, applyFilterRulesToFeed } from '../utils/filterUtils';
import styles from './FilterRulesManager.module.css';

const { TabPane } = Tabs;
const { Option } = Select;

interface FilterRulesManagerProps {
  feedId?: string;
  feedTitle?: string;
}

const FilterRulesManager: React.FC<FilterRulesManagerProps> = ({ feedId, feedTitle }) => {
  const { db, isInitialized, triggerFeedCountRefresh, triggerArticleListRefresh } = useDatabase();
  const { globalFilterRules, addGlobalFilterRule, updateGlobalFilterRule, deleteGlobalFilterRule, applyGlobalRules, isLoading: isGlobalRulesLoading } = useFilterRules();
  
  const [form] = Form.useForm();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(feedId ? 'feed' : 'global');
  const [feedRules, setFeedRules] = useState<FilterRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
        console.error('[FilterRulesManager] 加载订阅源过滤规则失败:', error);
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
      await db.feeds.update(feedId, { filterRules: rules });
      setFeedRules(rules);
      
      // 应用规则到文章
      await applyFilterRulesToFeed(db, feedId, rules);
      
      // 触发刷新
      triggerFeedCountRefresh();
      triggerArticleListRefresh();
    } catch (error) {
      console.error('[FilterRulesManager] 保存订阅源过滤规则失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 添加订阅源过滤规则
  const addFeedRule = (rule: Omit<FilterRule, 'id'>) => {
    const newRule = createFilterRule(rule.scope, rule.type, rule.keywords, rule.isActive);
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
        isActive: values.isActive !== false // 默认为true
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
      console.error('提交表单失败:', error);
    }
  };

  // 编辑规则
  const editRule = (rule: FilterRule) => {
    setEditingRuleId(rule.id);
    form.setFieldsValue({
      scope: rule.scope,
      type: rule.type,
      keywords: rule.keywords,
      isActive: rule.isActive
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
      render: (type: string) => type === 'contains' ? '包含' : '不包含'
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

  return (
    <div className={styles.container}>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {feedId && (
          <TabPane tab={`订阅源规则 (${feedTitle || '未命名'})`} key="feed">
            <div className={styles.header}>
              <h3>订阅源过滤规则</h3>
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
                    isActive: true
                  });
                  setIsModalVisible(true);
                }}
              >
                添加规则
              </Button>
            </div>
            <Spin spinning={isLoading}>
              <Table 
                dataSource={feedRules} 
                columns={columns}
                rowKey="id"
                pagination={false}
                locale={{ emptyText: '没有过滤规则' }}
              />
            </Spin>
          </TabPane>
        )}
        <TabPane tab="全局规则" key="global">
          <div className={styles.header}>
            <h3>全局过滤规则</h3>
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
                  isActive: true
                });
                setIsModalVisible(true);
              }}
            >
              添加规则
            </Button>
          </div>
          <Spin spinning={isGlobalRulesLoading}>
            <Table 
              dataSource={globalFilterRules} 
              columns={columns}
              rowKey="id"
              pagination={false}
              locale={{ emptyText: '没有全局过滤规则' }}
            />
          </Spin>
        </TabPane>
      </Tabs>

      <Modal
        title={editingRuleId ? "编辑过滤规则" : "添加过滤规则"}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalVisible(false);
          setEditingRuleId(null);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="scope"
            label="过滤范围"
            rules={[{ required: true, message: '请选择过滤范围' }]}
          >
            <Select>
              <Option value="title">标题</Option>
              <Option value="content">内容</Option>
              <Option value="author">作者</Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="type"
            label="过滤类型"
            rules={[{ required: true, message: '请选择过滤类型' }]}
          >
            <Select>
              <Option value="contains">包含</Option>
              <Option value="not_contains">不包含</Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="keywords"
            label="关键词"
            rules={[{ required: true, message: '请输入关键词' }]}
            extra="多个关键词请用空格分隔，匹配任一关键词即可触发过滤"
          >
            <Input placeholder="输入关键词" />
          </Form.Item>
          
          <Form.Item
            name="isActive"
            label="是否启用"
            valuePropName="checked"
          >
            <Switch defaultChecked />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default FilterRulesManager; 