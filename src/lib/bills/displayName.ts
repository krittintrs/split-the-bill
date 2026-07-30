/**
 * The organizer's peer-facing name (ADR-0010). Falls back down a chain so a
 * matrix column header is never blank. Trimmed because the result feeds
 * peers.name, which carries a unique (organizer_id, name) index.
 */
export function resolveDisplayName(
  stored: string | null | undefined,
  identity: { fullName?: string | null; name?: string | null; email?: string | null },
): string {
  const candidates = [
    stored,
    identity.fullName,
    identity.name,
    identity.email?.split("@")[0],
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return "ฉัน";
}
