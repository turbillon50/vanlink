import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { ensureAccount } from "@/lib/db/account";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) return new Response(null, { status: 503 });
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (event.type === "user.created") await ensureAccount(event.data.id);
  return new Response(null, { status: 204 });
}
