/** Retina-sharp MapLibre tiles on high-DPI phones and laptops. */
export function getMapPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, 3);
}

/** Call after layout changes so MapLibre repaints at full resolution. */
export function bindMapResize(container: HTMLElement, map: { resize(): void }): () => void {
  const ro = new ResizeObserver(() => {
    try {
      map.resize();
    } catch {
      /* map may be removed */
    }
  });
  ro.observe(container);
  window.requestAnimationFrame(() => {
    try {
      map.resize();
    } catch {
      /* ignore */
    }
  });
  return () => ro.disconnect();
}
