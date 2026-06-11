
import {
  JourneyPlan,
  LocationType,
  PointOfInterest,
  UserState,
  UrgencyLevel,
  ContextualPrompt,
} from './types';

// A mock database of points of interest for a sample airport
const mockAirportDB: PointOfInterest[] = [
  { id: 'checkin-1', name: 'Main Check-in', type: LocationType.CheckIn, position: { x: 10, y: 50, z: 0 } },
  { id: 'security-north', name: 'North Security', type: LocationType.Security, position: { x: 50, y: 80, z: 0 } },
  { id: 'lounge-a', name: "Admirals Club", type: LocationType.Lounge, position: { x: 100, y: 120, z: 1 } },
  { id: 'gate-b32', name: 'Gate B32', type: LocationType.Gate, position: { x: 200, y: 150, z: 1 } },
];

/**
 * The Kepi Sentience Engine.
 * The brain of the airport co-pilot.
 */
export class KepiSentienceEngine {
  private userState: UserState;
  private flightData: Record<string, unknown> | null = null;

  constructor(initialUserState: UserState) {
    this.userState = initialUserState;
  }

  /** Initializes the engine with real-time flight data. */
  async initializeFlightData(flightNumber: string) {
    try {
      const response = await fetch(`/api/travel-updates?flight=${encodeURIComponent(flightNumber)}`);
      if (response.ok) {
        this.flightData = (await response.json()) as Record<string, unknown>;
      }
    } catch (error) {
      console.error("Failed to fetch flight data:", error);
    }
  }

  getFlightData(): Record<string, unknown> | null {
    return this.flightData;
  }

  /** Returns a mock journey plan. */
  getJourneyPlan(): JourneyPlan {
    const checkIn = mockAirportDB[0];
    const security = mockAirportDB[1];
    const gate = mockAirportDB[3];

    return {
      legs: [
        {
          id: 'leg-1-security',
          start: checkIn,
          end: security,
          estimatedDurationMs: 15 * 60 * 1000,
          path: [checkIn.position, security.position],
        },
        {
          id: 'leg-2-gate',
          start: security,
          end: gate,
          estimatedDurationMs: 8 * 60 * 1000,
          path: [security.position, gate.position],
        },
      ],
      totalEstimatedDurationMs: 23 * 60 * 1000,
      slackTimeMs: 45 * 60 * 1000,
    };
  }

  /** Returns a mock contextual prompt based on user state. */
  getContextualPrompt(): ContextualPrompt {
    return {
      id: 'prompt-1',
      content: "You have plenty of time. The Admirals Club is on your left.",
      urgency: UrgencyLevel.Relaxed,
      trigger: 'location',
    };
  }

  /** Updates the user's state. */
  updateUserState(newState: Partial<UserState>) {
    this.userState = { ...this.userState, ...newState };
  }
}
