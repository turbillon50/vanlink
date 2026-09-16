import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { walletFlows } from "@/lib/db/schema";
import { walletConfig, walletConfigured } from "@/lib/wallet/config";
import { digest, equalSecret } from "@/lib/wallet/security";
import { exchangeIdentity, provisionWallet } from "@/lib/wallet/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const destination = new URL("/profile", process.env.APP_ORIGIN || "https://vandefi.live");
  const finish = (result: string) => {
    destination.searchParams.set("wallet", result);
    const response = NextResponse.redirect(destination, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set("__Host-vanlink-wallet", "", { secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  };
  const { userId } = await auth();
  if (!userId || !walletConfigured()) return finish("unavailable");
  const config = walletConfig();
  if (request.nextUrl.origin !== config.origin) return finish("expired");
  const state = request.nextUrl.searchParams.get("state");
  if (!equalSecret(state, request.cookies.get("__Host-vanlink-wallet")?.value)) return finish("expired");
  try {
    // Atomic, one-time consumption also rejects replay, expiry and another user.
    const [flow] = await db().delete(walletFlows).where(and(eq(walletFlows.clerkUserId, userId),
      eq(walletFlows.stateHash, digest(state!)), gt(walletFlows.expiresAt, new Date()))).returning();
    if (!flow) return finish("expired");
    if (request.nextUrl.searchParams.has("error")) return finish("cancelled");
    const code = request.nextUrl.searchParams.get("code");
    if (!code || code.length > 4096) return finish("expired");
    const identity = await exchangeIdentity(code, flow.verifier, userId, flow.publicKey);
    await provisionWallet(userId, identity, flow.publicKey);
    return finish("connected");
  } catch {
    // Provider errors can contain tokens; never log raw exceptions or responses.
    console.error("wallet_activation_failed");
    return finish("error");
  }
}
