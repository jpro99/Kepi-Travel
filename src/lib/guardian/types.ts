export interface GuardianProfile {
  biometricAuthEnabled: boolean;
  continuousAuthEnabled: boolean;
  virtualCardEnabled: boolean;
  secureEnclaveKeyId: string | null;
}
