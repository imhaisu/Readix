import React from 'react';

interface PulsingLoaderProps {
  inline?: boolean; // 添加inline属性，用于控制是否为内联显示
  compact?: boolean; // 添加compact属性，用于控制是否为紧凑模式
}

const PulsingLoader: React.FC<PulsingLoaderProps> = ({ 
  inline = true,
  compact = true // 默认使用紧凑模式
}) => {
  // 如果是内联模式，就只返回加载指示器，不包括容器
  if (inline) {
    return (
      <div className={`pulsing-loader ${compact ? 'compact' : ''}`}>
        <div className="dot"></div>
        <div className="dot"></div>
        <div className="dot"></div>
      </div>
    );
  }
  
  return (
    <div className={`pulsing-loader-container ${compact ? 'compact' : ''}`}>
      <div className="pulsing-loader">
        <div className="dot"></div>
        <div className="dot"></div>
        <div className="dot"></div>
      </div>
    </div>
  );
};

export default PulsingLoader; 