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
  const [platform, setPlatform] = useState<'darwin' | 'win32' | 'linux' | null>(null);

  useEffect(() => {
    const checkPlatform = async () => {
      if (window.electron && window.electron.getPlatform) {
        try {
          const currentPlatform = await window.electron.getPlatform();
          setPlatform(currentPlatform);
        } catch (error) {
          console.error("Failed to get platform:", error);
        }
      }
    };

    const checkMaximized = async () => {
      if (window.electron && window.electron.windowControls) {
        try {
          const maximized = await window.electron.windowControls.isMaximized();
          setIsMaximized(maximized);
        } catch (error) {
          console.error("Failed to check if window is maximized:", error);
        }
      }
    };

    checkPlatform();
    checkMaximized();

    const removeListener = window.electron?.onMessage('window-state-changed', (_event, state) => {
      if (state.isMaximized !== undefined) {
        setIsMaximized(state.isMaximized);
      }
    });

    return () => {
      removeListener?.();
    };
  }, []);

  const handleMinimize = () => window.electron?.windowControls.minimize();
  const handleMaximize = () => window.electron?.windowControls.maximize();
  const handleClose = () => window.electron?.windowControls.close();

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