export interface SovereignKey {
  did: string; // Decentralized Identifier
  publicKey: string;
  privateKeyEncrypted: string;
}

export interface DigitalValet {
  id: string;
  name: string;
  provider: 'airline' | 'hotel' | 'car-rental';
  legacySystem: string;
  status: 'active' | 'idle' | 'error';
  lastActivity: string;
}
