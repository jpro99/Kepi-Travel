import { loadImageElement } from "@/lib/travelAssistant/tripMemoryClient";

export interface CollageInputPhoto {
  url: string;
  caption?: string;
}

export interface CollageOptions {
  tripName: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  photos: CollageInputPhoto[];
  columns?: number;
}

function formatHeadingDate(start?: string, end?: string): string {
  if (!start && !end) return "";
  const fmt = (value: string) =>
    new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (start && end && start !== end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return fmt(start);
  return end ? fmt(end) : "";
}

/** Build a keepsake collage PNG from trip photos (browser canvas). */
export async function generateTripCollageBlob(options: CollageOptions): Promise<Blob> {
  const sources = options.photos.filter((photo) => photo.url.trim()).slice(0, 12);
  if (sources.length === 0) {
    throw new Error("Add at least one photo before creating a collage.");
  }

  const images = await Promise.all(sources.map((photo) => loadImageElement(photo.url)));
  const columns = options.columns ?? (sources.length <= 4 ? 2 : 3);
  const rows = Math.ceil(sources.length / columns);
  const cell = 420;
  const pad = 24;
  const header = 160;
  const footer = 72;
  const width = pad * 2 + columns * cell + (columns - 1) * pad;
  const height = header + pad + rows * cell + Math.max(0, rows - 1) * pad + footer + pad;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#0f172a");
  gradient.addColorStop(1, "#1e3a8a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#e0f2fe";
  ctx.font = "bold 42px Georgia, serif";
  ctx.fillText(options.tripName.slice(0, 48), pad, 58);
  ctx.font = "24px system-ui, sans-serif";
  ctx.fillStyle = "#bae6fd";
  const subtitle = [options.destination, formatHeadingDate(options.startDate, options.endDate)]
    .filter(Boolean)
    .join(" · ");
  if (subtitle) ctx.fillText(subtitle.slice(0, 80), pad, 98);
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillStyle = "#7dd3fc";
  ctx.fillText("Kepi Travel keepsake", pad, 132);

  images.forEach((img, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = pad + col * (cell + pad);
    const y = header + pad + row * (cell + pad);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x - 4, y - 4, cell + 8, cell + 8);

    const scale = Math.max(cell / img.width, cell / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const dx = x + (cell - drawW) / 2;
    const dy = y + (cell - drawH) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cell, cell);
    ctx.clip();
    ctx.drawImage(img, dx, dy, drawW, drawH);
    ctx.restore();
  });

  ctx.fillStyle = "#94a3b8";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(`${sources.length} moment${sources.length === 1 ? "" : "s"} · kepitravel.com`, pad, height - pad);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/jpeg", 0.9);
  });
  if (!blob) throw new Error("Could not render collage.");
  return blob;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
