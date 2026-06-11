"use client";

interface InstrumentPanelProps {
  highlights: string[];
  homeRegion: string;
  hotelPriority: string[];
}

export function InstrumentPanel({ highlights, homeRegion, hotelPriority }: InstrumentPanelProps) {
  return (
    <aside className="rounded-2xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Traveler Genome
      </h2>
      <p className="mt-1 text-sm font-medium">{homeRegion}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Hotels: {hotelPriority.slice(0, 3).join(" → ")}
      </p>
      <ul className="mt-4 space-y-2">
        {highlights.map((line) => (
          <li key={line} className="rounded-lg bg-secondary/60 px-3 py-2 text-xs leading-relaxed">
            {line}
          </li>
        ))}
      </ul>
    </aside>
  );
}
