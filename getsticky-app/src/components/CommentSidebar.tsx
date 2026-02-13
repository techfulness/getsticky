import { useState, useEffect } from 'react';
import type { CommentMessage, CommentThread } from '../types/comments';

export type { CommentMessage, CommentThread };

interface CommentCardProps {
  thread: CommentThread;
  isActive: boolean;
  isLoading: boolean;
  agentName: string;
  onThreadClick: (threadId: string) => void;
  onResolve: (threadId: string) => void;
  onAddMessage: (threadId: string, text: string) => void;
}

function CommentCard({
  thread,
  isActive,
  isLoading,
  agentName,
  onThreadClick,
  onResolve,
  onAddMessage,
}: CommentCardProps) {
  const [expanded, setExpanded] = useState(isActive);
  const [reply, setReply] = useState('');
  const isResolved = thread.status === 'resolved';

  // Auto-expand when becoming active (e.g. clicked highlighted text)
  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  const handleReply = () => {
    const text = reply.trim();
    if (!text) return;
    onAddMessage(thread.id, text);
    setReply('');
  };

  return (
    <div
      className="nowheel nodrag"
      onClick={() => onThreadClick(thread.id)}
      style={{
        width: '280px',
        background: isActive
          ? 'rgba(250, 204, 21, 0.08)'
          : 'linear-gradient(135deg, #1e1b2e 0%, #0f0e1a 100%)',
        border: isActive
          ? '1px solid rgba(250, 204, 21, 0.3)'
          : '1px solid #2d3748',
        borderRadius: '8px',
        boxShadow: isActive
          ? '0 4px 16px rgba(250, 204, 21, 0.1)'
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        opacity: isResolved ? 0.5 : 1,
        transition: 'all 0.15s ease',
        overflow: 'hidden',
        cursor: 'default',
      }}
    >
      {/* Compact header — always visible */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((prev) => !prev);
          onThreadClick(thread.id);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 10px',
          cursor: 'pointer',
          borderBottom: expanded ? '1px solid rgba(45, 55, 72, 0.5)' : 'none',
          borderLeft: '3px solid #facc15',
        }}
      >
        <span
          style={{
            fontSize: '9px',
            color: '#64748b',
            transition: 'transform 0.15s ease',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            flexShrink: 0,
            display: 'inline-block',
          }}
        >
          ▾
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '11px',
              color: '#cbd5e0',
              fontStyle: 'italic',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: '1.3',
            }}
          >
            "{thread.selectedText.length > 40
              ? thread.selectedText.slice(0, 40) + '...'
              : thread.selectedText}"
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {isLoading && (
            <span className="comment-loading-dots" style={{ marginRight: '2px' }}>
              <span className="comment-dot" />
              <span className="comment-dot" />
              <span className="comment-dot" />
            </span>
          )}
          <span
            style={{
              fontSize: '9px',
              color: '#4a5568',
              background: 'rgba(45, 55, 72, 0.5)',
              borderRadius: '8px',
              padding: '1px 5px',
            }}
          >
            {thread.messages.length}
          </span>
          {isResolved && (
            <span style={{ fontSize: '9px', color: '#10b981', fontWeight: 600 }}>
              ✓
            </span>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div
          className="nowheel"
          style={{
            padding: '8px 10px 10px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          {/* Messages */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {thread.messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  background:
                    msg.author === 'claude'
                      ? 'rgba(99, 102, 241, 0.1)'
                      : 'rgba(139, 92, 246, 0.08)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  lineHeight: '1.5',
                }}
              >
                <div
                  style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    color: msg.author === 'claude' ? '#818cf8' : '#a78bfa',
                    marginBottom: '2px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {msg.author === 'claude' ? agentName : 'You'}
                </div>
                <div style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>{msg.text}</div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.1)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11px',
                }}
              >
                <div
                  style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    color: '#818cf8',
                    marginBottom: '2px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {agentName}
                </div>
                <span className="comment-loading-dots">
                  <span className="comment-dot" />
                  <span className="comment-dot" />
                  <span className="comment-dot" />
                </span>
              </div>
            )}
          </div>

          {/* Reply input (only for open threads) */}
          {!isResolved && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ display: 'flex', gap: '3px' }}>
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.stopPropagation();
                      handleReply();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Reply..."
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    background: '#1a202c',
                    border: '1px solid #2d3748',
                    borderRadius: '4px',
                    padding: '5px 7px',
                    fontSize: '10px',
                    color: '#e2e8f0',
                    outline: 'none',
                    opacity: isLoading ? 0.5 : 1,
                  }}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReply();
                  }}
                  disabled={isLoading}
                  style={{
                    background: '#6366f1',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 7px',
                    fontSize: '9px',
                    color: '#fff',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    opacity: isLoading ? 0.5 : 1,
                  }}
                >
                  Reply
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: '4px',
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onResolve(thread.id);
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid #10b981',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '9px',
                    color: '#10b981',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Resolve
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main sidebar container ---

interface CommentSidebarProps {
  threads: CommentThread[];
  activeThreadId: string | null;
  nodeId: string;
  loadingThreadIds: Set<string>;
  threadPositions: Map<string, number>; // threadId -> Y offset for sort order
  agentName?: string;
  onThreadClick: (threadId: string) => void;
  onResolve: (threadId: string) => void;
  onAddMessage: (threadId: string, text: string) => void;
}

export default function CommentSidebar({
  threads,
  activeThreadId,
  nodeId,
  loadingThreadIds,
  threadPositions,
  agentName = 'Claude',
  onThreadClick,
  onResolve,
  onAddMessage,
}: CommentSidebarProps) {
  // Sort threads by their text position in the document
  const sortedThreads = [...threads].sort((a, b) => {
    const aY = threadPositions.get(a.id) ?? a.from;
    const bY = threadPositions.get(b.id) ?? b.from;
    return aY - bY;
  });

  return (
    <div
      className="nowheel"
      style={{
        position: 'absolute',
        right: '-300px',
        top: 0,
        width: '280px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {sortedThreads.map((thread) => (
        <CommentCard
          key={thread.id}
          thread={thread}
          isActive={thread.id === activeThreadId}
          isLoading={loadingThreadIds.has(thread.id)}
          agentName={agentName}
          onThreadClick={onThreadClick}
          onResolve={onResolve}
          onAddMessage={onAddMessage}
        />
      ))}
    </div>
  );
}
