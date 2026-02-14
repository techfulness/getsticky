import { useEffect, useRef, type RefObject } from 'react';

/**
 * Hook that implements grab-to-drag / click-to-edit for React Flow nodes.
 *
 * When the node is NOT selected, the entire surface (including editable
 * content) is draggable with a grab cursor.  A click without drag selects
 * the node; on the selection transition the hook calls `onSelectFocus(x, y)`
 * so the consumer can place the caret / focus the right element at the
 * original click position.
 *
 * Returns:
 *  - `containerOnMouseDown` – attach to the outer node wrapper
 *  - `editableClassName`    – CSS classes for editable children
 *      (`'nodrag nopan'` when selected, `''` when not)
 */
export function useGrabToDrag(
  selected: boolean | undefined,
  onSelectFocus: (x: number, y: number) => void,
) {
  const pendingClickRef = useRef<{ x: number; y: number } | null>(null);
  const wasSelectedRef = useRef(selected);
  const onSelectFocusRef = useRef(onSelectFocus);
  onSelectFocusRef.current = onSelectFocus;

  useEffect(() => {
    if (selected && !wasSelectedRef.current) {
      requestAnimationFrame(() => {
        if (!pendingClickRef.current) return;
        const { x, y } = pendingClickRef.current;
        pendingClickRef.current = null;
        onSelectFocusRef.current(x, y);
      });
    }
    wasSelectedRef.current = selected;
  }, [selected]);

  const containerOnMouseDown = (e: React.MouseEvent) => {
    if (!selected) {
      pendingClickRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const editableClassName = selected ? 'nodrag nopan' : '';

  return { containerOnMouseDown, editableClassName } as const;
}

/**
 * Hook that attaches a native wheel event listener to block regular scroll
 * from reaching React Flow (so the node content scrolls normally) while
 * letting pinch-to-zoom events propagate for canvas zoom.
 *
 * Must use native addEventListener — React's synthetic onWheel fires from
 * a delegated listener at the root, which is AFTER React Flow's native
 * listener on the viewport has already captured the event.
 *
 * Browsers report trackpad pinch as wheel events with ctrlKey === true.
 */
export function useWheelPassthroughPinch(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean = true,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) {
        e.stopPropagation();
      }
    };

    el.addEventListener('wheel', handler, { passive: true });
    return () => el.removeEventListener('wheel', handler);
  }, [ref, enabled]);
}
