export type ParseCorrectionOutcome = "accepted" | "edited-then-accepted";

export interface ParseCorrectionDraftSnapshot {
  type?: string;
  title?: string;
  provider?: string;
  localTime?: string;
  timezone?: string;
  location?: string;
  confirmationCode?: string;
  notes?: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  quotedPriceUsd?: number | null;
  quotedPointsMiles?: number | null;
  quotedMilesEarned?: number | null;
  pointsProgram?: string;
}

export interface ParseCorrectionRecord {
  id: string;
  recordedAt: string;
  parserVersion: string;
  reviewItemId: string;
  sourceChannel?: string;
  sourceEmailSubject?: string;
  parseConfidenceScore?: number;
  parsingStatus?: string;
  gateReasons: string[];
  parserGuess: ParseCorrectionDraftSnapshot;
  corrected: ParseCorrectionDraftSnapshot;
  changedFields: string[];
  sourceTextSnippet: string;
  outcome: ParseCorrectionOutcome;
}

export interface FewShotParseExample {
  sourceTextSnippet: string;
  parserGuess: ParseCorrectionDraftSnapshot;
  corrected: ParseCorrectionDraftSnapshot;
}

export type SuggestionOutcomeKind = "impression" | "dismiss" | "accept" | "click";

export interface SuggestionOutcomeEvent {
  id: string;
  recordedAt: string;
  surface: string;
  suggestionKey: string;
  outcome: SuggestionOutcomeKind;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ConfidenceCalibrationBucket {
  bucketMin: number;
  bucketMax: number;
  acceptedWithoutEdit: number;
  acceptedWithEdit: number;
  total: number;
}

export interface ConfidenceCalibrationStats {
  updatedAt: string;
  buckets: ConfidenceCalibrationBucket[];
}
