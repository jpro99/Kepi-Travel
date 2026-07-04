"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TripMemoryAlbum, TripMemoryPhoto } from "@/lib/travelAssistant/tripMemoryStore";
import { prepareTripPhotoForUpload } from "@/lib/travelAssistant/tripMemoryClient";
import { downloadBlob, generateTripCollageBlob } from "@/lib/travelAssistant/tripMemoryCollage";

const TRIP_PHOTO_ACCEPT =
  "image/*,.heic,.heif,.HEIC,.HEIF,image/heic,image/heif,image/jpeg,image/png,image/webp";

interface TripMemoriesPanelProps {
  tripId: string | null;
  tripName: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  shareToken?: string | null;
  /** owner = upload/delete/collage; viewer = comment + pick-your-own collage */
  mode?: "owner" | "viewer";
  /** Hide section title when embedded in the dedicated Photos tab */
  hideTitle?: boolean;
  className?: string;
}

const MAX_COLLAGE_PHOTOS = 12;

function guestNameStorageKey(shareToken: string): string {
  return `kepi-trip-memory-name:${shareToken}`;
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
  hideTitle = false,
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
  const [pickMode, setPickMode] = useState(false);
  const [selectedForCollage, setSelectedForCollage] = useState<string[]>([]);

  const photos = useMemo(
    () => (album?.photos ?? []).filter((photo) => photo.kind !== "collage"),
    [album?.photos],
  );
  const collages = useMemo(
    () => (album?.photos ?? []).filter((photo) => photo.kind === "collage"),
    [album?.photos],
  );
  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId) ?? photos[0] ?? null;

  useEffect(() => {
    if (!shareToken || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(guestNameStorageKey(shareToken));
    if (saved) setGuestName(saved);
  }, [shareToken]);

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

  const toggleCollagePick = (photoId: string): void => {
    setSelectedForCollage((current) => {
      if (current.includes(photoId)) {
        return current.filter((id) => id !== photoId);
      }
      if (current.length >= MAX_COLLAGE_PHOTOS) {
        setMessage(`Pick up to ${MAX_COLLAGE_PHOTOS} photos for one collage.`);
        return current;
      }
      return [...current, photoId];
    });
  };

  const exitPickMode = (): void => {
    setPickMode(false);
    setSelectedForCollage([]);
  };

  const handleUpload = async (file: File | null | undefined): Promise<void> => {
    if (!file || !tripId || mode !== "owner" || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const compressed = await prepareTripPhotoForUpload(file);
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
        const trimmedName = guestName.trim();
        if (trimmedName && typeof window !== "undefined") {
          window.localStorage.setItem(guestNameStorageKey(shareToken), trimmedName);
        }
        const response = await fetch(`/api/share/memories?token=${encodeURIComponent(shareToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoId: selectedPhoto.id,
            comment: commentDraft.trim(),
            authorName: trimmedName || undefined,
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
              collageUrl: current.photos.some((p) => p.kind === "collage" && p.id !== photoId)
                ? current.collageUrl
                : null,
              collageCreatedAt: current.photos.some((p) => p.kind === "collage" && p.id !== photoId)
                ? current.collageCreatedAt
                : null,
            }
          : current,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const uploadCollage = async (
    blob: Blob,
    sourcePhotoIds: string[],
    creatorLabel: string,
  ): Promise<TripMemoryPhoto | null> => {
    const file = new File([blob], "kepi-keepsake.jpg", { type: "image/jpeg" });
    const caption = `Keepsake by ${creatorLabel}${sourcePhotoIds.length ? ` · ${sourcePhotoIds.length} photos` : ""}`;

    if (mode === "owner" && tripId) {
      const formData = new FormData();
      formData.append("tripId", tripId);
      formData.append("file", file);
      formData.append("kind", "collage");
      formData.append("caption", caption);
      formData.append("photoIds", JSON.stringify(sourcePhotoIds));
      const response = await fetch("/api/trips/memories", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const payload = (await response.json()) as { photo?: TripMemoryPhoto; error?: string };
      if (!response.ok || !payload.photo) {
        throw new Error(payload.error ?? "Could not save collage to album.");
      }
      return payload.photo;
    }

    if (shareToken) {
      const trimmedName = creatorLabel.trim();
      if (trimmedName && typeof window !== "undefined") {
        window.localStorage.setItem(guestNameStorageKey(shareToken), trimmedName);
      }
      const formData = new FormData();
      formData.append("action", "collage");
      formData.append("file", file);
      formData.append("photoIds", JSON.stringify(sourcePhotoIds));
      formData.append("authorName", trimmedName);
      const response = await fetch(`/api/share/memories?token=${encodeURIComponent(shareToken)}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const payload = (await response.json()) as { photo?: TripMemoryPhoto; error?: string };
      if (!response.ok || !payload.photo) {
        throw new Error(payload.error ?? "Could not save collage.");
      }
      return payload.photo;
    }

    return null;
  };

  const handleCreateCollage = async (): Promise<void> => {
    const sourceIds =
      selectedForCollage.length > 0
        ? selectedForCollage
        : photos.slice(0, MAX_COLLAGE_PHOTOS).map((photo) => photo.id);
    const sourcePhotos = photos.filter((photo) => sourceIds.includes(photo.id));
    if (busy || sourcePhotos.length === 0) return;

    const creatorLabel =
      mode === "viewer" ? guestName.trim() || "Guest" : "You";

    setBusy(true);
    setMessage(null);
    try {
      const blob = await generateTripCollageBlob({
        tripName,
        destination: destination ?? undefined,
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
        creatorName: mode === "viewer" ? creatorLabel : undefined,
        photos: sourcePhotos.map((photo) => ({ url: photo.imageUrl, caption: photo.caption })),
      });
      downloadBlob(`${tripName.replace(/\s+/gu, "-")}-keepsake.jpg`, blob);

      const saved = await uploadCollage(blob, sourceIds, creatorLabel);
      if (saved) {
        setAlbum((current) =>
          current
            ? {
                ...current,
                photos: [saved, ...current.photos],
                collageUrl: saved.imageUrl,
                collageCreatedAt: saved.uploadedAt,
              }
            : current,
        );
        exitPickMode();
        setMessage(
          mode === "owner"
            ? "Keepsake collage saved — everyone on your share link can see it."
            : "Your collage is saved for the group to enjoy.",
        );
      } else {
        setMessage("Collage downloaded to your device.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create collage.");
    } finally {
      setBusy(false);
    }
  };

  if (!tripId && !shareToken) return null;

  const collageSelectionCount = selectedForCollage.length;
  const canCreateCollage = photos.length > 0 && (pickMode ? collageSelectionCount > 0 : true);

  return (
    <section className={`space-y-4 ${className}`}>
      {hideTitle ? (
        mode === "owner" ? (
          <div className="flex justify-end">
            <input
              ref={inputRef}
              type="file"
              accept={TRIP_PHOTO_ACCEPT}
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
          </div>
        ) : null
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Trip photos</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {mode === "owner"
                ? "Upload moments from your trip. Family and friends on your share link can view, comment, and build their own collages."
                : "Photos from the trip — comment or pick your favorites to build a keepsake collage."}
            </p>
          </div>
          {mode === "owner" ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={TRIP_PHOTO_ACCEPT}
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
      )}

      {loading ? <p className="text-sm text-[var(--text-muted)]">Loading album…</p> : null}
      {message ? (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
          {message}
        </p>
      ) : null}

      {collages.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Keepsake collages
          </p>
          {collages.map((collage) => (
            <div key={collage.id} className="overflow-hidden rounded-2xl ring-1 ring-[var(--border-default)]">
              <img src={collage.imageUrl} alt="Trip keepsake collage" className="w-full object-cover" />
              <div className="flex items-center justify-between gap-2 px-4 py-2">
                <p className="text-xs text-[var(--text-secondary)]">
                  {collage.caption || `By ${collage.uploadedByName}`}
                </p>
                {mode === "owner" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(collage.id)}
                    className="text-xs font-semibold text-red-600"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {photos.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            {mode === "owner" ? "No photos yet — tap Add photo to start the album." : "No photos shared yet."}
          </p>
        </div>
      ) : (
        <>
          {pickMode ? (
            <p className="text-sm font-medium text-sky-800 dark:text-sky-200">
              Tap photos to include ({collageSelectionCount}/{MAX_COLLAGE_PHOTOS} selected)
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((photo) => {
              const picked = selectedForCollage.includes(photo.id);
              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => {
                    if (pickMode) {
                      toggleCollagePick(photo.id);
                    } else {
                      setSelectedPhotoId(photo.id);
                    }
                  }}
                  className={`relative aspect-square overflow-hidden rounded-xl ring-2 ${
                    pickMode
                      ? picked
                        ? "ring-sky-500"
                        : "ring-transparent"
                      : selectedPhoto?.id === photo.id
                        ? "ring-[var(--accent)]"
                        : "ring-transparent"
                  }`}
                >
                  <img src={photo.imageUrl} alt={photo.caption || "Trip photo"} className="h-full w-full object-cover" />
                  {pickMode && picked ? (
                    <span className="absolute left-1 top-1 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      ✓
                    </span>
                  ) : null}
                  {mode === "owner" && !pickMode ? (
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
              );
            })}
          </div>
        </>
      )}

      {selectedPhoto && !pickMode ? (
        <div className="rounded-2xl bg-[var(--bg-card)] p-4 ring-1 ring-[var(--border-default)]">
          <img
            src={selectedPhoto.imageUrl}
            alt={selectedPhoto.caption || "Selected trip photo"}
            className="max-h-80 w-full rounded-xl object-contain"
          />
          {selectedPhoto.caption ? (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{selectedPhoto.caption}</p>
          ) : null}
          {mode === "owner" && selectedPhoto.printImageUrl && selectedPhoto.kind === "photo" ? (
            <a
              href={selectedPhoto.printImageUrl}
              download={`${tripName.replace(/\s+/gu, "-")}-print.jpg`}
              className="mt-3 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
            >
              Download print version
            </a>
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
            {mode === "viewer" && shareToken ? (
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

      {photos.length > 0 ? (
        <div className="space-y-2">
          {!pickMode ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPickMode(true);
                setSelectedForCollage([]);
                setMessage(null);
              }}
              className="w-full rounded-2xl border-2 border-dashed border-sky-400/70 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-900 dark:bg-sky-950/30 dark:text-sky-100"
            >
              Pick photos for a keepsake collage
            </button>
          ) : (
            <>
              {mode === "viewer" && shareToken ? (
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  placeholder="Your name (shown on the collage)"
                  className="w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
                />
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !canCreateCollage}
                  onClick={() => void handleCreateCollage()}
                  className="flex-1 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {busy
                    ? "Building…"
                    : collageSelectionCount > 0
                      ? `Create collage (${collageSelectionCount} photos)`
                      : "Create collage"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={exitPickMode}
                  className="rounded-2xl border border-[var(--border-default)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
