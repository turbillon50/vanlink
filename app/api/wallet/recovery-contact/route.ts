import { auth } from "@clerk/nextjs/server";
import { ownerEmail, primaryEmail, walletFor } from "@/lib/wallet/recovery-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/** Read-only. Only the authenticated owner receives their verified contact. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response(null, { status: 401, headers });
  try {
    const wallet = await walletFor(userId);
    if (!wallet) return new Response(null, { status: 404, headers });
    const [registered, email] = await Promise.all([
      ownerEmail(wallet.organizationId, wallet.turnkeyUserId), primaryEmail(userId),
    ]);
    if (registered || !email) return new Response(null, { status: 409, headers });
    return Response.json({ userId, email, organizationId: wallet.organizationId,
      turnkeyUserId: wallet.turnkeyUserId }, { headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
