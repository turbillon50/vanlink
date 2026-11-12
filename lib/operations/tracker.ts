/**
 * Resumable receipt tracking. Only PUBLIC tx hashes and user-facing labels
 * are stored; never store Turnkey signatures, recovery material or secrets.
 *
 * Local on-device history is a recovery aid, NOT an accounting ledger:
 * all statuses must be checked against the blockchain by the server.
 */
export type TrackedNetwork = "polygon" | "base" | "bitcoin";
export type TrackedPhase = "submitted" | "pending" | "not_seen" | "confirming" | "confirmed" | "failed" | "unavailable";

export type TrackedOperation = {
  id: string;
  network: TrackedNetwork;
  label: string;
  direction: "in" | "out";
  createdAt: string;
  phase: TrackedPhase;
  confirmations: number | null;
  checkedAt: string | null;
};

const MAX_STORED_OPERATIONS = 100;
const VERSION = "v2";
export const TRACKING_EVENT = "vandefi:operations-updated";

export function isValidTransactionId(network: TrackedNetwork, id: string): boolean {
  return network === "bitcoin" ? /^[0-9a-fA-F]{64}$/.test(id) : /^0x[0-9a-fA-F]{64}$/.test(id);
}

export function operationsStorageKey(userId: string): string {
  if (!/^user_[a-zA-Z0-9_-]{4,256}$/.test(userId)) throw new Error("invalid_user_id");
  return "vandefi.operation-tracker." + VERSION + "." + userId;
}

function sanitize(value: unknown): TrackedOperation | null {
  if (!value || typeof value !== "object") return null;
  const x = value as Record<string, unknown>;
  if (x.network !== "polygon" && x.network !== "base" && x.network !== "bitcoin") return null;
  if (typeof x.id !== "string" || !isValidTransactionId(x.network, x.id)) return null;
  if (x.direction !== "in" && x.direction !== "out") return null;
  const phases: TrackedPhase[] = ["submitted", "pending", "not_seen", "confirming", "confirmed", "failed", "unavailable"];
  const phase = typeof x.phase === "string" && phases.includes(x.phase as TrackedPhase) ? x.phase as TrackedPhase : "unavailable";
  const label = typeof x.label === "string" && x.label.length > 0 && x.label.length < 100 ? x.label : "Movimiento";
  const createdAt = typeof x.createdAt === "string" && !Number.isNaN(Date.parse(x.createdAt))
    ? x.createdAt : new Date(0).toISOString();
  const confirmations = typeof x.confirmations === "number" && Number.isInteger(x.confirmations) &&
    x.confirmations >= 0 && x.confirmations <= 100000000 ? x.confirmations : null;
  return {
    id: x.id.toLowerCase(), network: x.network, label, direction: x.direction,
    phase, createdAt, confirmations,
    checkedAt: typeof x.checkedAt === "string" && !Number.isNaN(Date.parse(x.checkedAt)) ? x.checkedAt : null,
  };
}

export function decodeOperations(json: string): TrackedOperation[] {
  try {
    const data = JSON.parse(json) as unknown;
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    const result: TrackedOperation[] = [];
    for (const input of data.slice(0, MAX_STORED_OPERATIONS * 2)) {
      const operation = sanitize(input);
      if (!operation) continue;
      const key = operation.network + ":" + operation.id;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(operation);
      if (result.length >= MAX_STORED_OPERATIONS) break;
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return []; }
}

export function readTrackedOperations(userId: string): TrackedOperation[] {
  try {
    if (typeof localStorage === "undefined") return [];
    return decodeOperations(localStorage.getItem(operationsStorageKey(userId)) || "[]");
  } catch { return []; }
}

function store(userId: string, operations: TrackedOperation[]): boolean {
  try {
    localStorage.setItem(operationsStorageKey(userId),
      JSON.stringify(operations.slice(0, MAX_STORED_OPERATIONS)));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(TRACKING_EVENT));
    return true;
  } catch { return false; }
}

export function trackOperation(
  userId: string,
  entry: Pick<TrackedOperation, "id" | "network" | "label" | "direction">,
): boolean {
  if (!isValidTransactionId(entry.network, entry.id)) return false;
  const id = entry.id.toLowerCase();
  const current = readTrackedOperations(userId);
  if (current.some(item => item.id === id && item.network === entry.network)) return true;
  return store(userId, [{
    id, network: entry.network, label: entry.label.slice(0, 96),
    direction: entry.direction, phase: "submitted", confirmations: null,
    createdAt: new Date().toISOString(), checkedAt: null,
  }, ...current]);
}

export function reconcileOperation(userId: string, id: string, network: TrackedNetwork,
  next: { phase: TrackedPhase; confirmations: number | null; checkedAt: string },
): boolean {
  const records = readTrackedOperations(userId);
  const index = records.findIndex(x => x.id === id.toLowerCase() && x.network === network);
  if (index < 0) return false;
  const current = records[index];
  // A later flaky RPC must never downgrade a definitively confirmed receipt.
  if (current.phase === "confirmed" && next.phase !== "confirmed") return true;
  if (current.phase === "failed" && next.phase !== "failed") return true;
  if (current.phase === next.phase && current.confirmations === next.confirmations) return true;
  records[index] = {
    ...current, phase: next.phase, confirmations: next.confirmations,
    checkedAt: next.checkedAt,
  };
  return store(userId, records);
}

export function explorerForOperation(entry: Pick<TrackedOperation, "id" | "network">): string {
  if (!isValidTransactionId(entry.network, entry.id)) return "";
  const id = entry.id.toLowerCase();
  if (entry.network === "polygon") return "https://polygonscan.com/tx/" + id;
  return entry.network === "base"
    ? "https://basescan.org/tx/" + id
    : "https://mempool.space/tx/" + id;
}

export function phaseLabel(phase: TrackedPhase): string {
  const labels: Record<TrackedPhase, string> = {
    submitted: "Enviada a la red",
    pending: "En espera de bloque",
    not_seen: "Aún no localizada",
    confirming: "Confirmándose",
    confirmed: "Confirmada",
    failed: "Falló en la red",
    unavailable: "Sin verificación reciente",
  };
  return labels[phase];
}
