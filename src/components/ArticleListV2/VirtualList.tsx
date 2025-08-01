import React, { forwardRef, useImperativeHandle, useRef, ReactNode, useEffect } from 'react';
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
  const listOuterRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<number | null>(null);

  const handleScroll = () => {
    if (listOuterRef.current && !listOuterRef.current.classList.contains(styles.scrolling)) {
      listOuterRef.current.classList.add(styles.scrolling);
    }
    
    if (scrollTimerRef.current) {
      window.clearTimeout(scrollTimerRef.current);
    }
    
    scrollTimerRef.current = window.setTimeout(() => {
      if (listOuterRef.current) {
        listOuterRef.current.classList.remove(styles.scrolling);
      }
    }, 1500); // 滚动停止1.5秒后移除class
  };

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
      }
    },
    scrollTo: (offset: number) => {
      if (listRef.current) {
        listRef.current.scrollTo(offset);
      }
    },
    scrollToTop: () => {
      if (listRef.current) {
        listRef.current.scrollTo(0);
      }
    },
    getScrollPosition: () => {
      return listOuterRef.current?.scrollTop ?? 0;
    }
  }), []);
  
  return (
    <div className={styles.scrollableArticleListContainer}>
      <AutoSizer>
        {({ height, width }) => (
          <FixedSizeList
            ref={listRef}
            outerRef={listOuterRef}
            onScroll={handleScroll}
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