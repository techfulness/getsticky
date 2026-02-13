import { Handle, Position, type Node } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export type TerminalNodeData = {
  title?: string;
  command?: string;
  output?: string;
  status?: 'idle' | 'running' | 'completed' | 'error';
};

export type TerminalNode = Node<TerminalNodeData>;

function TerminalNodeComponent({ data }: { data: TerminalNodeData }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Create terminal instance
    const terminal = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#e2e8f0',
        cursor: '#10b981',
        cursorAccent: '#0d1117',
        selectionBackground: 'rgba(99, 102, 241, 0.3)',
        black: '#1a202c',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#fbbf24',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#4a5568',
        brightRed: '#f87171',
        brightGreen: '#34d399',
        brightYellow: '#fcd34d',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#67e8f9',
        brightWhite: '#f7fafc',
      },
      fontFamily: 'Monaco, Menlo, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 1000,
      rows: 15,
      cols: 80,
    });

    // Create fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Mount terminal
    terminal.open(terminalRef.current);
    fitAddon.fit();

    // Store refs
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Cleanup
    return () => {
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Write content when data props change
  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) return;

    terminal.clear();
    if (data.command) {
      terminal.writeln(`\x1b[1;32m$\x1b[0m ${data.command}`);
    }
    if (data.output) {
      terminal.writeln(data.output);
    }
    if (data.status === 'running') {
      terminal.write('\x1b[1;33m⟳\x1b[0m Running...');
    } else if (data.status === 'completed') {
      terminal.writeln('\x1b[1;32m✓\x1b[0m Completed');
    } else if (data.status === 'error') {
      terminal.writeln('\x1b[1;31m✗\x1b[0m Error');
    }
  }, [data.command, data.output, data.status]);

  // Handle resize when expanded changes
  useEffect(() => {
    if (fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 300); // Wait for transition
    }
  }, [isExpanded]);

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  };

  const handleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleCopy = () => {
    if (xtermRef.current) {
      const selection = xtermRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
    }
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: 'linear-gradient(135deg, #0f1419 0%, #0d1117 100%)',
        border: '1px solid #2d3748',
        borderRadius: '12px',
        padding: '0',
        width: isExpanded ? '900px' : '600px',
        maxWidth: isExpanded ? '900px' : '600px',
        boxShadow: isHovered
          ? '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(16, 185, 129, 0.3)'
          : '0 4px 12px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.3s ease',
        position: 'relative',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#10b981',
          width: '12px',
          height: '12px',
          border: '2px solid #0f1419',
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid #2d3748',
          background: 'rgba(16, 185, 129, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#10b981',
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
              background: '#10b981',
              display: 'inline-block',
              animation: data.status === 'running' ? 'pulse 2s infinite' : 'none',
            }}
          />
          {data.title || 'Terminal Output'}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleCopy}
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
            title="Copy selection"
          >
            Copy
          </button>
          <button
            onClick={handleClear}
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
            title="Clear terminal"
          >
            Clear
          </button>
          <button
            onClick={handleExpand}
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
      </div>

      {/* Terminal */}
      <div
        style={{
          padding: '16px',
          background: '#0d1117',
          minHeight: '250px',
          height: isExpanded ? '500px' : '300px',
          transition: 'height 0.3s ease',
        }}
      >
        <div
          ref={terminalRef}
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      </div>

      {/* Status Footer */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid #2d3748',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: '#64748b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {data.status && (
            <span
              style={{
                color:
                  data.status === 'running'
                    ? '#fbbf24'
                    : data.status === 'completed'
                    ? '#10b981'
                    : data.status === 'error'
                    ? '#ef4444'
                    : '#64748b',
              }}
            >
              {data.status === 'running'
                ? '⟳ Running'
                : data.status === 'completed'
                ? '✓ Completed'
                : data.status === 'error'
                ? '✗ Error'
                : 'Idle'}
            </span>
          )}
          {data.command && (
            <span style={{ fontFamily: 'Monaco, monospace' }}>
              {data.command}
            </span>
          )}
        </div>
        <div>Claude Code Output</div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#10b981',
          width: '12px',
          height: '12px',
          border: '2px solid #0f1419',
        }}
      />

      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.3;
            }
          }
        `}
      </style>
    </div>
  );
}

export default memo(TerminalNodeComponent);
