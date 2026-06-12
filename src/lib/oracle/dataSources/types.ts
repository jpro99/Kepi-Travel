export interface RealtimeAviationData {
    airTrafficCongestion: {
        [airportIata: string]: number; // Congestion score from 0 to 1
    };
    weatherConditions: {
        [airportIata: string]: {
            temperature: number; // in Celsius
            windSpeed: number; // in km/h
            isThunderstorm: boolean;
        };
    };
}
