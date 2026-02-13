import { Handle, Position, type Node } from '@xyflow/react';
import { memo, useState, useCallback, useEffect, useRef } from 'react';
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
  isReview?: boolean;
  agentName?: string;
  comments?: CommentThread[];
  onSubmit?: (content: string) => void;
};

export type RichTextNode = Node<RichTextNodeData>;

function RichTextNodeComponent({ data, id }: { data: RichTextNodeData; id: string }) {
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const api = useAPI();

  const isReview = data.isReview === true;
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
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

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
        placeholder: isReview
          ? 'Review content...'
          : data.placeholder || 'Ask Claude anything...',
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      ...(isReview ? [CommentMark] : []),
    ],
    content: isReview && data.plainText
      ? markdownToHtml(data.plainText)
      : (data.content || data.text || data.plainText || ''),
    onTransaction: ({ transaction }) => {
      if (isReview && transaction.docChanged) {
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
        style: 'outline: none; min-height: 80px;',
      },
      handleClick: isReview
        ? (view, pos) => {
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
          }
        : undefined,
    },
  });

  // Listen for Claude comment responses
  useEffect(() => {
    if (!isReview) return;

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
  }, [isReview, id, api, persistThreads]);

  // Compute Y positions for each thread based on their document position
  useEffect(() => {
    if (!isReview || !editor || !editorWrapperRef.current || threads.length === 0) return;

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
  }, [isReview, editor, threads]);

  // Focus comment input when it appears
  useEffect(() => {
    if (showCommentInput && commentInputRef.current) {
      commentInputRef.current.focus();
    }
  }, [showCommentInput]);

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

  const handleSubmit = () => {
    if (!editor) return;
    const content = editor.getText();
    if (content.trim()) {
      data.onSubmit?.(content);
      const parentId =
        id.startsWith('question-') ||
        id.startsWith('terminal-') ||
        id.startsWith('diagram-')
          ? undefined
          : id;
      api.askClaude(content, undefined, parentId);
      editor.commands.clearContent();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (isReview && showCommentInput) {
        handleAddComment();
      } else if (!isReview) {
        handleSubmit();
      }
    }
  };

  const accentColor = isReview ? '#facc15' : '#8b5cf6';

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: 'linear-gradient(135deg, #1e1b2e 0%, #0f0e1a 100%)',
        border: isFocused
          ? `1px solid ${accentColor}`
          : '1px solid #2d3748',
        borderRadius: '12px',
        padding: '0',
        minWidth: '400px',
        maxWidth: '600px',
        boxShadow: isFocused
          ? `0 8px 24px ${isReview ? 'rgba(250, 204, 21, 0.15)' : 'rgba(99, 102, 241, 0.2)'}, 0 0 0 1px ${isReview ? 'rgba(250, 204, 21, 0.2)' : 'rgba(99, 102, 241, 0.3)'}`
          : isHovered
          ? '0 6px 16px rgba(0, 0, 0, 0.4)'
          : '0 4px 12px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'visible',
      }}
      onKeyDown={handleKeyDown}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: accentColor,
          width: '12px',
          height: '12px',
          border: '2px solid #1e1b2e',
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #2d3748',
          background: isReview
            ? 'rgba(250, 204, 21, 0.05)'
            : 'rgba(139, 92, 246, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: accentColor,
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
              background: accentColor,
              display: 'inline-block',
            }}
          />
          {data.title || (isReview ? 'Code Review' : 'Your Question')}
        </div>

        {/* Formatting toolbar */}
        {editor && isFocused && !isReview && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              style={{
                background: editor.isActive('bold')
                  ? 'rgba(139, 92, 246, 0.2)'
                  : 'transparent',
                border: '1px solid #2d3748',
                color: editor.isActive('bold') ? '#c4b5fd' : '#94a3b8',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Bold"
            >
              B
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              style={{
                background: editor.isActive('italic')
                  ? 'rgba(139, 92, 246, 0.2)'
                  : 'transparent',
                border: '1px solid #2d3748',
                color: editor.isActive('italic') ? '#c4b5fd' : '#94a3b8',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontStyle: 'italic',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Italic"
            >
              I
            </button>
            <button
              onClick={() => editor.chain().focus().toggleCode().run()}
              style={{
                background: editor.isActive('code')
                  ? 'rgba(139, 92, 246, 0.2)'
                  : 'transparent',
                border: '1px solid #2d3748',
                color: editor.isActive('code') ? '#c4b5fd' : '#94a3b8',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontFamily: 'monospace',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Code"
            >
              {'<>'}
            </button>
            <button
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              style={{
                background: editor.isActive('codeBlock')
                  ? 'rgba(139, 92, 246, 0.2)'
                  : 'transparent',
                border: '1px solid #2d3748',
                color: editor.isActive('codeBlock') ? '#c4b5fd' : '#94a3b8',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Code Block"
            >
              {'{ }'}
            </button>
          </div>
        )}
      </div>

      {/* BubbleMenu for review mode */}
      {editor && isReview && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100, placement: 'top' }}
        >
          {showCommentInput ? (
            <div
              style={{
                display: 'flex',
                gap: '4px',
                background: '#1e1b2e',
                border: '1px solid #facc15',
                borderRadius: '6px',
                padding: '6px',
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
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  color: '#e2e8f0',
                  outline: 'none',
                  width: '200px',
                }}
              />
              <button
                onClick={handleAddComment}
                style={{
                  background: '#facc15',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '11px',
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
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
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
        className="nodrag nowheel"
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{
          padding: '20px',
          fontSize: '14px',
          color: '#e2e8f0',
          lineHeight: '1.7',
          minHeight: isReview ? '200px' : '120px',
          maxHeight: isReview ? '400px' : undefined,
          overflowY: isReview ? 'auto' : undefined,
          cursor: 'text',
        }}
      >
        <EditorContent editor={editor} style={{ outline: 'none' }} />
      </div>

      {/* Footer — only shown in non-review mode */}
      {!isReview && (
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #2d3748',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
            }}
          >
            <kbd
              style={{
                background: '#1a202c',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid #2d3748',
                fontSize: '10px',
              }}
            >
              cmd
            </kbd>
            {' + '}
            <kbd
              style={{
                background: '#1a202c',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid #2d3748',
                fontSize: '10px',
              }}
            >
              Enter
            </kbd>
            {' to submit'}
          </div>

          <button
            onClick={handleSubmit}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              border: 'none',
              color: '#ffffff',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow =
                '0 4px 12px rgba(139, 92, 246, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow =
                '0 2px 8px rgba(139, 92, 246, 0.3)';
            }}
          >
            Ask Claude
          </button>
        </div>
      )}

      {/* Review mode footer */}
      {isReview && (
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid #2d3748',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            Select text to comment
          </div>
          <div
            style={{
              fontSize: '11px',
              color: '#facc15',
              fontWeight: 600,
            }}
          >
            {threads.filter((t) => t.status === 'open').length} open
            {threads.filter((t) => t.status === 'resolved').length > 0 &&
              ` / ${threads.filter((t) => t.status === 'resolved').length} resolved`}
          </div>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: accentColor,
          width: '12px',
          height: '12px',
          border: '2px solid #1e1b2e',
        }}
      />

      {/* Comment Sidebar — only in review mode with threads */}
      {isReview && (
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
      )}
    </div>
  );
}

export default memo(RichTextNodeComponent);
