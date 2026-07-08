export type TwoFactorState = {
  error: string | null;
  /** pending = QR mostrato, in attesa del codice di conferma */
  step: "idle" | "pending" | "enabled" | "codes";
  qrDataUrl?: string;
  secret?: string;
  backupCodes?: string[];
};

export const initialTwoFactorState: TwoFactorState = { error: null, step: "idle" };
