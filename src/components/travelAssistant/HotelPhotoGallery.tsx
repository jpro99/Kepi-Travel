"use client";

import { useEffect, useMemo, useState } from "react";
import type { HotelDetailMedia, HotelGalleryCategory, HotelGalleryImage } from "@/lib/hotels/hotelMedia";

type GalleryTab = "all" | HotelGalleryCategory;

interface HotelPhotoGalleryProps {
  media: HotelDetailMedia;
  loading?: boolean;
  hotelName: string;
}

function tabLabel(tab: GalleryTab): string {
  if (tab === "all") return "All";
  if (tab === "property") return "Hotel";
  if (tab === "room") return "Rooms";
  if (tab === "area") return "Area";
  return "More";
}

function filterImages(images: HotelGalleryImage[], tab: GalleryTab): HotelGalleryImage[] {
  if (tab === "all") return images;
  return images.filter((image) => image.category === tab);
}

export function HotelPhotoGallery({ media, loading = false, hotelName }: HotelPhotoGalleryProps) {
  const [tab, setTab] = useState<GalleryTab>("all");
  const [index, setIndex] = useState(0);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);

  const visibleImages = useMemo(() => filterImages(media.images, tab), [media.images, tab]);

  useEffect(() => {
    setIndex(0);
  }, [tab, media.images.length]);

  const active = visibleImages[index] ?? visibleImages[0] ?? null;
  const hasImages = media.images.length > 0;

  const goPrev = () => {
    if (visibleImages.length === 0) return;
    setIndex((value) => (value - 1 + visibleImages.length) % visibleImages.length);
  };

  const goNext = () => {
    if (visibleImages.length === 0) return;
    setIndex((value) => (value + 1) % visibleImages.length);
  };

  if (loading) {
    return (
      <div className="border-b border-slate-100 dark:border-slate-800">
        <div className="aspect-[16/10] animate-pulse bg-slate-200 dark:bg-slate-800" />
        <div className="flex gap-2 px-4 py-3">
          {[1, 2, 3, 4].map((key) => (
            <div key={key} className="h-14 w-20 shrink-0 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  if (!hasImages) {
    return (
      <div className="mx-4 mt-3 flex aspect-[16/10] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500 dark:bg-slate-900">
        Photos load from the hotel chain when you open booking
      </div>
    );
  }

  return (
    <div className="border-b border-slate-100 dark:border-slate-800">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-950">
        {active ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.url}
            alt={active.caption ? `${hotelName} — ${active.caption}` : hotelName}
            className="h-full w-full object-cover"
          />
        ) : null}

        {visibleImages.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={goPrev}
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg font-bold text-white backdrop-blur hover:bg-black/60"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={goNext}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg font-bold text-white backdrop-blur hover:bg-black/60"
            >
              ›
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/40 px-2 py-1 backdrop-blur">
              {visibleImages.slice(0, 12).map((image, dotIndex) => (
                <button
                  key={`${image.url}-${dotIndex}`}
                  type="button"
                  aria-label={`Photo ${dotIndex + 1}`}
                  onClick={() => setIndex(dotIndex)}
                  className={`h-1.5 rounded-full transition ${
                    dotIndex === index ? "w-4 bg-white" : "w-1.5 bg-white/50"
                  }`}
                />
              ))}
              {visibleImages.length > 12 ? (
                <span className="px-1 text-[10px] font-semibold text-white/80">+{visibleImages.length - 12}</span>
              ) : null}
            </div>
          </>
        ) : null}

        {active?.caption ? (
          <p className="absolute left-3 top-3 max-w-[70%] rounded-lg bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
            {active.caption}
          </p>
        ) : null}

        <p className="absolute right-3 top-3 rounded-lg bg-black/45 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
          {index + 1} / {visibleImages.length}
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 py-2">
        {(["all", "property", "room", "area"] as GalleryTab[]).map((option) => {
          const count =
            option === "all"
              ? media.images.length
              : media.images.filter((image) => image.category === option).length;
          if (option !== "all" && count === 0) return null;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold ${
                tab === option ? "bg-sky-600 text-white" : "border border-slate-300 text-slate-600"
              }`}
            >
              {tabLabel(option)} ({count})
            </button>
          );
        })}
      </div>

      {visibleImages.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {visibleImages.map((image, thumbIndex) => (
            <button
              key={`${image.url}-${thumbIndex}`}
              type="button"
              onClick={() => setIndex(thumbIndex)}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${
                thumbIndex === index ? "border-sky-500" : "border-transparent opacity-80 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      {tab === "room" && media.rooms.length > 0 ? (
        <div className="space-y-2 px-4 pb-3">
          {media.rooms.map((room) => {
            const expanded = expandedRoomId === room.id;
            return (
              <div key={room.id} className="rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setExpandedRoomId(expanded ? null : room.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{room.name}</p>
                    {room.sizeLabel ? <p className="text-[10px] text-slate-500">{room.sizeLabel}</p> : null}
                  </div>
                  <span className="text-xs text-slate-400">{expanded ? "▲" : "▼"}</span>
                </button>
                {expanded ? (
                  <div className="space-y-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                    {room.description ? (
                      <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{room.description}</p>
                    ) : null}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {room.photos.map((url) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => {
                            const matchIndex = visibleImages.findIndex((image) => image.url === url);
                            if (matchIndex >= 0) setIndex(matchIndex);
                          }}
                          className="h-20 w-28 shrink-0 overflow-hidden rounded-lg"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={room.name} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
