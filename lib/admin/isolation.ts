/** Shared by the proxy and mutation handlers; contains no credentials or DB code. */
type Environment = Record<string, string | undefined>;

export function isAdminPreviewIsolated(env: Environment = process.env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  return env.VERCEL_ENV === "preview" || env.ADMIN_PREVIEW_ISOLATED === "true" ||
    env.ADMIN_ENVIRONMENT === "preview" || env.ADMIN_ENVIRONMENT === "test";
}

export function blocksExternalMutation(pathname: string, method: string, env: Environment = process.env): boolean {
  if (!isAdminPreviewIsolated(env) || !pathname.startsWith("/api/") || pathname.startsWith("/api/admin/")) return false;
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function externalMutationGuard(request: Request): Response | null {
  if (!blocksExternalMutation(new URL(request.url).pathname, request.method)) return null;
  return Response.json({ error: "preview_mutation_blocked", message: "Este preview permite investigar; las acciones sobre wallets, recuperaciones y envíos están bloqueadas." },
    { status: 403, headers: { "Cache-Control": "no-store" } });
}
