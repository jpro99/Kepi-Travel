import type { TripCanvas } from '@/lib/dreamcaster/types';

// This is a simulated LLM. In a real application, this would be a call to a service like OpenAI or Google AI.

const tripTemplates: Record<"paris" | "italy", TripCanvas> = {
  paris: {
    title: 'Romantic Weekend in Paris',
    narrative: 'Experience the city of love with a curated itinerary that balances iconic sights with hidden gems.',
    steps: [
      { type: 'travel', description: 'Fly to Paris (CDG)', details: 'Direct flight on Air France, Economy Plus.', cost: 850, valueProposition: 'Balance of cost and comfort.' },
      { type: 'lodging', description: 'Stay in Le Marais', details: 'Boutique hotel with a 4.5-star rating.', cost: 700, valueProposition: 'Authentic Parisian experience.' },
      { type: 'activity', description: 'Eiffel Tower & Seine River Cruise', details: 'Skip-the-line tickets and a sunset cruise.', cost: 200, valueProposition: 'Iconic experiences, optimized for time.' },
    ],
    valueStream: { totalCost: 1750, totalValue: 2000, savings: 250, valueInsights: [{ description: 'Booked flights on a Tuesday to save $150.', type: 'cost-saving' }] },
  },
  italy: {
    title: 'Culinary Tour of Italy',
    narrative: 'A journey through the heart of Italian cuisine, from the pasta of Bologna to the wines of Tuscany.',
    steps: [
      { type: 'travel', description: 'Fly to Bologna (BLQ)', details: 'Flight with one stop in Frankfurt.', cost: 950, valueProposition: 'Most efficient route to the Emilia-Romagna region.' },
      { type: 'activity', description: 'Pasta making class in Bologna', details: 'Hands-on class with a local chef.', cost: 150, valueProposition: 'Immersive cultural experience.' },
      { type: 'travel', description: 'Train to Florence', details: 'High-speed train, 40-minute journey.', cost: 50, valueProposition: 'Fast and scenic way to travel between cities.' },
      { type: 'lodging', description: 'Stay in a Tuscan villa', details: 'Agriturismo with a pool and cooking classes.', cost: 900, valueProposition: 'Unique and memorable accommodation.' },
    ],
    valueStream: { totalCost: 2050, totalValue: 2400, savings: 350, valueInsights: [{ description: 'Found a package deal for the villa and cooking class.', type: 'cost-saving' }] },
  },
};

export async function generateTripCanvas(prompt: string): Promise<TripCanvas> {
  const lowerCasePrompt = prompt.toLowerCase();

  if (lowerCasePrompt.includes('paris')) {
    return tripTemplates.paris;
  } else if (lowerCasePrompt.includes('italy') || lowerCasePrompt.includes('culinary')) {
    return tripTemplates.italy;
  } else {
    // Default response if no keywords are matched
    return {
      title: `A Custom Trip: ${prompt}`,
      narrative: `A personalized adventure based on your prompt: \"${prompt}\". We'll find the best flights, hotels, and activities to make your dream a reality.`,
      steps: [],
      valueStream: { totalCost: 0, totalValue: 0, savings: 0, valueInsights: [] },
    };
  }
}
