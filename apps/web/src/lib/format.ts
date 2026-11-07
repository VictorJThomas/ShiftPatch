export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? ""; // "Sunrise Health Staffing" -> SH, "Maria Lopez" -> ML
  return (first + second).toUpperCase();
}

/** Per-agency band colours (design: Agency-Switcher). Index = position in the user's memberships, so it is stable per user. */
const AGENCY_COLORS = ["#A24A00", "#2F4FA3", "#6B3FA0", "#1F6B3A", "#8A1F4D"] as const;

export function agencyColor(index: number): string {
  return AGENCY_COLORS[Math.max(index, 0) % AGENCY_COLORS.length] ?? AGENCY_COLORS[0];
}
