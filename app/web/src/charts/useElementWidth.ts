import { useEffect, useState, type RefObject } from 'react';

export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 600): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, fallback]);
  return width;
}
