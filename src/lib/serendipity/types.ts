import "server-only";

// This interface defines the data structure for the Kepi Serendipity Engine.
// It represents the user's profile for social and experiential matching.

export interface SerendipityProfile {
    // The user to whom this profile belongs.
    userId: string;

    // A list of interests, either explicitly stated or inferred from travel patterns.
    interests: string[];

    // Professional information, optionally synced from a source like LinkedIn.
    professionalProfile?: {
        industry: string;
        title: string;
        company: string;
    };

    // The user's preference for social introductions.
    openToIntroductions: "none" | "professional" | "social";
}

// Represents a potential connection between two Kepi users.
export interface SerendipityConnection {
    // A score from 0.0 to 1.0 representing the strength of the potential connection.
    connectionScore: number;

    // The reason for the suggested connection (e.g., "Shared interest in AI").
    sharedContext: string;

    // The users involved in the potential connection.
    users: [SerendipityProfile, SerendipityProfile];
}

// Represents a curated, hyper-personalized experience.
export interface CuratedExperience {
    // A unique ID for this experience.
    experienceId: string;

    // The type of experience (e.g., "dining," "art," "music").
    type: string;

    // A short, captivating title.
    title: string;

    // A longer description of the experience.
    description: string;

    // The location of the experience.
    location: { lat: number; lon: number; };

    // A score from 0.0 to 1.0 representing how well this experience matches the user.
    matchScore: number;
}

// Represents a memory created by the Memory Weaver.
export interface WovenMemory {
    // A unique ID for this memory.
    memoryId: string;

    // The trip to which this memory belongs.
    tripId: string;

    // The title of the memory (e.g., "Tokyo, Spring 2024").
    title: string;

    // A URL to the generated video or interactive story.
    mediaUrl: string;

    // The key moments that were woven into the memory.
    keyMoments: any[]; // Photos, locations, notes, etc.
}
