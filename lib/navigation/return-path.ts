/** Only same-origin, absolute app paths may be used as return destinations. */
const APP_ORIGIN = "https://navigation.invalid";

export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  let decoded = value;
  try {
    for (let i = 0; i < 4; i++) {
      if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return null;
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    const url = new URL(value, APP_ORIGIN);
    if (url.origin !== APP_ORIGIN || url.pathname.startsWith("//")) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

export type InternalNavigation = { current: string | null; previous: string | null };

function internalReferrer(referrer: string, origin: string): string | null {
  try {
    const url = new URL(referrer);
    return url.origin === origin ? safeInternalPath(url.pathname + url.search + url.hash) : null;
  } catch { return null; }
}

/** Auth is an interstitial: logging in must not replace the original app screen. */
export function rememberInternalRoute(
  navigation: InternalNavigation, pathname: string | null, referrer: string, origin: string,
): InternalNavigation {
  const current = safeInternalPath(pathname);
  if (!current || /^\/(?:login|sign-in|sign-up)(?:\/|$)/.test(current) || current === navigation.current)
    return navigation;
  const previous = safeInternalPath(navigation.current) ?? internalReferrer(referrer, origin);
  return { current, previous: previous === current ? null : previous };
}

export function internalBackDestination(
  navigation: InternalNavigation, pathname: string | null, fallback: string,
): string {
  const current = safeInternalPath(pathname);
  const previous = safeInternalPath(navigation.previous);
  return navigation.current === current && previous && previous !== current
    ? previous : safeInternalPath(fallback) ?? "/";
}
