import { NextResponse } from 'next/server';
import { generateTripCanvas } from '@/lib/server/ai/dreamcaster';

export async function POST(request: Request) {
  const { prompt } = await request.json();

  const tripCanvas = await generateTripCanvas(prompt);

  return NextResponse.json(tripCanvas);
}
