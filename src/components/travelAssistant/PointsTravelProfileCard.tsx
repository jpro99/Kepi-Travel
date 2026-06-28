"use client";

import { useCallback, useEffect, useState } from "react";
import { CARD_CATALOG, findCard } from "@/lib/points/cardEarnRules";
import { getCardBenefitProfile, listBenefitsForOwnedCards, summarizeCardBenefits } from "@/lib/points/cardBenefits";
import type { PointsTravelProfile, SavedInvitationCode } from "@/lib/memory/pointsTravelProfile";
import { generateId } from "@/lib/utils/generateId";

function cardDisplayName(profile: PointsTravelProfile, cardId: string): string {
  const entry = profile.ownedCards.find((c) => c.cardId === cardId);
  if (entry?.label?.trim()) return entry.label.trim();
  return findCard(cardId)?.name ?? cardId;
}

export function PointsTravelProfileCard() {
  const [profile, setProfile] = useState<PointsTravelProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [customLastFour, setCustomLastFour] = useState("");
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteNotes, setInviteNotes] = useState("");
  const [editingLastFour, setEditingLastFour] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/points-profile", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { profile: PointsTravelProfile };
      setProfile({
        ...data.profile,
        invitationCodes: data.profile.invitationCodes ?? [],
      });
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
      setProfile({
        ...data.profile,
        invitationCodes: data.profile.invitationCodes ?? [],
      });
      setMessage("Saved — Kepi updated your travel benefits for Airport Mode.");
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

  const addCustomCard = (): void => {
    if (!profile) return;
    const label = customName.trim();
    if (!label) return;
    const lastFour = customLastFour.replace(/\D/g, "").slice(-4);
    const cardId = `custom-${generateId()}`;
    void save({
      ownedCards: [...profile.ownedCards, { cardId, label, ...(lastFour ? { lastFour } : {}) }],
    });
    setCustomName("");
    setCustomLastFour("");
  };

  const updateCardLastFour = (cardId: string, raw: string): void => {
    if (!profile) return;
    const lastFour = raw.replace(/\D/g, "").slice(0, 4);
    setEditingLastFour((prev) => ({ ...prev, [cardId]: lastFour }));
  };

  const commitCardLastFour = (cardId: string): void => {
    if (!profile) return;
    const lastFour = editingLastFour[cardId]?.replace(/\D/g, "").slice(0, 4);
    const ownedCards = profile.ownedCards.map((entry) =>
      entry.cardId === cardId ? { ...entry, ...(lastFour ? { lastFour } : { lastFour: undefined }) } : entry,
    );
    void save({ ownedCards });
  };

  const removeCustomCard = (cardId: string): void => {
    if (!profile) return;
    void save({ ownedCards: profile.ownedCards.filter((c) => c.cardId !== cardId) });
  };

  const addInvitationCode = (): void => {
    if (!profile) return;
    const label = inviteLabel.trim();
    const code = inviteCode.trim();
    if (!label || !code) return;
    const next: SavedInvitationCode = {
      id: generateId(),
      label,
      code,
      ...(inviteNotes.trim() ? { notes: inviteNotes.trim() } : {}),
    };
    void save({ invitationCodes: [...(profile.invitationCodes ?? []), next] });
    setInviteLabel("");
    setInviteCode("");
    setInviteNotes("");
  };

  const removeInvitationCode = (id: string): void => {
    if (!profile) return;
    void save({
      invitationCodes: (profile.invitationCodes ?? []).filter((entry) => entry.id !== id),
    });
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading cards…</p>;
  }

  if (!profile) {
    return <p className="text-sm text-slate-500">Sign in to save your card wallet.</p>;
  }

  const customCards = profile.ownedCards.filter((c) => c.cardId.startsWith("custom-"));
  const catalogActive = profile.ownedCards.filter((c) => !c.cardId.startsWith("custom-"));
  const activeBenefits = summarizeCardBenefits(
    listBenefitsForOwnedCards(profile.ownedCards.map((c) => c.cardId)),
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Pick your card from the list — we never store full card numbers. The first 6 digits (BIN) can identify
        issuer and product, but Kepi uses your explicit card choice plus optional last-four for labeling only.
        Benefits sync to Airport Mode and hotel check-in guidance.
      </p>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Popular cards</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CARD_CATALOG.map((card) => {
            const active = profile.ownedCards.some((c) => c.cardId === card.id);
            const benefits = getCardBenefitProfile(card.id);
            return (
              <button
                key={card.id}
                type="button"
                disabled={saving}
                onClick={() => toggleCard(card.id)}
                title={benefits?.guidance[0]}
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
      </div>

      {catalogActive.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Your cards — last 4 (optional)</p>
          {catalogActive.map((entry) => (
            <div
              key={entry.cardId}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700"
            >
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {cardDisplayName(profile, entry.cardId)}
              </span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
                value={editingLastFour[entry.cardId] ?? entry.lastFour ?? ""}
                onChange={(e) => updateCardLastFour(entry.cardId, e.target.value)}
                onBlur={() => commitCardLastFour(entry.cardId)}
                className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </div>
          ))}
        </div>
      ) : null}

      {activeBenefits.length > 0 ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
            Travel benefits from your cards
          </p>
          <ul className="mt-2 space-y-1">
            {activeBenefits.slice(0, 6).map((line) => (
              <li key={line} className="text-xs text-sky-800 dark:text-sky-200">
                • {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-600">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Add another card</p>
        <p className="mt-1 text-xs text-slate-500">Any issuer — Amex, Capital One, Citi, local bank, etc.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Card name (e.g. Amex Gold)"
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={customLastFour}
            onChange={(e) => setCustomLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="Last 4"
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <button
            type="button"
            disabled={saving || !customName.trim()}
            onClick={addCustomCard}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {customCards.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Custom cards</p>
          {customCards.map((entry) => (
            <div
              key={entry.cardId}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {entry.label ?? "Custom card"}
                </p>
                {entry.lastFour ? (
                  <p className="text-xs text-slate-500">···· {entry.lastFour}</p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => removeCustomCard(entry.cardId)}
                className="text-xs font-semibold text-rose-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Invitation &amp; referral codes</p>
        <p className="mt-1 text-xs text-slate-500">
          Save sign-up invite codes here so they&apos;re ready when you apply for a new card.
        </p>
        {(profile.invitationCodes ?? []).length > 0 ? (
          <ul className="mt-3 space-y-2">
            {(profile.invitationCodes ?? []).map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{entry.label}</p>
                  <p className="font-mono text-xs text-sky-700 dark:text-sky-300 break-all">{entry.code}</p>
                  {entry.notes ? <p className="mt-1 text-xs text-slate-500">{entry.notes}</p> : null}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => removeInvitationCode(entry.id)}
                  className="shrink-0 text-xs font-semibold text-rose-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={inviteLabel}
            onChange={(e) => setInviteLabel(e.target.value)}
            placeholder="Card or offer name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Invitation / referral code"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <input
            type="text"
            value={inviteNotes}
            onChange={(e) => setInviteNotes(e.target.value)}
            placeholder="Notes (optional — expires, bonus amount, etc.)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <button
            type="button"
            disabled={saving || !inviteLabel.trim() || !inviteCode.trim()}
            onClick={addInvitationCode}
            className="rounded-lg border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-700 dark:text-sky-300 disabled:opacity-50"
          >
            Save code for later
          </button>
        </div>
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
