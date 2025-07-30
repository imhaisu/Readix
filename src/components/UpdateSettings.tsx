import React, { useState, useEffect } from 'react';
import { Card, Typography, Switch, InputNumber, Space, Divider, Alert } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface UpdateSettingsProps {
  className?: string;
}

interface UpdateSettings {
  autoCheck: boolean;
  checkInterval: number; // 毫秒
  downloadAutomatically: boolean;
  installAutomatically: boolean;
}

const UpdateSettings: React.FC<UpdateSettingsProps> = ({ className }) => {
  const [settings, setSettings] = useState<UpdateSettings>({
    autoCheck: true,
    checkInterval: 24 * 60 * 60 * 1000, // 24小时
    downloadAutomatically: false,
    installAutomatically: false
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 从主进程获取设置
    const loadSettings = async () => {
      if (window.electron?.getSettings) {
        try {
          const allSettings = await window.electron.getSettings();
          if (allSettings?.updates) {
            setSettings(allSettings.updates);
          }
        } catch (error) {
          console.error('加载更新设置失败:', error);
        }
      }
    };

    loadSettings();
  }, []);

  const saveSettings = async (newSettings: UpdateSettings) => {
    if (!window.electron?.getSettings || !window.electron?.saveSettings) {
      return;
    }

    setLoading(true);
    try {
      const allSettings = await window.electron.getSettings();
      const updatedSettings = {
        ...allSettings,
        updates: newSettings
      };
      
      window.electron.saveSettings(updatedSettings);
      setSettings(newSettings);
    } catch (error) {
      console.error('保存更新设置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoCheckChange = (checked: boolean) => {
    const newSettings = { ...settings, autoCheck: checked };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleCheckIntervalChange = (value: number | null) => {
    if (value && value > 0) {
      const newSettings = { ...settings, checkInterval: value * 60 * 60 * 1000 }; // 转换为毫秒
      setSettings(newSettings);
      saveSettings(newSettings);
    }
  };

  const handleDownloadAutomaticallyChange = (checked: boolean) => {
    const newSettings = { ...settings, downloadAutomatically: checked };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleInstallAutomaticallyChange = (checked: boolean) => {
    const newSettings = { ...settings, installAutomatically: checked };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const formatInterval = (milliseconds: number): number => {
    return Math.round(milliseconds / (60 * 60 * 1000)); // 转换为小时
  };

  return (
    <Card className={className}>
      <div>
        <Title level={5}><SettingOutlined /> 更新设置</Title>
        
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <div style={{ marginBottom: 8 }}>
              <Text strong>自动检查更新</Text>
            </div>
            <Text type="secondary">应用启动时和定期检查是否有新版本</Text>
            <div style={{ marginTop: 8 }}>
              <Switch 
                checked={settings.autoCheck} 
                onChange={handleAutoCheckChange}
                loading={loading}
              />
            </div>
          </div>

          <Divider />

          <div>
            <div style={{ marginBottom: 8 }}>
              <Text strong>检查间隔</Text>
            </div>
            <Text type="secondary">自动检查更新的时间间隔（小时）</Text>
            <div style={{ marginTop: 8 }}>
              <InputNumber
                min={1}
                max={168} // 一周
                value={formatInterval(settings.checkInterval)}
                onChange={handleCheckIntervalChange}
                disabled={!settings.autoCheck || loading}
                addonAfter="小时"
                style={{ width: 120 }}
              />
            </div>
          </div>

          <Divider />

          <div>
            <div style={{ marginBottom: 8 }}>
              <Text strong>自动下载更新</Text>
            </div>
            <Text type="secondary">发现新版本时自动下载（需要网络连接）</Text>
            <div style={{ marginTop: 8 }}>
              <Switch 
                checked={settings.downloadAutomatically} 
                onChange={handleDownloadAutomaticallyChange}
                loading={loading}
              />
            </div>
          </div>

          <Divider />

          <div>
            <div style={{ marginBottom: 8 }}>
              <Text strong>自动安装更新</Text>
            </div>
            <Text type="secondary">下载完成后自动安装更新（应用将重启）</Text>
            <div style={{ marginTop: 8 }}>
              <Switch 
                checked={settings.installAutomatically} 
                onChange={handleInstallAutomaticallyChange}
                loading={loading}
                disabled={!settings.downloadAutomatically}
              />
            </div>
          </div>

          <Alert
            message="注意事项"
            description="自动安装更新会导致应用重启，请确保已保存所有工作。建议在非工作时间启用此功能。"
            type="info"
            showIcon
          />
        </Space>
      </div>
    </Card>
  );
};

export default UpdateSettings; 