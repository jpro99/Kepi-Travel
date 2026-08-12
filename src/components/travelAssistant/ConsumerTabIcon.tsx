"use client";

import {
  CalendarDays,
  Camera,
  Ellipsis,
  House,
  Map,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import type { ConsumerTab } from "@/lib/travelAssistant/consumerTabs";
import type { MobilePrimaryTab } from "@/components/travelAssistant/mobile/mobileShellTypes";

const CONSUMER_ICONS: Record<ConsumerTab, LucideIcon> = {
  trip: House,
  itinerary: CalendarDays,
  book: Ticket,
  map: Map,
  photos: Camera,
  more: Ellipsis,
};

const MOBILE_ICONS: Record<MobilePrimaryTab, LucideIcon> = {
  home: House,
  plan: CalendarDays,
  book: Ticket,
  map: Map,
  photos: Camera,
  more: Ellipsis,
};

export function ConsumerTabIcon({
  tab,
  className = "h-5 w-5",
  strokeWidth = 1.85,
}: {
  tab: ConsumerTab | MobilePrimaryTab;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon =
    tab in CONSUMER_ICONS
      ? CONSUMER_ICONS[tab as ConsumerTab]
      : MOBILE_ICONS[tab as MobilePrimaryTab];
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}
