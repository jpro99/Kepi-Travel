"use client";

import Link from "next/link";
import { OfflineTravelKitView } from "@/components/travelAssistant/OfflineTravelKitView";

export function OfflineTravelKitPageClient() {
  return <OfflineTravelKitView showBackLink />;
}

export function OfflineKitLauncherLink({ className }: { className?: string }) {
  return (
    <Link href="/offline-kit" className={className}>
      Open offline travel kit
    </Link>
  );
}
