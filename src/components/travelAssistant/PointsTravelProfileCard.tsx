"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_CATALOG } from "@/lib/points/cardEarnRules";
import type { PointsTravelProfile } from "@/lib/memory/pointsTravelProfile";

export function PointsTravelProfileCard() {
  const [profile, setProfile] = useState<PointsTravelProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/points-profile", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { profile: PointsTravelProfile };
      setProfile(data.profile);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (patch: Partial<PointsTravelProfile>): Promise<void> => {
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/points-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = (await res.json()) as { profile: PointsTravelProfile };
      setProfile(data.profile);
      setMessage("Saved — Kepi will use this for earn suggestions.");
    } catch {
      setMessage("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleCard = (cardId: string): void => {
    if (!profile) return;
    const has = profile.ownedCards.some((c) => c.cardId === cardId);
    const ownedCards = has
      ? profile.ownedCards.filter((c) => c.cardId !== cardId)
      : [...profile.ownedCards, { cardId }];
    void save({ ownedCards });
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading cards…</p>;
  }

  if (!profile) {
    return <p className="text-sm text-slate-500">Sign in to save your card wallet.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Card names only — never full numbers on Kepi servers. Used to suggest which card earns the most for each trip.
      </p>
      <div className="flex flex-wrap gap-2">
        {CARD_CATALOG.map((card) => {
          const active = profile.ownedCards.some((c) => c.cardId === card.id);
          return (
            <button
              key={card.id}
              type="button"
              disabled={saving}
              onClick={() => toggleCard(card.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                active
                  ? "bg-sky-600 text-white"
                  : "border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200"
              }`}
            >
              {card.name}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={profile.usesRakuten}
            onChange={(e) => void save({ usesRakuten: e.target.checked })}
          />
          I use Rakuten cashback
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={profile.usesChasePortal}
            onChange={(e) => void save({ usesChasePortal: e.target.checked })}
          />
          I use Chase Travel portal
        </label>
      </div>
      {message ? <p className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p> : null}
    </div>
  );
}
