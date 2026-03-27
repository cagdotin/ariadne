import { useState, useEffect } from "react";

/**
 * Track the content width of a container element via ResizeObserver.
 * Returns a pixel value that updates on resize.
 */
export function use_container_width(ref: React.RefObject<HTMLDivElement | null>): number {
  const [w, set_w] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) set_w(Math.floor(e.contentRect.width));
    });
    obs.observe(el);
    set_w(Math.floor(el.clientWidth));
    return () => obs.disconnect();
  }, [ref]);
  return w;
}
