import type { DayLineKind } from "@/lib/travelAssistant/dayPlanLines";

export function dayLineColorClass(kind: DayLineKind): string {
  switch (kind) {
    case "travel":
      return "text-[var(--text-primary)]";
    case "hotel":
      return "text-[var(--text-primary)]";
    case "dining":
      return "text-[var(--text-secondary)]";
    case "activity":
      return "text-[var(--text-secondary)]";
    default:
      return "text-[var(--text-primary)]";
  }
}

export function reservationLineColorClass(type: string): string {
  if (type === "flight" || type === "train" || type === "ride") return dayLineColorClass("travel");
  if (type === "hotel") return dayLineColorClass("hotel");
  if (type === "dinner") return dayLineColorClass("dining");
  return dayLineColorClass("note");
}
