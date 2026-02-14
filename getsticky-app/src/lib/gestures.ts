import { useEffect, type RefObject } from 'react';

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
