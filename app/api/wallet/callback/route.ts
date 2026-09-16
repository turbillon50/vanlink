import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
/** Legacy destination for an interrupted pre-device activation flow. */
export async function GET(_request: NextRequest) {
  const destination = new URL("/profile", process.env.APP_ORIGIN || "https://vandefi.live");
  destination.searchParams.set("wallet", "expired");
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set("__Host-vanlink-wallet", "", { secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
