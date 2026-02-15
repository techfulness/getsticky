import { NodeResizer, type Node } from '@xyflow/react';
import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { marked } from 'marked';
import { useAPI } from '../contexts/APIContext';
import CommentMark from '../extensions/CommentMark';
import CommentSidebar from '../components/CommentSidebar';
import type { CommentThread, CommentMessage } from '../types/comments';
import { useGrabToDrag } from '../lib/gestures';
import RichTextModal from '../components/RichTextModal';

const lowlight = createLowlight(common);

// Strip raw HTML tags from markdown before rendering
function stripHtmlTags(md: string): string {
  return md.replace(/<[^>]*>/g, '');
}

// Convert markdown to HTML for TipTap consumption
function markdownToHtml(md: string): string {
  return marked.parse(stripHtmlTags(md), { async: false }) as string;
}

export type RichTextNodeData = {
  content?: string;
  text?: string;
  plainText?: string;
  title?: string;
  placeholder?: string;
  agentName?: string;
  comments?: CommentThread[];
  width?: number;
  height?: number;
  inList?: boolean;
  collapsed?: boolean;
  expandedWidth?: number;
  order?: number;
  status?: string;
};

export type RichTextNode = Node<RichTextNodeData>;

// Separate component for compact list mode — avoids conditional hook calls in the main component.
function RichTextListCard({ data, id, selected }: { data: RichTextNodeData; id: string; selected?: boolean }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div
      style={{
        width: 200,
        height: 200,
        background: 'linear-gradient(135deg, #1e1b2e 0%, #0f0e1a 100%)',
        border: selected ? '1px solid #facc15' : '1px solid #2d3748',
        borderRadius: '8px',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        cursor: 'pointer',
        overflow: 'hidden',
        boxShadow: selected ? '0 4px 12px rgba(250, 204, 21, 0.15)' : '0 2px 6px rgba(0, 0, 0, 0.2)',
      }}
      onClick={() => setModalOpen(true)}
    >
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#facc15', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        {data.title || 'Rich Text'}
      </div>
      <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
        {data.plainText || data.text || (typeof data.content === 'string' ? data.content.replace(/<[^>]*>/g, '') : '') || 'Empty...'}
      </div>
      <div style={{ fontSize: '9px', color: '#475569', marginTop: 'auto' }}>
        Click to expand
      </div>
      {modalOpen && createPortal(
        <RichTextModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          nodeId={id}
          data={data}
        />,
        document.body
      )}
    </div>
  );
}

// Collapsed view — sticky-note sized (200x200), shows title + expand button
function RichTextCollapsed({ data, id, selected }: { data: RichTextNodeData; id: string; selected?: boolean }) {
  const api = useAPI();

  const handleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    api.updateNode({
      id,
      data: { collapsed: false, width: data.expandedWidth || undefined },
    });
  }, [api, id, data.expandedWidth]);

  return (
    <div
      onClick={handleExpand}
      style={{
        width: 200,
        height: 200,
        background: 'linear-gradient(135deg, #1e1b2e 0%, #0f0e1a 100%)',
        border: selected ? '1px solid #facc15' : '1px dashed #6366f1',
        borderRadius: '12px',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        cursor: 'pointer',
        overflow: 'hidden',
        boxShadow: selected
          ? '0 4px 12px rgba(250, 204, 21, 0.15)'
          : '0 2px 8px rgba(99, 102, 241, 0.15)',
        position: 'relative',
      }}
    >
      {/* Document icon */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </svg>

      {/* Title */}
      <div style={{
        color: '#facc15',
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
        lineHeight: '1.3',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const,
      }}>
        {data.title || 'Untitled'}
      </div>

      {/* Preview text */}
      <div style={{
        color: '#94a3b8',
        fontSize: '10px',
        lineHeight: '1.4',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 4,
        WebkitBoxOrient: 'vertical' as const,
        flex: 1,
      }}>
        {data.plainText || data.text || (typeof data.content === 'string' ? data.content.replace(/<[^>]*>/g, '') : '') || ''}
      </div>

      {/* Expand icon (card-level onClick handles the action) */}
      <button
        className="nodrag"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'rgba(99, 102, 241, 0.2)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '4px',
          padding: '3px 5px',
          cursor: 'pointer',
          color: '#a5b4fc',
          fontSize: '12px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Expand"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>
    </div>
  );
}

