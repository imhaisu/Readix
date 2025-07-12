import React, { useState } from 'react';
import { Button, Form, Select, Input, InputNumber, Space, Switch, Divider, Card, Tag, Tooltip, Modal, List, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, QuestionCircleOutlined, BookOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { TopicFilterRule } from '../db/database';
import { filterTemplates, generateNewRuleIds } from '../utils/presetFilterTemplates';
import { getIconByName } from '../utils/topicIconUtils';
// 移除TopicIcon导入

const { Option } = Select;
const { Text, Paragraph } = Typography;

interface TopicFilterRulesEditorProps {
  rules: TopicFilterRule[];
  onChange: (rules: TopicFilterRule[]) => void;
  onIconChange?: (iconName: string) => void; // 可选回调，用于更新主题图标
}

// 定义字段类型
type FieldType = 'title' | 'content' | 'summary' | 'author' | 'publishDate' | 'readingTime' | 'hasImages' | 'domain' | 'tags';

const TopicFilterRulesEditor: React.FC<TopicFilterRulesEditorProps> = ({ rules, onChange, onIconChange }) => {
  const [editingRule, setEditingRule] = useState<TopicFilterRule | null>(null);
  const [isTemplateModalVisible, setIsTemplateModalVisible] = useState(false);

  // 字段选项
  const fieldOptions = [
    { value: 'title', label: '标题' },
    { value: 'content', label: '内容' },
    { value: 'summary', label: '摘要' },
    { value: 'author', label: '作者' },
    { value: 'publishDate', label: '发布日期' },
    { value: 'readingTime', label: '阅读时间' },
    { value: 'hasImages', label: '包含图片' },
    { value: 'domain', label: '来源域名' },
    { value: 'tags', label: '标签' },
  ];

  // 根据字段类型获取可用的操作选项
  const getOperationOptions = (field: FieldType) => {
    switch (field) {
      case 'title':
      case 'content':
      case 'summary':
      case 'author':
      case 'domain':
      case 'tags':
        return [
          { value: 'contains', label: '包含' },
          { value: 'not_contains', label: '不包含' },
          { value: 'equals', label: '等于' },
          { value: 'not_equals', label: '不等于' },
        ];
      case 'publishDate':
      case 'readingTime':
        return [
          { value: 'greater_than', label: '大于' },
          { value: 'less_than', label: '小于' },
          { value: 'between', label: '介于' },
        ];
      case 'hasImages':
        return [
          { value: 'exists', label: '存在' },
          { value: 'not_exists', label: '不存在' },
        ];
      default:
        return [];
    }
  };

  // 添加新规则
  const handleAddRule = () => {
    const newRule: TopicFilterRule = {
      id: uuidv4(),
      field: 'title',
      operation: 'contains',
      value: '',
      logic: 'AND',
      isActive: true,
    };
    setEditingRule(newRule);
  };

  // 编辑规则
  const handleEditRule = (rule: TopicFilterRule) => {
    setEditingRule({ ...rule });
  };

  // 删除规则
  const handleDeleteRule = (id: string) => {
    const updatedRules = rules.filter(rule => rule.id !== id);
    onChange(updatedRules);
  };

  // 切换规则激活状态
  const handleToggleRule = (id: string, isActive: boolean) => {
    const updatedRules = rules.map(rule => 
      rule.id === id ? { ...rule, isActive } : rule
    );
    onChange(updatedRules);
  };

  // 保存规则
  const handleSaveRule = () => {
    if (!editingRule) return;

    const isNew = !rules.some(r => r.id === editingRule.id);
    let updatedRules: TopicFilterRule[];

    if (isNew) {
      updatedRules = [...rules, editingRule];
    } else {
      updatedRules = rules.map(r => r.id === editingRule.id ? editingRule : r);
    }

    onChange(updatedRules);
    setEditingRule(null);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingRule(null);
  };

  // 应用模板
  const handleApplyTemplate = (templateId: string) => {
    const template = filterTemplates.find(t => t.id === templateId);
    if (template) {
      // 生成新的规则ID以避免冲突
      const newRules = generateNewRuleIds(template.rules);
      onChange(newRules);
      
      // 如果提供了图标更新回调，更新主题图标
      if (onIconChange) {
        onIconChange(template.icon);
      }
      
      setIsTemplateModalVisible(false);
    }
  };

  // 根据字段类型渲染不同的值输入控件
  const renderValueInput = () => {
    if (!editingRule) return null;

    const fieldType = editingRule.field as FieldType;
    
    switch (fieldType) {
      case 'title':
      case 'content':
      case 'summary':
      case 'author':
      case 'domain':
      case 'tags':
        return (
          <Input 
            value={editingRule.value as string} 
            onChange={e => setEditingRule({ ...editingRule, value: e.target.value })}
            placeholder="输入匹配值"
          />
        );
        
      case 'publishDate':
        if (editingRule.operation === 'between') {
          return (
            <Space>
              <InputNumber
                addonBefore="从"
                value={(editingRule.value as number[])?.[0] || 1}
                onChange={val => {
                  const current = Array.isArray(editingRule.value) ? [...editingRule.value] : [1, 7];
                  current[0] = val as number;
                  setEditingRule({ ...editingRule, value: current });
                }}
                min={1}
              />
              <InputNumber
                addonBefore="到"
                value={(editingRule.value as number[])?.[1] || 7}
                onChange={val => {
                  const current = Array.isArray(editingRule.value) ? [...editingRule.value] : [1, 7];
                  current[1] = val as number;
                  setEditingRule({ ...editingRule, value: current });
                }}
                min={1}
              />
              <span>天内</span>
            </Space>
          );
        }
        return (
          <Space>
            <InputNumber
              value={editingRule.value as number || 7}
              onChange={val => setEditingRule({ ...editingRule, value: val })}
              min={1}
            />
            <span>天</span>
          </Space>
        );
        
      case 'readingTime':
        if (editingRule.operation === 'between') {
          return (
            <Space>
              <InputNumber
                addonBefore="从"
                value={(editingRule.value as number[])?.[0] || 1}
                onChange={val => {
                  const current = Array.isArray(editingRule.value) ? [...editingRule.value] : [1, 5];
                  current[0] = val as number;
                  setEditingRule({ ...editingRule, value: current });
                }}
                min={1}
              />
              <InputNumber
                addonBefore="到"
                value={(editingRule.value as number[])?.[1] || 5}
                onChange={val => {
                  const current = Array.isArray(editingRule.value) ? [...editingRule.value] : [1, 5];
                  current[1] = val as number;
                  setEditingRule({ ...editingRule, value: current });
                }}
                min={1}
              />
              <span>分钟</span>
            </Space>
          );
        }
        return (
          <Space>
            <InputNumber
              value={editingRule.value as number || 5}
              onChange={val => setEditingRule({ ...editingRule, value: val })}
              min={1}
            />
            <span>分钟</span>
          </Space>
        );
        
      case 'hasImages':
        // hasImages 字段不需要值输入
        return null;
        
      default:
        return <Input />;
    }
  };

  const renderRuleForm = () => {
    if (!editingRule) return null;

    return (
      <Card style={{ marginTop: 16 }}>
        <Form layout="vertical">
          <Form.Item label="选择字段">
            <Select 
              value={editingRule.field} 
              onChange={value => {
                // 当字段改变时，重置操作和值
                const newOperation = getOperationOptions(value as FieldType)[0]?.value || 'contains';
                let newValue;
                
                switch (value) {
                  case 'publishDate':
                    newValue = newOperation === 'between' ? [1, 7] : 7;
                    break;
                  case 'readingTime':
                    newValue = newOperation === 'between' ? [1, 5] : 5;
                    break;
                  case 'hasImages':
                    newValue = true;
                    break;
                  default:
                    newValue = '';
                }
                
                setEditingRule({ 
                  ...editingRule, 
                  field: value, 
                  operation: newOperation,
                  value: newValue
                });
              }}
              style={{ width: '100%' }}
            >
              {fieldOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="操作">
            <Select 
              value={editingRule.operation} 
              onChange={value => {
                let newValue = editingRule.value;
                
                // 如果是区间操作，调整值格式
                if (value === 'between') {
                  if (editingRule.field === 'publishDate') {
                    newValue = [1, 7];
                  } else if (editingRule.field === 'readingTime') {
                    newValue = [1, 5];
                  }
                } else if (editingRule.field === 'publishDate' && Array.isArray(editingRule.value)) {
                  newValue = 7;
                } else if (editingRule.field === 'readingTime' && Array.isArray(editingRule.value)) {
                  newValue = 5;
                }
                
                setEditingRule({ 
                  ...editingRule, 
                  operation: value,
                  value: newValue
                });
              }}
              style={{ width: '100%' }}
            >
              {getOperationOptions(editingRule.field as FieldType).map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {(editingRule.field !== 'hasImages') && (
            <Form.Item label="值">
              {renderValueInput()}
            </Form.Item>
          )}

          <Form.Item label="逻辑">
            <Select 
              value={editingRule.logic} 
              onChange={value => setEditingRule({ ...editingRule, logic: value })}
              style={{ width: '100%' }}
            >
              <Option value="AND">
                与其他条件都满足（AND）
                <Tooltip title="文章必须同时满足此条件和其他条件">
                  <QuestionCircleOutlined style={{ marginLeft: 8 }} />
                </Tooltip>
              </Option>
              <Option value="OR">
                与其他条件任一满足（OR）
                <Tooltip title="文章只需满足此条件或其他条件之一">
                  <QuestionCircleOutlined style={{ marginLeft: 8 }} />
                </Tooltip>
              </Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" onClick={handleSaveRule}>保存偏好</Button>
              <Button onClick={handleCancelEdit}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    );
  };

  // 获取规则的显示文本
  const getRuleDisplayText = (rule: TopicFilterRule): string => {
    const field = fieldOptions.find(f => f.value === rule.field)?.label || rule.field;
    const operation = getOperationOptions(rule.field as FieldType).find(o => o.value === rule.operation)?.label || rule.operation;
    
    if (rule.operation === 'exists' || rule.operation === 'not_exists') {
      return `${field} ${operation}`;
    }

    if (rule.operation === 'between' && Array.isArray(rule.value)) {
      return `${field} ${operation} ${rule.value[0]} 和 ${rule.value[1]}`;
    }

    return `${field} ${operation} ${rule.value}`;
  };

  // 渲染模板选择模态框
  const renderTemplateModal = () => (
    <Modal
      title="选择阅读偏好模板"
      open={isTemplateModalVisible}
      onCancel={() => setIsTemplateModalVisible(false)}
      footer={null}
      width={600}
      styles={{
        body: { maxHeight: '70vh', overflowY: 'auto' }
      }}
    >
      <List
        itemLayout="horizontal"
        dataSource={filterTemplates}
        renderItem={template => {
          const IconComponent = getIconByName(template.icon);
          return (
            <List.Item
              actions={[
                <Button 
                  type="primary" 
                  onClick={() => handleApplyTemplate(template.id)}
                >
                  应用
                </Button>
              ]}
            >
              <List.Item.Meta
                avatar={<IconComponent style={{ fontSize: 24 }} />}
                title={template.name}
                description={
                  <>
                    <Paragraph>{template.description}</Paragraph>
                    <Text type="secondary">包含 {template.rules.length} 条规则</Text>
                  </>
                }
              />
            </List.Item>
          );
        }}
      />
    </Modal>
  );

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 16
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>阅读偏好</div>
        <Button 
          type="primary" 
          size="small"
          icon={<BookOutlined />} 
          onClick={() => setIsTemplateModalVisible(true)}
        >
          使用模板
        </Button>
      </div>
      
      {rules.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          {rules.map(rule => (
            <Card 
              key={rule.id} 
              size="small" 
              style={{ marginBottom: 8, opacity: rule.isActive ? 1 : 0.5 }}
              extra={
                <Space>
                  <Switch 
                    checked={rule.isActive} 
                    onChange={checked => handleToggleRule(rule.id, checked)} 
                    size="small"
                  />
                  <Button 
                    type="text" 
                    icon={<DeleteOutlined />} 
                    onClick={() => handleDeleteRule(rule.id)} 
                    size="small"
                  />
                </Space>
              }
              onClick={() => handleEditRule(rule)}
            >
              <Space>
                <Tag color={rule.logic === 'AND' ? 'blue' : 'green'}>
                  {rule.logic}
                </Tag>
                {getRuleDisplayText(rule)}
              </Space>
            </Card>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#999', padding: '16px 0', border: '1px dashed #d9d9d9', borderRadius: '4px' }}>
          没有配置阅读偏好，点击下方按钮添加或使用模板
        </div>
      )}

      {!editingRule && (
        <Button 
          type="dashed" 
          block 
          icon={<PlusOutlined />} 
          onClick={handleAddRule}
          style={{ marginTop: 16 }}
        >
          添加阅读偏好
        </Button>
      )}

      {renderRuleForm()}
      {renderTemplateModal()}
    </div>
  );
};

export default TopicFilterRulesEditor; 