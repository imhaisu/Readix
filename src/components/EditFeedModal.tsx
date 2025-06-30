import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, message, Tooltip, Upload, Image, Avatar, Grid, Radio, Tabs } from 'antd';
import { InfoCircleOutlined, UploadOutlined, PictureOutlined, FilterOutlined } from '@ant-design/icons';
import { useDatabase } from '../contexts/DatabaseContext';
import { FeedSource, Group } from '../db/database';
import type { RcFile, UploadProps } from 'antd/es/upload/interface';

import DefaultIcon from './icons/DefaultIcon';
import RssIcon from './icons/RssIcon';
import NewsIcon from './icons/NewsIcon';
import BlogIcon from './icons/BlogIcon';
import CodeIcon from './icons/CodeIcon';
import PodcastIcon from './icons/PodcastIcon';
import FilterRulesManager from './FilterRulesManager';

const { Option } = Select;
const { useBreakpoint } = Grid;
const { TabPane } = Tabs;

interface EditFeedModalProps {
  feed: FeedSource | null;
  open: boolean;
  groups: Group[];
  onCancel: () => void;
  onSuccess: (updatedFeed: FeedSource) => void;
}

const presetIcons = [
  { name: 'Default', component: DefaultIcon, path: 'preset:Default' },
  { name: 'RSS', component: RssIcon, path: 'preset:RSS' },
  { name: 'News', component: NewsIcon, path: 'preset:News' },
  { name: 'Blog', component: BlogIcon, path: 'preset:Blog' },
  { name: 'Code', component: CodeIcon, path: 'preset:Code' },
  { name: 'Podcast', component: PodcastIcon, path: 'preset:Podcast' },
];

const getBase64 = (file: RcFile): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });

