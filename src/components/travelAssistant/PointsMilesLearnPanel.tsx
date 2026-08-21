"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_CATALOG } from "@/lib/points/cardEarnRules";
import { playbooksForCard } from "@/lib/points/benefitPlaybooks";
import type { PointsTravelProfile } from "@/lib/memory/pointsTravelProfile";

const SECTIONS: Array<{
  id: string;
  emoji: string;
  title: string;
  body: string[];
  tip?: string;
  action?: string;
}> = [
  {
    id: "basics",
    emoji: "✈️",
    title: "Points & miles in 60 seconds",
    body: [
      "Airlines and hotels run loyalty programs. You earn miles or points when you fly, stay, or use the right credit card.",
      "Status (MVP Gold, Globalist, etc.) unlocks lounges, upgrades, and priority lines — Kepi tracks yours in the Loyalty Wallet.",
      "Credit cards multiply earning: pay with the card that gives the most points for that purchase.",
    ],
  },
  {
    id: "cards",
    emoji: "💳",
    title: "Add your cards (names only)",
    body: [
      "Open More → Card wallet and tap the cards you carry. Kepi never stores full card numbers.",
      "We match each card to a benefit profile: lounge access, hotel elite status, earn rates, and airport guidance.",
      "Premium cards like Amex Platinum include Centurion Lounges and Priority Pass — but you must enroll Priority Pass once at Amex.com.",
    ],
    action: "Add cards in Card wallet below when you finish this guide.",
  },
  {
    id: "rakuten",
    emoji: "🛒",
    title: "Stack Rakuten before you shop",
    body: [
      "Rakuten pays cash back when you shop through their portal or browser extension.",
      "Before Instacart, Amazon, or a hotel portal: activate Rakuten first, then check out with your best travel card.",
      "Example: Rakuten 5% back + Chase 3x points on dining — two layers of value on one order.",
      "Direct hotel bookings often earn elite nights; portal bookings might not. Kepi warns you when that trade-off matters.",
    ],
    tip: "In Card wallet, toggle \"I use Rakuten\" so Kepi reminds you at checkout time.",
  },
  {
    id: "loyalty",
    emoji: "🏨",
    title: "Loyalty programs & status",
    body: [
      "Add your airline and hotel programs in the Loyalty Wallet with member numbers and current tier.",
      "Credit cards can grant status too — Hyatt card → Discoverist, Amex Platinum → Marriott/Hilton Gold (enroll required).",
      "Kepi merges card grants + your real status for Airport Mode and hotel check-in tips.",
    ],
  },
  {
    id: "lounges",
    emoji: "🛋",
    title: "Lounges at the airport",
    body: [
      "When you have a flight today, open Airport Mode. Kepi checks your cards, status, and airport.",
      "For Amex Centurion: open the Amex app → Membership → Lounge Access → show QR + boarding pass.",
      "For Priority Pass: enroll once, use the Priority Pass app QR at participating lounges.",
      "Same-day boarding pass is almost always required. Guest rules vary — we show what applies.",
    ],
  },
  {
    id: "kepi",
    emoji: "🎯",
    title: "How Kepi helps on trip day",
    body: [
      "Travel Fit learns your airlines and hotels from past trips.",
      "Earn stack suggestions recommend which card to pay with for flights and hotels.",
      "Airport walkthrough steps include lounge stops when you have time before boarding.",
      "Forward confirmation emails to your Kepi address — we parse flights, hotels, and pricing automatically.",
    ],
  },
] ;

interface PointsMilesLearnPanelProps {
  onBack?: () => void;
  onOpenCardWallet?: () => void;
  compact?: boolean;
}

export function PointsMilesLearnPanel({ onBack, onOpenCardWallet, compact = false }: PointsMilesLearnPanelProps) {
  const [profile, setProfile] = useState<PointsTravelProfile | null>(null);
  const [activeSection, setActiveSection] = useState(0);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/points-profile", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { profile: PointsTravelProfile };
      setProfile(data.profile);
    } catch {
      /* degrade */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markSectionComplete = async (sectionId: string): Promise<void> => {
    if (!profile) return;
    const progress = new Set(profile.learnProgress ?? []);
    progress.add(sectionId);
    setSaving(true);
    try {
      const res = await fetch("/api/points-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learnProgress: [...progress] }),
      });
      if (res.ok) {
        const data = (await res.json()) as { profile: PointsTravelProfile };
        setProfile(data.profile);
      }
    } finally {
      setSaving(false);
    }
  };

  const section = SECTIONS[activeSection]!;
  const ownedCards = profile?.ownedCards ?? [];
  const completed = new Set(profile?.learnProgress ?? []);

  return (
    <div className={compact ? "space-y-4" : "mx-auto max-w-2xl space-y-5 pb-8"}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
            New to points & miles?
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Learn with Kepi</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Plain-language guide — cards, Rakuten, lounges, and how Kepi uses what you tell it.
          </p>
        </div>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            Back
          </button>
        ) : null}
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {SECTIONS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveSection(index)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              index === activeSection
                ? "bg-sky-600 text-white"
                : completed.has(item.id)
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {completed.has(item.id) ? "✓ " : ""}
            {item.emoji} {item.title.split(" ")[0]}
          </button>
        ))}
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {section.emoji} {section.title}
        </h2>
        <ul className="mt-4 space-y-3">
          {section.body.map((paragraph) => (
            <li key={paragraph} className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {paragraph}
            </li>
          ))}
        </ul>
        {"tip" in section && section.tip ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            💡 {section.tip}
          </p>
        ) : null}
        {"action" in section && section.action ? (
          <p className="mt-4 text-xs font-medium text-sky-700 dark:text-sky-300">{section.action}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void markSectionComplete(section.id)}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {completed.has(section.id) ? "Completed ✓" : "Mark section done"}
          </button>
          {activeSection < SECTIONS.length - 1 ? (
            <button
              type="button"
              onClick={() => setActiveSection((prev) => prev + 1)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Next →
            </button>
          ) : onOpenCardWallet ? (
            <button
              type="button"
              onClick={onOpenCardWallet}
              className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200"
            >
              Open Card wallet
            </button>
          ) : null}
        </div>
      </article>

      {ownedCards.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your cards unlock</p>
          <ul className="mt-2 space-y-2">
            {ownedCards.slice(0, 4).map((owned) => {
              const catalog = CARD_CATALOG.find((c) => c.id === owned.cardId);
              const playbooks = playbooksForCard(owned.cardId);
              const displayName = (catalog?.name ?? owned.label?.trim()) || "Your card";
              return (
                <li key={owned.cardId} className="text-sm text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{displayName}</span>
                  {playbooks.length > 0 ? (
                    <span className="text-slate-500"> — {playbooks.map((p) => p.title).join(", ")}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
