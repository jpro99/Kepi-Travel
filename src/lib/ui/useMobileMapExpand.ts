import { useCallback, useEffect, useState, type RefObject } from "react";

export function useMobileMapExpand(enabled: boolean): {
  expanded: boolean;
  expand: () => void;
  collapse: () => void;
} {
  const [expanded, setExpanded] = useState(false);

  const expand = useCallback((): void => {
    if (enabled) setExpanded(true);
  }, [enabled]);

  const collapse = useCallback((): void => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, collapse]);

  return { expanded, expand, collapse };
}

export function useMapResizeOnLayoutChange(
  expanded: boolean,
  mapRef: RefObject<import("maplibre-gl").Map | null>,
): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t1 = window.setTimeout(() => map.resize(), 80);
    const t2 = window.setTimeout(() => map.resize(), 320);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [expanded, mapRef]);
}
