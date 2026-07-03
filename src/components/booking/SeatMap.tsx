"use client";

import { useState, useEffect } from "react";

interface Seat {
  designator: string;
  available: boolean;
  isExit: boolean;
  isExtraLegroom: boolean;
  price: number;
  currency: string;
}

interface SeatMapRow {
  rowNumber: number;
  sections: { seats: Seat[] }[];
}

interface SeatMapCabin {
  cabinClass: string;
  rows: SeatMapRow[];
}

interface SeatMapData {
  segmentId: string;
  cabinClass: string;
  cabins: SeatMapCabin[];
}

interface SeatMapProps {
  offerId: string;
  onSelect: (seat: string | null) => void;
  selectedSeat: string | null;
}

export function SeatMap({ offerId, onSelect, selectedSeat }: SeatMapProps) {
  const [seatMaps, setSeatMaps] = useState<SeatMapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSegment, setActiveSegment] = useState(0);

  useEffect(() => {
    fetch(`/api/orders/seat-map?offerId=${encodeURIComponent(offerId)}`)
      .then(r => r.json())
      .then(d => { if (d.seatMaps) setSeatMaps(d.seatMaps); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [offerId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-[#111e33] p-6 text-center animate-pulse">
        <p className="text-slate-400 text-sm">Loading seat map…</p>
      </div>
    );
  }

  if (!seatMaps.length) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-[#111e33] px-4 py-5 text-center">
        <p className="text-slate-400 text-sm">Seat selection not available for this flight.</p>
        <p className="text-xs text-slate-500 mt-1">Seats will be assigned at check-in.</p>
      </div>
    );
  }

  const currentMap = seatMaps[activeSegment];
  if (!currentMap) return null;

  const allSeats = currentMap.cabins.flatMap(c => c.rows.flatMap(r => r.sections.flatMap(s => s.seats)));
  const hasExtraLegroom = allSeats.some(s => s.isExtraLegroom);
  const hasPaidSeats = allSeats.some(s => s.price > 0);

  return (
    <div className="space-y-4">
      {/* Segment selector */}
      {seatMaps.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {seatMaps.map((sm, i) => (
            <button key={i} type="button" onClick={() => setActiveSegment(i)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold border transition ${activeSegment === i ? "bg-[#f4c95d] border-[#f4c95d] text-[#0b1f3a]" : "border-slate-600 text-slate-400"}`}>
              Flight {i + 1} · {sm.cabinClass}
            </button>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-slate-700 border border-slate-600 inline-block" /> Available</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-[#f4c95d] inline-block" /> Selected</span>
        {hasExtraLegroom && <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-600/60 border border-blue-500 inline-block" /> Extra legroom</span>}
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-slate-800 border border-slate-700 opacity-40 inline-block" /> Taken</span>
      </div>

      {/* Seat map */}
      <div className="rounded-2xl border border-slate-700 bg-[#111e33] overflow-hidden">
        {/* Nose indicator */}
        <div className="text-center py-2 border-b border-slate-700/50">
          <span className="text-[10px] text-slate-500 uppercase tracking-widest">✈ Front of aircraft</span>
        </div>

        <div className="overflow-y-auto max-h-80 py-2">
          {currentMap.cabins.flatMap(cabin =>
            cabin.rows.map(row => {
              const allRowSeats = row.sections.flatMap(s => s.seats);
              const leftSeats = row.sections[0]?.seats ?? [];
              const middleSeats = row.sections[1]?.seats ?? [];
              const rightSeats = row.sections[2]?.seats ?? allRowSeats.slice(leftSeats.length + middleSeats.length);

              return (
                <div key={row.rowNumber} className="flex items-center gap-1 px-4 py-0.5">
                  {/* Row number */}
                  <span className="w-6 text-[10px] text-slate-600 text-right shrink-0">{row.rowNumber}</span>

                  {/* Left seats */}
                  <div className="flex gap-1">
                    {leftSeats.map(seat => (
                      <SeatButton key={seat.designator} seat={seat} selected={selectedSeat === seat.designator} onSelect={onSelect} />
                    ))}
                  </div>

                  {/* Aisle */}
                  <div className="w-4 shrink-0" />

                  {/* Middle seats */}
                  {middleSeats.length > 0 && (
                    <>
                      <div className="flex gap-1">
                        {middleSeats.map(seat => (
                          <SeatButton key={seat.designator} seat={seat} selected={selectedSeat === seat.designator} onSelect={onSelect} />
                        ))}
                      </div>
                      <div className="w-4 shrink-0" />
                    </>
                  )}

                  {/* Right seats */}
                  <div className="flex gap-1">
                    {rightSeats.map(seat => (
                      <SeatButton key={seat.designator} seat={seat} selected={selectedSeat === seat.designator} onSelect={onSelect} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {selectedSeat && (
        <div className="flex items-center justify-between rounded-2xl bg-[#f4c95d]/10 border border-[#f4c95d]/30 px-4 py-3">
          <div>
            <p className="text-sm font-black text-white">Seat {selectedSeat} selected</p>
            {(() => {
              const seat = allSeats.find(s => s.designator === selectedSeat);
              return seat?.isExtraLegroom ? <p className="text-xs text-blue-400">Extra legroom</p> :
                seat?.isExit ? <p className="text-xs text-amber-400">Exit row</p> : null;
            })()}
          </div>
          <button type="button" onClick={() => onSelect(null)}
            className="text-xs text-slate-400">Change</button>
        </div>
      )}

      {!selectedSeat && (
        <button type="button" onClick={() => onSelect("skip")}
          className="w-full text-xs text-slate-500 text-center py-2">
          Skip seat selection — assign at check-in
        </button>
      )}

      {hasPaidSeats && (
        <p className="text-[10px] text-slate-600 text-center">
          Some seats have an upgrade fee charged separately at booking.
        </p>
      )}
    </div>
  );
}

function SeatButton({ seat, selected, onSelect }: { seat: Seat; selected: boolean; onSelect: (s: string | null) => void }) {
  if (!seat.designator) return <div className="w-7 h-7" />;

  const letter = seat.designator.replace(/\d/g, "");
  const isWindow = letter === "A" || letter === "F" || letter === "K";

  return (
    <button
      type="button"
      disabled={!seat.available}
      onClick={() => onSelect(selected ? null : seat.designator)}
      title={`${seat.designator}${seat.isExtraLegroom ? " · Extra legroom" : ""}${seat.price > 0 ? ` · +$${seat.price}` : ""}`}
      className={`w-7 h-6 rounded text-[9px] font-bold transition relative ${
        selected ? "bg-[#f4c95d] text-[#0b1f3a]" :
        !seat.available ? "bg-slate-800 border border-slate-700 text-slate-700 cursor-not-allowed opacity-40" :
        seat.isExtraLegroom ? "bg-blue-600/50 border border-blue-500/60 text-blue-200 hover:bg-blue-500/60" :
        seat.isExit ? "bg-amber-600/40 border border-amber-500/50 text-amber-200 hover:bg-amber-500/50" :
        "bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600"
      }`}
    >
      {seat.designator}
      {isWindow && seat.available && !selected && (
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-sky-400/60" />
      )}
    </button>
  );
}
