import type { DayLineKind } from "@/lib/travelAssistant/dayPlanLines";

export function dayLineColorClass(kind: DayLineKind): string {
  switch (kind) {
    case "travel":
      return "text-[#1e4a7a]";
    case "hotel":
      return "text-[#166534]";
    case "dining":
      return "text-[#b45309]";
    case "activity":
      return "text-[#6d28d9]";
    default:
      return "text-[#1c1917]";
  }
}

export function reservationLineColorClass(type: string): string {
  if (type === "flight" || type === "train" || type === "ride") return dayLineColorClass("travel");
  if (type === "hotel") return dayLineColorClass("hotel");
  if (type === "dinner") return dayLineColorClass("dining");
  return dayLineColorClass("note");
}
