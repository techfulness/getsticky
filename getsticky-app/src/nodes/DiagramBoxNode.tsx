import { Handle, Position, type Node } from '@xyflow/react';
import { memo } from 'react';

export type DiagramBoxCategory = 'frontend' | 'server' | 'database' | 'external';

export type DiagramBoxData = {
  label: string;
  subtitle?: string;
  category?: DiagramBoxCategory;
};

export type DiagramBoxNode = Node<DiagramBoxData>;

const categoryColors: Record<DiagramBoxCategory, { border: string; bg: string; text: string }> = {
  frontend: { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)', text: '#60a5fa' },
  server: { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.08)', text: '#4ade80' },
  database: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', text: '#fbbf24' },
  external: { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.08)', text: '#a78bfa' },
};

const defaultColors = { border: '#475569', bg: 'rgba(71, 85, 105, 0.08)', text: '#94a3b8' };

function DiagramBoxNodeComponent({ data }: { data: DiagramBoxData }) {
  const colors = categoryColors[data.category || 'server'] || defaultColors;

  return (
    <div
      style={{
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        borderRadius: '6px',
        padding: '10px 16px',
        minWidth: '140px',
        maxWidth: '220px',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: colors.border,
          width: '6px',
          height: '6px',
          border: 'none',
        }}
      />

      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#e2e8f0',
          lineHeight: 1.3,
          textAlign: 'center',
        }}
      >
        {data.label}
      </div>

      {data.subtitle && (
        <div
          style={{
            fontSize: '10px',
            color: colors.text,
            marginTop: '4px',
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          {data.subtitle}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: colors.border,
          width: '6px',
          height: '6px',
          border: 'none',
        }}
      />
    </div>
  );
}

export default memo(DiagramBoxNodeComponent);
