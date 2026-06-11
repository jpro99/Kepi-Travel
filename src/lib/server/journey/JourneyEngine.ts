import { getOptimalTransport } from "../../transport/advisor";
import { runOracle } from '../../oracle';
import { pushLiveActivityUpdate } from '../../ambient/liveActivities';
import type { JourneyState, JourneyContext, AutonomousAction, Opportunity, ProactiveIntervention, NextStep } from '../../journey/types';
import type { LiveActivityData } from "../../ambient/types";

// The "Silent Oracle" Engine

export class JourneyEngine {

    /**
     * The heart of the "Sentient Itinerary". This method analyzes the journey for
     * major disruptions or valuable opportunities, elevating the app beyond a simple guide.
     */
    private static findOpportunitiesAndDisruptions(state: JourneyState, context: JourneyContext): { autonomousAction?: AutonomousAction; opportunity?: Opportunity } {
        // --- 1. Check for Major Disruptions (Highest Priority) ---
        if (context.disruption?.type === 'flight-cancellation') {
            return {
                autonomousAction: {
                    type: 'rebook-flight',
                    status: 'requires-confirmation', // The system has found a solution
                    title: `Your flight ${context.disruption.flightNumber} was canceled.`,
                    description: "We've proactively found an alternative flight on the same airline, departing in 2 hours. Your seat preference (window) is available.",
                    confirmation: {
                        prompt: "Would you like to book this flight? Your original ticket cost will be applied.",
                        options: [
                            { label: "Yes, book it now", type: 'function', target: 'CONFIRM_REBOOKING' },
                            { label: "Show me other options", type: 'function', target: 'SHOW_OTHER_FLIGHTS' },
                        ]
                    }
                }
            };
        }

        // --- 2. Check for Valuable Opportunities ---
        if (state === 'AT_AIRPORT_POST_SECURITY') {
            // Placeholder logic: assume a long layover is detected
            const longLayover = true; 
            if (longLayover) {
                return {
                    opportunity: {
                        type: 'lounge-access',
                        title: "Long Layover Opportunity",
                        description: "You have a 3-hour layover. Unwind in the Centurion Lounge near Gate D12. Your Platinum Card grants you access.",
                        action: { label: "Get AR Directions to Lounge", type: 'function', target: 'NAV_TO_LOUNGE' }
                    }
                }
            }
        }

        return {}; // No major disruptions or opportunities found
    }

    /**
     * Checks for high-value, proactive interventions based on the current context.
     * This is where the app demonstrates "out-of-this-world" intelligence.
     */
    private static checkForProactiveInterventions(state: JourneyState, context: JourneyContext): ProactiveIntervention | null {
        // --- Baggage Guarantee Intervention ---
        if (state === 'AT_BAGGAGE_CLAIM') {
            const flight = context.flightStatus;
            const now = new Date().getTime();

            // Ensure we have the necessary flight data
            if (!flight || !flight.airline?.iata || !flight.arrival?.actualTime) {
                return null;
            }

            // Example: Alaska Airlines 20-Minute Baggage Guarantee
            if (flight.airline.iata === 'AS') {
                const arrivalTime = new Date(flight.arrival.actualTime).getTime();
                const minutesSinceArrival = (now - arrivalTime) / (1000 * 60);

                if (minutesSinceArrival > 25) { // Use a 25-min threshold for reliability
                    return {
                        id: 'alaska-baggage-guarantee',
                        title: "Alaska's Baggage Guarantee",
                        description: "It's been over 25 minutes since you landed. If you don't have your bags, you may be eligible for 2,500 bonus miles or a $25 flight voucher under their 20-minute baggage guarantee.",
                        actions: [
                            { label: "View Guarantee", type: 'link', target: 'https://www.alaskaair.com/content/travel-info/baggage/baggage-claim/20-minute-baggage-guarantee' },
                            { label: "File a Claim", type: 'link', target: 'https://www.alaskaair.com/feedback' }
                        ]
                    };
                }
            }
             // Example: Delta Air Lines
            if (flight.airline.iata === 'DL') {
                const arrivalTime = new Date(flight.arrival.actualTime).getTime();
                const minutesSinceArrival = (now - arrivalTime) / (1000 * 60);

                if (minutesSinceArrival > 25) { 
                    return {
                        id: 'delta-baggage-guarantee',
                        title: "Delta's Baggage Guarantee",
                        description: "It's been over 25 minutes since you landed. If your checked bag isn't on the carousel in 20 minutes or less, you are eligible to receive 2,500 bonus miles.",
                        actions: [
                            { label: "View Guarantee", type: 'link', target: 'https://www.delta.com/us/en/baggage/checked-baggage/baggage-claim-guarantee' },
                        ]
                    };
                }
            }
        }

        return null; // No intervention found
    }

