"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { markLiveMapSessionActive, openLiveMapPath } from "@/lib/travelAssistant/liveMapSession";

type LiveMapLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href?: string;
};

/** Link to family live map — marks an explicit user session so cold restores do not trap users. */
export function LiveMapLink({ href = openLiveMapPath(), onClick, ...props }: LiveMapLinkProps) {
  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        markLiveMapSessionActive();
        onClick?.(event);
      }}
    />
  );
}
