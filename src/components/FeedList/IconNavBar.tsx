import React from 'react';
import { Tooltip } from 'antd';
import {
  CalendarFilled,
  AppstoreFilled,
  ReadFilled,
  ClockCircleFilled
} from '@ant-design/icons';
import styles from './IconNavBar.module.css';

interface IconNavBarProps {
  todayCount: number;
  allCount: number;
  notesCount: number;
  readLaterCount: number;
  activeNavItem: string;
  onNavItemClick: (key: string) => void;
}

const IconNavBar: React.FC<IconNavBarProps> = ({
  todayCount,
  allCount,
  notesCount,
  readLaterCount,
  activeNavItem,
  onNavItemClick
}) => {
  return (
    <div className={styles.iconNavBar}>
      <Tooltip title="今日文章" placement="bottom">
        <div 
          className={`${styles.iconNavItem} ${activeNavItem === 'today' ? styles.iconNavItemActive : ''} ${styles.todayItem}`}
          onClick={() => onNavItemClick('today')}
        >
          <CalendarFilled className={styles.iconNavIcon} />
          <span className={styles.iconNavCount}>{todayCount > 99 ? '99+' : todayCount}</span>
        </div>
      </Tooltip>
      
      <Tooltip title="所有文章" placement="bottom">
        <div 
          className={`${styles.iconNavItem} ${activeNavItem === 'all' ? styles.iconNavItemActive : ''} ${styles.allItem}`}
          onClick={() => onNavItemClick('all')}
        >
          <AppstoreFilled className={styles.iconNavIcon} />
          <span className={styles.iconNavCount}>{allCount > 99 ? '99+' : allCount}</span>
        </div>
      </Tooltip>
      
      <Tooltip title="我的笔记" placement="bottom">
        <div 
          className={`${styles.iconNavItem} ${activeNavItem === 'notes' ? styles.iconNavItemActive : ''} ${styles.notesItem}`}
          onClick={() => onNavItemClick('notes')}
        >
          <ReadFilled className={styles.iconNavIcon} />
          <span className={styles.iconNavCount}>{notesCount}</span>
        </div>
      </Tooltip>
      
      <Tooltip title="稍后阅读" placement="bottom">
        <div 
          className={`${styles.iconNavItem} ${activeNavItem === 'readlater' ? styles.iconNavItemActive : ''} ${styles.readLaterItem}`}
          onClick={() => onNavItemClick('readlater')}
        >
          <ClockCircleFilled className={styles.iconNavIcon} />
          <span className={styles.iconNavCount}>{readLaterCount}</span>
        </div>
      </Tooltip>
    </div>
  );
};

export default IconNavBar; 