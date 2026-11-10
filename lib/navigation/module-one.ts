import { safeInternalPath } from "./return-path";

export const panelNames = ["menu", "guia", "crear", "cartera", "actividad"] as const;
export type Panel = typeof panelNames[number];
export function panelFrom(url: URL): Panel | null {
  const value = url.searchParams.get("panel");
  return panelNames.find(panel => panel === value) ?? null;
}

export function originFrom(url: URL) {
  const supplied = safeInternalPath(url.searchParams.get("origen"));
  if (supplied) return supplied;
  const clean = new URL(url);
  clean.searchParams.delete("panel");
  clean.searchParams.delete("origen");
  return clean.pathname + clean.search + clean.hash;
}

export function panelPath(panel: Panel, origin: string) {
  const params = new URLSearchParams({ panel, origen: safeInternalPath(origin) ?? "/" });
  return "/?" + params;
}

// Only a known panel on the same app can resume after a Clerk redirect.
export function resumePath(raw: string | null) {
  const path = safeInternalPath(raw);
  if (!path) return null;
  const url = new URL(path, "https://navigation.invalid");
  const panel = panelFrom(url);
  return url.pathname === "/" && panel && panel !== "menu" && panel !== "guia"
    ? panelPath(panel, originFrom(url)) : null;
}
