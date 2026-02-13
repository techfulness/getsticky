import { Handle, Position, type Node } from '@xyflow/react';
import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export type AgentNodeData = {
  question: string;
  response: string;
  agentName?: string;
};

export type AgentNode = Node<AgentNodeData>;

function AgentNodeComponent({ data, selected }: { data: AgentNodeData; selected?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: 'linear-gradient(135deg, #1a1f2e 0%, #0f1419 100%)',
        border: '1px solid #2d3748',
        borderRadius: '12px',
        padding: '0',
        minWidth: '400px',
        maxWidth: '600px',
        boxShadow: isHovered
          ? '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.3)'
          : '0 4px 12px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#6366f1',
          width: '12px',
          height: '12px',
          border: '2px solid #1a1f2e',
        }}
      />

      {/* Header with Question */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #2d3748',
          background: 'rgba(99, 102, 241, 0.05)',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#6366f1',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
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
              background: '#6366f1',
              display: 'inline-block',
            }}
          />
          Question
        </div>
        <div
          style={{
            fontSize: '14px',
            color: '#e2e8f0',
            fontWeight: 500,
            lineHeight: '1.5',
          }}
        >
          {data.question}
        </div>
      </div>

      {/* Response Body */}
      <div
        className={selected ? 'nowheel' : ''}
        style={{
          padding: '20px',
          fontSize: '14px',
          color: '#cbd5e0',
          lineHeight: '1.7',
          maxHeight: '400px',
          overflowY: 'auto',
        }}
      >
        {/* Agent name label */}
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#818cf8',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#818cf8',
              display: 'inline-block',
            }}
          />
          {data.agentName || 'Claude'}
        </div>
        <ReactMarkdown
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match;
              return !isInline && match ? (
                <SyntaxHighlighter
                  style={vscDarkPlus as any}
                  language={match[1]}
                  PreTag="div"
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              ) : (
                <code
                  style={{
                    background: '#2d3748',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    color: '#f7fafc',
                  }}
                  className={className}
                  {...props}
                >
                  {children}
                </code>
              );
            },
            p({ children }) {
              return (
                <p style={{ marginBottom: '12px', marginTop: '0' }}>
                  {children}
                </p>
              );
            },
            h1({ children }) {
              return (
                <h1
                  style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    marginTop: '16px',
                    marginBottom: '12px',
                    color: '#f7fafc',
                  }}
                >
                  {children}
                </h1>
              );
            },
            h2({ children }) {
              return (
                <h2
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    marginTop: '16px',
                    marginBottom: '12px',
                    color: '#f7fafc',
                  }}
                >
                  {children}
                </h2>
              );
            },
            h3({ children }) {
              return (
                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    marginTop: '12px',
                    marginBottom: '8px',
                    color: '#f7fafc',
                  }}
                >
                  {children}
                </h3>
              );
            },
            ul({ children }) {
              return (
                <ul
                  style={{
                    marginLeft: '20px',
                    marginBottom: '12px',
                    marginTop: '0',
                  }}
                >
                  {children}
                </ul>
              );
            },
            ol({ children }) {
              return (
                <ol
                  style={{
                    marginLeft: '20px',
                    marginBottom: '12px',
                    marginTop: '0',
                  }}
                >
                  {children}
                </ol>
              );
            },
            li({ children }) {
              return (
                <li style={{ marginBottom: '4px', color: '#cbd5e0' }}>
                  {children}
                </li>
              );
            },
          }}
        >
          {data.response}
        </ReactMarkdown>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#6366f1',
          width: '12px',
          height: '12px',
          border: '2px solid #1a1f2e',
        }}
      />
    </div>
  );
}

export default memo(AgentNodeComponent);
