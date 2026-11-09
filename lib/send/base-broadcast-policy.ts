import {
  getAddress, isAddress, parseTransaction, recoverTransactionAddress,
  type Hex,
} from "viem";

export const ALLOWED_BASE_CONTRACTS: Readonly<Record<string, string>> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": "USDT",
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": "cbBTC",
};

export type ApprovedBaseBroadcast = {
  sender: string;
  recipient: string;
  asset: string;
  amount: bigint;
  chainId: 8453;
};

/**
 * Server-side policy for relay. A user is free to sign anything with their
 * own key, but the VanDeFi endpoint only transmits straightforward transfers.
 * No arbitrary method calls, approvals, delegatecalls, other chains or tokens.
 */
export async function validateBaseBroadcast(
  signed: string,
  userEvmAddress: string,
): Promise<ApprovedBaseBroadcast> {
  if (!/^0x[0-9a-f]{100,20000}$/i.test(signed)) throw new Error("tx_invalida");
  if (!isAddress(userEvmAddress, { strict: false })) throw new Error("wallet_invalida");
  const tx = parseTransaction(signed as Hex);
  if (tx.type !== "eip1559" || tx.chainId !== 8453) throw new Error("red_incorrecta");
  const sender = await recoverTransactionAddress({ serializedTransaction: signed as never });
  if (sender.toLowerCase() !== userEvmAddress.toLowerCase()) throw new Error("tx_ajena");
  if (!tx.to || !isAddress(tx.to)) throw new Error("destino_invalido");
  const recipient = getAddress(tx.to);
  if (recipient.toLowerCase() === sender.toLowerCase() || /^0x0{40}$/i.test(recipient))
    throw new Error("destino_invalido");

  if (tx.gas === undefined || tx.gas <= BigInt(0) ||
      tx.maxFeePerGas === undefined || tx.maxFeePerGas <= BigInt(0) ||
      tx.maxPriorityFeePerGas === undefined || tx.maxPriorityFeePerGas > tx.maxFeePerGas)
    throw new Error("comision_invalida");

  const contract = ALLOWED_BASE_CONTRACTS[recipient.toLowerCase()];
  if (!contract) {
    if (tx.data && tx.data !== "0x") throw new Error("contrato_no_permitido");
    if (!tx.value || tx.value <= BigInt(0)) throw new Error("monto_invalido");
    return { sender, recipient, asset: "ETH", amount: tx.value, chainId: 8453 };
  }

  if ((tx.value ?? BigInt(0)) !== BigInt(0)) throw new Error("valor_nativo_no_permitido");
  const data = tx.data || "";
  if (!/^0xa9059cbb[0-9a-fA-F]{128}$/.test(data)) throw new Error("metodo_no_permitido");
  const firstWord = data.slice(10, 74);
  const amountWord = data.slice(74, 138);
  if (!/^0{24}[0-9a-fA-F]{40}$/.test(firstWord)) throw new Error("destino_invalido");
  const payee = getAddress("0x" + firstWord.slice(-40));
  if (/^0x0{40}$/i.test(payee) || payee.toLowerCase() === sender.toLowerCase()) throw new Error("destino_invalido");
  const amount = BigInt("0x" + amountWord);
  if (amount <= BigInt(0)) throw new Error("monto_invalido");
  return { sender, recipient: payee, asset: contract, amount, chainId: 8453 };
}
