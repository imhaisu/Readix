import React, { useState } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import { FolderAddOutlined } from '@ant-design/icons';
import { useDatabase } from '../contexts/DatabaseContext';
import { Group } from '../contexts/DatabaseContext';
import { generateUniqueId } from '../utils/helpers';

interface AddGroupModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: (group: Group) => void;
  existingGroups: Group[];
}

const AddGroupModal: React.FC<AddGroupModalProps> = ({ 
  open, 
  onCancel, 
  onSuccess,
  existingGroups
}) => {
  const { db } = useDatabase();
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
    <Modal
      title="添加分组"
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button 
          key="submit" 
          type="primary" 
          loading={loading}
          onClick={handleSubmit}
        >
          添加
        </Button>
      ]}
    >
      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item
          label="分组名称"
          name="name"
          rules={[{ required: true, message: '请输入分组名称' }]}
        >
          <Input 
            prefix={<FolderAddOutlined />} 
            placeholder="例如：科技新闻、生活资讯"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AddGroupModal; 