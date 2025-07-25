import React, { useState, useEffect } from 'react';
import { Card, Typography, Button, Progress, Space, Alert } from 'antd';
import { CloudDownloadOutlined, SyncOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'not-available';

interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

interface UpdateInfo {
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
}

interface UpdateManagerProps {
  className?: string;
}

const UpdateManager: React.FC<UpdateManagerProps> = ({ className }) => {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    // 监听来自主进程的更新状态消息
    const handleUpdateStatus = (event: any, data: any) => {
      console.log('收到更新状态:', data);
      setStatus(data.status);
      
      if (data.status === 'error') {
        setError(data.error || '更新过程中出现错误');
      }
      
      if (data.status === 'downloading' && data.progress) {
        setProgress(data.progress);
      }
      
      if (data.status === 'available') {
        setUpdateInfo({
          version: data.version,
          releaseDate: data.releaseDate,
          releaseNotes: data.releaseNotes
        });
      }
    };

    if (window.electron && window.electron.onUpdateStatus) {
      window.electron.onUpdateStatus(handleUpdateStatus);
    }

    return () => {
      // 清理监听器
      if (window.electron && window.electron.offUpdateStatus) {
        window.electron.offUpdateStatus(handleUpdateStatus);
      }
    };
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.electron || !window.electron.checkForUpdates) {
      setError('更新功能仅在Electron环境下可用');
      return;
    }

    setIsChecking(true);
    setError(null);
    
    try {
      const result = await window.electron.checkForUpdates();
      if (!result.success) {
        setError(result.error || '检查更新失败');
      }
    } catch (err: any) {
      setError(err.message || '检查更新时发生错误');
    } finally {
      setIsChecking(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderStatusContent = () => {
    switch (status) {
      case 'checking':
        return <Alert message="正在检查更新..." type="info" showIcon />;
        
      case 'available':
        return (
          <Alert
            message={`发现新版本 v${updateInfo?.version || ''}`}
            description={
              <div>
                <p>发布日期: {updateInfo?.releaseDate || '未知'}</p>
                <p>更新说明: {updateInfo?.releaseNotes || '无'}</p>
              </div>
            }
            type="success"
            showIcon
          />
        );
        
      case 'downloading':
        return (
          <div>
            <Alert message="正在下载更新..." type="info" showIcon />
            <Progress 
              percent={progress?.percent ? Math.round(progress.percent) : 0} 
              status="active" 
              style={{ marginTop: 10 }}
            />
            {progress && (
              <Text type="secondary">
                下载速度: {formatBytes(progress.bytesPerSecond)}/s | 
                {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
              </Text>
            )}
          </div>
        );
        
      case 'downloaded':
        return <Alert message="更新已下载，将在下次启动时安装" type="success" showIcon />;
        
      case 'error':
        return <Alert message={error || '更新过程中出现错误'} type="error" showIcon />;
        
      case 'not-available':
        return <Alert message="当前已是最新版本" type="success" showIcon />;
        
      case 'idle':
      default:
        return <Text>点击按钮检查更新</Text>;
    }
  };

  return (
    <Card className={className}>
      <div>
        <Title level={5}><CloudDownloadOutlined /> 软件更新</Title>
        <div style={{ marginBottom: 16 }}>
          {renderStatusContent()}
        </div>
        <Space>
          <Button 
            type="primary"
            icon={<SyncOutlined />} 
            onClick={handleCheckForUpdates}
            loading={isChecking || status === 'checking'}
            disabled={status === 'downloading'}
          >
            检查更新
          </Button>
        </Space>
      </div>
    </Card>
  );
};

export default UpdateManager; 