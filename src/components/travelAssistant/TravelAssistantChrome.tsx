"use client";

import { InstallPrompt } from "@/components/InstallPrompt";

export function TravelAssistantChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <InstallPrompt />
    </>
  );
}
