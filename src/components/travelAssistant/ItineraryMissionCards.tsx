"use client";

import { cityPhotoUrl } from "@/lib/travelAssistant/cityPhotos";
import type { TripActionItem } from "@/lib/travelAssistant/tripActionItems";

interface ItineraryMissionCardsProps {
  items: TripActionItem[];
  onAction: (item: TripActionItem) => void;
}

function cityFromHotelLabel(label: string): string {
  const match = /book hotel in (.+)/iu.exec(label);
  return match?.[1]?.trim() ?? label;
}

export function ItineraryMissionCards({ items, onAction }: ItineraryMissionCardsProps) {
  const hotelMissions = items.filter((item) => item.kind === "hotel");
  if (hotelMissions.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Missions
        </p>
        <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
          Unbooked stays — one tap to fix
        </p>
      </div>
      <div className="space-y-3">
        {hotelMissions.map((item) => {
          const city = cityFromHotelLabel(item.label);
          const photo = cityPhotoUrl(city);
          return (
            <article
              key={item.id}
              className="relative overflow-hidden rounded-3xl shadow-lg ring-1 ring-black/[0.06] dark:ring-white/[0.08]"
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `linear-gradient(135deg, rgba(15,25,35,0.82), rgba(15,25,35,0.68)), url(${photo})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
                aria-hidden
              />
              <div className="relative px-5 py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f4c95d]/90">
                  Needs booking
                </p>
                <h3 className="mt-1 text-lg font-extrabold text-white">{item.label}</h3>
                {item.detail ? (
                  <p className="mt-1 text-sm font-normal text-slate-300">{item.detail}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => onAction(item)}
                  className="mt-4 rounded-2xl bg-[#f4c95d] px-5 py-2.5 text-sm font-extrabold text-[#0F1923] shadow-md transition hover:brightness-105"
                >
                  Find hotels
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
