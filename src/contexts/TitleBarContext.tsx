import React, { createContext, useState, useContext, ReactNode } from 'react';

interface TitleBarContextType {
  customControls: ReactNode | null;
  setCustomControls: (controls: ReactNode | null) => void;
}

const TitleBarContext = createContext<TitleBarContextType | undefined>(undefined);

export const TitleBarProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [customControls, setCustomControls] = useState<ReactNode | null>(null);

  return (
    <TitleBarContext.Provider value={{ customControls, setCustomControls }}>
      {children}
    </TitleBarContext.Provider>
  );
};

export const useTitleBar = () => {
  const context = useContext(TitleBarContext);
  if (context === undefined) {
    throw new Error('useTitleBar must be used within a TitleBarProvider');
  }
  return context;
}; 