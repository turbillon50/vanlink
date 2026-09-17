/**
 * lib/chain/bitcoin.ts — saldo de Bitcoin NATIVO. SERVER-ONLY.
 *
 * Bitcoin no es EVM: Alchemy y cualquier RPC de Base son inservibles aquí.
 * Usamos la API Esplora (mempool.space, con blockstream.info de respaldo);
 * ambas exponen el mismo formato, así que el failover es transparente.
 * Sin llaves: son endpoints públicos.
 */
import "server-only";

const PROVIDERS = [
  process.env.BITCOIN_API_URL,
  "https://mempool.space/api",
  "https://blockstream.info/api",
].filter((url): url is string => Boolean(url));

interface EsploraStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
  tx_count: number;
}
interface EsploraAddress {
  chain_stats: EsploraStats;
  mempool_stats: EsploraStats;
}

/** Convierte satoshis a BTC legible, sin decimales flotantes. */
export function satsToBtc(sats: number): string {
  const negative = sats < 0;
  const absolute = Math.abs(sats).toString().padStart(9, "0");
  const whole = absolute.slice(0, -8);
  const frac = absolute.slice(-8).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

function isBitcoinAddress(value: string): boolean {
  return /^(bc1[a-z0-9]{8,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(value);
}

export async function bitcoinBalance(address: string) {
  if (!isBitcoinAddress(address)) throw new Error("Dirección Bitcoin inválida");

  let lastError: Error | undefined;
  for (const base of PROVIDERS) {
    try {
      const response = await fetch(`${base}/address/${address}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Esplora ${response.status}`);
      const data = (await response.json()) as EsploraAddress;

      const confirmedSats = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
      const pendingSats = data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum;

      return {
        token: "BTC",
        network: "Bitcoin",
        address,
        confirmedSats,
        pendingSats,
        amount: satsToBtc(confirmedSats),
        pending: satsToBtc(pendingSats),
        txCount: data.chain_stats.tx_count + data.mempool_stats.tx_count,
        source: base,
      };
    } catch (error) {
      lastError = error as Error;
      continue;
    }
  }
  throw lastError ?? new Error("Sin proveedores de Bitcoin disponibles");
}
