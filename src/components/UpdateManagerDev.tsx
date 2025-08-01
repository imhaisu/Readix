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

interface UpdateManagerDevProps {
  className?: string;
}

const UpdateManagerDev: React.FC<UpdateManagerDevProps> = ({ className }) => {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('1.0.3');
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // 模拟获取当前版本
  useEffect(() => {
    setCurrentVersion('1.0.3');
  }, []);

  // 模拟检查更新
  const handleCheckForUpdates = async () => {
    setIsChecking(true);
    setError(null);
    setStatus('checking');
    message.loading('正在检查更新...', 0);
    
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 2000));
    message.destroy();
    
    // 模拟发现新版本
    const mockUpdateInfo = {
      version: '1.0.4',
      releaseDate: new Date().toISOString(),
      releaseNotes: '🎉 新版本发布！\n\n✨ 新功能：\n- 优化应用内更新体验\n- 改进用户界面设计\n- 增强错误处理机制\n\n🐛 修复：\n- 修复已知问题\n- 提升应用稳定性\n\n🚀 性能优化：\n- 提升启动速度\n- 优化内存使用'
    };
    
    setUpdateInfo(mockUpdateInfo);
    setStatus('available');
    setShowUpdateModal(true);
    setIsChecking(false);
  };

  // 模拟下载更新
  const handleDownloadUpdate = async () => {
    setIsDownloading(true);
    setStatus('downloading');
    setShowUpdateModal(false);
    message.loading('正在下载更新...', 0);
    
    // 模拟下载进度
    const totalSize = 150 * 1024 * 1024; // 150MB
    let downloaded = 0;
    const downloadInterval = setInterval(() => {
      downloaded += Math.random() * 1024 * 1024 * 2; // 随机增加1-3MB
      if (downloaded >= totalSize) {
        downloaded = totalSize;
        clearInterval(downloadInterval);
        
        message.destroy();
        message.success('更新下载完成！');
        setStatus('downloaded');
        setIsDownloading(false);
        return;
      }
      
      const percent = (downloaded / totalSize) * 100;
      const speed = Math.random() * 1024 * 1024 * 5 + 1024 * 1024; // 1-6MB/s
      
      setProgress({
        percent,
        bytesPerSecond: speed,
        transferred: downloaded,
        total: totalSize
      });
    }, 100);
  };

  // 模拟安装更新
  const handleInstallUpdate = async () => {
    setIsInstalling(true);
    message.loading('正在安装更新，应用将自动重启...', 0);
    
    // 模拟安装过程
    await new Promise(resolve => setTimeout(resolve, 3000));
    message.destroy();
    message.success('更新安装完成！');
    setIsInstalling(false);
    
    // 模拟应用重启
    setTimeout(() => {
      message.info('应用将重新启动以完成更新...');
    }, 1000);
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
            message="软件更新 (开发模式)"
            description={
              <div>
                <p><strong>当前版本:</strong> v{currentVersion}</p>
                <p>点击下方按钮模拟检查更新流程</p>
                <p style={{ color: '#ff4d4f', fontSize: '12px' }}>
                  ⚠️ 这是开发模式下的模拟更新，用于测试UI效果
                </p>
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
            <div style={{ flex: 1, overflow: 'hidden', marginBottom: 16 }}>
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
          
          {/* 开发模式提示 - 固定位置 */}
          <div style={{ flexShrink: 0 }}>
            <Alert
              message="开发模式提示"
              description="这是模拟的更新流程，用于测试UI效果。在实际生产环境中，这里会进行真实的更新下载和安装。"
              type="warning"
              showIcon
            />
          </div>
        </div>
      </Modal>
    );
  };

  return (
    <>
      <Card className={className}>
        <div>
          <Title level={5}>
            <CloudDownloadOutlined /> 软件更新 (开发模式)
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

export default UpdateManagerDev; 