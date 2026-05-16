export type UpdatableReservationType = "flight" | "train" | "ride" | "hotel" | "dinner";
export type TravelUpdateMode = "mock" | "off" | "auto";
export type TravelUpdateKind =
  | "delay"
  | "cancellation"
  | "gate-change"
  | "platform-change"
  | "pickup-change"
  | "on-time";
export type TravelUpdateSeverity = "info" | "warning" | "critical";

export interface UpdatableReservation {
  id: string;
  type: UpdatableReservationType;
  title: string;
  confirmationCode: string;
  localTime: string;
  location: string;
  timezone: string;
}

export interface TravelUpdateEvent {
  provider: string;
  kind: TravelUpdateKind;
  severity: TravelUpdateSeverity;
  summary: string;
  detail: string;
  target: {
    reservationType: UpdatableReservationType;
    confirmationCode?: string;
    titleHint?: string;
  };
  delayMinutes?: number;
  updatedLocation?: string;
}

export interface TravelUpdateProvider {
  name: string;
  fetchUpdates(args: {
    reservations: readonly UpdatableReservation[];
    nowIso: string;
  }): Promise<TravelUpdateEvent[]>;
}

export interface TravelUpdateAuditSummary {
  requestId: string;
  checkedAt: string;
  mode: TravelUpdateMode;
  provider: string | null;
  incomingUpdates: number;
  newUpdates: number;
  duplicateUpdates: number;
  totalKnownEvents: number;
}

export interface TravelProviderReport {
  provider: string;
  attempts: number;
  updateCount: number;
  circuitOpen: boolean;
  error: string | null;
}

export interface TravelUpdateCheckResult {
  mode: TravelUpdateMode;
  provider: string | null;
  updates: TravelUpdateEvent[];
  attempts: number;
  circuitOpen: boolean;
  error: string | null;
  providerReports: TravelProviderReport[];
  audit?: TravelUpdateAuditSummary;
}
