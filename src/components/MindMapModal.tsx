import React, { useRef, useEffect } from 'react';
import { Modal, Spin } from 'antd';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import styles from './MindMapModal.module.css';

interface MindMapModalProps {
  open: boolean;
  markdown: string;
  onCancel: () => void;
}

const MindMapModal: React.FC<MindMapModalProps> = ({ open, markdown, onCancel }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap>();
  const transformer = useRef(new Transformer());

  const renderMindmap = () => {
    if (!svgRef.current || !markdown) return;

    if (mmRef.current) {
      mmRef.current.destroy();
    }

    const options = {
      autoFit: true,
      color: (node: any) => {
        const depth = node.state.depth;
        if (depth === 0) return '#5B21B6';
        if (depth === 1) return '#7C3AED';
        if (depth === 2) return '#A78BFA';
        return '#C4B5FD';
      },
      duration: 500,
      nodeMinHeight: 20,
      spacingVertical: 10,
      spacingHorizontal: 60,
      paddingX: 12,
      style: (id: string) => `${id} { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }`,
    };

    mmRef.current = Markmap.create(svgRef.current, options);
    
    try {
      const { root } = transformer.current.transform(markdown);
      mmRef.current.setData(root);
      mmRef.current.fit();
    } catch (e) {
      console.error('思维导图Markdown解析失败:', e);
    }
  };

  useEffect(() => {
    return () => {
      mmRef.current?.destroy();
    };
  }, []);

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title="AI 导图"
      footer={null}
      width="90vw"
      centered
      destroyOnClose
      afterOpenChange={(visible) => {
        if (visible) {
          // 在Modal完全打开后再渲染
          renderMindmap();
        }
      }}
    >
      <div className={styles.svgContainer}>
        {markdown ? (
          <svg ref={svgRef} className={styles.svg} />
        ) : (
          <div className={styles.loadingContainer}>
            <Spin size="large" />
            <p>正在生成导图...</p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default MindMapModal; 