import { useReducer, useCallback, useRef, useEffect } from 'react';
import { travelAssistantReducer, initialState } from './travelAssistantReducer';
import type { ManagedTrip, Reservation, ReviewItem, ReadinessItem, TripStage, TripStatus, DisruptionScenario, UpdateFeedItem, AirportTransportChoice } from '@/lib/travelAssistant/travelUpdateTypes';
import { type Session } from "next-auth";

export function useTravelAssistant(session: Session | null) {
    const [state, dispatch] = useReducer(travelAssistantReducer, initialState);
    const isLoaded = useRef(false);
    const [error, setError] = useState<string | null>(null);

    const handleAcceptSuggestion = useCallback((suggestionId: string) => {
        dispatch({ type: 'ACCEPT_SUGGESTION', payload: suggestionId });
    }, []);

    const handleDismissSuggestion = useCallback((suggestionId: string) => {
        dispatch({ type: 'DISMISS_SUGGESTION', payload: suggestionId });
    }, []);

    const handleToggleChecklistItem = useCallback((itemId: string) => {
        dispatch({ type: 'TOGGLE_CHECKLIST_ITEM', payload: itemId });
    }, []);

    const handleSetAirportTransportChoice = useCallback((choice: AirportTransportChoice) => {
        dispatch({ type: 'SET_AIRPORT_TRANSPORT_CHOICE', payload: choice });
    }, []);

    const handleRegenerateSuggestions = useCallback(() => {
        dispatch({ type: 'REGENERATE_SUGGESTIONS' });
    }, []);

    const handleManageTrip = useCallback((tripId: string) => {
        dispatch({ type: 'MANAGE_TRIP', payload: tripId });
    }, []);

    const handleConfirmDisruption = useCallback(() => {
        dispatch({ type: 'CONFIRM_DISRUPTION' });
    }, []);

    const handleSnoozeDisruption = useCallback(() => {
        dispatch({ type: 'SNOOZE_DISRUPTION' });
    }, []);

    const handleUpdatePushSubscription = useCallback((subscription: PushSubscription) => {
        dispatch({ type: 'UPDATE_PUSH_SUBSCRIPTION', payload: subscription });
    }, []);

    useEffect(() => {
        async function loadInitialData() {
            if (session && !isLoaded.current) {
                try {
                    // This is where you would fetch initial data from your backend
                    // For now, we'll use a mock timeout to simulate a network request
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    dispatch({ type: 'INITIALIZE', payload: { activeTripId: '1', managedTrips: { '1': { id: '1', name: 'Trip to SFO', isOnboarding: false, reservations: [], status: 'on-time' as TripStatus, stage: 'pre-trip' as TripStage, updateFeed: [], disruptionScenario: null, readiness: [], suggestions: [] } } } });
                    isLoaded.current = true;
                } catch (e) {
                    setError("Failed to load travel data.");
                }
            }
        }
        loadInitialData();
    }, [session]);

    return {
        state,
        isLoaded: isLoaded.current,
        error,
        isInitialising: !isLoaded.current && !error,
        handleAcceptSuggestion,
        handleDismissSuggestion,
        handleToggleChecklistItem,
        handleSetAirportTransportChoice,
        handleRegenerateSuggestions,
        handleManageTrip,
        handleConfirmDisruption,
        handleSnoozeDisruption,
        handleUpdatePushSubscription,
    };
}