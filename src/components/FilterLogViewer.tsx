import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Space, Badge, Typography, Collapse, Switch, Tabs, Select, Divider } from 'antd';
import { ClearOutlined, ReloadOutlined, SettingOutlined, DownloadOutlined } from '@ant-design/icons';
import { getLogs, clearLogs, setConsoleLogging } from '../utils/filterLogger';
import { LogConfig, LogLevel, LogModule } from '../utils/logConfig';
import type { ColumnsType } from 'antd/es/table';
import type { TabsProps } from 'antd';

const { Text } = Typography;
const { Panel } = Collapse;
const { TabPane } = Tabs;
const { Option } = Select;

interface FilterLogViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

const FilterLogViewer: React.FC<FilterLogViewerProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [consoleLoggingEnabled, setConsoleLoggingEnabled] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('logs');
  const [logLevel, setLogLevel] = useState<LogLevel>(LogConfig.currentLevel);
  
  // 模块开关状态 - 默认与LogConfig保持一致
  const [moduleStates, setModuleStates] = useState<Record<LogModule, boolean>>({
    GENERAL: true,
    FEED: false,
    FILTER: false,
    DATABASE: false,
    NETWORK: false,
    LAYOUT: false,
    HOMEPAGE: false,
    PERFORMANCE: false
  });
  
  // 加载日志
  const loadLogs = () => {
    const allLogs = getLogs();
    setLogs(allLogs);
  };
  
  // 清除日志
  const handleClearLogs = () => {
    clearLogs();
    setLogs([]);
  };
  
  // 切换控制台日志
  const handleToggleConsoleLogging = (checked: boolean) => {
    setConsoleLogging(checked);
    setConsoleLoggingEnabled(checked);
  };
  
  // 设置日志级别
  const handleSetLogLevel = (level: LogLevel) => {
    LogConfig.setLevel(level);
    setLogLevel(level);
  };
  
  // 切换模块日志开关
  const handleToggleModule = (module: LogModule, enabled: boolean) => {
    LogConfig.setModuleEnabled(module, enabled);
    setModuleStates(prev => ({
      ...prev,
      [module]: enabled
    }));
  };
  
  // 启用所有模块
  const handleEnableAllModules = () => {
    LogConfig.enableAllModules();
    setModuleStates({
      GENERAL: true,
      FEED: true,
      FILTER: true,
      DATABASE: true,
      NETWORK: true,
      LAYOUT: true,
      HOMEPAGE: true,
      PERFORMANCE: true
    });
  };
  
  // 禁用所有模块
  const handleDisableAllModules = () => {
    LogConfig.disableAllModules();
    setModuleStates({
      GENERAL: false,
      FEED: false,
      FILTER: false,
      DATABASE: false,
      NETWORK: false,
      LAYOUT: false,
      HOMEPAGE: false,
      PERFORMANCE: false
    });
  };
  
  // 导出日志
  const handleExportLogs = () => {
    // 创建要导出的日志内容
    const logContent = logs.map(log => {
      const date = new Date(log.timestamp);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
      const dataStr = log.data ? JSON.stringify(log.data, null, 2) : '';
      return `[${formattedDate}] [${log.level.toUpperCase()}] ${log.message}\n${dataStr ? `数据: ${dataStr}\n` : ''}`;
    }).join('\n----------------------------\n');
    
    // 创建Blob对象
    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filter-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  };
  
  // 组件挂载或打开时加载日志和设置
  useEffect(() => {
    if (isOpen) {
      loadLogs();
      
      // 加载当前日志配置
      setLogLevel(LogConfig.currentLevel);
      
      // 加载模块状态
      const newModuleStates = {} as Record<LogModule, boolean>;
      (Object.keys(moduleStates) as LogModule[]).forEach(module => {
        newModuleStates[module] = LogConfig.isModuleEnabled(module);
      });
      setModuleStates(newModuleStates);
      
      // 加载过滤日志状态
      setConsoleLoggingEnabled(LogConfig.isModuleEnabled('FILTER'));
    }
  }, [isOpen]);
  
  // 日志级别对应的颜色
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'debug': return 'blue';
      case 'info': return 'green';
      case 'warn': return 'orange';
      case 'error': return 'red';
      default: return 'default';
    }
  };
  
  // 表格列定义
  const columns: ColumnsType<LogEntry> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (text: string) => {
        const date = new Date(text);
        return (
          <Text style={{ fontSize: '12px' }}>
            {date.toLocaleTimeString()} {date.toLocaleDateString()}
          </Text>
        );
      },
      width: 150,
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      render: (text: string) => <Badge status={getLevelColor(text) as any} text={text} />,
      width: 100,
      filters: [
        { text: 'debug', value: 'debug' },
        { text: 'info', value: 'info' },
        { text: 'warn', value: 'warn' },
        { text: 'error', value: 'error' },
      ],
      onFilter: (value, record) => record.level === value,
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
    },
    {
      title: '数据',
      dataIndex: 'data',
      key: 'data',
      render: (data: any) => {
        if (!data) return null;
        return (
          <Collapse ghost>
            <Panel header="查看详情" key="1">
              <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(data, null, 2)}</pre>
            </Panel>
          </Collapse>
        );
      },
    },
  ];
  
  // 定义Tabs的items
  const tabItems: TabsProps['items'] = [
    {
      key: 'logs',
      label: '过滤规则日志',
      children: (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Space>
            <Text>控制台日志:</Text>
            <Switch 
              checked={consoleLoggingEnabled} 
              onChange={handleToggleConsoleLogging}
              size="small"
            />
            <Button icon={<ReloadOutlined />} onClick={loadLogs} size="small">
              刷新
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExportLogs} size="small" type="primary">
              导出日志
            </Button>
            <Button danger icon={<ClearOutlined />} onClick={handleClearLogs} size="small">
              清除日志
            </Button>
          </Space>
          <Text>共有 {logs.length} 条日志记录</Text>
          <Table
            dataSource={logs}
            columns={columns}
            rowKey={(record) => `${record.timestamp}-${Math.random()}`}
            pagination={{ pageSize: 10 }}
            size="small"
            scroll={{ x: 'max-content' }}
          />
        </Space>
      )
    },
    {
      key: 'settings',
      label: '日志设置',
      icon: <SettingOutlined />,
      children: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Divider orientation="left">全局日志级别</Divider>
          <Select 
            value={logLevel} 
            onChange={handleSetLogLevel}
            style={{ width: 200 }}
          >
            <Option value={LogLevel.DEBUG}>DEBUG - 调试信息</Option>
            <Option value={LogLevel.INFO}>INFO - 一般信息</Option>
            <Option value={LogLevel.WARN}>WARN - 警告信息</Option>
            <Option value={LogLevel.ERROR}>ERROR - 错误信息</Option>
            <Option value={LogLevel.NONE}>NONE - 禁用所有日志</Option>
          </Select>
          
          <Divider orientation="left">模块日志开关</Divider>
          <Space>
            <Button size="small" onClick={handleEnableAllModules}>启用全部</Button>
            <Button size="small" onClick={handleDisableAllModules}>禁用全部</Button>
          </Space>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '8px' }}>
            {(Object.keys(moduleStates) as LogModule[]).map(module => (
              <div key={module} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', border: '1px solid #f0f0f0', borderRadius: '4px' }}>
                <Text>{module}</Text>
                <Switch 
                  size="small" 
                  checked={moduleStates[module]} 
                  onChange={(checked) => handleToggleModule(module, checked)}
                />
              </div>
            ))}
          </div>
        </Space>
      )
    }
  ];
  
  return (
    <Modal
      title="日志管理"
      open={isOpen}
      onCancel={onClose}
      width={800}
      styles={{
        body: { padding: '16px 24px' }
      }}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          关闭
        </Button>,
      ]}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </Modal>
  );
};

export default FilterLogViewer; 