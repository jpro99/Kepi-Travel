/**
 * Airline frequent flyer status tiers and associated lounge + benefit data.
 * Used by AirportMode to give status-aware guidance.
 */

export interface StatusTier {
  tier: string;           // e.g. "Gold", "Platinum", "MVP Gold"
  loungeAccess: boolean;
  priorityBoarding: boolean;
  prioritySecurity: boolean;
  freeCheckedBags: number;
  extraBoardingMinutes: number; // how many extra minutes they can wait before boarding
}

export interface AirlineStatusProgram {
  airline: string;        // display name
  iata: string[];         // IATA codes this airline operates under
  program: string;        // loyalty program name
  tiers: StatusTier[];
  lounges: AirlineLoungeInfo[];
}

export interface AirlineLoungeInfo {
  airport: string;        // IATA airport code
  terminal?: string;
  name: string;
  location: string;       // human description, e.g. "Concourse B, near Gate B6"
  gateProximityNote?: string; // e.g. "~5 min walk to B gates, ~12 min to C gates"
  hours?: string;
}

export const AIRLINE_PROGRAMS: AirlineStatusProgram[] = [
  {
    airline: "Alaska Airlines",
    iata: ["AS"],
    program: "Mileage Plan",
    tiers: [
      { tier: "MVP",           loungeAccess: false, priorityBoarding: true,  prioritySecurity: false, freeCheckedBags: 1, extraBoardingMinutes: 10 },
      { tier: "MVP Gold",      loungeAccess: true,  priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 2, extraBoardingMinutes: 15 },
      { tier: "MVP Gold 75K",  loungeAccess: true,  priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 3, extraBoardingMinutes: 20 },
    ],
    lounges: [
      { airport:"SEA", terminal:"S",   name:"Alaska Lounge", location:"Concourse C, near Gate C2", gateProximityNote:"2 min to C gates, 10 min to N gates", hours:"4:30am–11pm" },
      { airport:"SEA", terminal:"N",   name:"Alaska Lounge+", location:"North Satellite, Gate N6", gateProximityNote:"2 min to N gates, 15 min to C gates", hours:"4:30am–11pm" },
      { airport:"LAX", terminal:"6",   name:"Alaska Lounge", location:"Terminal 6, past security near Gate 65", gateProximityNote:"5 min to T6 gates", hours:"5am–10pm" },
      { airport:"SFO", terminal:"2",   name:"Alaska Lounge", location:"Terminal 2, Boarding Area D", gateProximityNote:"3 min to D gates", hours:"5am–10pm" },
      { airport:"PDX", terminal:"C",   name:"Alaska Lounge", location:"Concourse C, near Gate C8", gateProximityNote:"3 min to C gates, 8 min to D gates", hours:"5am–10pm" },
      { airport:"JFK", terminal:"7",   name:"Alaska Lounge", location:"Terminal 7, past security", gateProximityNote:"5 min to all T7 gates", hours:"5am–9pm" },
      { airport:"BOS", terminal:"B",   name:"Alaska Lounge", location:"Terminal B, Gate B38 area", gateProximityNote:"5 min walk to B gates", hours:"5am–9pm" },
    ],
  },
  {
    airline: "United Airlines",
    iata: ["UA"],
    program: "MileagePlus",
    tiers: [
      { tier: "Silver",    loungeAccess: false, priorityBoarding: true,  prioritySecurity: false, freeCheckedBags: 1, extraBoardingMinutes: 10 },
      { tier: "Gold",      loungeAccess: false, priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 2, extraBoardingMinutes: 15 },
      { tier: "Platinum",  loungeAccess: true,  priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 3, extraBoardingMinutes: 20 },
      { tier: "1K",        loungeAccess: true,  priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 3, extraBoardingMinutes: 25 },
    ],
    lounges: [
      { airport:"ORD", terminal:"1", name:"United Club",   location:"Terminal 1, Concourse C, Level 2 near Gate C18", gateProximityNote:"2 min to C gates, 8 min to B gates", hours:"5am–10pm" },
      { airport:"ORD", terminal:"1", name:"United Club",   location:"Terminal 1, Concourse B, Level 2 near Gate B14", gateProximityNote:"2 min to B gates", hours:"5am–10pm" },
      { airport:"IAH", terminal:"E", name:"United Club",   location:"Terminal E, Level 2 near Gate E10", gateProximityNote:"3 min to E gates", hours:"5am–10pm" },
      { airport:"SFO", terminal:"3", name:"United Club",   location:"Terminal 3, Boarding Area F, near Gate F8", gateProximityNote:"3 min to F gates", hours:"5am–11pm" },
      { airport:"EWR", terminal:"C", name:"United Club",   location:"Terminal C, Level 2 between Gates 70–90", gateProximityNote:"5 min to all C gates", hours:"5am–11pm" },
      { airport:"LAX", terminal:"7", name:"United Club",   location:"Terminal 7/8, Level 6 connector", gateProximityNote:"5 min to T7/T8 gates", hours:"5am–10pm" },
      { airport:"DEN", terminal:"B", name:"United Club",   location:"Concourse B, Level 6 mezzanine", gateProximityNote:"3 min to B gates, 10 min to A/C", hours:"5am–10pm" },
    ],
  },
  {
    airline: "American Airlines",
    iata: ["AA"],
    program: "AAdvantage",
    tiers: [
      { tier: "Gold",      loungeAccess: false, priorityBoarding: true,  prioritySecurity: false, freeCheckedBags: 1, extraBoardingMinutes: 10 },
      { tier: "Platinum",  loungeAccess: false, priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 2, extraBoardingMinutes: 15 },
      { tier: "Platinum Pro", loungeAccess: true, priorityBoarding: true, prioritySecurity: true, freeCheckedBags: 3, extraBoardingMinutes: 20 },
      { tier: "Executive Platinum", loungeAccess: true, priorityBoarding: true, prioritySecurity: true, freeCheckedBags: 3, extraBoardingMinutes: 25 },
    ],
    lounges: [
      { airport:"DFW", terminal:"D", name:"Admirals Club", location:"Terminal D, Level 2 near Gate D24", gateProximityNote:"3 min to D20–30 gates, 8 min to D gates ends", hours:"5am–11pm" },
      { airport:"JFK", terminal:"8", name:"Admirals Club", location:"Terminal 8, Mezzanine Level", gateProximityNote:"5 min to all T8 gates", hours:"5am–11pm" },
      { airport:"LAX", terminal:"4", name:"Admirals Club", location:"Terminal 4, Level 4 above security", gateProximityNote:"5 min to T4 gates, 8 min to T5", hours:"5am–10pm" },
      { airport:"ORD", terminal:"3", name:"Admirals Club", location:"Terminal 3, Concourse H, Level 2", gateProximityNote:"3 min to H gates", hours:"5am–11pm" },
      { airport:"MIA", terminal:"D", name:"Admirals Club", location:"Concourse D, Level 2 near Gate D30", gateProximityNote:"5 min to D gates", hours:"5am–11pm" },
    ],
  },
  {
    airline: "Delta Air Lines",
    iata: ["DL"],
    program: "SkyMiles",
    tiers: [
      { tier: "Silver",    loungeAccess: false, priorityBoarding: true,  prioritySecurity: false, freeCheckedBags: 1, extraBoardingMinutes: 10 },
      { tier: "Gold",      loungeAccess: false, priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 2, extraBoardingMinutes: 15 },
      { tier: "Platinum",  loungeAccess: true,  priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 3, extraBoardingMinutes: 20 },
      { tier: "Diamond",   loungeAccess: true,  priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 3, extraBoardingMinutes: 25 },
    ],
    lounges: [
      { airport:"ATL", terminal:"T", name:"Delta Sky Club", location:"Concourse B, Gate B18 area (Level 2)", gateProximityNote:"3 min to B gates, 8 min to Concourse C via underground train", hours:"5am–11pm" },
      { airport:"ATL", terminal:"T", name:"Delta Sky Club", location:"Concourse E, Gate E20 area", gateProximityNote:"2 min to E gates, 10 min to F", hours:"5am–11pm" },
      { airport:"JFK", terminal:"4", name:"Delta Sky Club", location:"Terminal 4, Concourse B, Level 3", gateProximityNote:"5 min to B/C gates", hours:"5am–11pm" },
      { airport:"LAX", terminal:"3", name:"Delta Sky Club", location:"Terminal 3, Level 3 above security", gateProximityNote:"5 min to T3 gates", hours:"5am–11pm" },
      { airport:"MSP", terminal:"1", name:"Delta Sky Club", location:"Concourse F, Gate F5 area (Level 2)", gateProximityNote:"2 min to F gates, 10 min to C/G via connector", hours:"5am–11pm" },
      { airport:"SEA", terminal:"S", name:"Delta Sky Club", location:"Concourse A/B connector, Level 2", gateProximityNote:"5 min to A gates, 8 min to B/C", hours:"5am–11pm" },
      { airport:"BOS", terminal:"A", name:"Delta Sky Club", location:"Terminal A, Gate A9 area", gateProximityNote:"3 min to A gates", hours:"5am–10pm" },
      { airport:"SLC", terminal:"1", name:"Delta Sky Club", location:"Concourse B, Gate B9 area", gateProximityNote:"2 min to B gates, 8 min to A/C", hours:"5am–11pm" },
    ],
  },
  {
    airline: "Southwest Airlines",
    iata: ["WN"],
    program: "Rapid Rewards",
    tiers: [
      { tier: "A-List",          loungeAccess: false, priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 2, extraBoardingMinutes: 10 },
      { tier: "A-List Preferred",loungeAccess: false, priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 2, extraBoardingMinutes: 15 },
    ],
    lounges: [], // Southwest has no lounges
  },
  {
    airline: "JetBlue",
    iata: ["B6"],
    program: "TrueBlue",
    tiers: [
      { tier: "Mosaic 1", loungeAccess: false, priorityBoarding: true,  prioritySecurity: false, freeCheckedBags: 1, extraBoardingMinutes: 10 },
      { tier: "Mosaic 2", loungeAccess: false, priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 2, extraBoardingMinutes: 15 },
      { tier: "Mosaic 3", loungeAccess: true,  priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 2, extraBoardingMinutes: 20 },
      { tier: "Mosaic 4", loungeAccess: true,  priorityBoarding: true,  prioritySecurity: true,  freeCheckedBags: 2, extraBoardingMinutes: 20 },
    ],
    lounges: [
      { airport:"BOS", terminal:"C", name:"Mint Studio Lounge", location:"Terminal C, Level 3 near Gate C26", gateProximityNote:"3 min to C gates", hours:"5am–10pm" },
      { airport:"JFK", terminal:"5", name:"Mint Studio Lounge", location:"Terminal 5, Level 2 near Gate 22", gateProximityNote:"5 min to all T5 gates", hours:"5am–11pm" },
    ],
  },
];

