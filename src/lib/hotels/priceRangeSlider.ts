export function clampDualPriceRange(
  minBound: number,
  maxBound: number,
  valueMin: number,
  valueMax: number,
): { min: number; max: number } {
  const floor = Math.floor(minBound);
  const ceiling = Math.ceil(maxBound);
  const min = Math.max(floor, Math.min(valueMin, valueMax - 1));
  const max = Math.min(ceiling, Math.max(valueMax, min + 1));
  return { min, max };
}

export function priceFromTrackRatio(
  minBound: number,
  maxBound: number,
  ratio: number,
): number {
  const floor = Math.floor(minBound);
  const ceiling = Math.ceil(maxBound);
  const span = Math.max(1, ceiling - floor);
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.round(floor + clamped * span);
}
