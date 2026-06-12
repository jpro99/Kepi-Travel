export const featureCards = [
  {
    icon: "✈️",
    title: "Live flight tracking",
    description:
      "Continuous status checks for gate, departure, and delay changes with anti-miss safeguards.",
  },
  {
    icon: "📧",
    title: "Gmail reservation import",
    description:
      "Pull confirmed reservations directly from email and map them into a clean trip timeline.",
  },
  {
    icon: "🤖",
    title: "AI disruption recovery",
    description:
      "Get recovery paths when plans shift, with practical actions prioritized by urgency.",
  },
  {
    icon: "🔔",
    title: "Smart gate change alerts",
    description:
      "Subtle, timely alerts for the right traveler at the right moment so nothing is missed.",
  },
  {
    icon: "👨‍👩‍👧",
    title: "Family trip sharing",
    description:
      "Share trip views with companions and keep each traveler synced to their own schedule.",
  },
  {
    icon: "🗓️",
    title: "Google Calendar sync",
    description:
      "Push approved reservations into calendar blocks for a dependable single source of truth.",
  },
] as const;

export const pricingPlans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "/month",
    description: "Essential travel execution for one active trip.",
    cta: "Start free",
    highlighted: false,
    features: ["1 active trip", "Manual trip updates", "Core readiness board"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$9",
    period: "/month",
    description: "Automation and alerts for frequent travelers.",
    cta: "Start Pro",
    highlighted: true,
    features: ["Unlimited trips", "Gmail import + AI guidance", "Push gate/delay alerts"],
  },
  {
    id: "concierge",
    name: "Concierge",
    price: "$29",
    period: "/month",
    description: "VIP proactive support before disruption escalates.",
    cta: "Start Concierge",
    highlighted: false,
    features: ["5-minute proactive monitoring", "Auto-rebook workflows", "Priority concierge support"],
  },
] as const;

export const comparisonRows = [
  { feature: "Trips", free: "1", pro: "Unlimited", concierge: "Unlimited" },
  { feature: "Gmail reservation import", free: "—", pro: "Included", concierge: "Included" },
  { feature: "AI disruption recovery", free: "—", pro: "Included", concierge: "Included" },
  { feature: "Push gate/delay alerts", free: "—", pro: "Included", concierge: "Included" },
  { feature: "Proactive monitoring cadence", free: "—", pro: "15 min", concierge: "5 min" },
  { feature: "Priority human support", free: "—", pro: "Standard", concierge: "Priority lane" },
] as const;

export const testimonials = [
  {
    name: "Maya R.",
    route: "NYC → Lisbon",
    stars: "★★★★★",
    quote:
      "My departure gate changed twice in 20 minutes. Kepi alerted me early and rerouted my pre-boarding checklist so I still boarded calmly.",
  },
  {
    name: "David L.",
    route: "Chicago → Tokyo",
    stars: "★★★★★",
    quote:
      "The Gmail import caught a hotel confirmation I forgot to add. It synced to calendar and prevented a late-night check-in surprise.",
  },
  {
    name: "Priya S.",
    route: "Austin family trip",
    stars: "★★★★★",
    quote:
      "Family sharing made coordination painless. Everyone saw their own timeline and pickup steps without constant group-text confusion.",
  },
] as const;

export const faqs = [
  {
    question: "How does Kepi handle my travel data privacy?",
    answer:
      "Kepi is designed around user-scoped data access with authenticated sessions and configurable sharing controls. You can revoke share access at any time.",
  },
  {
    question: "Can I cancel my paid plan anytime?",
    answer:
      "Yes. Paid plans can be managed and canceled from billing. Access remains active through your current billing period when applicable.",
  },
  {
    question: "What Gmail permissions are required?",
    answer:
      "Kepi requests only the minimum scope required to read reservation-related messages for import workflows. It does not send email on your behalf.",
  },
  {
    question: "Can I share trips with family members safely?",
    answer:
      "Yes. You can generate read-only share links, set expiry windows, and control whether personal notes are included.",
  },
  {
    question: "Does Kepi work well on mobile devices?",
    answer:
      "Yes. The interface is mobile-first, stage-adaptive, and optimized for quick decisions while moving through airports, stations, and arrivals.",
  },
  {
    question: "Is there a native app experience?",
    answer:
      "Kepi supports installable app behavior via PWA and native wrapper support, with platform-aware notification and haptic integrations.",
  },
] as const;

export type LandingTab = "overview" | "plan";

export function landingTabFromParam(value: string | null | undefined): LandingTab {
  return value === "plan" ? "plan" : "overview";
}
