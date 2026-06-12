import { NextResponse } from 'next/server';

// Mocks an AI service that generates recovery options for a given disruption
async function getRecoveryOptions(tripId: string) {
    // In a real implementation, this would query flight status, hotel availability, etc.
    return [
        {
            id: 'rebook_next_flight',
            label: 'Rebook on the next available flight',
            description: 'Flight leaves at 8:45 PM. We will handle the booking change for you.',
        },
        {
            id: 'find_hotel_and_rebook_morning',
            label: 'Find a nearby hotel and fly tomorrow',
            description: 'We will book a room at the Grand Hyatt and a flight for 9:00 AM tomorrow.',
        },
        {
            id: 'cancel_trip',
            label: 'Cancel the remainder of the trip',
            description: 'We will cancel all remaining reservations and request refunds where possible.',
        },
    ];
}

export async function POST(request: Request) {
    const { trip } = await request.json();

    const recoveryOptions = await getRecoveryOptions(trip);

    return NextResponse.json({ recoveryOptions });
}
