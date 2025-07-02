import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Popconfirm, message, Tabs, Spin, Space, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { useFilterRules } from '../contexts/FilterRulesContext';
import { useDatabase } from '../contexts/DatabaseContext';
import { FilterRule, FeedSource } from '../db/database';
import { createFilterRule, applyFilterRulesToFeed, forceApplyAllFeedRules } from '../utils/filterUtils';
import { v4 as uuidv4 } from 'uuid';
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
        console.log('[FilterRulesManager] 数据库未初始化或没有feedId，无法加载订阅源过滤规则');
        setFeedRules([]);
        return;
      }

      console.log(`[FilterRulesManager] 开始加载订阅源 ${feedId} 的过滤规则`);
      setIsLoading(true);
      try {
        const feed = await db.feeds.get(feedId);
        console.log(`[FilterRulesManager] 获取到订阅源:`, feed);
        if (feed && feed.filterRules) {
          console.log(`[FilterRulesManager] 订阅源 ${feedId} 的过滤规则:`, JSON.stringify(feed.filterRules));
          setFeedRules(feed.filterRules);
        } else {
          console.log(`[FilterRulesManager] 订阅源 ${feedId} 没有过滤规则或规则为空`);
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
      console.log('[FilterRulesManager] 数据库未初始化或没有feedId，无法保存订阅源过滤规则');
      return;
    }

    console.log(`[FilterRulesManager] 保存订阅源 ${feedId} 的过滤规则:`, JSON.stringify(rules));
    setIsLoading(true);
    try {
      // 确保rules是数组且每个元素都有所需的字段
      const validatedRules = Array.isArray(rules) ? rules.map(rule => {
        // 确保每个规则都有必要的字段
        if (!rule.id) {
          console.warn('[FilterRulesManager] 发现规则缺少ID，生成新ID');
          rule.id = uuidv4();
        }
        return {
          id: rule.id,
          scope: rule.scope || 'title',
          type: rule.type || 'contains',
          keywords: rule.keywords || '',
          isActive: rule.isActive !== false  // 默认为true
        };
      }) : [];
      
      console.log(`[FilterRulesManager] 验证后的规则:`, JSON.stringify(validatedRules));
      
      // 保存到数据库
      await db.feeds.update(feedId, { filterRules: validatedRules });
      
      // 验证是否保存成功
      const updatedFeed = await db.feeds.get(feedId);
      console.log(`[FilterRulesManager] 保存后从数据库重新读取:`, updatedFeed?.filterRules);
      
      // 如果数据库中的规则数量与要保存的不一致，则记录警告
      if (updatedFeed?.filterRules?.length !== validatedRules.length) {
        console.warn(`[FilterRulesManager] 警告: 保存的规则数量(${validatedRules.length})与数据库中的(${updatedFeed?.filterRules?.length})不一致!`);
      }
      
      console.log(`[FilterRulesManager] 已更新数据库中订阅源 ${feedId} 的过滤规则`);
      setFeedRules(validatedRules);
      
      // 应用规则到文章
      console.log(`[FilterRulesManager] 开始应用过滤规则到订阅源 ${feedId} 的文章`);
      const updatedCount = await applyFilterRulesToFeed(db, feedId, validatedRules);
      console.log(`[FilterRulesManager] 应用过滤规则完成，更新了 ${updatedCount} 篇文章`);
      
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
    console.log(`[FilterRulesManager] 添加新的订阅源过滤规则:`, newRule);
    const updatedRules = [...feedRules, newRule];
    saveFeedRules(updatedRules);
    
    // 重新应用所有订阅源规则
    setTimeout(() => {
      if (db && isInitialized && feedId) {
        console.log(`[FilterRulesManager] 重新检查订阅源过滤规则的应用状态`);
        applyFilterRulesToFeed(db, feedId, updatedRules).then(count => {
          console.log(`[FilterRulesManager] 重新应用过滤规则完成，更新了 ${count} 篇文章`);
        });
      }
    }, 500);
  };

  // 更新订阅源过滤规则
  const updateFeedRule = (id: string, changes: Partial<Omit<FilterRule, 'id'>>) => {
    console.log(`[FilterRulesManager] 更新订阅源过滤规则 ${id}:`, changes);
    const updatedRules = feedRules.map(rule => 
      rule.id === id ? { ...rule, ...changes } : rule
    );
    saveFeedRules(updatedRules);
    
    // 重新应用所有订阅源规则
    setTimeout(() => {
      if (db && isInitialized && feedId) {
        console.log(`[FilterRulesManager] 重新检查订阅源过滤规则的应用状态`);
        applyFilterRulesToFeed(db, feedId, updatedRules).then(count => {
          console.log(`[FilterRulesManager] 重新应用过滤规则完成，更新了 ${count} 篇文章`);
        });
      }
    }, 500);
  };

  // 删除订阅源过滤规则
  const deleteFeedRule = (id: string) => {
    console.log(`[FilterRulesManager] 删除订阅源过滤规则 ${id}`);
    const updatedRules = feedRules.filter(rule => rule.id !== id);
    saveFeedRules(updatedRules);
    
    // 重新应用所有订阅源规则
    setTimeout(() => {
      if (db && isInitialized && feedId) {
        console.log(`[FilterRulesManager] 重新检查订阅源过滤规则的应用状态`);
        applyFilterRulesToFeed(db, feedId, updatedRules).then(count => {
          console.log(`[FilterRulesManager] 重新应用过滤规则完成，更新了 ${count} 篇文章`);
        });
      }
    }, 500);
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
            <Space>
              <Tooltip title="立即应用规则">
                <Button 
                  type="default" 
                  icon={<ReloadOutlined />} 
                  onClick={async () => {
                    if (!db || !isInitialized || !feedId) {
                      message.error('无法应用规则：数据库未初始化或没有选择订阅源');
                      return;
                    }
                    
                    setIsLoading(true);
                    try {
                      message.loading('正在应用过滤规则...');
                      
                      // 仅应用当前订阅源的规则
                      const updatedCount = await applyFilterRulesToFeed(db, feedId, feedRules);
                      
                      message.success(`成功应用规则，更新了 ${updatedCount} 篇文章`);
                      
                      // 强制刷新文章列表
                      triggerArticleListRefresh();
                      
                      // 如果没有文章被更新，可能是UI问题，尝试强制刷新
                      if (updatedCount === 0) {
                        // 延迟500ms后再次触发刷新
                        setTimeout(() => {
                          console.log('[FilterRulesManager] 执行二次刷新...');
                          triggerArticleListRefresh();
                          
                          // 使用随机数触发数据库更新，强制UI刷新
                          db.feeds.update(feedId, { 
                            lastForceRefresh: `${new Date().toISOString()}_${Math.random()}` 
                          }).then(() => {
                            console.log('[FilterRulesManager] 强制刷新完成');
                          });
                        }, 500);
                      }
                    } catch (error) {
                      console.error('[FilterRulesManager] 应用规则时出错:', error);
                      message.error('应用规则失败');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  应用规则
                </Button>
              </Tooltip>
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
            </Space>
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
            <Space>
              <Tooltip title="立即应用所有规则">
                <Button 
                  type="default" 
                  icon={<ReloadOutlined />} 
                  onClick={async () => {
                    if (!db || !isInitialized) {
                      message.error('无法应用规则：数据库未初始化');
                      return;
                    }
                    
                    try {
                      message.loading('正在应用所有过滤规则...');
                      
                      // 强制应用所有订阅源规则，优先级高于全局规则
                      const feedRulesCount = await forceApplyAllFeedRules(db);
                      console.log(`[FilterRulesManager] 完成订阅源规则应用，更新了 ${feedRulesCount} 篇文章`);
                      
                      // 延迟一会儿再应用全局规则，确保订阅源规则先被处理
                      await new Promise(resolve => setTimeout(resolve, 500));
                      
                      // 然后应用全局规则
                      const globalRulesCount = await applyGlobalRules();
                      console.log(`[FilterRulesManager] 完成全局规则应用，更新了 ${globalRulesCount} 篇文章`);
                      
                      message.success(`成功应用所有规则，更新了 ${feedRulesCount + globalRulesCount} 篇文章`);
                      triggerArticleListRefresh();
                    } catch (error) {
                      console.error('[FilterRulesManager] 应用所有规则时出错:', error);
                      message.error('应用规则失败');
                    }
                  }}
                >
                  应用所有规则
                </Button>
              </Tooltip>
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
            </Space>
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