import { auth } from "@clerk/nextjs/server";
import { ensureAccount } from "@/lib/db/account";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403, headers });
  const { userId } = await auth();
  if (!userId) return new Response(null, { status: 401, headers });
  try {
    await ensureAccount(userId);
    return Response.json({ userId }, { headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
