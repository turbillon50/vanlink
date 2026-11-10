import "server-only";
import { randomUUID } from "node:crypto";
import { adminQuery, adminTransaction, assertAdminDatabase, commandEnvironment } from "./database";
import { refreshAccount, reconcileResource, type RefreshCheckpoint } from "./reconcile";

type JobKind = "refresh" | "reconcile";
type Job = {id:string;kind:JobKind;resource_id:string;attempts:number;checkpoint:RefreshCheckpoint;lease_token:string;actor_id:string};
const HASH_RESOURCE = /^(?:polygon:)?0x[0-9a-fA-F]{64}$/;
const ACCOUNT = /^user_[a-zA-Z0-9_-]{4,256}$/;
export function classifyJobError(error: unknown): {code:string;retryable:boolean;retryAfterMs:number|null} {
  const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
  const safe = /^(?:polygon|command)_[a-z0-9_]{1,90}$/.test(message) ? message : "command_provider_unavailable";
  const permanent = /invalid_|not_found|owner_unresolved|unrelated_transaction|wrong_chain|hash_mismatch/.test(safe);
  const retry = (error as {retryAfterMs?:unknown}|null)?.retryAfterMs;
  return {code:safe,retryable:!permanent,retryAfterMs:typeof retry === "number" && Number.isFinite(retry) ? Math.min(3_600_000,Math.max(1000,retry)) : null};
}
export function retryDelayMs(attempt: number, retryAfterMs?: number | null) {
  return Math.min(3_600_000,Math.max(1000,retryAfterMs ?? 5000 * 2 ** Math.max(0,Math.min(attempt-1,8))));
}

export async function enqueueJob(input: {kind:JobKind;resourceId:string;actorId:string;reason:string}) {
  await assertAdminDatabase();
  const environment = commandEnvironment();
  if ((input.kind !== "refresh" && input.kind !== "reconcile") ||
      (input.kind === "refresh" ? !ACCOUNT.test(input.resourceId) : !HASH_RESOURCE.test(input.resourceId))) throw new Error("command_invalid_job");
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 500) throw new Error("command_invalid_reason");
  const resourceId = input.kind === "reconcile" ? "polygon:"+input.resourceId.replace(/^polygon:/,"").toLowerCase() : input.resourceId;
  return adminTransaction(async client=>{
    // Serializes even the no-row case. No process-local mutex or timing-dependent dedupe.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[environment+":"+input.kind+":"+resourceId]);
    const existing=await client.query(`SELECT id FROM command_jobs WHERE environment=$1 AND kind=$2 AND resource_id=$3
      AND status IN ('queued','running','retry') ORDER BY created_at LIMIT 1 FOR UPDATE`,[environment,input.kind,resourceId]);
    const id=existing.rows[0]?.id as string || randomUUID();
    if (!existing.rowCount) await client.query(`INSERT INTO command_jobs(id,environment,kind,resource_id,status,attempts,available_at,checkpoint,actor_id,created_at,updated_at)
      VALUES($1,$2,$3,$4,'queued',0,now(),'{}'::jsonb,$5,now(),now())`,[id,environment,input.kind,resourceId,input.actorId]);
    await client.query(`INSERT INTO command_audit(id,environment,actor_id,permission,resource,reason,result,request_id,details,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())`,[randomUUID(),environment,input.actorId,"reconcile.run",
        resourceId,reason,existing.rowCount ? "deduplicated" : "queued",id,JSON.stringify({jobId:id,kind:input.kind})]);
    return {id,deduplicated:Boolean(existing.rowCount)};
  });
}

async function claim(): Promise<Job|null> {
  const token=randomUUID();
  return adminTransaction(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[commandEnvironment()+":job-concurrency"]);
    const running=await client.query("SELECT count(*)::int AS count FROM command_jobs WHERE environment=$1 AND status='running' AND lease_until>now()",[commandEnvironment()]);
    if (Number(running.rows[0]?.count)>=2) return null;
    // Lease expiry counts as one failed attempt; partial successful pagination does not.
    await client.query("UPDATE command_jobs SET status='failed',error_code='command_job_lease_expired',updated_at=now() WHERE environment=$1 AND status='running' AND lease_until<now() AND attempts>=4",[commandEnvironment()]);
    const result=await client.query(`WITH candidate AS (
      SELECT id FROM command_jobs WHERE environment=$1 AND attempts<5 AND available_at<=now()
      AND (status IN ('queued','retry') OR (status='running' AND lease_until<now()))
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE command_jobs j SET attempts=j.attempts+CASE WHEN j.status='running' THEN 1 ELSE 0 END,
      status='running',lease_until=now()+interval '35 seconds',lease_token=$2,updated_at=now()
      FROM candidate c WHERE j.id=c.id RETURNING j.*`,[commandEnvironment(),token]);
    return result.rows[0] as Job | undefined ?? null;
  });
}
export async function runJobs(actorId: string) {
  await assertAdminDatabase();
  const deadline=Date.now()+28_000;
  const results:Array<{id:string;status:string}>=[];
  const pageBudget={remaining:10};
  // Two workers, at most two claimed jobs per request. Each job resumes from a fenced checkpoint.
  await Promise.all(Array.from({length:2},async()=>{
    const job=await claim();
    if (!job) return;
    const context={actorId,job:{id:job.id,token:job.lease_token},deadline,pageBudget};
    const saveCheckpoint=async(checkpoint:RefreshCheckpoint)=>{
      const updated=await adminQuery(`UPDATE command_jobs SET checkpoint=$4::jsonb,updated_at=now()
        WHERE id=$1 AND environment=$2 AND lease_token=$3 AND status='running' AND lease_until>now()`,[job.id,commandEnvironment(),job.lease_token,JSON.stringify(checkpoint)]);
      if (!updated.rowCount) throw new Error("command_job_lease_lost");
    };
    try {
      const result=job.kind === "refresh" ? await refreshAccount(job.resource_id,job.checkpoint || {},saveCheckpoint,context)
        : {complete:true,...await reconcileResource(job.resource_id,context)};
      const status=result.complete ? "succeeded" : "queued";
      const updated=await adminQuery(`UPDATE command_jobs SET status=$4,result=$5::jsonb,error_code=NULL,
        available_at=now()+interval '2 seconds',lease_token=NULL,lease_until=NULL,updated_at=now()
        WHERE id=$1 AND environment=$2 AND lease_token=$3 AND status='running' AND lease_until>now()`,
      [job.id,commandEnvironment(),job.lease_token,status,JSON.stringify(result)]);
      results.push({id:job.id,status:updated.rowCount ? status : "lease_lost"});
    } catch(error) {
      const classified=classifyJobError(error);
      const attempts=job.attempts+1;
      const status=classified.retryable && attempts<5 ? "retry" : "failed";
      const delay=retryDelayMs(attempts,classified.retryAfterMs);
      const updated=await adminQuery(`UPDATE command_jobs SET status=$4,attempts=$5,error_code=$6,
        available_at=now()+($7::int*interval '1 millisecond'),lease_token=NULL,lease_until=NULL,updated_at=now()
        WHERE id=$1 AND environment=$2 AND lease_token=$3 AND status='running' AND lease_until>now()`,
      [job.id,commandEnvironment(),job.lease_token,status,attempts,classified.code,delay]);
      results.push({id:job.id,status:updated.rowCount ? status : "lease_lost"});
    }
  }));
  return {processed:results.length,results};
}
