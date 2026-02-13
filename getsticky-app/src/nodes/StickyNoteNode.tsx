import { memo, useCallback, useRef, useEffect, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { useAPI } from '../contexts/APIContext';

const STICKY_COLORS: Record<string, { bg: string; text: string }> = {
  yellow:   { bg: '#fef08a', text: '#713f12' },
  blue:     { bg: '#bfdbfe', text: '#1e3a5f' },
  purple:   { bg: '#d8b4fe', text: '#3b0764' },
  pink:     { bg: '#fbcfe8', text: '#701a3e' },
  green:    { bg: '#bbf7d0', text: '#14532d' },
  teal:     { bg: '#a5f3fc', text: '#134e4a' },
  orange:   { bg: '#fed7aa', text: '#7c2d12' },
  rose:     { bg: '#fecdd3', text: '#881337' },
  lavender: { bg: '#c4b5fd', text: '#2e1065' },
  sage:     { bg: '#d1d5c4', text: '#3f4536' },
  peach:    { bg: '#fdd8b4', text: '#6b3410' },
};

export { STICKY_COLORS };

function StickyNoteNode({ id, data, selected }: NodeProps) {
  const api = useAPI();
  const textRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [isEditing, setIsEditing] = useState(false);
  const initializedRef = useRef(false);

  const color = (data.color as string) || 'yellow';
  const palette = STICKY_COLORS[color] || STICKY_COLORS.yellow;

  // Set initial text content once on mount (not via React children)
  useEffect(() => {
    if (textRef.current && !initializedRef.current) {
      textRef.current.innerText = (data.text as string) || '';
      initializedRef.current = true;
    }
  }, []);

  // Sync text content from data prop when it changes externally
  useEffect(() => {
    if (!textRef.current || !initializedRef.current) return;
    // Only update if the div isn't focused (avoid clobbering user edits)
    if (document.activeElement !== textRef.current) {
      const currentText = textRef.current.innerText;
      const newText = (data.text as string) || '';
      if (currentText !== newText) {
        textRef.current.innerText = newText;
      }
    }
  }, [data.text]);

  const handleInput = useCallback(() => {
    if (!textRef.current) return;
    const text = textRef.current.innerText;

    // Debounce persistence
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api.updateNode({ id, data: { text } });
    }, 500);
  }, [id, api]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      style={{
        width: 200,
        minHeight: 200,
        background: palette.bg,
        color: palette.text,
        borderRadius: '2px',
        boxShadow: selected
          ? `0 4px 16px rgba(0,0,0,0.25), 0 0 0 2px ${palette.text}40`
          : '0 2px 8px rgba(0,0,0,0.15)',
        position: 'relative',
        fontFamily: "'Inter', -apple-system, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        cursor: isEditing ? 'text' : 'grab',
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* Folded corner */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 20,
          height: 20,
          background: `linear-gradient(135deg, ${palette.bg} 50%, ${palette.text}15 50%)`,
          borderTopLeftRadius: '4px',
          pointerEvents: 'none',
        }}
      />

      {/* Editable text area — no React children, text set via ref */}
      {/* nodrag/nowheel/nopan classes prevent React Flow from intercepting events */}
      <div
        ref={textRef}
        className={`nodrag${isEditing || selected ? ' nowheel nopan' : ''}`}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        data-placeholder="Type here..."
        style={{
          flex: 1,
          padding: '14px 16px',
          fontSize: '14px',
          lineHeight: '1.5',
          outline: 'none',
          cursor: 'inherit',
          wordBreak: 'break-word',
          minHeight: '170px',
        }}
      />

      {/* Placeholder style is in App.css */}
    </div>
  );
}

export default memo(StickyNoteNode);
