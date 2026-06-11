import { useEffect, useState } from "react";
import { useDebouncedCallback } from 'use-debounce';
import { AlertTriangle, HelpCircle, Info, X, Zap, ShieldCheck, Umbrella } from 'lucide-react';
import type { JourneyState, JourneyContext, NextStep, ProactiveIntervention, AutonomousAction, Opportunity, ItineraryFortification } from "@/lib/journey/types";

interface JourneyFlowPanelProps {
    journeyState: JourneyState;
    journeyContext: JourneyContext;
    setJourneyState: (state: JourneyState) => void;
    onReportProblem: () => void;
    isLoading: boolean;
}

const InterventionCard: React.FC<{ intervention: ProactiveIntervention }> = ({ intervention }) => (
    <div className="mt-4 rounded-2xl border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-950/50">
        <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-yellow-500 dark:text-yellow-400" />
            <div className="flex-1">
                <h3 className="font-bold text-sm text-yellow-800 dark:text-yellow-200">{intervention.title}</h3>
                <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">{intervention.description}</p>
            </div>
        </div>
    </div>
);

const AutonomousActionCard: React.FC<{ action: AutonomousAction }> = ({ action }) => (
    <div className="mt-4 rounded-2xl border-2 border-red-500 bg-red-50 p-4 dark:bg-red-950/50">
         <h3 className="font-bold text-md text-red-800 dark:text-red-200">{action.title}</h3>
         <p className="mt-1 text-sm text-red-700 dark:text-red-300">{action.description}</p>
    </div>
);

const OpportunityCard: React.FC<{ opportunity: Opportunity }> = ({ opportunity }) => (
     <div className="mt-4 rounded-2xl border border-dashed border-sky-400 bg-sky-50 p-4 dark:border-sky-600 dark:bg-sky-950/50">
        <h3 className="font-bold text-sm text-sky-800 dark:text-sky-200">{opportunity.title}</h3>
        <p className="mt-1 text-sm text-sky-700 dark:text-sky-300">{opportunity.description}</p>
    </div>
); 

const FortificationCard: React.FC<{ fortification: ItineraryFortification }> = ({ fortification }) => (
    <div className="mt-4 rounded-2xl border-2 border-indigo-500 bg-indigo-50 p-4 dark:bg-indigo-950/50">
        <div className="flex items-start gap-3">
            <Umbrella className="h-6 w-6 flex-shrink-0 text-indigo-500" />
            <div className="flex-1">
                <h3 className="font-bold text-md text-indigo-800 dark:text-indigo-200">Itinerary Fortified</h3>
                <p className="mt-1 text-sm font-semibold text-indigo-700 dark:text-indigo-300">Predicted Risk: {fortification.predictedDisruption.description}</p>
                <div className="mt-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 p-3">
                    <p className="text-sm font-bold text-indigo-800 dark:text-indigo-200">Contingency Plan:</p>
                    <p className="text-sm text-indigo-700 dark:text-indigo-300">{fortification.contingencyPlan.description}</p>
                </div>
            </div>
        </div>
    </div>
);


export const JourneyFlowPanel: React.FC<JourneyFlowPanelProps> = ({ 
    journeyState, 
    journeyContext, 
    setJourneyState,
    onReportProblem,
    isLoading
}) => {
    const [nextStep, setNextStep] = useState<NextStep | null>(null);
    const [fortification, setFortification] = useState<ItineraryFortification | null>(null);

    const debouncedGetStep = useDebouncedCallback(async (state, context) => {
        if (isLoading) return; // Do not fetch if the main hook is still loading
        const response = await fetch('/api/journey/next-step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state, context }),
        });
        const step = await response.json();
        setNextStep(step);
    }, 300);

    useEffect(() => {
        debouncedGetStep(journeyState, journeyContext);
    }, [journeyState, journeyContext, debouncedGetStep]);

    const activeStep = nextStep;

    if (!activeStep) {
        return <div className="relative rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-lg animate-pulse min-h-[150px]"></div>;
    }

    const displayFortification = fortification || activeStep.fortification;

    return (
        <div className="relative rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-lg">
            <div className="flex items-start gap-4">
                {displayFortification && <Umbrella className="h-6 w-6 flex-shrink-0 text-indigo-500" />}
                
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{activeStep.title}</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{activeStep.description}</p>
                </div>
            </div>
            
            {/* --- "Pre-Crime" Oracle Component --- */}
            {displayFortification && <FortificationCard fortification={displayFortification} />}

            {activeStep.autonomousAction && <AutonomousActionCard action={activeStep.autonomousAction} />}
            {activeStep.opportunity && <OpportunityCard opportunity={activeStep.opportunity} />}
            {activeStep.intervention && <InterventionCard intervention={activeStep.intervention} />}

            <button onClick={onReportProblem} aria-label="Report a Problem" className="absolute bottom-[-20px] right-6 flex items-center justify-center h-12 w-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800">
                <HelpCircle className="h-6 w-6" />
            </button>
        </div>
    );
}
