import { NextResponse } from 'next/server';
import type { JourneyContext, BioHarmonizationPlan } from '@/lib/journey/types';

// This is a mock of a powerful AI service that analyzes a user's itinerary and biometrics.
// In a real app, this would involve complex logic and multiple API calls.
async function getBioHarmonizationPlan(context: JourneyContext): Promise<BioHarmonizationPlan | null> {
    // Mock logic: if the trip is international, recommend a jet lag plan.
    const isInternational = context.reservations.some(r => r.type === 'flight' && r.flightArrivalAirport && r.flightDepartureAirport && r.flightDepartureAirport.slice(0, 2) !== r.flightArrivalAirport.slice(0, 2));

    if (isInternational) {
        return {
            overallStatus: 'at-risk',
            activeRecommendations: [
                {
                    id: 'rec_sunlight_1',
                    title: "Seek Morning Sunlight",
                    description: "Upon arrival, getting 20-30 minutes of morning sunlight will help reset your body's internal clock to the new timezone.",
                    type: 'sunlight',
                    timing: 'immediate',
                    action: { label: "I'll do it", type: 'function', target: 'acknowledgeRecommendation' },
                },
                {
                    id: 'rec_caffeine_1',
                    title: "Avoid Caffeine Before Bedtime",
                    description: "To ensure quality sleep, avoid caffeine for at least 6 hours before you plan to go to sleep in the new timezone.",
                    type: 'caffeine',
                    timing: 'before-sleep',
                    action: { label: "Got it", type: 'function', target: 'acknowledgeRecommendation' },
                }
            ],
            activeDirectives: [
                { type: 'color_temp', value: 'warm' },
            ],
        };
    }

    return null;
}

export async function POST(request: Request) {
    const { context } = await request.json() as { context: JourneyContext };

    const bioPlan = await getBioHarmonizationPlan(context);

    return NextResponse.json({ bioPlan });
}
