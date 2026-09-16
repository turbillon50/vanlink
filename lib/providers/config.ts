import "server-only";
/** Presence is configuration readiness, not a successful provider health check. */
export function providerConfiguration() {
  return {
    alchemy: Boolean(process.env.ALCHEMY_API_KEY),
    lifi: Boolean(process.env.LIFI_API_KEY),
    onramper: Boolean(process.env.ONRAMPER_API_KEY && process.env.ONRAMPER_SIGNING_SECRET),
  };
}