    private static async updateAmbientInterfaces(userId: string, nextStep: NextStep, state: JourneyState) {
        // In a real app, you would get the user's push token from a database.
        if (!userId) return;

        const progressMapping = {
            PRE_TRIP: 0.1,
            EN_ROUTE_TO_AIRPORT: 0.2,
            AT_AIRPORT_PRE_SECURITY: 0.3,
            AT_AIRPORT_POST_SECURITY: 0.4,
            AT_GATE: 0.5,
            IN_FLIGHT: 0.6,
            LANDED: 0.7,
            AT_BAGGAGE_CLAIM: 0.8,
            EN_ROUTE_TO_HOTEL: 0.9,
            AT_HOTEL: 1.0,
            POST_TRIP: 1.0,
            BAGGAGE_ISSUE: 0.8,
        };

        // Create a concise summary for the ambient display
        let secondary = nextStep.description.substring(0, 40);
        if (nextStep.description.length > 40) secondary += "...";

        const liveActivityData: LiveActivityData = {
            primary: nextStep.title,
            secondary,
            tertiary: nextStep.fortification ? "Itinerary Fortified" : (nextStep.autonomousAction ? "Action Required" : "On Track"),
            progress: progressMapping[state] || 0,
            journeyState: state,
        };

        await pushLiveActivityUpdate(userId, liveActivityData);
    }

