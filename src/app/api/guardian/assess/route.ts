import { NextResponse } from 'next/server';

// A real implementation would use a more sophisticated rules engine
// and have access to airport layout data (e.g., gate locations).
function getGateLocation(gate: string) {
    // Mock data for gate locations at SFO
    const gateLocations: { [key: string]: { lat: number, lon: number } } = {
        "C12": { lat: 37.615, lon: -122.384 },
    };
    return gateLocations[gate] || null;
}

export async function POST(request: Request) {
    try {
        const { vector, tripContext } = await request.json();
        console.log('--- Guardian Assess API --- ');
        console.log('Received Vector:', JSON.stringify(vector, null, 2));
        console.log('Received Trip Context:', JSON.stringify(tripContext, null, 2));

        let assessment: {
            shouldIntervene: boolean;
            message: string;
            debug?: any;
        } = { shouldIntervene: false, message: '' };

        // Rule: Check if user is walking away from the gate
        if (tripContext.stage === 'airport' && vector.speed > 0.5) { // User is walking
            const flight = tripContext.reservations.find((r: any) => r.type === 'flight');
            if (flight) {
                const gate = flight.location.split('Gate ')[1];
                const gateLocation = getGateLocation(gate);

                if (gateLocation) {
                    // This is a simplified check. A real implementation would use a more robust
                    // vector comparison to see if the user's bearing is divergent from the gate's location.
                    // For now, we'll just check if their bearing is in the opposite direction (e.g., > 90 degrees off)
                    
                    // Calculate bearing to gate
                    const R = 6371e3;
                    const φ1 = tripContext.userLocation.lat * Math.PI/180;
                    const φ2 = gateLocation.lat * Math.PI/180;
                    const Δλ = (gateLocation.lon-tripContext.userLocation.lon) * Math.PI/180;

                    const y = Math.sin(Δλ) * Math.cos(φ2);
                    const x = Math.cos(φ1)*Math.sin(φ2) -
                              Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
                    const θ = Math.atan2(y, x);
                    const bearingToGate = (θ*180/Math.PI + 360) % 360;

                    const bearingDifference = Math.abs(vector.bearing - bearingToGate);

                    if (bearingDifference > 80 && bearingDifference < 280) {
                        assessment.shouldIntervene = true;
                        assessment.message = `You seem to be heading away from Gate ${gate}. Is everything alright?`;
                    }

                    assessment.debug = {
                        vector,
                        bearingToGate,
                        bearingDifference,
                        gateLocation,
                        userLocation: tripContext.userLocation
                    };
                }
            }
        }

        return NextResponse.json(assessment);
    } catch (error) {
        console.error('[Guardian] Error parsing request body:', error);
        const rawBody = await request.text();
        console.error('[Guardian] Raw request body:', rawBody);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
