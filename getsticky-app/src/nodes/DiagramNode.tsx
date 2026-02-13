import { Handle, Position, type Node } from '@xyflow/react';
import { memo, useState } from 'react';

export type DiagramNodeData = {
  title?: string;
  description?: string;
  context?: string;
  editable?: boolean;
};

export type DiagramNode = Node<DiagramNodeData>;

/**
 * DiagramNode - Architecture diagrams via native React Flow nodes + edges.
 *
 * React Flow IS the diagramming tool. This node serves as a labeled container
 * that can be connected to other nodes via edges to form architecture diagrams,
 * flowcharts, etc. No separate diagram library needed.
 */
function DiagramNodeComponent({ data, id }: { data: DiagramNodeData; id: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAskAboutDiagram = () => {
    console.log('Ask about diagram:', id);
    // TODO: Create a new RichTextNode with diagram context
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: 'linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%)',
        border: '1px solid #2d3748',
        borderRadius: '12px',
        padding: '0',
        width: isExpanded ? '500px' : '300px',
        maxWidth: isExpanded ? '500px' : '300px',
        boxShadow: isHovered
          ? '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(34, 211, 238, 0.3)'
          : '0 4px 12px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.3s ease',
        position: 'relative',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#22d3ee',
          width: '12px',
          height: '12px',
          border: '2px solid #1a1f2e',
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #2d3748',
          background: 'rgba(34, 211, 238, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#22d3ee',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#22d3ee',
              display: 'inline-block',
            }}
          />
          {data.title || 'Diagram'}
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            background: 'transparent',
            border: '1px solid #2d3748',
            color: '#94a3b8',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#475569';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#2d3748';
          }}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? '⊟' : '⊞'}
        </button>
      </div>

      {/* Description */}
      {data.description && (
        <div
          style={{
            padding: '16px 20px',
            fontSize: '13px',
            color: '#e2e8f0',
            lineHeight: '1.6',
          }}
        >
          {data.description}
        </div>
      )}

      {/* Context Info */}
      {data.context && isExpanded && (
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #2d3748',
            background: 'rgba(34, 211, 238, 0.03)',
            fontSize: '12px',
            color: '#94a3b8',
            lineHeight: '1.6',
          }}
        >
          <div style={{ fontWeight: 600, color: '#cbd5e0', marginBottom: '4px' }}>
            Context:
          </div>
          {data.context}
        </div>
      )}

      {/* Action Footer */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid #2d3748',
          display: 'flex',
          gap: '8px',
          justifyContent: 'space-between',
          alignItems: 'center',
          opacity: isHovered ? 1 : 0.7,
          transition: 'opacity 0.2s ease',
        }}
      >
        <button
          onClick={handleAskAboutDiagram}
          style={{
            background: 'rgba(34, 211, 238, 0.1)',
            border: '1px solid rgba(34, 211, 238, 0.3)',
            color: '#67e8f9',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(34, 211, 238, 0.2)';
            e.currentTarget.style.borderColor = '#22d3ee';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(34, 211, 238, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.3)';
          }}
        >
          Ask about this diagram
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#22d3ee',
          width: '12px',
          height: '12px',
          border: '2px solid #1a1f2e',
        }}
      />
    </div>
  );
}

export default memo(DiagramNodeComponent);
