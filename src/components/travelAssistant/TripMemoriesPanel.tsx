"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TripMemoryAlbum, TripMemoryPhoto } from "@/lib/travelAssistant/tripMemoryStore";
import { compressTripPhotoFile } from "@/lib/travelAssistant/tripMemoryClient";
import { downloadBlob, generateTripCollageBlob } from "@/lib/travelAssistant/tripMemoryCollage";

interface TripMemoriesPanelProps {
  tripId: string | null;
  tripName: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  shareToken?: string | null;
  /** owner = upload/delete/collage; viewer = comment only */
  mode?: "owner" | "viewer";
  className?: string;
}

function commentsForPhoto(album: TripMemoryAlbum | null, photoId: string) {
  return album?.comments.filter((comment) => comment.photoId === photoId) ?? [];
}

export function TripMemoriesPanel({
  tripId,
  tripName,
  destination,
  startDate,
  endDate,
  shareToken = null,
  mode = "owner",
  className = "",
}: TripMemoriesPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [album, setAlbum] = useState<TripMemoryAlbum | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [guestName, setGuestName] = useState("");

  const photos = useMemo(
    () => (album?.photos ?? []).filter((photo) => photo.kind !== "collage"),
    [album?.photos],
  );
  const collagePhoto = album?.photos.find((photo) => photo.kind === "collage") ?? null;
  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId) ?? photos[0] ?? null;

  const loadAlbum = useCallback(async (): Promise<void> => {
    if (!tripId && !shareToken) return;
    setLoading(true);
    setMessage(null);
    try {
      const url =
        mode === "owner" && tripId
          ? `/api/trips/memories?tripId=${encodeURIComponent(tripId)}`
          : `/api/share/memories?token=${encodeURIComponent(shareToken ?? "")}`;
      const response = await fetch(url, { credentials: "include", cache: "no-store" });
      const payload = (await response.json()) as { album?: TripMemoryAlbum; error?: string };
      if (!response.ok || !payload.album) {
        throw new Error(payload.error ?? "Could not load trip photos.");
      }
      setAlbum(payload.album);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load trip photos.");
    } finally {
      setLoading(false);
    }
  }, [mode, shareToken, tripId]);

  useEffect(() => {
    void loadAlbum();
  }, [loadAlbum]);

  useEffect(() => {
    if (!selectedPhotoId && photos[0]?.id) {
      setSelectedPhotoId(photos[0].id);
    }
  }, [photos, selectedPhotoId]);

  const handleUpload = async (file: File | null | undefined): Promise<void> => {
    if (!file || !tripId || mode !== "owner" || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const compressed = await compressTripPhotoFile(file);
      const formData = new FormData();
      formData.append("tripId", tripId);
      formData.append("file", compressed);
      const response = await fetch("/api/trips/memories", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const payload = (await response.json()) as { photo?: TripMemoryPhoto; error?: string };
      if (!response.ok || !payload.photo) {
        throw new Error(payload.error ?? "Upload failed.");
      }
      setAlbum((current) =>
        current
          ? { ...current, photos: [payload.photo!, ...current.photos] }
          : {
              tripId,
              photos: [payload.photo!],
              comments: [],
              collageUrl: null,
              collageCreatedAt: null,
            },
      );
      setSelectedPhotoId(payload.photo.id);
      setMessage("Photo added to your trip album.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleComment = async (): Promise<void> => {
    if (!selectedPhoto || !commentDraft.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "owner" && tripId) {
        const formData = new FormData();
        formData.append("action", "comment");
        formData.append("tripId", tripId);
        formData.append("photoId", selectedPhoto.id);
        formData.append("body", commentDraft.trim());
        const response = await fetch("/api/trips/memories", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const payload = (await response.json()) as { comment?: TripMemoryAlbum["comments"][number]; error?: string };
        if (!response.ok || !payload.comment) {
          throw new Error(payload.error ?? "Could not post comment.");
        }
        setAlbum((current) =>
          current ? { ...current, comments: [...current.comments, payload.comment!] } : current,
        );
      } else if (shareToken) {
        const response = await fetch(`/api/share/memories?token=${encodeURIComponent(shareToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoId: selectedPhoto.id,
            comment: commentDraft.trim(),
            authorName: guestName.trim() || undefined,
          }),
          credentials: "include",
        });
        const payload = (await response.json()) as { comment?: TripMemoryAlbum["comments"][number]; error?: string };
        if (!response.ok || !payload.comment) {
          throw new Error(payload.error ?? "Could not post comment.");
        }
        setAlbum((current) =>
          current ? { ...current, comments: [...current.comments, payload.comment!] } : current,
        );
      }
      setCommentDraft("");
      setMessage("Comment posted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not post comment.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (photoId: string): Promise<void> => {
    if (!tripId || mode !== "owner" || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/trips/memories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, photoId }),
        credentials: "include",
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Delete failed.");
      }
      setAlbum((current) =>
        current
          ? {
              ...current,
              photos: current.photos.filter((photo) => photo.id !== photoId),
              comments: current.comments.filter((comment) => comment.photoId !== photoId),
            }
          : current,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCollage = async (): Promise<void> => {
    if (!tripId || mode !== "owner" || busy || photos.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const blob = await generateTripCollageBlob({
        tripName,
        destination: destination ?? undefined,
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
        photos: photos.map((photo) => ({ url: photo.imageUrl, caption: photo.caption })),
      });
      downloadBlob(`${tripName.replace(/\s+/gu, "-")}-keepsake.jpg`, blob);

      const file = new File([blob], "kepi-keepsake.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("tripId", tripId);
      formData.append("file", file);
      formData.append("kind", "collage");
      formData.append("caption", "Trip keepsake collage");
      const response = await fetch("/api/trips/memories", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const payload = (await response.json()) as { photo?: TripMemoryPhoto; error?: string };
      if (response.ok && payload.photo) {
        setAlbum((current) =>
          current
            ? {
                ...current,
                photos: [payload.photo!, ...current.photos.filter((p) => p.kind !== "collage")],
                collageUrl: payload.photo!.imageUrl,
                collageCreatedAt: payload.photo!.uploadedAt,
              }
            : current,
        );
        setMessage("Keepsake collage saved — family on your share link can see it too.");
      } else {
        setMessage("Collage downloaded. Upload to album failed — try again from the app.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create collage.");
    } finally {
      setBusy(false);
    }
  };

  if (!tripId && !shareToken) return null;

  return (
    <section className={`space-y-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Trip photos</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {mode === "owner"
              ? "Upload moments from your trip. Family and friends on your share link can view and comment."
              : "Photos from the trip — leave a comment for the group."}
          </p>
        </div>
        {mode === "owner" ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void handleUpload(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy || !tripId}
              onClick={() => inputRef.current?.click()}
              className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {busy ? "Working…" : "Add photo"}
            </button>
          </>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-[var(--text-muted)]">Loading album…</p> : null}
      {message ? <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">{message}</p> : null}

      {collagePhoto ? (
        <div className="overflow-hidden rounded-2xl ring-1 ring-[var(--border-default)]">
          <img src={collagePhoto.imageUrl} alt="Trip keepsake collage" className="w-full object-cover" />
          <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Keepsake collage
          </p>
        </div>
      ) : null}

      {photos.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            {mode === "owner" ? "No photos yet — tap Add photo to start the album." : "No photos shared yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setSelectedPhotoId(photo.id)}
              className={`relative aspect-square overflow-hidden rounded-xl ring-2 ${
                selectedPhoto?.id === photo.id ? "ring-[var(--accent)]" : "ring-transparent"
              }`}
            >
              <img src={photo.imageUrl} alt={photo.caption || "Trip photo"} className="h-full w-full object-cover" />
              {mode === "owner" ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDelete(photo.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.stopPropagation();
                      void handleDelete(photo.id);
                    }
                  }}
                  className="absolute right-1 top-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white"
                >
                  ✕
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {selectedPhoto ? (
        <div className="rounded-2xl bg-[var(--bg-card)] p-4 ring-1 ring-[var(--border-default)]">
          <img
            src={selectedPhoto.imageUrl}
            alt={selectedPhoto.caption || "Selected trip photo"}
            className="max-h-80 w-full rounded-xl object-contain"
          />
          {selectedPhoto.caption ? (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{selectedPhoto.caption}</p>
          ) : null}
          <div className="mt-4 space-y-2">
            {commentsForPhoto(album, selectedPhoto.id).map((comment) => (
              <div key={comment.id} className="rounded-lg bg-[var(--bg-muted,#f1f5f9)] px-3 py-2 dark:bg-slate-900/60">
                <p className="text-xs font-bold text-[var(--text-primary)]">{comment.authorName}</p>
                <p className="text-sm text-[var(--text-secondary)]">{comment.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {mode === "viewer" && !shareToken ? null : mode === "viewer" ? (
              <input
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                placeholder="Your name"
                className="w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
              />
            ) : null}
            <textarea
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Leave a comment…"
              rows={2}
              className="w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy || !commentDraft.trim()}
              onClick={() => void handleComment()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              Post comment
            </button>
          </div>
        </div>
      ) : null}

      {mode === "owner" && photos.length > 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleCreateCollage()}
          className="w-full rounded-2xl border-2 border-dashed border-sky-400/70 bg-sky-50 px-4 py-4 text-sm font-bold text-sky-900 dark:bg-sky-950/30 dark:text-sky-100"
        >
          Create keepsake collage
        </button>
      ) : null}
    </section>
  );
}
