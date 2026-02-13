import { useReactFlow } from '@xyflow/react';
import { useAPI } from '../contexts/APIContext';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import SettingsModal from './SettingsModal';

interface ToolItem {
  id: string;
  label: string;
  icon: string;
  nodeType: string;
  defaultData: Record<string, any>;
}

const tools: ToolItem[] = [
  {
    id: 'richtext',
    label: 'Rich Text',
    icon: 'T',
    nodeType: 'richtext',
    defaultData: { content: '', placeholder: 'Start typing...' },
  },
  {
    id: 'diagramBox',
    label: 'Diagram Box',
    icon: '\u25A1',
    nodeType: 'diagramBox',
    defaultData: { label: 'New node', category: 'server' },
  },
  {
    id: 'diagram',
    label: 'Diagram Card',
    icon: '\u2B1A',
    nodeType: 'diagram',
    defaultData: { title: 'Diagram', description: '' },
  },
  {
    id: 'conversation',
    label: 'Conversation',
    icon: '\u2026',
    nodeType: 'conversation',
    defaultData: { question: '', response: '' },
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: '>_',
    nodeType: 'terminal',
    defaultData: {},
  },
];

interface CanvasToolbarProps {
  agentName?: string;
  maskedApiKey?: string;
  onSaveSettings?: (settings: { agentName?: string; apiKey?: string }) => void;
}

export default function CanvasToolbar({ agentName = 'Claude', maskedApiKey = '', onSaveSettings }: CanvasToolbarProps) {
  const { screenToFlowPosition } = useReactFlow();
  const api = useAPI();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gearHovered, setGearHovered] = useState(false);

  const handleAdd = (tool: ToolItem) => {
    // Place node at the center of the current viewport
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    api.createNode({
      type: tool.nodeType,
      position: center,
      data: { ...tool.defaultData, position: center },
    });
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        background: '#1a1f2e',
        border: '1px solid #2d3748',
        borderRadius: '10px',
        padding: '6px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {tools.map((tool) => {
        const isHovered = hoveredId === tool.id;
        return (
          <div key={tool.id} style={{ position: 'relative' }}>
            <button
              onClick={() => handleAdd(tool)}
              onMouseEnter={() => setHoveredId(tool.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isHovered ? '#2d3748' : 'transparent',
                border: 'none',
                borderRadius: '7px',
                color: isHovered ? '#e2e8f0' : '#94a3b8',
                fontSize: tool.id === 'terminal' ? '11px' : '16px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: tool.id === 'terminal' ? 'monospace' : 'inherit',
                transition: 'background 0.15s, color 0.15s',
              }}
              title={tool.label}
            >
              {tool.icon}
            </button>

            {/* Tooltip */}
            {isHovered && (
              <div
                style={{
                  position: 'absolute',
                  left: '100%',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  marginLeft: 8,
                  whiteSpace: 'nowrap',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  pointerEvents: 'none',
                }}
              >
                {tool.label}
              </div>
            )}
          </div>
        );
      })}

      {/* Separator */}
      <div
        style={{
          height: '1px',
          background: '#2d3748',
          margin: '4px 6px',
        }}
      />

      {/* Settings gear */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setSettingsOpen(true)}
          onMouseEnter={() => setGearHovered(true)}
          onMouseLeave={() => setGearHovered(false)}
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: gearHovered ? '#2d3748' : 'transparent',
            border: 'none',
            borderRadius: '7px',
            color: gearHovered ? '#e2e8f0' : '#64748b',
            fontSize: '16px',
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
          }}
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M13.5 8a5.5 5.5 0 0 0-.08-.88l1.37-1.07a.33.33 0 0 0 .08-.42l-1.3-2.26a.33.33 0 0 0-.4-.15l-1.62.65a5.2 5.2 0 0 0-1.52-.88L9.7 1.36A.33.33 0 0 0 9.37 1H6.77a.33.33 0 0 0-.33.28l-.24 1.73a5.2 5.2 0 0 0-1.52.88l-1.62-.65a.33.33 0 0 0-.4.15L1.35 5.63a.33.33 0 0 0 .08.42L2.8 7.12A5.5 5.5 0 0 0 2.72 8c0 .3.03.59.08.88L1.43 9.95a.33.33 0 0 0-.08.42l1.3 2.26c.08.14.25.2.4.15l1.62-.65c.47.36.97.66 1.52.88l.24 1.73c.02.16.17.28.33.28h2.6c.16 0 .3-.12.33-.28l.24-1.73a5.2 5.2 0 0 0 1.52-.88l1.62.65c.15.06.32 0 .4-.15l1.3-2.26a.33.33 0 0 0-.08-.42l-1.37-1.07c.05-.29.08-.58.08-.88z" />
          </svg>
        </button>

        {gearHovered && (
          <div
            style={{
              position: 'absolute',
              left: '100%',
              top: '50%',
              transform: 'translateY(-50%)',
              marginLeft: 8,
              whiteSpace: 'nowrap',
              background: '#1e293b',
              color: '#e2e8f0',
              fontSize: '12px',
              fontWeight: 500,
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid #334155',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              pointerEvents: 'none',
            }}
          >
            Settings
          </div>
        )}
      </div>

      {settingsOpen && createPortal(
        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          agentName={agentName}
          maskedApiKey={maskedApiKey}
          onSave={(settings) => {
            onSaveSettings?.(settings);
            setSettingsOpen(false);
          }}
        />,
        document.body
      )}
    </div>
  );
}
