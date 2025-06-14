import React, { useState, useEffect } from 'react';
import { Button, Tooltip } from 'antd';
import { 
  CloseOutlined, 
  MinusOutlined, 
  BorderOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons';
import styles from './TitleBar.module.css';

interface TitleBarProps {
  customControls?: React.ReactNode;
}

const TitleBar: React.FC<TitleBarProps> = ({ customControls }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null);

  useEffect(() => {
    const checkMaximized = async () => {
      if (window.electronWindowAPI) {
        const maximized = await window.electronWindowAPI.isMaximized();
        setIsMaximized(maximized);
      }
    };
    checkMaximized();

    const fetchPlatform = async () => {
      if (window.electronAPI && window.electronAPI.getPlatform) {
        try {
          const currentPlatform = await window.electronAPI.getPlatform();
          setPlatform(currentPlatform);
        } catch (error) {
          console.error('Failed to get platform:', error);
        }
      }
    };
    fetchPlatform();
  }, []);

  const handleMinimize = () => {
    if (window.electronWindowAPI) {
      window.electronWindowAPI.minimize();
    }
  };

  const handleMaximize = async () => {
    if (window.electronWindowAPI) {
      await window.electronWindowAPI.maximize();
      const maximized = await window.electronWindowAPI.isMaximized();
      setIsMaximized(maximized);
    }
  };

  const handleClose = () => {
    if (window.electronWindowAPI) {
      window.electronWindowAPI.close();
    }
  };

  const titleBarStyleOverrides: React.CSSProperties = platform === 'darwin' 
    ? { 
        backgroundColor: 'transparent',
        borderBottom: 'none',
      } 
    : {};

  return (
    <div className={styles.titleBar} style={titleBarStyleOverrides}>
      <div className={styles.draggableRegion}> 
      </div>
      <div className={styles.customControlsContainer}>
        {customControls}
      </div>
      <div className={styles.controls}>
        {platform && platform !== 'darwin' && (
          <div className={styles.windowControls}>
            <Tooltip title="最小化">
              <Button 
                type="text" 
                icon={<MinusOutlined />} 
                onClick={handleMinimize}
                className={styles.controlButton}
              />
            </Tooltip>
            <Tooltip title={isMaximized ? "向下还原" : "最大化"}>
              <Button 
                type="text" 
                icon={isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />} 
                onClick={handleMaximize}
                className={styles.controlButton}
              />
            </Tooltip>
            <Tooltip title="关闭">
              <Button 
                type="text" 
                icon={<CloseOutlined />} 
                onClick={handleClose}
                className={`${styles.controlButton} ${styles.closeButton}`}
              />
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
};

export default TitleBar; 