const EditFeedModal: React.FC<EditFeedModalProps> = ({ feed, open, groups, onCancel, onSuccess }) => {
  const { db } = useDatabase();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [currentIconUrl, setCurrentIconUrl] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<string>('basic');
  const screens = useBreakpoint();

  useEffect(() => {
    if (feed && open) {
      form.setFieldsValue({
        title: feed.title,
        url: feed.url,
        groupId: feed.groupId,
        defaultViewMode: feed.defaultViewMode || 'summary',
        iconUrlInput: feed.iconUrl || '',
      });
      setCurrentIconUrl(feed.iconUrl || '');
    } else if (!open) {
      form.resetFields();
      setCurrentIconUrl(undefined);
      setActiveTab('basic');
    }
  }, [feed, open, form]);

  const handleIconUrlInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentIconUrl(e.target.value);
    form.setFieldsValue({ iconUrlInput: e.target.value });
  };
  
  const handlePresetIconSelect = (path: string) => {
    setCurrentIconUrl(path);
    form.setFieldsValue({ iconUrlInput: path });
  };

  const handleUploadChange: UploadProps['onChange'] = async info => {
    if (info.file.status === 'done' || info.file.status === 'uploading') {
        if (info.file.originFileObj) {
            try {
                const base64Url = await getBase64(info.file.originFileObj as RcFile);
                setCurrentIconUrl(base64Url);
                form.setFieldsValue({ iconUrlInput: base64Url });
                message.success(`${info.file.name} 上传成功并已设为图标。`);
            } catch (error) {
                message.error('图片转换失败！');
            }
        }
    } else if (info.file.status === 'error') {
      message.error(`${info.file.name} 文件上传失败。`);
    }
  };

  const handleSubmit = async () => {
    if (!db || !feed || typeof feed.id === 'undefined') {
      message.error('数据错误，无法保存！');
      return;
    }
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      const finalIconUrl = values.iconUrlInput || undefined;

      const updates: Partial<FeedSource> = {
        title: values.title,
        groupId: values.groupId,
        iconUrl: finalIconUrl,
        defaultViewMode: values.defaultViewMode,
      };

      await db.feeds.update(feed.id, updates);
      
      message.success('订阅源信息更新成功！');
      const updatedFeedFromDb = await db.feeds.get(feed.id);
      if (updatedFeedFromDb) {
        onSuccess(updatedFeedFromDb);
      }
    } catch (error) {
      console.error('更新订阅源失败:', error);
      message.error('更新订阅源失败！');
    } finally {
      setLoading(false);
    }
  };
  
  const uploadProps: UploadProps = {
    name: 'iconfile',
    multiple: false,
    accept: 'image/*',
    showUploadList: false,
    customRequest: ({ file, onSuccess }) => {
        setTimeout(() => {
          if (onSuccess) {
            onSuccess('ok');
          }
        }, 0);
    },
    beforeUpload: (file) => {
      const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/svg+xml' || file.type === 'image/gif' || file.type === 'image/webp';
      if (!isJpgOrPng) {
        message.error('你只能上传 JPG/PNG/SVG/GIF/WEBP 文件!');
      }
      const isLt2M = file.size / 1024 / 1024 < 2;
      if (!isLt2M) {
        message.error('图片必须小于 2MB!');
      }
      return isJpgOrPng && isLt2M; 
    },
    onChange: handleUploadChange,
  };

  const renderIconPreview = () => {
    if (currentIconUrl?.startsWith('preset:')) {
      const iconName = currentIconUrl.replace('preset:', '');
      const IconComponent = presetIcons.find(p => p.name === iconName)?.component;
      if (IconComponent) {
        return <IconComponent width={64} height={64} style={{ border: '1px solid #f0f0f0', borderRadius: '4px', padding: '8px' }} />;
      }
    }
    
    if (currentIconUrl) {
      return <Image width={64} height={64} src={currentIconUrl} fallback="/assets/preset-icons/default.svg" preview={false} style={{ objectFit: 'contain', border: '1px solid #f0f0f0', borderRadius: '4px' }} />;
    }
    
    return <Avatar shape="square" size={64} icon={<PictureOutlined />} style={{ backgroundColor: '#f0f0f0' }} />;
  };

  const renderBasicInfoTab = () => (
    <Form form={form} layout="vertical" name="editFeedForm">
      <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入订阅源标题!' }]}>
        <Input />
      </Form.Item>

      <Form.Item label={<span>订阅源URL&nbsp;<Tooltip title="修改URL可能导致订阅源无法正确解析或获取内容。请谨慎操作。"><InfoCircleOutlined /></Tooltip></span>} name="url">
        <Input readOnly />
      </Form.Item>
      
      <Form.Item name="groupId" label="分组">
        <Select placeholder="选择分组（可选）" allowClear>
          <Option value={null}>(无分组)</Option>
          {groups.map(group => (group.id && <Option key={group.id} value={group.id}>{group.name}</Option>))}
        </Select>
      </Form.Item>

      <Form.Item label="当前图标预览" style={{ marginBottom: 10 }}>
        {renderIconPreview()}
      </Form.Item>
      
      <Form.Item
        name="iconUrlInput"
        label="图标设置"
        tooltip="可粘贴URL、上传图片或选择预设图标。"
      >
        <Input.Group compact>
          <Input 
            style={{ width: 'calc(100% - 92px)' }}
            placeholder="粘贴图标URL或选择下方预设" 
            value={form.getFieldValue('iconUrlInput')}
            onChange={handleIconUrlInputChange} 
          />
          <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>上传</Button>
          </Upload>
        </Input.Group>
      </Form.Item>

      <Form.Item label="选择预设图标">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {presetIcons.map(pIcon => (
            <div key={pIcon.name} style={{ textAlign: 'center' }}>
              <Button 
                onClick={() => handlePresetIconSelect(pIcon.path)}
                style={{ 
                  padding: '8px',
                  width: '80px',
                  height: '80px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: currentIconUrl === pIcon.path ? '2px solid #1890ff' : '1px solid #d9d9d9'
                }}
              >
                <pIcon.component 
                  width={32} 
                  height={32} 
                  style={{ marginBottom: '8px' }}
                />
                <span style={{ fontSize: '12px' }}>{pIcon.name}</span>
              </Button>
            </div>
          ))}
        </div>
      </Form.Item>

      <Form.Item name="defaultViewMode" label="默认阅读模式">
        <Radio.Group>
          <Radio.Button value="summary">摘要</Radio.Button>
          <Radio.Button value="fulltext">全文</Radio.Button>
        </Radio.Group>
      </Form.Item>
    </Form>
  );

  const renderFilterRulesTab = () => (
    feed && feed.id ? (
      <FilterRulesManager feedId={feed.id} feedTitle={feed.title} />
    ) : (
      <div>请先保存订阅源信息后再设置过滤规则。</div>
    )
  );

  return (
    <Modal
      title="修改订阅源信息"
      open={open}
      onCancel={onCancel}
      confirmLoading={loading}
      onOk={handleSubmit}
      okText="保存"
      cancelText="取消"
      width={screens.md ? 700 : '90%'}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="基本信息" key="basic">
          {renderBasicInfoTab()}
        </TabPane>
        <TabPane tab={<span><FilterOutlined /> 过滤规则</span>} key="filter">
          {renderFilterRulesTab()}
        </TabPane>
      </Tabs>
    </Modal>
  );
};

export default EditFeedModal; 