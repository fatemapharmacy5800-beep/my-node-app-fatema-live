import { useEffect, useState } from 'react';

// Kept tiny so the dashboard can use the same row window on desktop and mobile.
export function useVirtualWindow(itemCount: number, rowHeight: number, overscan = 6) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(360);

  useEffect(() => {
    const update = () => setViewportHeight(Math.max(240, window.innerHeight - 390));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const end = Math.min(itemCount, start + visibleCount);

  return {
    viewportHeight,
    start,
    end,
    totalHeight: itemCount * rowHeight,
    onScroll: (event: React.UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop),
  };
}