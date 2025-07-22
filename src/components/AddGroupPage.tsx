import React, { useState } from 'react';
import { Form, Input, Button, message, Card } from 'antd';
import { FolderAddOutlined } from '@ant-design/icons';
import { useDatabase } from '../contexts/DatabaseContext';
import { Group } from '../db/database';
import { generateUniqueId } from '../utils/helpers';
import styles from './AddGroupPage.module.css';

interface AddGroupPageProps {
  onSuccess: (group: Group) => void;
  existingGroups: Group[];
}

const AddGroupPage: React.FC<AddGroupPageProps> = ({ 
  onSuccess,
  existingGroups
}) => {
  const { db, triggerFeedCountRefresh, triggerArticleListRefresh } = useDatabase();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (!db) {
        message.error('数据库未初始化');
        return;
      }

      // 检查分组名称是否已存在
      const nameExists = existingGroups.some(g => g.name === values.name);
      if (nameExists) {
        message.error('分组名称已存在');
        setLoading(false);
        return;
      }

      // 获取最大顺序值
      const maxOrder = existingGroups.length > 0 
        ? Math.max(...existingGroups.map(g => g.order))
        : 0;

      // 构建分组对象
      const group: Group = {
        id: generateUniqueId(),
        name: values.name,
        order: maxOrder + 1,
        collapsed: false
      };

      // 添加到数据库
      await db.groups.add(group);
      
      // 不再立即触发数据刷新，由父组件决定何时刷新
      // triggerFeedCountRefresh();
      // triggerArticleListRefresh();
      
      message.success('添加分组成功');
      onSuccess(group);
      form.resetFields();
    } catch (error) {
      console.error('添加分组失败:', error);
      message.error('添加分组失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.addGroupPage}>
      <Card variant="borderless" className={styles.addGroupCard}>
        <Form
          form={form}
          layout="vertical"
          size="small"
        >
          <Form.Item
            label="分组名称"
            name="name"
            rules={[{ required: true, message: '请输入分组名称' }]}
          >
            <Input 
              prefix={<FolderAddOutlined />} 
              placeholder="例如：科技新闻、生活资讯"
              size="small"
            />
          </Form.Item>
          
          <Form.Item>
            <div className={styles.buttonContainer}>
              <Button 
                type="primary" 
                loading={loading}
                onClick={handleSubmit}
                size="small"
              >
                添加
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default AddGroupPage; 