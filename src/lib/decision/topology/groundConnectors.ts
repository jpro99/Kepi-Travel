/** Modeled ground connectors — cheaper than short-hop flights in much of Europe */

const EUROPE_TRAIN_IATA: Record<string, Record<string, { costUsd: number; hours: number; label: string }>> = {
  BRI: {
    VCE: { costUsd: 52, hours: 8, label: "Train Bari → Venice" },
    FCO: { costUsd: 38, hours: 4, label: "Train Bari → Rome" },
    MUC: { costUsd: 0, hours: 0, label: "" },
  },
  VCE: {
    MUC: { costUsd: 89, hours: 7, label: "Train Venice → Munich (via Innsbruck)" },
    FCO: { costUsd: 45, hours: 3.5, label: "Train Venice → Florence/Rome" },
    MXP: { costUsd: 35, hours: 2.5, label: "Train Venice → Milan" },
  },
  FCO: {
    MUC: { costUsd: 95, hours: 9, label: "Train Rome → Munich" },
    VCE: { costUsd: 45, hours: 3.5, label: "Train Rome → Venice" },
  },
  FLR: {
    MUC: { costUsd: 98, hours: 8, label: "Train Florence → Munich" },
    VCE: { costUsd: 42, hours: 2, label: "Train Florence → Venice" },
  },
  MUC: {
    VCE: { costUsd: 89, hours: 7, label: "Train Munich → Venice" },
    FCO: { costUsd: 95, hours: 9, label: "Train Munich → Rome" },
  },
};

export function estimateGroundConnector(
  fromIata: string,
  toIata: string,
  fromLabel: string,
  toLabel: string,
): { costUsd: number; frictionMinutes: number; label: string; detail: string } | null {
  const from = fromIata.toUpperCase();
  const to = toIata.toUpperCase();
  const row = EUROPE_TRAIN_IATA[from]?.[to] ?? EUROPE_TRAIN_IATA[to]?.[from];
  if (row && row.costUsd > 0) {
    return {
      costUsd: row.costUsd,
      frictionMinutes: Math.round(row.hours * 60),
      label: row.label,
      detail: `${row.label} · ~$${row.costUsd} · often beats a short-hop flight`,
    };
  }
  const distanceProxy = from !== to ? 75 : 0;
  if (distanceProxy <= 0) return null;
  return {
    costUsd: distanceProxy,
    frictionMinutes: 180,
    label: `Ground ${fromLabel} → ${toLabel}`,
    detail: "Regional train or bus — modeled estimate",
  };
}
