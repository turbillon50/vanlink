/** Public release state only; it never proves wallet access or RPC health. */
export type PolygonAvailability = "loading" | "enabled" | "paused" | "unknown";

export function parsePolygonAvailability(value: unknown): Exclude<PolygonAvailability, "loading"> {
  if (!value || typeof value !== "object") return "unknown";
  const data = value as Record<string, unknown>;
  if (data.network !== "polygon" || data.chainId !== 137 || data.asset !== "USDT") return "unknown";
  if (data.sendEnabled === true && data.receiveEnabled === true) return "enabled";
  if (data.sendEnabled === false && data.receiveEnabled === false) return "paused";
  return "unknown";
}

export async function readPolygonAvailability(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Exclude<PolygonAvailability, "loading">> {
  try {
    const response = await fetcher("/api/polygon/availability", { cache: "no-store", signal });
    if (!response.ok) return "unknown";
    return parsePolygonAvailability(await response.json());
  } catch { return "unknown"; }
}
