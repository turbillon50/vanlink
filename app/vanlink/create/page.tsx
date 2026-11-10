import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/navigation/return-path";
import { panelPath } from "@/lib/navigation/module-one";

export default async function CreatePage() {
  const h = await headers();
  const referer = h.get("referer");
  let origin = "/vanlink";
  try {
    if (referer) {
      const url = new URL(referer);
      if (url.host === h.get("host") && !["/vanlink/create", "/login", "/sign-up"].includes(url.pathname))
        origin = safeInternalPath(url.pathname + url.search + url.hash) ?? origin;
    }
  } catch {}
  redirect(panelPath("crear", origin));
}
