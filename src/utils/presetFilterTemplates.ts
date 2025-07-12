/**
 * 预设阅读偏好模板
 */
import { v4 as uuidv4 } from 'uuid';
import { TopicFilterRule } from '../db/database';

/**
 * 阅读偏好模板接口
 */
export interface FilterTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // 对应topicIcons中的name
  rules: TopicFilterRule[];
}

/**
 * 预设阅读偏好模板列表
 */
export const filterTemplates: FilterTemplate[] = [
  {
    id: 'recent-important',
    name: '近期重要文章',
    description: '最近7天发布的包含重要关键词的文章',
    icon: 'star',
    rules: [
      {
        id: uuidv4(),
        field: 'publishDate',
        operation: 'less_than',
        value: 7,
        logic: 'AND',
        isActive: true,
      },
      {
        id: uuidv4(),
        field: 'title',
        operation: 'contains',
        value: '重要 关键 核心 必读',
        logic: 'AND',
        isActive: true,
      }
    ]
  },
  {
    id: 'quick-reads',
    name: '快速阅读',
    description: '阅读时间在5分钟以内的短文',
    icon: 'thunder',
    rules: [
      {
        id: uuidv4(),
        field: 'readingTime',
        operation: 'less_than',
        value: 5,
        logic: 'AND',
        isActive: true,
      }
    ]
  },
  {
    id: 'tech-articles',
    name: '技术文章',
    description: '包含技术关键词的文章',
    icon: 'code',
    rules: [
      {
        id: uuidv4(),
        field: 'title',
        operation: 'contains',
        value: '技术 编程 开发 代码 架构 框架',
        logic: 'OR',
        isActive: true,
      },
      {
        id: uuidv4(),
        field: 'content',
        operation: 'contains',
        value: 'JavaScript TypeScript Python Java React Vue Angular',
        logic: 'OR',
        isActive: true,
      }
    ]
  },
  {
    id: 'visual-content',
    name: '图文内容',
    description: '包含图片的文章',
    icon: 'fund',
    rules: [
      {
        id: uuidv4(),
        field: 'hasImages',
        operation: 'exists',
        value: '',  // 修复类型错误，使用空字符串
        logic: 'AND',
        isActive: true,
      }
    ]
  },
  {
    id: 'in-depth-reading',
    name: '深度阅读',
    description: '阅读时间较长的深度文章',
    icon: 'read',
    rules: [
      {
        id: uuidv4(),
        field: 'readingTime',
        operation: 'greater_than',
        value: 10,
        logic: 'AND',
        isActive: true,
      }
    ]
  },
  {
    id: 'ai-content',
    name: 'AI相关',
    description: '人工智能相关内容',
    icon: 'bulb',
    rules: [
      {
        id: uuidv4(),
        field: 'title',
        operation: 'contains',
        value: 'AI 人工智能 机器学习 深度学习 神经网络 大模型 GPT',
        logic: 'OR',
        isActive: true,
      },
      {
        id: uuidv4(),
        field: 'content',
        operation: 'contains',
        value: '人工智能 机器学习 深度学习 神经网络 大模型 GPT',
        logic: 'OR',
        isActive: true,
      }
    ]
  }
];

/**
 * 根据模板ID获取模板
 * @param templateId 模板ID
 * @returns 找到的模板或undefined
 */
export const getTemplateById = (templateId: string): FilterTemplate | undefined => {
  return filterTemplates.find(template => template.id === templateId);
};

/**
 * 生成新的规则ID
 * 用于确保应用模板时每个规则都有唯一ID
 * @param rules 规则数组
 * @returns 更新了ID的规则数组
 */
export const generateNewRuleIds = (rules: TopicFilterRule[]): TopicFilterRule[] => {
  return rules.map(rule => ({
    ...rule,
    id: uuidv4()
  }));
}; 