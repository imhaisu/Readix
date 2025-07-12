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

    try {
      const { root } = transformer.current.transform(markdown);
      mmRef.current = Markmap.create(svgRef.current, options, root);
    } catch (e) {
      console.error('思维导图Markdown解析失败:', e);
    }
  };

  useEffect(() => {
    return () => {
      // 在组件卸载时执行清理
      if (mmRef.current) {
        mmRef.current.destroy();
        mmRef.current = undefined;
      }
    };
  }, []);

  const handleCancel = () => {
    // 在 Modal 关闭前手动销毁 markmap 实例
    if (mmRef.current) {
      mmRef.current.destroy();
      mmRef.current = undefined;
    }
    onCancel();
  };

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      title="AI 导图"
      footer={null}
      width="90vw"
      centered
      destroyOnHidden
      zIndex={1002}
      styles={{
        body: { padding: '16px 24px' }
      }}
      afterOpenChange={(visible) => {
        if (visible) {
          // 在Modal完全打开后再渲染，增加一个微小的延迟确保DOM尺寸可用
          setTimeout(() => {
            renderMindmap();
          }, 50);
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