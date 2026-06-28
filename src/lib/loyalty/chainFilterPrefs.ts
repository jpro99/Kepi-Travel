import type { AirlineChainId, HotelChainId } from "@/lib/loyalty/chainRegistry";
import { AIRLINE_CHAINS, HOTEL_CHAINS } from "@/lib/loyalty/chainRegistry";

export type ChainToggleMap<T extends string> = Record<T, boolean>;

const HOTEL_STORAGE_KEY = "kepi:hotel-chain-filter";
const AIRLINE_STORAGE_KEY = "kepi:airline-chain-filter";

function defaultHotelToggles(): ChainToggleMap<HotelChainId> {
  return Object.fromEntries(HOTEL_CHAINS.map((chain) => [chain.id, true])) as ChainToggleMap<HotelChainId>;
}

function defaultAirlineToggles(): ChainToggleMap<AirlineChainId> {
  return Object.fromEntries(AIRLINE_CHAINS.map((chain) => [chain.id, true])) as ChainToggleMap<AirlineChainId>;
}

function readStorage<T extends string>(key: string, defaults: () => ChainToggleMap<T>): ChainToggleMap<T> {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<ChainToggleMap<T>>;
    return { ...defaults(), ...parsed };
  } catch {
    return defaults();
  }
}

function writeStorage<T extends string>(key: string, value: ChainToggleMap<T>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadHotelChainToggles(): ChainToggleMap<HotelChainId> {
  return readStorage(HOTEL_STORAGE_KEY, defaultHotelToggles);
}

export function saveHotelChainToggles(value: ChainToggleMap<HotelChainId>): void {
  writeStorage(HOTEL_STORAGE_KEY, value);
}

export function loadAirlineChainToggles(): ChainToggleMap<AirlineChainId> {
  return readStorage(AIRLINE_STORAGE_KEY, defaultAirlineToggles);
}

export function saveAirlineChainToggles(value: ChainToggleMap<AirlineChainId>): void {
  writeStorage(AIRLINE_STORAGE_KEY, value);
}

export function enabledHotelChainIds(toggles: ChainToggleMap<HotelChainId>): HotelChainId[] {
  return HOTEL_CHAINS.filter((chain) => toggles[chain.id] !== false).map((chain) => chain.id);
}

export function enabledAirlineChainIds(toggles: ChainToggleMap<AirlineChainId>): AirlineChainId[] {
  return AIRLINE_CHAINS.filter((chain) => toggles[chain.id] !== false).map((chain) => chain.id);
}
