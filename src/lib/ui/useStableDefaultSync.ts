import { useEffect, useRef } from "react";

/**
 * Re-apply default form values only when the serialized defaults change —
 * not when the parent passes a new object with the same values (common with useMemo + polling).
 */
export function useStableDefaultSync(syncKey: string, apply: () => void): void {
  const lastKeyRef = useRef<string | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (syncKey === lastKeyRef.current) return;
    lastKeyRef.current = syncKey;
    applyRef.current();
  }, [syncKey]);
}
