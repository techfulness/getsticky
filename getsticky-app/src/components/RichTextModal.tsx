import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { marked } from 'marked';
import { useAPI } from '../contexts/APIContext';

const lowlight = createLowlight(common);

function stripHtmlTags(md: string): string {
  return md.replace(/<[^>]*>/g, '');
}

function markdownToHtml(md: string): string {
  return marked.parse(stripHtmlTags(md), { async: false }) as string;
}

interface RichTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string;
  data: {
    content?: string;
    text?: string;
    plainText?: string;
    title?: string;
    placeholder?: string;
  };
}

export default function RichTextModal({ isOpen, onClose, nodeId, data }: RichTextModalProps) {
  const api = useAPI();
  const backdropRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({ placeholder: data.placeholder || 'Start typing...' }),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: data.content
      || (data.plainText ? markdownToHtml(data.plainText) : '')
      || data.text
      || '',
    onUpdate: ({ editor }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const html = editor.getHTML();
        const text = editor.getText();
        api.updateNode({
          id: nodeId,
          data: { content: html, plainText: text },
        });
      }, 500);
    },
  });

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Cleanup debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { e.stopPropagation(); handleBackdropClick(e); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '90%',
          maxWidth: '800px',
          maxHeight: '80vh',
          background: 'linear-gradient(135deg, #1e1b2e 0%, #0f0e1a 100%)',
          border: '1px solid #2d3748',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #2d3748',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(250, 204, 21, 0.05)',
          }}
        >
          <span
            style={{
              color: '#facc15',
              fontSize: '14px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {data.title || 'Untitled'}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#e2e8f0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
          >
            &#x2715;
          </button>
        </div>

        {/* Editor */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px',
            fontSize: '14px',
            color: '#e2e8f0',
            lineHeight: '1.7',
          }}
        >
          <EditorContent editor={editor} style={{ outline: 'none' }} />
        </div>
      </div>
    </div>
  );
}
