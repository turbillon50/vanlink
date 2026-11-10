/** Invalidates asynchronous work when Clerk changes account or session. Never touches device keys. */
export type WalletSessionToken = { generation: number; userId: string | null; sessionId: string | null };
export function createWalletSessionGuard() {
  let current: WalletSessionToken = { generation: 0, userId: null, sessionId: null };
  return {
    synchronize(userId: string | null | undefined, sessionId: string | null | undefined) {
      if (current.userId !== (userId || null) || current.sessionId !== (sessionId || null)) {
        current = { generation: current.generation + 1, userId: userId || null, sessionId: sessionId || null };
      }
      return current;
    },
    capture() { return { ...current }; },
    isCurrent(token: WalletSessionToken) {
      return token.generation === current.generation && token.userId === current.userId && token.sessionId === current.sessionId;
    },
    assert(token: WalletSessionToken, expectedUserId?: string) {
      if (!this.isCurrent(token) || (expectedUserId && token.userId !== expectedUserId)) throw new Error("wallet_session_changed");
    },
  };
}
export const walletSession = createWalletSessionGuard();