function RichTextNodeComponent({ data, id, selected }: { data: RichTextNodeData; id: string; selected?: boolean }) {
  // Render compact card when inside a list — separate component to avoid conditional hooks
  if (data.inList) {
    return <RichTextListCard data={data} id={id} selected={selected} />;
  }

  // Render collapsed (sticky-note sized) view
  if (data.collapsed) {
    return <RichTextCollapsed data={data} id={id} selected={selected} />;
  }

  return <RichTextFullEditor data={data} id={id} selected={selected} />;
}

function RichTextFullEditor({ data, id, selected }: { data: RichTextNodeData; id: string; selected?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  const api = useAPI();

  const [threads, setThreads] = useState<CommentThread[]>(data.comments || []);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [pendingSelection, setPendingSelection] = useState<{
    text: string;
    from: number;
    to: number;
  } | null>(null);
  const [loadingThreadIds, setLoadingThreadIds] = useState<Set<string>>(new Set());
  const [threadPositions, setThreadPositions] = useState<Map<string, number>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const handleSelectFocusRef = useRef<(x: number, y: number) => void>(() => {});
  const { containerOnMouseDown, editableClassName } = useGrabToDrag(selected, (...args) => handleSelectFocusRef.current(...args));

  // Persist threads to backend whenever they change
  const persistThreads = useCallback(
    (updatedThreads: CommentThread[]) => {
      api.updateNode({
        id,
        data: { comments: updatedThreads },
      });
    },
    [api, id]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: data.placeholder || 'Start typing...',
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      CommentMark,
    ],
    content: data.content
      || (data.plainText ? markdownToHtml(data.plainText) : '')
      || data.text
      || '',
    onTransaction: ({ transaction }) => {
      if (transaction.docChanged) {
        // Remap comment thread positions using the actual transaction mapping
        setThreads((prev) => {
          const updated = prev.map((thread) => ({
            ...thread,
            from: transaction.mapping.map(thread.from),
            to: transaction.mapping.map(thread.to),
          }));
          return updated;
        });
      }
    },
    editorProps: {
      attributes: {
        style: 'outline: none; min-height: 5.7em;',
      },
      handleClick: (view, pos) => {
        // Check if clicked on a comment mark
        const resolved = view.state.doc.resolve(pos);
        const marks = resolved.marks();
        const commentMarkType = view.state.schema.marks.commentMark;
        if (commentMarkType) {
          const mark = marks.find((m) => m.type === commentMarkType);
          if (mark && mark.attrs.commentId) {
            setActiveThreadId(mark.attrs.commentId);
            return true;
          }
        }
        return false;
      },
    },
  });

  // Listen for Claude comment responses
  useEffect(() => {
    const unsub = api.on('comment_claude_response', (response: any) => {
      const { node_id, thread_id, message } = response.data || response;
      if (node_id !== id) return;

      // Clear loading state
      setLoadingThreadIds((prev) => {
        const next = new Set(prev);
        next.delete(thread_id);
        return next;
      });

      setThreads((prev) => {
        const updated = prev.map((t) =>
          t.id === thread_id
            ? { ...t, messages: [...t.messages, message] }
            : t
        );
        persistThreads(updated);
        return updated;
      });
    });

    return unsub;
  }, [id, api, persistThreads]);

  // Compute Y positions for each thread based on their document position
  useEffect(() => {
    if (!editor || !editorWrapperRef.current || threads.length === 0) return;

    const computePositions = () => {
      const wrapperRect = editorWrapperRef.current?.getBoundingClientRect();
      if (!wrapperRect) return;

      const positions = new Map<string, number>();
      for (const thread of threads) {
        try {
          const coords = editor.view.coordsAtPos(thread.from);
          // Y relative to the editor wrapper top
          positions.set(thread.id, coords.top - wrapperRect.top);
        } catch {
          positions.set(thread.id, 0);
        }
      }
      setThreadPositions(positions);
    };

    // Compute after a tick so the DOM is settled
    requestAnimationFrame(computePositions);
  }, [editor, threads]);

  // Focus comment input when it appears
  useEffect(() => {
    if (showCommentInput && commentInputRef.current) {
      commentInputRef.current.focus();
    }
  }, [showCommentInput]);

  // Keep the selectFocus callback up-to-date with current editor/refs
  handleSelectFocusRef.current = (x: number, y: number) => {
    // Check if click was in the header area → focus title
    const headerRect = headerRef.current?.getBoundingClientRect();
    if (headerRect && y >= headerRect.top && y <= headerRect.bottom && titleRef.current) {
      titleRef.current.focus();
      return;
    }

    // Otherwise focus editor at click position
    if (editor) {
      const pos = editor.view.posAtCoords({ left: x, top: y });
      if (pos) {
        editor.chain().focus().setTextSelection(pos.pos).run();
      } else {
        editor.commands.focus('end');
      }
    }
  };


  // Fire Claude for a given thread
  const triggerClaude = useCallback(
    (thread: CommentThread) => {
      setLoadingThreadIds((prev) => new Set(prev).add(thread.id));
      api.askClaudeInComment(
        id,
        thread.id,
        thread.selectedText,
        thread.messages.map((m) => ({ author: m.author, text: m.text }))
      );
    },
    [api, id]
  );

  const handleAddComment = useCallback(() => {
    if (!editor || !pendingSelection || !commentText.trim()) return;

    const threadId = `thread-${Date.now()}`;
    const newThread: CommentThread = {
      id: threadId,
      selectedText: pendingSelection.text,
      from: pendingSelection.from,
      to: pendingSelection.to,
      messages: [
        {
          id: `msg-${Date.now()}`,
          author: 'user',
          text: commentText.trim(),
          createdAt: new Date().toISOString(),
        },
      ],
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    // Apply comment mark to the selection
    editor
      .chain()
      .focus()
      .setTextSelection({ from: pendingSelection.from, to: pendingSelection.to })
      .setComment(threadId)
      .run();

    setThreads((prev) => {
      const updated = [...prev, newThread];
      persistThreads(updated);
      return updated;
    });
    setActiveThreadId(threadId);
    setShowCommentInput(false);
    setCommentText('');
    setPendingSelection(null);

    // Auto-trigger Claude
    triggerClaude(newThread);
  }, [editor, pendingSelection, commentText, persistThreads, triggerClaude]);

  const handleResolve = useCallback(
    (threadId: string) => {
      setThreads((prev) => {
        const updated = prev.map((t) =>
          t.id === threadId ? { ...t, status: 'resolved' as const } : t
        );
        persistThreads(updated);
        return updated;
      });
    },
    [persistThreads]
  );

  const handleAddMessage = useCallback(
    (threadId: string, text: string) => {
      const msg: CommentMessage = {
        id: `msg-${Date.now()}`,
        author: 'user',
        text,
        createdAt: new Date().toISOString(),
      };

      setThreads((prev) => {
        const updated = prev.map((t) =>
          t.id === threadId ? { ...t, messages: [...t.messages, msg] } : t
        );
        persistThreads(updated);

        // Auto-trigger Claude with the updated thread
        const updatedThread = updated.find((t) => t.id === threadId);
        if (updatedThread) {
          triggerClaude(updatedThread);
        }

        return updated;
      });
    },
    [persistThreads, triggerClaude]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (showCommentInput) {
        handleAddComment();
      }
    }
  };

  const accentColor = '#facc15';

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={containerOnMouseDown}
      style={{
        background: 'linear-gradient(135deg, #1e1b2e 0%, #0f0e1a 100%)',
        border: selected
          ? `1px solid ${accentColor}`
          : '1px solid #2d3748',
        borderRadius: '12px',
        padding: '0',
        width: '100%',
        cursor: selected ? 'default' : 'grab',
        boxShadow: selected
          ? '0 8px 24px rgba(250, 204, 21, 0.15), 0 0 0 1px rgba(250, 204, 21, 0.2)'
          : isHovered
          ? '0 6px 16px rgba(0, 0, 0, 0.4)'
          : '0 4px 12px rgba(0, 0, 0, 0.3)',
        transition: 'box-shadow 0.2s ease, border 0.2s ease',
        position: 'relative',
        overflow: 'visible',
        display: 'flex',
        flexDirection: 'column',
      }}
      onKeyDown={handleKeyDown}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={150}
        minHeight={50}
        lineStyle={{
          borderColor: 'transparent',
          borderWidth: 6,
          background: 'transparent',
        }}
        handleStyle={{
          width: 0,
          height: 0,
          opacity: 0,
          border: 'none',
        }}
      />
      {/* Header */}
      <div
        ref={headerRef}
        style={{
          padding: '1.5cqw 2.5cqw',
          borderBottom: '1px solid #2d3748',
          background: 'rgba(250, 204, 21, 0.05)',
          borderRadius: '12px 12px 0 0',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '1cqw',
        }}
      >
        <textarea
          ref={titleRef}
          className={editableClassName}
          value={data.title || ''}
          placeholder="Untitled"
          rows={1}
          onChange={(e) => {
            api.updateNode({ id, data: { title: e.target.value } });
          }}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: accentColor,
            fontSize: '1.375cqw',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.0625cqw',
            padding: 0,
            flex: 1,
            lineHeight: '1.4',
            fontFamily: 'inherit',
            cursor: selected ? 'text' : 'inherit',
            fieldSizing: 'content',
          }}
        />
        {/* Collapse button */}
        <button
          className="nodrag"
          onClick={(e) => {
            e.stopPropagation();
            const currentWidth = containerRef.current?.getBoundingClientRect().width;
            api.updateNode({
              id,
              data: {
                collapsed: true,
                expandedWidth: currentWidth ? Math.round(currentWidth) : data.width,
              },
            });
          }}
          style={{
            background: 'rgba(100, 116, 139, 0.2)',
            border: '1px solid rgba(100, 116, 139, 0.3)',
            borderRadius: '0.5cqw',
            padding: '0.375cqw 0.5cqw',
            cursor: 'pointer',
            color: '#94a3b8',
            fontSize: '1.25cqw',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          title="Collapse to card"
        >
          <svg width="1.25cqw" height="1.25cqw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.25cqw', height: '1.25cqw' }}>
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>

      {/* BubbleMenu for comments */}
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{
            duration: 100,
            placement: 'top',
            appendTo: () => containerRef.current || document.body,
          }}
        >
          {showCommentInput ? (
            <div
              style={{
                display: 'flex',
                gap: '0.5cqw',
                background: '#1e1b2e',
                border: '1px solid #facc15',
                borderRadius: '0.75cqw',
                padding: '0.75cqw',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              }}
            >
              <input
                ref={commentInputRef}
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAddComment();
                  }
                  if (e.key === 'Escape') {
                    setShowCommentInput(false);
                    setCommentText('');
                    setPendingSelection(null);
                  }
                }}
                placeholder="Add comment..."
                style={{
                  background: '#0f0e1a',
                  border: '1px solid #2d3748',
                  borderRadius: '0.5cqw',
                  padding: '0.5cqw 1cqw',
                  fontSize: '1.5cqw',
                  color: '#e2e8f0',
                  outline: 'none',
                  width: '25cqw',
                }}
              />
              <button
                onClick={handleAddComment}
                style={{
                  background: '#facc15',
                  border: 'none',
                  borderRadius: '0.5cqw',
                  padding: '0.5cqw 1.25cqw',
                  fontSize: '1.375cqw',
                  color: '#0f0e1a',
                  cursor: 'pointer',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                const { from, to } = editor.state.selection;
                const text = editor.state.doc.textBetween(from, to, ' ');
                if (text.trim()) {
                  setPendingSelection({ text, from, to });
                  setShowCommentInput(true);
                }
              }}
              style={{
                background: 'linear-gradient(135deg, #facc15 0%, #f59e0b 100%)',
                border: 'none',
                borderRadius: '0.75cqw',
                padding: '0.75cqw 1.75cqw',
                fontSize: '1.5cqw',
                color: '#0f0e1a',
                cursor: 'pointer',
                fontWeight: 700,
                boxShadow: '0 2px 8px rgba(250, 204, 21, 0.3)',
              }}
            >
              Comment
            </button>
          )}
        </BubbleMenu>
      )}

      {/* Editor */}
      <div
        ref={editorWrapperRef}
        className={editableClassName}
        style={{
          padding: '1.5cqw',
          fontSize: '1.2cqw',
          color: '#e2e8f0',
          lineHeight: '1.7',
          cursor: selected ? 'text' : 'inherit',
        }}
      >
        <EditorContent editor={editor} style={{ outline: 'none' }} />
      </div>

      {/* Footer */}
      <div
          style={{
            padding: '1.25cqw 2.5cqw',
            borderTop: '1px solid #2d3748',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '1.375cqw', color: '#64748b' }}>
            Select text to comment
          </div>
          <div
            style={{
              fontSize: '1.375cqw',
              color: '#facc15',
              fontWeight: 600,
            }}
          >
            {threads.filter((t) => t.status === 'open').length} open
            {threads.filter((t) => t.status === 'resolved').length > 0 &&
              ` / ${threads.filter((t) => t.status === 'resolved').length} resolved`}
          </div>
        </div>

      {/* Comment Sidebar */}
      <CommentSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        nodeId={id}
        loadingThreadIds={loadingThreadIds}
        threadPositions={threadPositions}
        agentName={data.agentName}
        onThreadClick={setActiveThreadId}
        onResolve={handleResolve}
        onAddMessage={handleAddMessage}
      />
    </div>
  );
}

export default memo(RichTextNodeComponent);
