import "server-only";

// This interface defines the core structures for the Travel Graph and the Digital Twin.

// --- The Digital Twin ---
// A perfect, data-driven reflection of the traveler.
export interface DigitalTwin {
    userId: string;
    preferences: {
        seating: "window" | "aisle";
        airlineAlliances: ("Star Alliance" | "Oneworld" | "SkyTeam")[];
        hotelChains: string[];
    };
    financialProfile: any; // Reference to the Financial Concierge profile
    legacyProfile: any; // Reference to the Legacy Engine profile
    serendipityProfile: any; // Reference to the Serendipity Engine profile
    bioProfile: any; // Reference to the Bio-Harmonization profile
}

// --- The Travel Graph ---
// A living, semantic model of the entire travel world.

export interface TravelGraphNode {
    id: string; // A unique identifier for the node (e.g., "LHR", "Marriott Bonvoy")
    type: "Airport" | "Airline" | "Hotel" | "LoyaltyProgram";
    name: string;
}

export interface TravelGraphEdge {
    source: string; // The ID of the source node
    target: string; // The ID of the target node
    type: "FliesTo" | "MemberOf" | "HasHubAt" | "PartnersWith";
    properties: any;
}

export interface RouteInfo extends TravelGraphEdge {
    type: "FliesTo";
    properties: {
        airline: string;
        flightNumber: string;
        aircraft: string[];
        // A score representing the real-world quality of this route (e.g., considering on-time performance).
        qualityScore: number;
    };
}