/** Find matching program for an airline name or IATA code */
export function findProgram(airlineHint: string): AirlineStatusProgram | null {
  const h = airlineHint.trim().toUpperCase();
  return AIRLINE_PROGRAMS.find(p =>
    p.iata.includes(h) ||
    p.airline.toUpperCase().includes(airlineHint.toUpperCase()) ||
    p.program.toUpperCase().includes(airlineHint.toUpperCase())
  ) ?? null;
}

/** Find the right tier object for a status string */
export function findTier(program: AirlineStatusProgram, statusHint: string): StatusTier | null {
  const h = statusHint.trim().toLowerCase();
  return program.tiers.find(t => t.tier.toLowerCase().includes(h) || h.includes(t.tier.toLowerCase())) ?? null;
}

/** Get lounge info for a specific airport */
export function getLoungesForAirport(program: AirlineStatusProgram, airportIata: string): AirlineLoungeInfo[] {
  return program.lounges.filter(l => l.airport.toUpperCase() === airportIata.toUpperCase());
}

/* ─── Hotel programs ─────────────────────────────────────────── */
export interface HotelProgram {
  chain: string;
  program: string;
  tiers: { tier: string; benefits: string[] }[];
}

export const HOTEL_PROGRAMS: HotelProgram[] = [
  {
    chain: "Marriott",
    program: "Bonvoy",
    tiers: [
      { tier: "Silver Elite",   benefits: ["10% bonus points", "Late checkout request"] },
      { tier: "Gold Elite",     benefits: ["25% bonus points", "Room upgrade", "Late checkout 2pm"] },
      { tier: "Platinum Elite", benefits: ["50% bonus points", "Room upgrade", "Late checkout 4pm", "Lounge access"] },
      { tier: "Titanium Elite", benefits: ["75% bonus points", "Suite upgrades", "Late checkout 4pm", "Guaranteed lounge"] },
      { tier: "Ambassador",     benefits: ["All Titanium + dedicated ambassador", "Your24 check-in/out"] },
    ],
  },
  {
    chain: "Hilton",
    program: "Honors",
    tiers: [
      { tier: "Silver",   benefits: ["20% bonus points", "5th night free on rewards"] },
      { tier: "Gold",     benefits: ["80% bonus points", "Complimentary breakfast", "Room upgrade"] },
      { tier: "Diamond",  benefits: ["100% bonus points", "Executive lounge", "Premium room upgrade", "Late checkout"] },
    ],
  },
  {
    chain: "Hyatt",
    program: "World of Hyatt",
    tiers: [
      { tier: "Discoverist", benefits: ["10% bonus points", "Late checkout 2pm", "Room upgrade"] },
      { tier: "Explorist",   benefits: ["20% bonus points", "Club lounge access", "Late checkout 4pm"] },
      { tier: "Globalist",   benefits: ["30% bonus points", "Guaranteed suite upgrades", "Free breakfast", "Club lounge", "Late checkout 4pm"] },
    ],
  },
  {
    chain: "IHG",
    program: "One Rewards",
    tiers: [
      { tier: "Silver",   benefits: ["10% bonus points"] },
      { tier: "Gold",     benefits: ["20% bonus points", "Room upgrade", "Late checkout"] },
      { tier: "Platinum", benefits: ["40% bonus points", "Room upgrade", "Complimentary breakfast", "Late checkout 4pm"] },
      { tier: "Diamond",  benefits: ["100% bonus points", "Suite upgrades", "Guaranteed availability", "Lounge access"] },
    ],
  },
  {
    chain: "Wyndham",
    program: "Rewards",
    tiers: [
      { tier: "Gold",     benefits: ["Bonus points", "Late checkout"] },
      { tier: "Platinum", benefits: ["Bonus points", "Room upgrade", "Late checkout", "Welcome amenity"] },
      { tier: "Diamond",  benefits: ["Bonus points", "Best upgrade", "Early check-in", "Late checkout"] },
    ],
  },
];

export const CAR_RENTAL_PROGRAMS = [
  { company: "Hertz", tiers: ["Gold Plus Rewards", "Five Star", "Presidents Circle"] },
  { company: "National", tiers: ["Emerald Club Executive", "Executive Elite"] },
  { company: "Avis", tiers: ["Preferred", "Preferred Plus", "Chairman's Club"] },
  { company: "Enterprise", tiers: ["Plus", "Executive"] },
  { company: "Budget", tiers: ["Fastbreak"] },
];
