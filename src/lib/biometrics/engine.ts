import "server-only";

// This interface defines the structure for a biological harmonization plan,
// designed to mitigate the physiological stresses of travel.

export interface BioHarmonizationPlan {
    // A unique identifier for this specific plan.
    planId: string;

    // The user to whom this plan applies.
    userId: string;

    // The specific goal of this plan (e.g., mitigating jet lag for a trip to Tokyo).
    objective: string;

    // The sequence of actions the user should take to achieve the goal.
    protocol: BioProtocolStep[];
}

// A single step within a bio-harmonization protocol.
export interface BioProtocolStep {
    // A unique ID for this step.
    stepId: string;

    // The type of action to be taken.
    type: "LIGHT_EXPOSURE" | "SLEEP" | "AVOID_CAFFEINE" | "HYDRATE" | "MEDITATE" | "EAT";

    // The exact UTC time at which this action should be performed.
    triggerTimeUtc: string;

    // The duration of the action, in minutes.
    durationMinutes: number;

    // A user-facing description of the action and its benefits.
    instruction: string;

    // The current status of this step.
    status: "pending" | "active" | "completed" | "skipped";
}

// This function would generate a personalized Bio-Harmonization Plan.
export async function createJetLagNeutralizationPlan(userId: string, flight: any): Promise<BioHarmonizationPlan> {
    // In a real implementation, this would involve:
    // 1. Analyzing the user's typical sleep patterns from a health data source.
    // 2. Calculating the time zone difference and the user's chronotype.
    // 3. Generating a multi-day schedule of light exposure, sleep, and caffeine intake.

    // For now, we will create a simulated plan for a flight to Tokyo.
    const planId = `bio-plan-${userId}-${new Date().getTime()}`;
    const now = new Date();

    return {
        planId,
        userId,
        objective: "Neutralize jet lag for your flight to Tokyo (HND)",
        protocol: [
            {
                stepId: `${planId}-1`,
                type: "AVOID_CAFFEINE",
                triggerTimeUtc: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(), // In 2 hours
                durationMinutes: 480, // For 8 hours
                instruction: "Avoid caffeine for the next 8 hours to prepare your body for a new sleep schedule.",
                status: "pending",
            },
            {
                stepId: `${planId}-2`,
                type: "SLEEP",
                triggerTimeUtc: new Date(now.getTime() + 10 * 60 * 60 * 1000).toISOString(), // In 10 hours
                durationMinutes: 90,
                instruction: "Take a 90-minute nap now to align your body with your destination's night-time.",
                status: "pending",
            },
        ],
    };
}
