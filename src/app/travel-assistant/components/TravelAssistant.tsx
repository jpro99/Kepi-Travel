// @ts-nocheck
import { useSession } from "next-auth/react";
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTravelAssistant } from "@/hooks/useTravelAssistant";
import { TravelAssistantTabs } from "./TravelAssistantTabs";
import { OnboardingFlow } from "./OnboardingFlow";
import { UpdateFeed } from "./UpdateFeed";
import { ReadinessChecklist } from "./ReadinessChecklist";
import { DisruptionBanner } from "./DisruptionBanner";
import { SuggestedItem } from "./SuggestedItem";

export function TravelAssistant({ session }) {
  const {
    state,
    isLoaded,
    error,
    isInitialising,
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handleToggleChecklistItem,
    handleSetAirportTransportChoice,
    handleRegenerateSuggestions,
    handleManageTrip,
    handleConfirmDisruption,
    handleSnoozeDisruption,
    handleUpdatePushSubscription,
  } = useTravelAssistant(session);

  if (!isLoaded || !session) {
    return <div>Loading...</div>;
  }

  if (state.activeTripId && state.managedTrips[state.activeTripId]?.isOnboarding) {
    return <OnboardingFlow session={session} />; 
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto p-4">
        <DisruptionBanner
          scenario={state.disruptionScenario}
          onConfirm={handleConfirmDisruption}
          onSnooze={handleSnoozeDisruption}
        />
        <div className="mt-6">
          <TravelAssistantTabs
            state={state}
            onRegenerateSuggestions={handleRegenerateSuggestions}
            onUpdatePushSubscription={handleUpdatePushSubscription}
          />
        </div>

        <div className="mt-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Updates</h2>
          <UpdateFeed updates={state.updateFeed} />
        </div>

        <div className="mt-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Suggested for you</h2>
          <div className="mt-2 space-y-4">
            {state.suggestions.map((item) => (
              <SuggestedItem
                key={item.id}
                item={item}
                onAccept={() => handleAcceptSuggestion(item.id)}
                onDismiss={() => handleDismissSuggestion(item.id)}
              />
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Trip Readiness</h2>
          <ReadinessChecklist
            checklist={state.readiness}
            onToggleItem={handleToggleChecklistItem}
          />
        </div>
      </div>
    </div>
  );
}