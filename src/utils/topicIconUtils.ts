/**
 * 主题图标工具
 */
import React from 'react';
import { 
  TagOutlined, BookOutlined, ReadOutlined, FireOutlined,  
  StarOutlined, CompassOutlined, HeartOutlined, BulbOutlined,
  RocketOutlined, TrophyOutlined, GiftOutlined, ThunderboltOutlined,
  AppstoreOutlined, FundOutlined, ExperimentOutlined, GlobalOutlined
} from '@ant-design/icons';
import BlogIcon from '../components/icons/BlogIcon';
import CodeIcon from '../components/icons/CodeIcon';
import NewsIcon from '../components/icons/NewsIcon';
import PodcastIcon from '../components/icons/PodcastIcon';

// 预设主题图标列表
export const topicIcons = [
  // 内置Ant Design图标
  { name: 'tag', component: TagOutlined, label: '标签' },
  { name: 'book', component: BookOutlined, label: '书籍' },
  { name: 'read', component: ReadOutlined, label: '阅读' },
  { name: 'fire', component: FireOutlined, label: '热门' },
  { name: 'star', component: StarOutlined, label: '收藏' },
  { name: 'compass', component: CompassOutlined, label: '探索' },
  { name: 'heart', component: HeartOutlined, label: '喜爱' },
  { name: 'bulb', component: BulbOutlined, label: '创意' },
  { name: 'rocket', component: RocketOutlined, label: '科技' },
  { name: 'trophy', component: TrophyOutlined, label: '成就' },
  { name: 'gift', component: GiftOutlined, label: '礼物' },
  { name: 'thunder', component: ThunderboltOutlined, label: '闪电' },
  { name: 'app', component: AppstoreOutlined, label: '应用' },
  { name: 'fund', component: FundOutlined, label: '图表' },
  { name: 'experiment', component: ExperimentOutlined, label: '实验' },
  { name: 'global', component: GlobalOutlined, label: '全球' },

  // 自定义图标
  { name: 'blog', component: BlogIcon, label: '博客' },
  { name: 'code', component: CodeIcon, label: '代码' },
  { name: 'news', component: NewsIcon, label: '新闻' },
  { name: 'podcast', component: PodcastIcon, label: '播客' },
];

/**
 * 根据图标名称获取图标组件
 * @param iconName 图标名称
 * @returns 对应的图标组件
 */
export const getIconByName = (iconName: string | undefined): React.ComponentType<any> => {
  if (!iconName) return TagOutlined; // 默认图标
  
  const icon = topicIcons.find(icon => icon.name === iconName);
  return icon ? icon.component : TagOutlined;
}; 