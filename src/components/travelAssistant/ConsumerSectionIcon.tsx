"use client";

import {
  Award,
  BookOpen,
  Briefcase,
  Bug,
  Camera,
  Compass,
  CreditCard,
  FolderOpen,
  RefreshCw,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { appleIconTile } from "@/lib/ui/appleDesign";
import type { ConsumerSectionKey } from "@/lib/travelAssistant/consumerVisualChrome";

const SECTION_ICONS: Record<ConsumerSectionKey, LucideIcon> = {
  points: BookOpen,
  trips: FolderOpen,
  fit: Compass,
  cards: CreditCard,
  loyalty: Award,
  packing: Briefcase,
  family: Users,
  photos: Camera,
  bug: Bug,
  trash: Trash2,
  refresh: RefreshCw,
};

export function ConsumerSectionIcon({
  section,
  className = "h-5 w-5",
  strokeWidth = 1.85,
  tiled = false,
}: {
  section: ConsumerSectionKey;
  className?: string;
  strokeWidth?: number;
  tiled?: boolean;
}) {
  const Icon = SECTION_ICONS[section];
  const icon = <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
  if (!tiled) return icon;
  return <span className={appleIconTile}>{icon}</span>;
}
