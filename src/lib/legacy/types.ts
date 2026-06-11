import "server-only";

// This interface defines the core data structure for the Kepi Legacy Engine.

export interface LegacyProfile {
    // The user to whom this legacy profile belongs.
    userId: string;

    // The user's high-level life goals, as defined in the "Life Compass".
    lifeGoals: LifeGoal[];

    // The user's defined personal values for purpose-driven travel.
    values: string[];

    // A reference to the family heirloom this user is a part of.
    familyHeirloomId?: string;
}

export interface LifeGoal {
    // A unique ID for this goal.
    id: string;

    // A short title for the goal (e.g., "Become a Global Citizen").
    title: string;

    // A more detailed description of what the user wants to achieve.
    description: string;

    // The current status of the goal.
    status: "not-started" | "in-progress" | "achieved";

    // A list of trips that have contributed to this goal.
    relatedTripIds: string[];
}

export interface DigitalFamilyHeirloom {
    // A unique ID for this family heirloom.
    id: string;

    // The name of the family.
    familyName: string;

    // A list of user IDs who are members of this family.
    memberUserIds: string[];

    // A collection of all the trips taken by family members.
    // This would be visualized as an interactive globe.
    tripHistory: HeirloomTrip[];
}

export interface HeirloomTrip {
    tripId: string;
    userId: string;
    year: number;
    location: string;
    // A link to the "Woven Memory" for this trip.
    memoryId: string;
}