    /**
     * Determines the next logical step in the user's journey, assuming everything is going correctly.
     * It no longer asks questions, instead embedding proactive interventions when valuable.
     */
    public static async determineNextStep(state: JourneyState, context: JourneyContext): Promise<NextStep> {
        let nextStep: NextStep;

        // --- "PRE-CRIME" ORACLE --- 
        const fortification = await runOracle(context);

        // --- SENTIENT ITINERARY --- 
        const { autonomousAction, opportunity } = this.findOpportunitiesAndDisruptions(state, context);

        if (autonomousAction) {
            nextStep = {
                title: autonomousAction.title,
                description: autonomousAction.description,
                autonomousAction: autonomousAction,
                fortification, // Carry fortification info through
            };
        } else if (opportunity) {
            nextStep = {
                title: opportunity.title,
                description: opportunity.description,
                opportunity: opportunity,
                action: {
                    label: opportunity.action.label,
                    type: opportunity.action.type,
                    payload: opportunity.action.target,
                },
                fortification, // Carry fortification info through
            };
        } else {
            const intervention = this.checkForProactiveInterventions(state, context);
            // Standard journey guidance
            switch (state) {
                case 'BAGGAGE_ISSUE':
                    const airline = context.reservations.find(r => r.type === 'flight')?.provider || 'the airline';
                    nextStep = {
                        title: "Baggage Issue Reported",
                        description: `Please proceed to the baggage service office for ${airline}. We have prepared the necessary information for you.`,
                    };
                    break;
                case 'EN_ROUTE_TO_HOTEL':
                    const { optimalChoice, allOptions } = await getOptimalTransport(context);
                    if (optimalChoice.provider === 'Public Transit') {
                        const rideshareOption = allOptions.find(o => o.provider !== 'Public Transit');
                        const costSavings = rideshareOption ? rideshareOption.costDollars - optimalChoice.costDollars : 0;
                        nextStep = {
                            title: `The ${optimalChoice.line} is your best choice.`,
                            description: `An Uber is currently at ${rideshareOption?.surgeMultiplier || 1}x surge pricing. The train will save you ~$${costSavings.toFixed(0)} and is expected to be faster.`,
                            action: { label: "Get AR directions to station & buy ticket", type: 'function', payload: 'NAV_TO_TRANSIT' }
                        };
                    } else {
                        nextStep = {
                            title: `Your ${optimalChoice.provider} is the fastest option.`,
                            description: `Estimated cost is $${optimalChoice.costDollars}. A car will arrive in ~${optimalChoice.etaMinutes} minutes.`,
                            action: { label: `Book ${optimalChoice.provider}`, type: 'link', payload: optimalChoice.provider === 'Uber' ? 'https://m.uber.com/' : 'https://lyft.com/ride' }
                        };
                    }
                    break;
                case 'PRE_TRIP':
                    nextStep = { title: "It's almost time to go!", description: "We'll let you know when it's time to head to the airport.", intervention, fortification };
                    break;
                case 'EN_ROUTE_TO_AIRPORT':
                    nextStep = { title: "Head to the airport", description: "You're on your way. We'll guide you to the terminal when you arrive.", intervention, fortification };
                    break;
                case 'AT_AIRPORT_PRE_SECURITY':
                    nextStep = { title: "Time for security", description: context.userPreferences.usePreCheck ? "Proceed to the TSA Pre-Check lane." : "Proceed to the main security checkpoint.", intervention, fortification };
                    break;
                case 'AT_AIRPORT_POST_SECURITY':
                    nextStep = { title: "You're through security!", description: "Head to your gate. We'll notify you of any changes.", intervention, fortification };
                    break;
                case 'AT_GATE':
                    nextStep = { title: "You're at your gate", description: "Relax until boarding begins. We're monitoring your flight for any updates.", intervention, fortification };
                    break;
                case 'IN_FLIGHT':
                    nextStep = { title: "You're in the air!", description: "Sit back, relax, and enjoy your flight. We'll have your arrival information ready when you land.", intervention, fortification };
                    break;
                case 'LANDED':
                    nextStep = { title: "Welcome to your destination!", description: "Proceed to baggage claim to pick up your luggage.", intervention, fortification };
                    break;
                case 'AT_BAGGAGE_CLAIM':
                    nextStep = { title: "Collect your bags", description: "Find your bags on the carousel. We're monitoring for any issues.", intervention, fortification };
                    break;
                case 'AT_HOTEL':
                    nextStep = { title: "You've arrived at your hotel!", description: "Check in and get settled. Enjoy your stay!", intervention, fortification };
                    break;
                case 'POST_TRIP':
                    nextStep = { title: "Welcome home!", description: "We hope you had a great trip.", intervention, fortification };
                    break;
                default:
                    nextStep = { title: "Ready for your trip?", description: "Your journey is planned. We'll guide you every step of the way.", intervention, fortification };
            }
        }

        // --- AMBIENT ITINERARY --- 
        // Finally, push the determined step to ambient interfaces.
        await this.updateAmbientInterfaces(context.userId, nextStep, state);

        return nextStep;
    }

    /**
     * Called when the user presses the "Problem" button. It uses the current journey
     * state to deduce the likely problem and offer intelligent, contextual solutions.
     */
    public static async handleProblem(state: JourneyState, context: JourneyContext): Promise<NextStep> {
        switch (state) {
            case 'AT_BAGGAGE_CLAIM':
                return {
                    title: "Problem at Baggage Claim?",
                    description: "It looks like you're at baggage claim. Let us know what's wrong, and we'll help you solve it.",
                    interaction: {
                        type: 'conversation',
                        prompt: "What's the issue?",
                        initialSuggestions: [
                            "My bags haven't arrived.",
                            "My bag is damaged.",
                            "I can't find the baggage claim area.",
                        ]
                    }
                };
            case 'AT_HOTEL':
                 return {
                     title: "Problem at the Hotel?",
                     description: "Having an issue with your hotel check-in or reservation? Describe the problem, and we'll find a solution.",
                     interaction: {
                        type: 'conversation',
                        prompt: "How can I help?",
                        initialSuggestions: [
                            "My reservation is missing.",
                            "The room isn't what I booked.",
                            "I lost my confirmation number.",
                        ]
                     }
                };
            default:
                 return {
                    title: "How can I help?",
                    description: "Tell me what the problem is, and I'll do my best to solve it. You can type or record your issue.",
                     interaction: {
                        type: 'conversation',
                        prompt: "What seems to be the problem?",
                        initialSuggestions: []
                     }
                 }
        }
    }
}
