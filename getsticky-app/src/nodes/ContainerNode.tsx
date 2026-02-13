import { NodeResizer, type Node } from '@xyflow/react';
import { memo } from 'react';

export type ContainerNodeData = {
  title?: string;
  width?: number;
  height?: number;
};

export type ContainerNode = Node<ContainerNodeData>;

function ContainerNodeComponent({ data, selected }: { data: ContainerNodeData; selected?: boolean }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '12px',
        border: selected ? '1.5px solid #475569' : '1px solid rgba(45, 55, 72, 0.6)',
        background: 'rgba(15, 14, 26, 0.3)',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={150}
        lineStyle={{
          borderColor: '#475569',
          borderWidth: 1,
        }}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: '#475569',
          border: '1px solid #64748b',
        }}
      />

      {/* Title bar */}
      {data.title && (
        <div
          style={{
            padding: '6px 12px',
            fontSize: '10px',
            fontWeight: 600,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            borderBottom: '1px solid rgba(45, 55, 72, 0.6)',
            background: 'rgba(30, 27, 46, 0.5)',
            borderRadius: '12px 12px 0 0',
            userSelect: 'none',
          }}
        >
          {data.title}
        </div>
      )}
    </div>
  );
}

export default memo(ContainerNodeComponent);
