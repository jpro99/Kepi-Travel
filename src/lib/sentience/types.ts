
// Defines the core concepts for the Kepi Sentience Engine.

/** Represents a physical point in 3D space. */
export interface Point3D {
  x: number;
  y: number;
  z: number; // For multi-level airports
}

/** Represents different types of locations within an airport. */
export enum LocationType {
  Gate = 'gate',
  Lounge = 'lounge',
  Security = 'security',
  CheckIn = 'check-in',
  Restroom = 'restroom',
  Shop = 'shop',
  Restaurant = 'restaurant',
  Transport = 'transport', // e.g., internal train
  Exit = 'exit',
  Unknown = 'unknown',
}

/** A specific, named point of interest within the airport. */
export interface PointOfInterest {
  id: string;
  name: string;
  type: LocationType;
  position: Point3D;
  description?: string;
}

/** A segment of the user's journey. */
export interface JourneyLeg {
  id: string;
  start: PointOfInterest;
  end: PointOfInterest;
  estimatedDurationMs: number;
  path: Point3D[]; // The physical path to take
}

/** The user's current state. */
export interface UserState {
  position: Point3D;
  velocity: number; // Speed in meters per second
  isMoving: boolean;
  currentLegId?: string; // The journey leg the user is currently on
}

/** The overall plan for the user's time at the airport. */
export interface JourneyPlan {
  legs: JourneyLeg[];
  totalEstimatedDurationMs: number;
  slackTimeMs: number; // Free time available
}

/** The level of urgency for the user's current situation. */
export enum UrgencyLevel {
  Relaxed = 'relaxed', // Plenty of time
  Nominal = 'nominal', // On schedule
  Elevated = 'elevated', // Time to start moving
  High = 'high',       // Risk of missing connection/boarding
  Critical = 'critical', // Immediate action required
}

/** A contextual prompt to be delivered to the user. */
export interface ContextualPrompt {
  id: string;
  content: string; // The message to be displayed or spoken
  urgency: UrgencyLevel;
  trigger: 'time' | 'location' | 'event'; // What caused the prompt
}
