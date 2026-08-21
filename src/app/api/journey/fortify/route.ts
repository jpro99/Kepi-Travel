import { NextResponse } from 'next/server';
import type { JourneyContext } from '@/lib/journey/types';

// This route used to fabricate a connection-risk prediction: it claimed ANY back-to-back
// flight pair was a "tight connection" (the check literally said `return true; // Assume a
// tight connection for demonstration`, ignoring real departure/arrival times), then
// invented a specific 35% miss probability, a fake "ORD" 45-minute-connection narrative
// attributed to a "Kepi Predictive Analytics Engine" that doesn't exist, and a fake held
// backup seat ("UA 789, leaves 8:45 PM") that was never actually booked. That is exactly
// the kind of invented, plausible-looking travel data this product must never present as
// real. Removing all of it and returning an honest "not available yet" response.
// TODO(product decision): a real implementation would need to parse actual layover
// datetimes from `context.reservations`, call a real flight-risk/weather data source, and
// only offer a contingency booking when one has actually been held via a real airline API.
export async function POST(request: Request) {
    try {
        const { context } = await request.json() as { context: JourneyContext };
        void context;

        return NextResponse.json(
            { error: 'Itinerary risk analysis is not available yet.' },
            { status: 501 },
        );
    } catch (error) {
        console.error('[Fortify API] Error:', error);
        return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
    }
}
