"use client";

import { useCallback, useRef, useState } from "react";
import { isConfirmationScanUpload } from "@/lib/travelAssistant/scannedReservationDraft";

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf,text/html,text/plain,.html,.htm,.txt,.eml";

interface ImportConfirmationDropzoneProps {
  busy?: boolean;
  onFile: (file: File) => void;
  compact?: boolean;
  className?: string;
}

export function ImportConfirmationDropzone({
  busy = false,
  onFile,
  compact = false,
  className = "",
}: ImportConfirmationDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File | null | undefined): void => {
      setError(null);
      if (!file) return;
      if (!isConfirmationScanUpload(file)) {
        setError("Use a PDF, screenshot, HTML email, or text confirmation.");
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragOver(false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 text-center transition disabled:cursor-not-allowed disabled:opacity-60 ${
          compact ? "py-3" : "py-5"
        } ${
          dragOver
            ? "border-cyan-500 bg-cyan-50 dark:border-cyan-400 dark:bg-cyan-500/15"
            : "border-cyan-400/70 bg-cyan-50/80 hover:bg-cyan-100 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20"
        }`}
      >
        <span className="text-2xl leading-none">{busy ? "⏳" : "📄"}</span>
        <p className="text-sm font-bold text-cyan-900 dark:text-cyan-100">
          {busy ? "Reading confirmation…" : "Drop confirmation here"}
        </p>
        <p className="text-xs text-cyan-800/90 dark:text-cyan-200/90">
          {compact
            ? "PDF, screenshot, HTML email, or text"
            : "PDF, boarding pass, HTML email from your travel company, or screenshot — we’ll read every leg"}
        </p>
        {!busy ? (
          <span className="mt-1 text-[11px] font-semibold text-cyan-700 underline dark:text-cyan-300">
            or tap to browse
          </span>
        ) : null}
      </button>
      {error ? (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
