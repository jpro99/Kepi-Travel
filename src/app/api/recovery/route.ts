
import { NextResponse } from 'next/server';

// Mock recovery plan data
const MOCK_RECOVERY_PLAN = {
    recommendations: [
        {
            category: "Sleep & Circadian Rhythm",
            advice: "To reset your body clock after your trip to Tokyo, prioritize morning sunlight exposure for the next 3 days. Aim for 20 minutes before 10 AM. Avoid screens for 90 minutes before your target bedtime of 10:00 PM."
        },
        {
            category: "Nutrition & Hydration",
            advice: "Travel can be dehydrating. Drink at least 3 liters of water today. Focus on light, easily digestible meals. Avoid heavy carbs and processed foods for the next 48 hours to help your digestive system recover."
        },
        {
            category: "Light Exercise",
            advice: "Engage in 30 minutes of light activity, such as a brisk walk or stretching. This will improve circulation and help reduce any stiffness from your flight."
        }
    ]
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get('tripId');

    // In a real app, the plan would be dynamically generated based on the tripId.
    if (tripId) {
        return NextResponse.json({ plan: MOCK_RECOVERY_PLAN });
    } else {
        return NextResponse.json({ error: 'Trip ID is required' }, { status: 400 });
    }
}
