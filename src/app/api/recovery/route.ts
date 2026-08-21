
import { NextResponse } from 'next/server';

// This route used to return a fixed, three-item "recovery plan" (including advice that
// literally says "after your trip to Tokyo") for ANY tripId, regardless of where the user
// actually went or what their itinerary looked like — fabricated personalization. There is
// no real recovery-plan generation implemented, so we return an honest "not available yet"
// response instead. The calling page (src/app/recovery/[tripId]/page.tsx) already treats a
// missing `plan` as "Could not generate a recovery plan," so this fails gracefully.
// TODO(product decision): generate a real plan from the trip's actual timezone shift,
// flight duration, and dates before re-enabling this feature.
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get('tripId');

    if (!tripId) {
        return NextResponse.json({ error: 'Trip ID is required' }, { status: 400 });
    }

    return NextResponse.json(
        { error: 'Recovery plans are not available yet.' },
        { status: 501 },
    );
}
