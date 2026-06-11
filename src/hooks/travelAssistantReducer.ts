import type { ManagedTrip, Reservation, ReviewItem, ReadinessItem, TripStage, TripStatus, DisruptionScenario, UpdateFeedItem, AirportTransportChoice, ItineraryFortification, BioHarmonizationPlan } from '@/lib/journey/types';

export interface TravelAssistantState {
    trips: ManagedTrip[];
    activeTripId: string | null;
    tripsLoading: boolean;
    tripStage: TripStage;
    tripStatus: TripStatus;
    reservations: Reservation[];
    reviewQueue: ReviewItem[];
    readinessItems: ReadinessItem[];
    minutesToDeparture: number;
    activeScenario: DisruptionScenario;
    updateFeed: UpdateFeedItem[];
    airportTransportChoice: AirportTransportChoice | null;
    hotelArrivalTime: string | null;
    hotelArrivalDraft: string;
    fortification: ItineraryFortification | null;
    isDisrupted: boolean;
    disruption: any | null;
    guardianAlert: string | null;
    snoozedAlerts: Record<string, number>;
    guidanceUserLat: number | null;
    guidanceUserLon: number | null;
    userVector: { speed: number, bearing: number } | null;
    locationHistory: { lat: number, lon: number, time: number }[];
    bioPlan: BioHarmonizationPlan | null;
}

type Action = 
    | { type: 'SET_TRIPS', payload: ManagedTrip[] }
    | { type: 'SET_ACTIVE_TRIP', payload: { trip: ManagedTrip | null, tripId: string | null } }
    | { type: 'SET_TRIPS_LOADING', payload: boolean }
    | { type: 'SET_TRIP_STAGE', payload: TripStage }
    | { type: 'ADD_RESERVATION', payload: Reservation }
    | { type: 'DELETE_RESERVATION', payload: string }
    | { type: 'SET_BIO_PLAN', payload: BioHarmonizationPlan | null }
    | { type: 'TOGGLE_DISRUPTION' }
    | { type: 'REPORT_PROBLEM', payload: any }
    | { type: 'SET_GUIDANCE_LOCATION', payload: { lat: number, lon: number } }
    | { type: 'DISMISS_GUARDIAN_ALERT' }
    | { type: 'SET_FORTIFICATION', payload: ItineraryFortification | null }
    | { type: 'SET_GUARDIAN_ALERT', payload: string | null };

export const initialState: TravelAssistantState = {
    trips: [],
    activeTripId: null,
    tripsLoading: true,
    tripStage: "readiness",
    tripStatus: "yellow",
    reservations: [],
    reviewQueue: [],
    readinessItems: [],
    minutesToDeparture: 180,
    activeScenario: "none",
    updateFeed: [],
    airportTransportChoice: null,
    hotelArrivalTime: null,
    hotelArrivalDraft: "",
    fortification: null,
    isDisrupted: false,
    disruption: null,
    guardianAlert: null,
    snoozedAlerts: {},
    guidanceUserLat: null,
    guidanceUserLon: null,
    userVector: null,
    locationHistory: [],
    bioPlan: null,
};

export function travelAssistantReducer(state: TravelAssistantState, action: Action): TravelAssistantState {
    switch (action.type) {
        case 'SET_TRIPS':
            return { ...state, trips: action.payload };
        case 'SET_TRIPS_LOADING':
            return { ...state, tripsLoading: action.payload };

        case 'SET_ACTIVE_TRIP':
            if (!action.payload.trip) {
                return { ...state, activeTripId: null, ...initialState };
            }
            return {
                ...state,
                activeTripId: action.payload.tripId,
                tripStage: action.payload.trip.stage,
                reservations: action.payload.trip.reservations,
                tripStatus: action.payload.trip.tripStatus,
                minutesToDeparture: action.payload.trip.minutesToDeparture,
                activeScenario: action.payload.trip.activeScenario,
                reviewQueue: action.payload.trip.reviewQueue,
                readinessItems: action.payload.trip.readinessItems,
                updateFeed: action.payload.trip.updateFeed,
                airportTransportChoice: action.payload.trip.airportTransport,
                hotelArrivalTime: action.payload.trip.hotelArrivalTime,
                hotelArrivalDraft: action.payload.trip.hotelArrivalTime ?? "",
            };
        case 'SET_TRIP_STAGE':
            return { ...state, tripStage: action.payload };
        case 'ADD_RESERVATION':
            return { ...state, reservations: [...state.reservations, action.payload] };
        case 'DELETE_RESERVATION':
            return { ...state, reservations: state.reservations.filter(r => r.id !== action.payload) };
        case 'SET_BIO_PLAN':
            return { ...state, bioPlan: action.payload };
        case 'TOGGLE_DISRUPTION':
            return { ...state, isDisrupted: !state.isDisrupted };
        case 'REPORT_PROBLEM':
            return { ...state, isDisrupted: true, disruption: action.payload };
        case 'SET_GUIDANCE_LOCATION':
            return { ...state, guidanceUserLat: action.payload.lat, guidanceUserLon: action.payload.lon };
        case 'DISMISS_GUARDIAN_ALERT':
            return { ...state, guardianAlert: null };
        case 'SET_FORTIFICATION':
            return { ...state, fortification: action.payload };
        case 'SET_GUARDIAN_ALERT':
            return { ...state, guardianAlert: action.payload };
        default:
            return state;
    }
}
