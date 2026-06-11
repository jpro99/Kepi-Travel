
import { NextResponse } from 'next/server';

// Mock data for a trip
const MOCK_TRIP_DATA = {
    "1": {
        title: "Trip to Tokyo",
        dateRange: "June 1, 2026 - June 10, 2026",
        moments: [
            { title: "Arrival in Shinjuku", description: "Landed at Narita and took the express train. The city lights were incredible." },
            { title: "Exploring Shibuya Crossing", description: "Experienced the world's busiest intersection. It was a sea of people and neon." },
            { title: "Day trip to Hakone", description: "Took a scenic trip to see Mount Fuji, but it was too cloudy. The hot springs were a nice consolation." },
            { title: "Farewell Dinner", description: "Enjoyed a final sushi dinner in Ginza before heading home." },
        ]
    }
};

export async function POST(request: Request) {
    const { tripId } = await request.json();

    if (MOCK_TRIP_DATA[tripId]) {
        return NextResponse.json({ memory: MOCK_TRIP_DATA[tripId] });
    } else {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
}
