// This interface defines the data structure for a Live Activity update.
// It is designed to be sent via a push notification to an iOS device.
export interface LiveActivityData {
  // The primary, most important piece of information (e.g., "Gate C27").
  primary: string;

  // Secondary information (e.g., "Boarding in 15 min").
  secondary: string;

  // A tertiary piece of info, often a status (e.g., "On Time").
  tertiary: string;

  // A value from 0.0 to 1.0 to drive a progress bar (e.g., time to boarding).
  progress: number;

  // The current journey state, to determine the icon to display.
  journeyState: string;
}
