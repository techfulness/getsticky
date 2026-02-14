import { NodeResizer, type Node } from '@xyflow/react';
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
import { useGrabToDrag, useWheelPassthroughPinch } from '../lib/gestures';

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
};

export type RichTextNode = Node<RichTextNodeData>;

function RichTextNodeComponent({ data, id, selected }: { data: RichTextNodeData; id: string; selected?: boolean }) {
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
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  useWheelPassthroughPinch(editorWrapperRef, !!selected);
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
    content: data.plainText
      ? markdownToHtml(data.plainText)
      : (data.content || data.text || ''),
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
        style: 'outline: none; min-height: 80px;',
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

  // Auto-resize title textarea
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = 'auto';
      titleRef.current.style.height = titleRef.current.scrollHeight + 'px';
    }
  }, [data.title]);

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
        height: '100%',
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
        minWidth={300}
        minHeight={200}
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
          padding: '12px 20px',
          borderBottom: '1px solid #2d3748',
          background: 'rgba(250, 204, 21, 0.05)',
          borderRadius: '12px 12px 0 0',
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
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: accentColor,
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            padding: 0,
            width: '100%',
            lineHeight: '1.4',
            fontFamily: 'inherit',
            cursor: selected ? 'text' : 'inherit',
            overflow: 'hidden',
          }}
        />
      </div>

      {/* BubbleMenu for comments */}
      {editor && (
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
        className={editableClassName}
        style={{
          padding: '20px',
          fontSize: '14px',
          color: '#e2e8f0',
          lineHeight: '1.7',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          cursor: selected ? 'text' : 'inherit',
        }}
      >
        <EditorContent editor={editor} style={{ outline: 'none' }} />
      </div>

      {/* Footer */}
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
