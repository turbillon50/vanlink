import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { adminQuery, adminTransaction, commandEnvironment } from "./database";
import { polygonRpc } from "@/lib/chain/polygon";
import { POLYGON_USDT_ADDRESS } from "@/lib/polygon/asset";
import { inspectPolygonEvidence, type EvidenceRpc, type PolygonEvidence } from "@/lib/chain/polygon-evidence";
import { polygonTransfersPage } from "@/lib/chain/polygon-operations";

export type JobFence = { id: string; token: string };
type Context = { actorId: string; job?: JobFence; reason?: string; deadline?: number; pageBudget?: {remaining:number} };
type Wallet = { clerk_user_id: string; evm_address: string };
type Journal = { id: string; tx_hash: string; recipient: string; amount_raw: string; wallet_address: string; clerk_user_id: string };
export type RefreshCheckpoint = {
  stage?: "journal" | "existing" | "indexer"; balanceSaved?: boolean; journalCursor?: string; existingCursor?: string;
  fromBlock?: string; toBlock?: string; direction?: "in" | "out"; pageKey?: string;
  candidates?: string[]; candidateOffset?: number; nextPageKey?: string; processed?: number;
  seenPageKeys?: string[];
  cursorResets?:number;
};
const HEX = /^0x[0-9a-fA-F]+$/;
const remaining = (context: Context) => (context.deadline ?? Date.now() + 25_000) - Date.now();
const available = (context: Context) => remaining(context) > 1800;
function rpcFor(context: Context): EvidenceRpc {
  return <T>(method: Parameters<EvidenceRpc>[0], params: unknown[]) => polygonRpc<T>(method, params, {
    signal: AbortSignal.timeout(Math.max(1, Math.min(10_000, remaining(context)))),
  });
}
export const reconcilePolygonTransaction = inspectPolygonEvidence;

/** Lease checks and writes share one DB transaction. An expired worker cannot publish evidence. */
export async function persistReconciliation(evidence: PolygonEvidence, accountId: string, context: Context) {
  const environment = commandEnvironment();
  return adminTransaction(async client => {
    if (context.job) {
      const lease = await client.query("SELECT id FROM command_jobs WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND status='running' FOR UPDATE", [context.job.id, context.job.token]);
      if (!lease.rowCount) throw new Error("command_job_lease_lost");
    }
    const previous = await client.query("SELECT state,block_hash FROM command_transactions WHERE environment=$1 AND chain_id=137 AND tx_hash=$2 FOR UPDATE", [environment, evidence.hash]);
    const old = previous.rows[0] as { state: string; block_hash: string | null } | undefined;
    const reorganized = Boolean(old?.block_hash && (evidence.canonical === false ||
      (evidence.blockHash && old.block_hash !== evidence.blockHash) || (!evidence.transactionSeen)));
    const payload = { ...evidence, reorganized, previousState: old?.state ?? null, exchangeCredit: "unknown" };
    await client.query(`INSERT INTO command_transactions
      (environment,chain_id,tx_hash,account_id,wallet_address,recipient,amount_raw,nonce,state,block_number,block_hash,confirmations,source,observed_at,evidence)
      VALUES ($1,137,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'polygon_rpc',$12,$13::jsonb)
      ON CONFLICT(environment,chain_id,tx_hash) DO UPDATE SET
      recipient=COALESCE(EXCLUDED.recipient,command_transactions.recipient),amount_raw=COALESCE(EXCLUDED.amount_raw,command_transactions.amount_raw),
      nonce=COALESCE(EXCLUDED.nonce,command_transactions.nonce),state=EXCLUDED.state,block_number=EXCLUDED.block_number,
      block_hash=EXCLUDED.block_hash,confirmations=EXCLUDED.confirmations,source=EXCLUDED.source,observed_at=EXCLUDED.observed_at,evidence=EXCLUDED.evidence`,
    [environment,evidence.hash,accountId,evidence.walletAddress,evidence.recipient,evidence.amountRaw,evidence.nonce,evidence.state,
      evidence.blockNumber,evidence.blockHash,evidence.confirmations,evidence.observedAt,JSON.stringify(payload)]);
    // Removed/canonical changes correct both the transaction and all old derived events.
    await client.query("UPDATE command_events SET state='orphaned',observed_at=$3 WHERE environment=$1 AND chain_id=137 AND tx_hash=$2", [environment,evidence.hash,evidence.observedAt]);
    for (const event of evidence.transfers) {
      await client.query(`INSERT INTO command_events
        (environment,chain_id,tx_hash,log_index,block_number,block_hash,sender,recipient,amount_raw,contract,state,observed_at)
        VALUES($1,137,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT(environment,chain_id,tx_hash,log_index) DO UPDATE SET
        block_number=EXCLUDED.block_number,block_hash=EXCLUDED.block_hash,sender=EXCLUDED.sender,recipient=EXCLUDED.recipient,
        amount_raw=EXCLUDED.amount_raw,contract=EXCLUDED.contract,state=EXCLUDED.state,observed_at=EXCLUDED.observed_at`,
      [environment,evidence.hash,event.logIndex,event.blockNumber,event.blockHash,event.sender,event.recipient,event.amountRaw,event.contract,
        evidence.state === "confirmed" ? "confirmed" : "included",evidence.observedAt]);
    }
    if (!old || old.state !== evidence.state || reorganized) {
      await client.query(`INSERT INTO command_audit(id,environment,actor_id,permission,resource,reason,result,request_id,details,created_at)
        VALUES($1,$2,$3,'reconcile.run',$4,$5,$6,$7,$8::jsonb,now())`,
      [randomUUID(),environment,context.actorId,"polygon:"+evidence.hash,context.reason || "Conciliación de evidencia on-chain",evidence.state,
        context.job?.id ?? randomUUID(),JSON.stringify({ previousState:old?.state ?? null,state:evidence.state,reorganized,canonical:evidence.canonical,finalized:evidence.finalized,reason:evidence.reason })]);
    }
    return payload;
  });
}

