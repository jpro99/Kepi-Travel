import { randomUUID } from "node:crypto";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

export const PACKING_CATEGORIES = [
  "essentials",
  "clothing",
  "toiletries",
  "electronics",
  "documents",
  "optional",
] as const;

export type PackingCategory = (typeof PACKING_CATEGORIES)[number];

export interface PackingListCategories {
  essentials: string[];
  clothing: string[];
  toiletries: string[];
  electronics: string[];
  documents: string[];
  optional: string[];
}

export interface PackingItem {
  id: string;
  label: string;
  checked: boolean;
  category: PackingCategory;
  custom?: boolean;
}

export interface PackingListState {
  tripId: string;
  updatedAt: string;
  generatedAt: string | null;
  categories: Record<PackingCategory, PackingItem[]>;
}

const PACKING_STATE_KEY_PREFIX = "packing-state";

function stateKey(tripId: string): string {
  return `${PACKING_STATE_KEY_PREFIX}:${tripId}`;
}

function isCategory(value: unknown): value is PackingCategory {
  return typeof value === "string" && (PACKING_CATEGORIES as readonly string[]).includes(value);
}

function ensureCategories(items?: Partial<Record<PackingCategory, PackingItem[]>>): Record<PackingCategory, PackingItem[]> {
  return {
    essentials: items?.essentials ? [...items.essentials] : [],
    clothing: items?.clothing ? [...items.clothing] : [],
    toiletries: items?.toiletries ? [...items.toiletries] : [],
    electronics: items?.electronics ? [...items.electronics] : [],
    documents: items?.documents ? [...items.documents] : [],
    optional: items?.optional ? [...items.optional] : [],
  };
}

function sanitizeState(raw: unknown): PackingListState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Partial<PackingListState>;
  if (
    typeof candidate.tripId !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    (typeof candidate.generatedAt !== "string" && candidate.generatedAt !== null) ||
    !candidate.categories ||
    typeof candidate.categories !== "object"
  ) {
    return null;
  }

  const mapped = ensureCategories();
  for (const category of PACKING_CATEGORIES) {
    const sourceItems = (candidate.categories as Partial<Record<PackingCategory, unknown>>)[category];
    if (!Array.isArray(sourceItems)) {
      mapped[category] = [];
      continue;
    }
    mapped[category] = sourceItems
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const row = item as Partial<PackingItem>;
        if (typeof row.id !== "string" || typeof row.label !== "string") {
          return null;
        }
        return {
          id: row.id,
          label: row.label.trim(),
          checked: Boolean(row.checked),
          category,
          custom: Boolean(row.custom),
        } as PackingItem;
      })
      .filter((item): item is PackingItem => item !== null && item.label.length > 0);
  }

  return {
    tripId: candidate.tripId,
    updatedAt: candidate.updatedAt,
    generatedAt: candidate.generatedAt ?? null,
    categories: mapped,
  };
}

function flattenItems(categories: Record<PackingCategory, PackingItem[]>): PackingItem[] {
  return PACKING_CATEGORIES.flatMap((category) => categories[category].map((item) => ({ ...item, category })));
}

function createItem(label: string, category: PackingCategory, checked = false, custom = false): PackingItem {
  return {
    id: randomUUID(),
    label: label.trim(),
    checked,
    category,
    custom,
  };
}

export async function getPackingList(tripId: string, userId?: string): Promise<PackingListState | null> {
  const stored = await kvStoreGet<unknown>(stateKey(tripId), { userId });
  return sanitizeState(stored);
}

export async function savePackingList(
  tripId: string,
  list: PackingListCategories,
  userId?: string,
): Promise<PackingListState> {
  const existing = await getPackingList(tripId, userId);
  const existingByLabel = new Map<string, PackingItem>();
  if (existing) {
    flattenItems(existing.categories).forEach((item) => {
      existingByLabel.set(item.label.toLowerCase(), item);
    });
  }

  const categories = ensureCategories();
  for (const category of PACKING_CATEGORIES) {
    const labels = Array.from(
      new Set(
        (list[category] ?? [])
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),
    );
    categories[category] = labels.map((label) => {
      const existingItem = existingByLabel.get(label.toLowerCase());
      if (existingItem) {
        return {
          ...existingItem,
          label,
          category,
          custom: existingItem.custom,
        };
      }
      return createItem(label, category);
    });
  }

  const nextState: PackingListState = {
    tripId,
    updatedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    categories,
  };
  await kvStoreSet(stateKey(tripId), nextState, { userId });
  return nextState;
}

export async function toggleItem(
  tripId: string,
  itemId: string,
  userId?: string,
  checked?: boolean,
): Promise<PackingListState | null> {
  const existing = await getPackingList(tripId, userId);
  if (!existing) {
    return null;
  }
  const categories = ensureCategories(existing.categories);
  let touched = false;
  for (const category of PACKING_CATEGORIES) {
    categories[category] = categories[category].map((item) => {
      if (item.id !== itemId) {
        return item;
      }
      touched = true;
      return {
        ...item,
        checked: typeof checked === "boolean" ? checked : !item.checked,
      };
    });
  }
  if (!touched) {
    return existing;
  }
  const nextState: PackingListState = {
    ...existing,
    updatedAt: new Date().toISOString(),
    categories,
  };
  await kvStoreSet(stateKey(tripId), nextState, { userId });
  return nextState;
}

export async function addCustomItem(
  tripId: string,
  label: string,
  userId?: string,
  category: PackingCategory = "optional",
): Promise<PackingListState> {
  const safeCategory = isCategory(category) ? category : "optional";
  const normalizedLabel = label.trim();
  const existing = (await getPackingList(tripId, userId)) ?? {
    tripId,
    updatedAt: new Date().toISOString(),
    generatedAt: null,
    categories: ensureCategories(),
  };
  if (!normalizedLabel) {
    return existing;
  }
  const alreadyExists = flattenItems(existing.categories).some(
    (item) => item.label.toLowerCase() === normalizedLabel.toLowerCase(),
  );
  if (alreadyExists) {
    return existing;
  }

  const categories = ensureCategories(existing.categories);
  categories[safeCategory] = [...categories[safeCategory], createItem(normalizedLabel, safeCategory, false, true)];

  const nextState: PackingListState = {
    ...existing,
    updatedAt: new Date().toISOString(),
    categories,
  };
  await kvStoreSet(stateKey(tripId), nextState, { userId });
  return nextState;
}

export async function removeItem(tripId: string, itemId: string, userId?: string): Promise<PackingListState | null> {
  const existing = await getPackingList(tripId, userId);
  if (!existing) {
    return null;
  }
  const categories = ensureCategories(existing.categories);
  let changed = false;
  for (const category of PACKING_CATEGORIES) {
    const nextItems = categories[category].filter((item) => item.id !== itemId);
    if (nextItems.length !== categories[category].length) {
      changed = true;
    }
    categories[category] = nextItems;
  }
  if (!changed) {
    return existing;
  }

  const nextState: PackingListState = {
    ...existing,
    updatedAt: new Date().toISOString(),
    categories,
  };
  await kvStoreSet(stateKey(tripId), nextState, { userId });
  return nextState;
}

export function getPackingCompletionPercent(state: PackingListState | null): number {
  if (!state) {
    return 0;
  }
  const all = flattenItems(state.categories);
  if (all.length === 0) {
    return 0;
  }
  const checkedCount = all.filter((item) => item.checked).length;
  return Math.round((checkedCount / all.length) * 100);
}
