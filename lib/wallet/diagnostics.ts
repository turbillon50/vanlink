export function walletDiagnostic(error: unknown) {
  const value = error as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown } | null;
  const message = typeof value?.message === "string" ? value.message.toLowerCase() : "";
  const reasons = [
    ["permission", /permission|policy|consensus|not authorized/],
    ["credential", /api.?key|credential|stamp|signature/],
    ["identity", /issuer|oidc|oauth|nonce|audience|identity/],
    ["configuration", /root|quorum|service identity|unavailable/],
    ["database", /database|relation|column|query|postgres|connection/],
    ["timeout", /timeout|timed out|abort/],
    ["argument", /invalid argument|required|missing|unsupported/],
  ] as const;
  return {
    name: typeof value?.name === "string" && /^[A-Za-z]+Error$/.test(value.name) ? value.name : "Error",
    code: typeof value?.code === "number" ? value.code : typeof value?.code === "string" && /^[A-Z0-9_]{1,20}$/.test(value.code) ? value.code : undefined,
    reason: reasons.find(([, pattern]) => pattern.test(message))?.[0] ?? "unknown",
  };
}

export async function walletStep<T>(step: string, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    console.error("wallet_step_failed", { step, ...walletDiagnostic(error) });
    throw error;
  }
}