async function journalExpected(hash: string, accountId: string) {
  const rows = await adminQuery("SELECT recipient,amount_raw FROM wallet_operations WHERE tx_hash=$1 AND clerk_user_id=$2 LIMIT 1", [hash,accountId]);
  return rows.rows[0] as { recipient: string; amount_raw: string } | undefined;
}
async function checkHash(hash: string, wallet: Wallet, context: Context) {
  const journal = await journalExpected(hash,wallet.clerk_user_id);
  const evidence = await inspectPolygonEvidence({ hash,walletAddress:wallet.evm_address,rpc:rpcFor(context),
    ...(journal ? { expected:{ recipient:journal.recipient,amountRaw:journal.amount_raw } } : {}) });
  if (!evidence.related && evidence.transactionSeen) throw new Error("command_unrelated_transaction");
  await persistReconciliation(evidence,wallet.clerk_user_id,context);
  return evidence;
}

export async function reconcileResource(resourceId: string, context: Context) {
  const hash = resourceId.replace(/^polygon:/, "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new Error("command_invalid_transaction");
  const rows = await adminQuery(`SELECT w.clerk_user_id,w.evm_address FROM user_wallets w WHERE
    EXISTS(SELECT 1 FROM wallet_operations o WHERE o.tx_hash=$1 AND o.clerk_user_id=w.clerk_user_id)
    OR EXISTS(SELECT 1 FROM command_transactions t WHERE t.environment=$2 AND t.chain_id=137 AND t.tx_hash=$1 AND t.account_id=w.clerk_user_id)
    ORDER BY w.clerk_user_id LIMIT 2`, [hash,commandEnvironment()]);
  if (rows.rows.length !== 1) throw new Error("command_transaction_owner_unresolved");
  const evidence = await checkHash(hash,rows.rows[0] as Wallet,context);
  return { state:evidence.state,hash:evidence.hash,canonical:evidence.canonical,finalized:evidence.finalized,observedAt:evidence.observedAt };
}

async function observe(accountId: string, kind: string, source: string, status: string, payload: unknown, context: Context) {
  await adminTransaction(async client => {
    if (context.job) {
      const lease = await client.query("SELECT id FROM command_jobs WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND status='running' FOR UPDATE", [context.job.id,context.job.token]);
      if (!lease.rowCount) throw new Error("command_job_lease_lost");
    }
    // One snapshot per job/kind makes retries idempotent without erasing historical observations.
    const id = context.job ? await client.query("SELECT id FROM command_observations WHERE environment=$1 AND account_id=$2 AND kind=$3 AND payload->>'jobId'=$4 LIMIT 1 FOR UPDATE", [commandEnvironment(),accountId,kind,context.job.id]) : null;
    const value = JSON.stringify({ ...(payload as Record<string,unknown>),jobId:context.job?.id ?? null });
    if (id?.rows[0]) await client.query("UPDATE command_observations SET status=$2,observed_at=now(),payload=$3::jsonb WHERE id=$1", [id.rows[0].id,status,value]);
    else await client.query("INSERT INTO command_observations(id,environment,account_id,kind,source,status,observed_at,payload) VALUES($1,$2,$3,$4,$5,$6,now(),$7::jsonb)", [randomUUID(),commandEnvironment(),accountId,kind,source,status,value]);
  });
}

export async function refreshAccount(accountId: string, initial: RefreshCheckpoint, saveCheckpoint: (checkpoint: RefreshCheckpoint) => Promise<void>, context: Context) {
  const walletRows = await adminQuery("SELECT clerk_user_id,evm_address FROM user_wallets WHERE clerk_user_id=$1 LIMIT 1", [accountId]);
  const wallet = walletRows.rows[0] as Wallet | undefined;
  if (!wallet) throw new Error("command_account_not_found");
  const checkpoint = { ...initial };
  const rpc = rpcFor(context);
  if (!checkpoint.balanceSaved) {
    const tip = await rpc<string>("eth_blockNumber", []);
    if (!HEX.test(tip)) throw new Error("polygon_invalid_tip");
    const block = await rpc<{ hash?: string } | null>("eth_getBlockByNumber", [tip,false]);
    if (!block?.hash || !/^0x[0-9a-f]{64}$/i.test(block.hash)) throw new Error("polygon_block_unavailable");
    const query = "0x70a08231" + wallet.evm_address.slice(2).toLowerCase().padStart(64,"0");
    const options = { signal:AbortSignal.timeout(Math.max(1,Math.min(10_000,remaining(context)))) };
    const [amount,pol] = await Promise.all([
      polygonRpc<string>("eth_call", [{to:POLYGON_USDT_ADDRESS,data:query},tip],options),
      polygonRpc<string>("eth_getBalance", [wallet.evm_address,tip],options),
    ]);
    if (!HEX.test(amount) || !HEX.test(pol)) throw new Error("polygon_balance_invalid");
    await observe(accountId,"balance","polygon_rpc","known",{network:"Polygon",chainId:137,asset:"USDT",contract:POLYGON_USDT_ADDRESS,
      decimals:6,amountRaw:BigInt(amount).toString(),polRaw:BigInt(pol).toString(),blockNumber:BigInt(tip).toString(),blockHash:block.hash},context);
    checkpoint.balanceSaved=true;
    checkpoint.toBlock=BigInt(tip).toString();
    checkpoint.stage ||= "journal";
    await saveCheckpoint(checkpoint);
  }
  // The server journal is independent from Alchemy. Reconcile it even if the indexer is unavailable.
  if (checkpoint.stage === "journal") {
    while (available(context)) {
      const rows = await adminQuery("SELECT id,tx_hash FROM wallet_operations WHERE clerk_user_id=$1 AND id>$2 ORDER BY id LIMIT 10", [accountId,checkpoint.journalCursor || ""]);
      if (!rows.rows.length) { checkpoint.stage="existing"; await saveCheckpoint(checkpoint); break; }
      for (const row of rows.rows as Pick<Journal,"id"|"tx_hash">[]) {
        if (!available(context)) return { complete:false,checkpoint };
        await checkHash(row.tx_hash,wallet,context);
        checkpoint.journalCursor=row.id;
        await saveCheckpoint(checkpoint);
      }
    }
  }
  if (checkpoint.stage === "existing") {
    while (available(context)) {
      const rows = await adminQuery(`SELECT tx_hash FROM command_transactions WHERE environment=$1 AND chain_id=137 AND account_id=$2 AND tx_hash>$3
        AND NOT EXISTS(SELECT 1 FROM wallet_operations w WHERE w.tx_hash=command_transactions.tx_hash AND w.clerk_user_id=$2)
        ORDER BY tx_hash LIMIT 10`, [commandEnvironment(),accountId,checkpoint.existingCursor || ""]);
      if (!rows.rows.length) { checkpoint.stage="indexer"; await saveCheckpoint(checkpoint); break; }
      for (const row of rows.rows as { tx_hash:string }[]) {
        if (!available(context)) return { complete:false,checkpoint };
        await checkHash(row.tx_hash,wallet,context);
        checkpoint.existingCursor=row.tx_hash;
        await saveCheckpoint(checkpoint);
      }
    }
  }
  if (checkpoint.stage !== "indexer" || !available(context)) return {complete:false,checkpoint};
  if (!checkpoint.fromBlock) {
    const prior = await adminQuery("SELECT payload FROM command_observations WHERE environment=$1 AND account_id=$2 AND kind='indexer' AND status='known' ORDER BY observed_at DESC LIMIT 1", [commandEnvironment(),accountId]);
    const previous = prior.rows[0]?.payload as {toBlock?:string} | undefined;
    // Re-scan a bounded overlap. Previously observed hashes are also revalidated above, including finalized records.
    checkpoint.fromBlock=previous?.toBlock && /^[0-9]+$/.test(previous.toBlock)
      ? (BigInt(previous.toBlock)>BigInt(256) ? BigInt(previous.toBlock)-BigInt(256) : BigInt(0)).toString() : "0";
    checkpoint.direction ||= "in";
    if (BigInt(checkpoint.fromBlock)>BigInt(checkpoint.toBlock!)) throw new Error("polygon_indexer_lagging");
    await saveCheckpoint(checkpoint);
  }
  for (let pages=0;pages<10 && available(context);pages++) {
    if (!checkpoint.candidates) {
      if (context.pageBudget && context.pageBudget.remaining<=0) break;
      if (context.pageBudget) context.pageBudget.remaining--;
      const started=Date.now();
      let page:Awaited<ReturnType<typeof polygonTransfersPage>>;
      try {
        page = await polygonTransfersPage({address:wallet.evm_address,direction:checkpoint.direction || "in",
          fromBlock:checkpoint.fromBlock,toBlock:checkpoint.toBlock!,pageKey:checkpoint.pageKey,maxCount:5,
          signal:AbortSignal.timeout(Math.max(1,Math.min(9000,remaining(context))))});
        await observe(accountId,"health:Alchemy","Alchemy API","known",{latencyMs:Date.now()-started,detail:"Read-only Polygon indexer; chain 137 verified. Usage/quota not integrated."},context);
      } catch(error) {
        const raw=error instanceof Error ? error.message : "";
        const code=/^polygon_[a-z0-9_]{1,80}$/.test(raw) ? raw : "polygon_indexer_unavailable";
        if (code === "polygon_indexer_cursor_expired" && checkpoint.pageKey) {
          checkpoint.cursorResets=(checkpoint.cursorResets || 0)+1;
          if (checkpoint.cursorResets>2) throw new Error("polygon_indexer_invalid_cursor_repeated");
          checkpoint.pageKey=undefined;checkpoint.candidates=undefined;checkpoint.candidateOffset=undefined;
          checkpoint.nextPageKey=undefined;checkpoint.seenPageKeys=[];
          // Restart the fixed range in the same direction. Event upserts make replay harmless.
          await saveCheckpoint(checkpoint);
        }
        await observe(accountId,"indexer","alchemy","unavailable",{fromBlock:checkpoint.fromBlock,toBlock:checkpoint.toBlock,
          complete:false,processed:checkpoint.processed || 0,errorCode:code,coverage:"Previous evidence retained; incomplete indexer refresh"},context);
        await observe(accountId,"health:Alchemy","Alchemy API","unavailable",{latencyMs:Date.now()-started,errorCode:code,detail:"Indexer unavailable; existing observations retained."},context);
        throw error;
      }
      const digest=(key:string)=>createHash("sha256").update((checkpoint.direction || "in")+":"+key).digest("hex");
      const keys=[...(checkpoint.seenPageKeys || []),digest(checkpoint.pageKey || "first")];
      if (keys.length>1000 || (page.pageKey && keys.includes(digest(page.pageKey)))) throw new Error("polygon_indexer_invalid_cursor_cycle");
      checkpoint.seenPageKeys=keys;
      checkpoint.candidates=[...new Set(page.transfers.map(item=>item.hash.toLowerCase()))];
      checkpoint.candidateOffset=0;
      checkpoint.nextPageKey=page.pageKey;
      await saveCheckpoint(checkpoint);
    }
    for (let index=checkpoint.candidateOffset || 0;index<checkpoint.candidates.length;index++) {
      if (!available(context)) return {complete:false,checkpoint};
      await checkHash(checkpoint.candidates[index],wallet,context);
      checkpoint.candidateOffset=index+1;
      checkpoint.processed=(checkpoint.processed || 0)+1;
      await saveCheckpoint(checkpoint);
    }
    const pageKey=checkpoint.nextPageKey;
    if (pageKey && pageKey === checkpoint.pageKey) throw new Error("polygon_indexer_cursor_stalled");
    checkpoint.candidates=undefined;checkpoint.candidateOffset=undefined;checkpoint.nextPageKey=undefined;checkpoint.pageKey=pageKey;
    if (!pageKey) {
      if (checkpoint.direction === "in") checkpoint.direction="out";
      else {
        await observe(accountId,"indexer","alchemy","known",{fromBlock:checkpoint.fromBlock,toBlock:checkpoint.toBlock,
          complete:true,processed:checkpoint.processed || 0,coverage:"USDT Polygon; fixed block range; verified canonical receipt events"},context);
        await saveCheckpoint(checkpoint);
        return {complete:true,checkpoint};
      }
    }
    await saveCheckpoint(checkpoint);
  }
  await observe(accountId,"indexer","alchemy","stale",{fromBlock:checkpoint.fromBlock,toBlock:checkpoint.toBlock,
    complete:false,processed:checkpoint.processed || 0,coverage:"Pagination in progress; totals incomplete"},context);
  return {complete:false,checkpoint};
}
