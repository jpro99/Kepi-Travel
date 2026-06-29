import { useCallback, useRef } from "react";

/** Prevents auto fitBounds from fighting the user after pan/zoom. */
export function useMapUserViewport() {
  const userInteractedRef = useRef(false);
  const dataFingerprintRef = useRef("");

  const bindUserInteraction = useCallback((map: import("maplibre-gl").Map): (() => void) => {
    const mark = (event: { originalEvent?: Event }): void => {
      if (event.originalEvent) userInteractedRef.current = true;
    };
    map.on("dragstart", mark);
    map.on("zoomstart", mark);
    map.on("rotatestart", mark);
    map.on("pitchstart", mark);
    return () => {
      map.off("dragstart", mark);
      map.off("zoomstart", mark);
      map.off("rotatestart", mark);
      map.off("pitchstart", mark);
    };
  }, []);

  const shouldAutoFit = useCallback((fingerprint: string): boolean => {
    if (fingerprint !== dataFingerprintRef.current) {
      dataFingerprintRef.current = fingerprint;
      userInteractedRef.current = false;
      return true;
    }
    return !userInteractedRef.current;
  }, []);

  const allowManualFit = useCallback((): void => {
    userInteractedRef.current = false;
  }, []);

  return { bindUserInteraction, shouldAutoFit, allowManualFit };
}
