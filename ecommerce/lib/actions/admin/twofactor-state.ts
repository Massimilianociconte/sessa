export type AdminTwoFactorState = {
  error: string | null;
  step: "idle" | "pending" | "enabled" | "codes";
  qrDataUrl?: string;
  secret?: string;
  backupCodes?: string[];
};

export const initialAdminTwoFactorState: AdminTwoFactorState = { error: null, step: "idle" };
