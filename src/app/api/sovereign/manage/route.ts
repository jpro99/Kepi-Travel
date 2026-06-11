import { NextResponse } from 'next/server';
import type { SovereignKey, DigitalValet } from '@/lib/sovereign/types';

let sovereignKey: SovereignKey | null = null;
const digitalValets: DigitalValet[] = [];

export async function GET(request: Request) {
  return NextResponse.json({ sovereignKey, digitalValets });
}

export async function POST(request: Request) {
  const { action, payload } = await request.json();

  if (action === 'create-key') {
    sovereignKey = {
      did: 'did:kepi:123456789abcdef',
      publicKey: '...', // In a real implementation, this would be a generated public key
      privateKeyEncrypted: '...', // In a real implementation, this would be an encrypted private key
    };
  } else if (action === 'deploy-valet') {
    const newValet: DigitalValet = {
      id: `valet-${Math.random().toString(36).substring(2, 9)}`,
      name: payload.name,
      provider: payload.provider,
      legacySystem: payload.legacySystem,
      status: 'idle',
      lastActivity: new Date().toISOString(),
    };
    digitalValets.push(newValet);
  }

  return NextResponse.json({ sovereignKey, digitalValets });
}
