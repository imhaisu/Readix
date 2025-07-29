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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');

  useEffect(() => {
    // 获取当前应用版本
    const fetchCurrentVersion = async () => {
      if (window.electron?.getAppVersion) {
        try {
          const version = await window.electron.getAppVersion();
          setCurrentVersion(version);
        } catch (err) {
          console.error('获取应用版本失败:', err);
        }
      }
    };

    fetchCurrentVersion();

    // 监听来自主进程的更新状态消息
    const handleUpdateStatus = (event: any, data: any) => {
      console.log('收到更新状态:', data);
      
      // 处理状态
      setStatus(data.status);
      
      // 处理自定义消息
      if (data.message) {
        setStatusMessage(data.message);
      } else {
        setStatusMessage(null);
      }
      
      // 处理错误信息
      if (data.status === 'error' && data.error) {
        setError(data.error);
      } else {
        setError(null);
      }
      
      // 处理下载进度
      if (data.status === 'downloading' && data.progress) {
        setProgress(data.progress);
      }
      
      // 处理版本信息
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
    if (!window.electron) {
      setError('更新功能仅在Electron环境下可用');
      return;
    }

    // 使用手动检查
    const checkFunction = window.electron.checkForUpdatesManual;
    
    if (!checkFunction) {
      setError('更新检查功能不可用');
      return;
    }

    setIsChecking(true);
    setError(null);
    setStatus('checking');
    
    try {
      const result = await checkFunction();
      // 结果处理已在handleUpdateStatus中进行，这里只需额外处理错误
      if (!result.success && result.error) {
        setError(result.error);
        setStatus('error');
      }
    } catch (err: any) {
      console.error('检查更新出错:', err);
      setError('检查更新时发生错误，请稍后再试');
      setStatus('error');
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
                <p><strong>当前版本:</strong> v{currentVersion}</p>
                <p><strong>新版本:</strong> v{updateInfo?.version || ''}</p>
                <p><strong>发布日期:</strong> {updateInfo?.releaseDate ? new Date(updateInfo.releaseDate).toLocaleDateString('zh-CN') : '未知'}</p>
                <p><strong>更新说明:</strong> {updateInfo?.releaseNotes || '无'}</p>
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
        // 显示友好错误提示，使用info类型而非error
        return <Alert message="检查更新" description={error || '检查更新失败，请稍后再试'} type="info" showIcon />;
        
      case 'not-available':
        return <Alert message={statusMessage || "当前已是最新版本"} type="success" showIcon />;
        
      case 'idle':
      default:
        return (
          <div>
            <Text>当前版本: v{currentVersion}</Text>
            <br />
            <Text>点击按钮检查更新</Text>
          </div>
        );
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