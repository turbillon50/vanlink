import "server-only";

/**
 * Changing the default visual network is not equivalent to approving money
 * movement. Activating Polygon requires the operator to set BOTH the release
 * flag and a dedicated private RPC connection after mainnet testing.
 */
export function polygonUsdtMoneyEnabled() {
  const privateRpc = Boolean(
    (process.env.POLYGON_RPC_URL || "").startsWith("https://") ||
    process.env.ALCHEMY_API_KEY
  );
  return process.env.POLYGON_USDT_MAINNET_ENABLED === "true" && privateRpc;
}
