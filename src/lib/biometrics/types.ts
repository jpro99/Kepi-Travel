export interface BioHarmonizationPlan {
  jetLagProtocolEnabled: boolean;
  realtimeStressMonitoring: boolean;
  healthDataIntegration: 'none' | 'apple-health' | 'google-fit';
}

export interface JetLagProtocol {
  preFlight: ProtocolStep[];
  inFlight: ProtocolStep[];
  postFlight: ProtocolStep[];
}

export interface ProtocolStep {
  time: string;
  action: string;
  description: string;
}
