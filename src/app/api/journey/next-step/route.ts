import { NextResponse } from 'next/server';
import { JourneyEngine } from '@/lib/server/journey/JourneyEngine';
import type { JourneyState, JourneyContext } from '@/lib/journey/types';

export async function POST(request: Request) {
  const { state, context } = await request.json() as { state: JourneyState, context: JourneyContext };

  const nextStep = await JourneyEngine.determineNextStep(state, context);

  return NextResponse.json(nextStep);
}
