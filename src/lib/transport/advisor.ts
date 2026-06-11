import { JourneyContext } from "../journey/JourneyEngine";

// Mock API responses for demonstration
const fetchUberEstimate = async (context: JourneyContext) => {
    // In a real app, this would call the Uber API
    const isSurging = Math.random() > 0.7;
    return {
        provider: 'Uber',
        etaMinutes: isSurging ? 45 : 30,
        costDollars: isSurging ? 85 : 45,
        surgeMultiplier: isSurging ? 2.5 : 1,
    };
};

const fetchLyftEstimate = async (context: JourneyContext) => {
    const isSurging = Math.random() > 0.8;
    return {
        provider: 'Lyft',
        etaMinutes: isSurging ? 40 : 28,
        costDollars: isSurging ? 80 : 42,
        surgeMultiplier: isSurging ? 2.2 : 1,
    };
};

const fetchTransitEstimate = async (context: JourneyContext) => {
    // In a real app, this would call a transit API like Google Maps
    return {
        provider: 'Public Transit',
        etaMinutes: 35,
        costDollars: 2.75,
        line: 'Red Line',
        station: 'Airport Station'
    };
};

export const getOptimalTransport = async (context: JourneyContext) => {
    const [uber, lyft, transit] = await Promise.all([
        fetchUberEstimate(context),
        fetchLyftEstimate(context),
        fetchTransitEstimate(context),
    ]);

    const options = [uber, lyft, transit];

    // Simplified decision logic: prioritize cost unless rideshare is significantly faster
    let optimalChoice = transit;
    const bestRideshare = uber.etaMinutes < lyft.etaMinutes ? uber : lyft;

    if (bestRideshare.etaMinutes < transit.etaMinutes - 15) { // If rideshare is >15 mins faster
        optimalChoice = bestRideshare;
    }

    // Override if surge pricing is too high
    if (bestRideshare.surgeMultiplier > 2) {
        optimalChoice = transit;
    }

    return { optimalChoice, allOptions: options };
};