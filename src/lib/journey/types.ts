import type { SessionReservation as Reservation } from "@/lib/travelAssistant/clientSessionState";

// Core Types

export type JourneyState = 
    | 'PRE_TRIP'
    | 'EN_ROUTE_TO_AIRPORT'
    | 'AT_AIRPORT_PRE_SECURITY'
    | 'AT_AIRPORT_POST_SECURITY'
    | 'AT_GATE'
    | 'IN_FLIGHT'
    | 'LANDED'
    | 'AT_BAGGAGE_CLAIM'
    | 'EN_ROUTE_TO_HOTEL'
    | 'AT_HOTEL'
    | 'POST_TRIP'
    // Problem states are handled by a different mechanism now
    | 'BAGGAGE_ISSUE'; 

export interface JourneyContext {
    userId: string; // Clerk user ID
    reservations: Reservation[];
    userLocation: { lat: number, lon: number } | null;
    flightStatus: any; 
    userPreferences: {
        usePreCheck: boolean;
        preferredTransport: 'uber' | 'taxi' | 'train';
    }
    disruption: { type: 'flight-cancellation', flightNumber: string } | null;
    fortification?: ItineraryFortification;
    // New field for the Bio-Harmonization Engine
    bioPlan?: BioHarmonizationPlan;
}

// "Pre-Crime" Oracle Types

export interface ProbabilisticDisruption {
    type: 'flight-delay' | 'connection-risk' | 'baggage-handling-issue';
    probability: number; // 0.0 to 1.0
    description: string;
    source: string; // e.g., "Air Traffic Control Network"
}

export interface FortifiedPlan {
    type: 'alternative-flight' | 'backup-hotel' | 'pre-booked-taxi';
    description: string;
    status: 'held' | 'pending-confirmation';
    action: ActionButton;
}

export interface ItineraryFortification {
    predictedDisruption: ProbabilisticDisruption;
    contingencyPlan: FortifiedPlan;
}

// Bio-Harmonization Engine Types

export type UiDirective =
    | { type: 'color_temp', value: 'warm' | 'cool' | 'neutral' }
    | { type: 'brightness', value: 'dim' | 'normal' | 'bright' };

export interface BioRecommendation {
    id: string;
    title: string;
    description: string;
    type: 'sunlight' | 'caffeine' | 'hydration' | 'sleep' | 'nutrition';
    timing: 'immediate' | 'in-1-hour' | 'at-gate' | 'before-sleep';
    action: ActionButton;
}

export interface BioHarmonizationPlan {
    overallStatus: 'aligned' | 'at-risk' | 'misaligned';
    activeRecommendations: BioRecommendation[];
    activeDirectives: UiDirective[];
}


// "Silent Oracle" and "Problem Button" Types

interface ActionButton {
    label: string;
    type: 'link' | 'function';
    target: string;
}

export interface ProactiveIntervention {
    id: string; 
    title: string;
    description: string;
    actions: ActionButton[];
}

// Sentient Itinerary Types

export interface AutonomousAction {
    type: 'rebook-flight';
    status: 'pending' | 'in-progress' | 'requires-confirmation' | 'complete';
    title: string;
    description: string;
    confirmation?: { 
        prompt: string;
        options: ActionButton[];
    };
    result?: { 
        title: string;
        description: string;
    };
}

export interface Opportunity {
    type: 'lounge-access';
    title: string;
    description: string;
    action: ActionButton;
}

interface Interaction {
    type: 'question' | 'conversation';
    prompt: string;
    options?: {
        label: string;
        action: 'DISMISS' | 'SET_JOURNEY_STATE';
        payload?: JourneyState;
    }[];
    initialSuggestions?: string[];
}

export interface NextStep {
    title: string;
    description: string;
    ui?: React.ReactNode;
    action?: {
        label: string;
        type: 'link' | 'function';
        payload: any;
    };
    intervention?: ProactiveIntervention;
    interaction?: Interaction;
    autonomousAction?: AutonomousAction;
    opportunity?: Opportunity;
    fortification?: ItineraryFortification;
    // New field for the Bio-Harmonization Engine
    bioPlan?: BioHarmonizationPlan;
}
