const PROVINCES = new Set([
  "AG","AL","AN","AO","AP","AQ","AR","AT","AV","BA","BG","BI","BL","BN","BO","BR","BS","BT","BZ","CA",
  "CB","CE","CH","CL","CN","CO","CR","CS","CT","CZ","EN","FC","FE","FG","FI","FM","FR","GE","GO","GR",
  "IM","IS","KR","LC","LE","LI","LO","LT","LU","MB","MC","ME","MI","MN","MO","MS","MT","NA","NO","NU",
  "OR","PA","PC","PD","PE","PG","PI","PN","PO","PR","PT","PU","PV","PZ","RA","RC","RE","RG","RI","RM",
  "RN","RO","SA","SI","SO","SP","SR","SS","SU","SV","TA","TE","TN","TO","TP","TR","TS","TV","UD","VA",
  "VB","VC","VE","VI","VR","VT","VV"
]);

export function isValidItalianPostalCode(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}

export function isValidItalianProvince(value: string): boolean {
  return PROVINCES.has(value.trim().toUpperCase());
}

export function normalizeItalianPhone(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, "");
  if (/^00\d{8,14}$/.test(digits)) return `+${digits.slice(2)}`;
  if (/^\+39\d{6,12}$/.test(digits)) return digits;
  if (/^39\d{6,12}$/.test(digits)) return `+${digits}`;
  if (/^0\d{6,11}$/.test(digits)) return `+39${digits}`;
  if (/^3\d{8,10}$/.test(digits)) return `+39${digits}`;
  return null;
}
