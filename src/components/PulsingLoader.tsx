import React from 'react';

const PulsingLoader: React.FC = () => {
  return (
    <div className="pulsing-loader-container">
      <div className="pulsing-loader">
        <div className="dot"></div>
        <div className="dot"></div>
        <div className="dot"></div>
      </div>
    </div>
  );
};

export default PulsingLoader; 