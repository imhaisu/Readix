import React, { forwardRef, useImperativeHandle, useRef, ReactNode, useEffect, useState } from 'react';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import styles from './ArticleListV2.module.css';

export interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (props: {
    index: number;
    style: React.CSSProperties;
    data: any;
  }) => ReactNode;
  itemData: any;
  className?: string;
  style?: React.CSSProperties;
  isInTransition?: boolean;
  overscanCount?: number;
}

export interface VirtualListHandle {
  scrollToItem: (index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start') => void;
  scrollTo: (offset: number) => void;
  scrollToTop: () => void;
  getScrollPosition: () => number;
}

function VirtualListComponent<T>(
  { 
    items,
    itemHeight,
    renderItem,
    itemData,
    className,
    style,
    isInTransition,
    overscanCount = 5
  }: VirtualListProps<T>,
  ref: React.Ref<VirtualListHandle>
) {
  const listRef = useRef<FixedSizeList>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<number | null>(null);
  
  // 处理滚动事件
  const handleScroll = () => {
    // 激活滚动状态
    setIsScrolling(true);
    
    // 清除之前的计时器
    if (scrollTimerRef.current) {
      window.clearTimeout(scrollTimerRef.current);
    }
    
    // 设置新的计时器，延迟隐藏滚动条
    scrollTimerRef.current = window.setTimeout(() => {
      setIsScrolling(false);
    }, 1000); // 滚动停止1秒后隐藏滚动条
  };

  // 清除计时器
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) {
        window.clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);
  
  useImperativeHandle(ref, () => ({
    scrollToItem: (index: number, align: 'auto' | 'smart' | 'center' | 'end' | 'start' = 'auto') => {
      if (listRef.current) {
        listRef.current.scrollToItem(index, align);
        // 触发滚动状态以显示滚动条
        handleScroll();
      }
    },
    scrollTo: (offset: number) => {
      if (listRef.current) {
        listRef.current.scrollTo(offset);
        // 触发滚动状态以显示滚动条
        handleScroll();
      }
    },
    scrollToTop: () => {
      if (listRef.current) {
        listRef.current.scrollTo(0);
        // 触发滚动状态以显示滚动条
        handleScroll();
      }
    },
    getScrollPosition: () => {
      return containerRef.current?.scrollTop ?? 0;
    }
  }), []);
  
  return (
    <div 
      ref={containerRef} 
      className={`${styles.scrollableArticleListContainer} ${isScrolling ? styles.scrolling : ''}`}
      onScroll={handleScroll} // 在容器上直接监听滚动事件
    >
      <AutoSizer>
        {({ height, width }) => (
          <FixedSizeList
            ref={listRef}
            height={height}
            width={width}
            itemCount={items.length}
            itemSize={itemHeight}
            itemData={itemData}
            overscanCount={overscanCount}
            className={`${styles.virtualList} ${className || ''}`}
            style={{ 
              ...style,
              transition: 'opacity 0.15s ease',
              opacity: isInTransition ? 0.7 : 1,
              paddingTop: 2,
              paddingBottom: 2,
            }}
          >
            {renderItem}
          </FixedSizeList>
        )}
      </AutoSizer>
    </div>
  );
}

// 使用 forwardRef 包装组件并使用泛型
const VirtualList = forwardRef(VirtualListComponent) as <T>(
  props: VirtualListProps<T> & { ref?: React.Ref<VirtualListHandle> }
) => ReturnType<typeof VirtualListComponent>;

export default VirtualList; 