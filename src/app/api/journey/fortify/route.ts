import { NextResponse } from 'next/server';
import type { JourneyContext, ItineraryFortification } from '@/lib/journey/types';

// This is a mock of a powerful AI service that analyzes an itinerary for risks.
// In a real app, this would involve complex logic and multiple API calls to weather, FAA, etc.
async function getFortificationPlan(context: JourneyContext): Promise<ItineraryFortification | null> {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 1000));
    const hasTightConnection = context.reservations.some((r, i) => {
        if (r.type !== 'flight' || i === 0) return false;
        const previousFlight = context.reservations[i-1];
        if (previousFlight.type !== 'flight') return false;

        // This is a naive check. A real implementation would parse and compare datetimes.
        return true; // Assume a tight connection for demonstration
    });

    if (hasTightConnection) {
        return {
            predictedDisruption: {
                type: 'connection-risk',
                probability: 0.35, // 35% chance of missed connection
                description: "Your 45-minute connection at ORD has a high risk of being missed due to frequent taxiway congestion.",
                source: "Kepi Predictive Analytics Engine",
            },
            contingencyPlan: {
                type: 'alternative-flight',
                description: "If your inbound flight is delayed, we have a held seat for you on the next flight (UA 789, leaves 8:45 PM). We can confirm this booking for you instantly.",
                status: 'held',
                action: {
                    label: "Confirm backup flight",
                    type: 'function',
                    target: 'confirmContingency',
                },
            },
        };
    }

    return null;
}

export async function POST(request: Request) {
    console.log('--- Fortify API Called ---');
    try {
        const { context } = await request.json() as { context: JourneyContext };
        console.log('Received Context:', JSON.stringify(context, null, 2));

        const fortificationPlan = await getFortificationPlan(context);
        console.log('Returning Fortification Plan:', JSON.stringify(fortificationPlan, null, 2));

        return NextResponse.json({ fortification: fortificationPlan });
    } catch (error) {
        console.error('[Fortify API] Error:', error);
        const rawBody = await request.text().catch(() => 'Could not read body');
        console.error('[Fortify API] Raw Body:', rawBody);
        return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
    }
}
