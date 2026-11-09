/** Shared public network metadata. No keys or provider secrets. */
export const POLYGON_CHAIN_ID = 137 as const;
/**
 * Tether USD en Polygon PoS (ADR-009). El contrato migró al estándar USDT0 y
 * su symbol() on-chain devuelve "USDT0"; en la interfaz SIEMPRE se muestra
 * "USDT" y nunca se valida contra symbol().
 */
export const POLYGON_USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" as const;
export const POLYGON_USDT_DECIMALS = 6 as const;
export const POLYGON_USDT_SYMBOL = "USDT" as const;
export const POLYGON_EXPLORER = "https://polygonscan.com" as const;
export const POLYGON_GAS_CURRENCY = "POL" as const;
