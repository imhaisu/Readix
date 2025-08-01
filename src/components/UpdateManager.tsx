import React, { useState, useEffect } from 'react';
import { Card, Typography, Button, Progress, Space, Alert, Modal, message, Divider } from 'antd';
import { 
  CloudDownloadOutlined, 
  SyncOutlined, 
  DownloadOutlined, 
  RocketOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

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
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

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
        message.error(data.error);
      } else {
        setError(null);
      }
      
      // 处理下载进度
      if (data.status === 'downloading' && data.progress) {
        setProgress(data.progress);
        setIsDownloading(true);
      } else if (data.status === 'downloaded') {
        setIsDownloading(false);
        message.success('更新下载完成！');
      }
      
      // 处理版本信息
      if (data.status === 'available') {
        setUpdateInfo({
          version: data.version,
          releaseDate: data.releaseDate,
          releaseNotes: data.releaseNotes
        });
        // 自动显示更新对话框
        setShowUpdateModal(true);
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

    // 优先使用manual检查，如果不存在则使用普通检查
    const checkFunction = window.electron.checkForUpdatesManual || window.electron.checkForUpdates;
    
    if (!checkFunction) {
      setError('更新检查功能不可用');
      return;
    }

    setIsChecking(true);
    setError(null);
    setStatus('checking');
    message.loading('正在检查更新...', 0);
    
    try {
      const result = await checkFunction();
      message.destroy();
      
      // 结果处理已在handleUpdateStatus中进行，这里只需额外处理错误
      if (!result.success && result.error) {
        setError(result.error);
        setStatus('error');
        message.error(result.error);
      }
    } catch (err: any) {
      message.destroy();
      console.error('检查更新出错:', err);
      setError('检查更新时发生错误，请稍后再试');
      setStatus('error');
      message.error('检查更新时发生错误，请稍后再试');
    } finally {
      setIsChecking(false);
    }
  };

  // 处理下载更新
  const handleDownloadUpdate = async () => {
    if (!window.electron?.downloadUpdate) {
      setError('下载更新功能不可用');
      return;
    }

    setIsDownloading(true);
    setStatus('downloading');
    setShowUpdateModal(false);
    message.loading('正在下载更新...', 0);
    
    try {
      const result = await window.electron.downloadUpdate();
      message.destroy();
      
      if (!result.success && result.error) {
        setError(result.error);
        setStatus('error');
        message.error(result.error);
      }
    } catch (err: any) {
      message.destroy();
      console.error('下载更新失败:', err);
      setError('下载更新失败，请稍后再试');
      setStatus('error');
      message.error('下载更新失败，请稍后再试');
    } finally {
      setIsDownloading(false);
    }
  };

  // 处理安装更新
  const handleInstallUpdate = async () => {
    if (!window.electron?.installUpdate) {
      setError('安装更新功能不可用');
      return;
    }

    setIsInstalling(true);
    message.loading('正在安装更新，应用将自动重启...', 0);
    
    try {
      await window.electron.installUpdate();
      // 不需要设置状态，因为应用会重启
    } catch (err: any) {
      message.destroy();
      console.error('安装更新失败:', err);
      setError('安装更新失败，请稍后再试');
      message.error('安装更新失败，请稍后再试');
    } finally {
      setIsInstalling(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const renderStatusContent = () => {
    switch (status) {
      case 'checking':
        return (
          <Alert 
            message="正在检查更新..." 
            type="info" 
            showIcon 
            icon={<SyncOutlined spin />}
          />
        );
        
      case 'available':
        return (
          <Alert
            message={`发现新版本 v${updateInfo?.version || ''}`}
            description={
              <div>
                <p><strong>当前版本:</strong> v{currentVersion}</p>
                <p><strong>新版本:</strong> v{updateInfo?.version || ''}</p>
                {updateInfo?.releaseDate && (
                  <p><strong>发布日期:</strong> {new Date(updateInfo.releaseDate).toLocaleDateString('zh-CN')}</p>
                )}
                {updateInfo?.releaseNotes && (
                  <p><strong>更新说明:</strong> {updateInfo.releaseNotes}</p>
                )}
              </div>
            }
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
          />
        );
        
      case 'downloading':
        return (
          <div>
            <Alert 
              message="正在下载更新..." 
              type="info" 
              showIcon 
              icon={<DownloadOutlined spin />}
            />
            <Progress 
              percent={progress?.percent ? Math.round(progress.percent) : 0} 
              status="active" 
              style={{ marginTop: 16 }}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
            {progress && (
              <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                  下载速度: {formatSpeed(progress.bytesPerSecond)} | 
                  进度: {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
              </Text>
              </div>
            )}
          </div>
        );
        
      case 'downloaded':
        return (
          <Alert 
            message="更新已下载完成" 
            description="点击下方按钮立即安装更新，安装后应用将自动重启"
            type="success" 
            showIcon 
            icon={<CheckCircleOutlined />}
          />
        );
        
      case 'error':
        return (
          <Alert 
            message="检查更新" 
            description={error || '检查更新失败，请稍后再试'} 
            type="error" 
            showIcon 
            icon={<ExclamationCircleOutlined />}
          />
        );
        
      case 'not-available':
        return (
          <Alert 
            message={statusMessage || "当前已是最新版本"} 
            type="success" 
            showIcon 
            icon={<CheckCircleOutlined />}
          />
        );
        
      case 'idle':
      default:
        return (
          <Alert
            message="软件更新"
            description={
          <div>
                <p><strong>当前版本:</strong> v{currentVersion}</p>
                <p>点击下方按钮检查是否有新版本可用</p>
          </div>
            }
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
          />
        );
    }
  };

  // 更新对话框
  const renderUpdateModal = () => {
    if (!updateInfo) return null;

    return (
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>发现新版本</span>
          </div>
        }
        open={showUpdateModal}
        onCancel={() => setShowUpdateModal(false)}
        footer={[
          <Button key="cancel" onClick={() => setShowUpdateModal(false)}>
            稍后更新
          </Button>,
          <Button 
            key="download" 
            type="primary" 
            icon={<DownloadOutlined />}
            onClick={handleDownloadUpdate}
            loading={isDownloading}
          >
            立即下载
          </Button>
        ]}
        width={500}
        bodyStyle={{ 
          maxHeight: '400px', 
          overflow: 'hidden',
          padding: '16px 24px'
        }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* 版本信息区域 - 固定高度 */}
          <div style={{ marginBottom: 16, flexShrink: 0 }}>
            <Text strong>版本信息</Text>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text>当前版本:</Text>
              <Text code>v{currentVersion}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text>新版本:</Text>
              <Text code style={{ color: '#52c41a' }}>v{updateInfo.version}</Text>
            </div>
            {updateInfo.releaseDate && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text>发布日期:</Text>
                <Text>{new Date(updateInfo.releaseDate).toLocaleDateString('zh-CN')}</Text>
              </div>
            )}
          </div>
          
          {/* 更新说明区域 - 可滚动 */}
          {updateInfo.releaseNotes && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Text strong>更新说明</Text>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ 
                maxHeight: '200px', 
                overflowY: 'auto',
                paddingRight: '8px'
              }}>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-line' }}>
                  {updateInfo.releaseNotes}
                </Paragraph>
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  };

  return (
    <>
    <Card className={className}>
      <div>
          <Title level={5}>
            <CloudDownloadOutlined /> 软件更新
          </Title>
        <div style={{ marginBottom: 16 }}>
          {renderStatusContent()}
        </div>
        <Space>
          <Button 
            type="primary"
            icon={<SyncOutlined />} 
            onClick={handleCheckForUpdates}
            loading={isChecking || status === 'checking'}
              disabled={status === 'downloading' || isDownloading}
          >
            检查更新
          </Button>
            {status === 'downloaded' && (
              <Button
                type="primary"
                onClick={handleInstallUpdate}
                icon={<RocketOutlined />}
                loading={isInstalling}
              >
                立即安装
              </Button>
            )}
        </Space>
      </div>
    </Card>
      {renderUpdateModal()}
    </>
  );
};

export default UpdateManager; 