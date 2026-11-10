import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { adminQuery, adminTransaction, commandEnvironment } from './database';
import type { PoolClient } from 'pg';
import { AdminAccessError, requireStepUp, type AdminAccess } from './access';
import { roleHasPermission, type AdminPermission } from './policy';
import { runJobs } from './jobs';
import { refreshIdentities } from './sources';
export const actionPermissions:Record<string,AdminPermission>={createCase:'cases.write',updateCase:'cases.write',createIncident:'incidents.write',updateIncident:'incidents.write',refresh:'reconcile.run',reconcile:'reconcile.run',runJobs:'reconcile.run',grantRole:'roles.write',revokeRole:'roles.write',pause:'pause.write',export:'export.run'};
function invalid() {throw new AdminAccessError(400,'invalid_action_input');}
function text(value:unknown,max=500,optional=false):string {if(optional&&(value===undefined||value===null||value===''))return '';if(typeof value!=='string'||!value.trim()||value.length>max)invalid();return (value as string).trim();}
function uuid(value:unknown) {const v=text(value,40);if(!/^[0-9a-f-]{36}$/i.test(v))invalid();return v;}
async function authorizeTransaction(tx:PoolClient,access:AdminAccess,action:string) {
 if(access.environment!==commandEnvironment())throw new AdminAccessError(403,'admin_environment_denied');
 // Roster edits take their global lock before actor row locks, avoiding lock-order deadlocks.
 if(action==='grantRole'||action==='revokeRole')await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[access.environment+':role_roster']);
 const grants=(await tx.query('SELECT role FROM command_role_grants WHERE environment=$1 AND clerk_user_id=$2 AND revoked_at IS NULL LIMIT 2 FOR SHARE',[access.environment,access.userId])).rows;
 if(grants.length!==1||!roleHasPermission(grants[0].role,actionPermissions[action]))throw new AdminAccessError(403,'admin_access_denied');
}
export function csvCell(value:unknown) {let s=typeof value==='object'?JSON.stringify(value):String(value??'');if(/^[\s]*[=+@\-]/.test(s)||/^[\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export async function executeAction(access:AdminAccess,body:Record<string,unknown>) {
 const action=text(body.action,40),reason=text(body.reason),key=text(body.idempotencyKey,100);if(reason.length<8||!/^[a-zA-Z0-9_-]{16,100}$/.test(key))invalid();
 if(!Object.hasOwn(actionPermissions,action)||!access.permissions.includes(actionPermissions[action]))throw new AdminAccessError(403,'admin_access_denied');
 if(['grantRole','revokeRole','pause','export'].includes(action))await requireStepUp();
 if(action==='grantRole'){const target=text(body.userId,100);if(target===access.userId)throw new AdminAccessError(403,'self_role_change_denied');try{await(await clerkClient()).users.getUser(target);}catch{throw new AdminAccessError(400,'target_identity_unverified');}}
 const inputHash=createHash('sha256').update(JSON.stringify(Object.keys(body).sort().map(k=>[k,body[k]]))).digest('hex');
 // Reserve once. Repeated worker requests cannot start a second worker invocation.
 if(action==='runJobs') {
 const reservation=await adminTransaction(async tx=>{
 await authorizeTransaction(tx,access,action);
 await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[access.environment+access.userId+key]);
 const old=(await tx.query('SELECT * FROM command_action_keys WHERE environment=$1 AND actor_id=$2 AND idempotency_key=$3',[access.environment,access.userId,key])).rows[0];
 if(old){if(old.input_hash!==inputHash)throw new AdminAccessError(409,'idempotency_conflict');return old.response||{id:key,auditId:null,result:'processing'};}
 await tx.query('INSERT INTO command_action_keys(environment,actor_id,idempotency_key,input_hash) VALUES($1,$2,$3,$4)',[access.environment,access.userId,key,inputHash]);return null;
 });if(reservation)return reservation;
 let result:Record<string,unknown>;try{result=await runJobs(access.userId);}catch{result={error:'worker_unavailable'};}
 return adminTransaction(async tx=>{const auditId=randomUUID();const response={id:key,auditId,result:result.error?'failed':'completed',...result};await tx.query('INSERT INTO command_audit(id,environment,actor_id,permission,resource,reason,result,request_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[auditId,access.environment,access.userId,'reconcile.run','jobs',reason,String(response.result),key,JSON.stringify(result)]);await tx.query('UPDATE command_action_keys SET response=$4 WHERE environment=$1 AND actor_id=$2 AND idempotency_key=$3',[access.environment,access.userId,key,JSON.stringify(response)]);return response;});
 }
 return adminTransaction(async tx=>{
 await authorizeTransaction(tx,access,action);
 await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[access.environment+access.userId+key]);
 const old=(await tx.query('SELECT * FROM command_action_keys WHERE environment=$1 AND actor_id=$2 AND idempotency_key=$3',[access.environment,access.userId,key])).rows[0];
 if(old){if(old.input_hash!==inputHash)throw new AdminAccessError(409,'idempotency_conflict');if(action==='export')throw new AdminAccessError(409,'export_already_generated');return {...old.response,replayed:true};}
 let id:string=randomUUID(),result='completed';let detail:Record<string,unknown>={action};
 if(action==='createCase') {
 const accountId=text(body.accountId,100,true),operationId=text(body.operationId,100,true);const title=text(body.title,160);const priority=body.priority||'normal';if(!['low','normal','high','urgent'].includes(String(priority)))invalid();
 if(accountId&&!(await tx.query("SELECT 1 FROM user_wallets WHERE clerk_user_id=$1 UNION SELECT 1 FROM command_observations WHERE environment=$2 AND account_id=$1 AND kind='identity' AND status='known' LIMIT 1",[accountId,access.environment])).rowCount)throw new AdminAccessError(404,'account_not_found');
 if(operationId&&!(await tx.query('SELECT 1 FROM command_transactions WHERE environment=$1 AND tx_hash=$2',[access.environment,operationId])).rowCount)throw new AdminAccessError(404,'operation_not_found');
 if(accountId&&operationId&&!(await tx.query('SELECT 1 FROM command_transactions WHERE environment=$1 AND tx_hash=$2 AND account_id=$3',[access.environment,operationId,accountId])).rowCount)throw new AdminAccessError(409,'case_account_operation_mismatch');
 await tx.query('INSERT INTO command_cases(id,environment,account_id,operation_id,title,priority,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,access.environment,accountId||null,operationId||null,title,priority,access.userId]);
 } else if(action==='updateCase'||action==='updateIncident') {
 id=uuid(body.id);const status=text(body.status,30),table=action==='updateCase'?'command_cases':'command_incidents';if(!['open','investigating','waiting','resolved','closed'].includes(status)||!Number.isInteger(body.version))invalid();
 const updated=await tx.query(`UPDATE ${table} SET status=$1,version=version+1,updated_at=now() WHERE id=$2 AND environment=$3 AND version=$4 RETURNING id`,[status,id,access.environment,body.version]);if(!updated.rowCount)throw new AdminAccessError(409,'resource_version_conflict');
 if(action==='updateCase'&&body.assignee){const assignee=text(body.assignee,100);if(!(await tx.query('SELECT 1 FROM command_role_grants WHERE environment=$1 AND clerk_user_id=$2 AND revoked_at IS NULL',[access.environment,assignee])).rowCount)throw new AdminAccessError(400,'assignee_not_authorized');await tx.query('UPDATE command_cases SET assignee=$1 WHERE id=$2 AND environment=$3',[assignee,id,access.environment]);}
 if(action==='updateCase'&&body.note)await tx.query('INSERT INTO command_case_notes(environment,case_id,actor_id,note) VALUES($1,$2,$3,$4)',[access.environment,id,access.userId,text(body.note,2000)]);
 detail={action,status};
 } else if(action==='createIncident') {
 const title=text(body.title,160),priority=String(body.priority||'normal');if(!['low','normal','high','urgent'].includes(priority))invalid();await tx.query('INSERT INTO command_incidents(id,environment,title,priority,created_by) VALUES($1,$2,$3,$4,$5)',[id,access.environment,title,priority,access.userId]);
 } else if(action==='grantRole'||action==='revokeRole') {
 await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[access.environment+':role_roster']);
 let target:string;
 if(action==='grantRole') {target=text(body.userId,100);const role=text(body.role,20);if(!['owner','operations','support','auditor'].includes(role))invalid();if(target===access.userId)throw new AdminAccessError(403,'self_role_change_denied');const existing=(await tx.query('SELECT * FROM command_role_grants WHERE environment=$1 AND clerk_user_id=$2 AND revoked_at IS NULL FOR UPDATE',[access.environment,target])).rows[0];if(existing?.role==='owner'&&role!=='owner'&&(await tx.query("SELECT 1 FROM command_role_grants WHERE environment=$1 AND role='owner' AND revoked_at IS NULL",[access.environment])).rowCount===1)throw new AdminAccessError(409,'last_owner_required');await tx.query('UPDATE command_role_grants SET revoked_at=now() WHERE environment=$1 AND clerk_user_id=$2 AND revoked_at IS NULL',[access.environment,target]);await tx.query('INSERT INTO command_role_grants(id,environment,clerk_user_id,role,granted_by,reason) VALUES($1,$2,$3,$4,$5,$6)',[id,access.environment,target,role,access.userId,reason]);detail={action,target,role};
 }else{id=uuid(body.id);const grant=(await tx.query('SELECT * FROM command_role_grants WHERE environment=$1 AND id=$2 AND revoked_at IS NULL FOR UPDATE',[access.environment,id])).rows[0];if(!grant)throw new AdminAccessError(404,'grant_not_found');target=grant.clerk_user_id;if(target===access.userId)throw new AdminAccessError(403,'self_role_change_denied');if(grant.role==='owner'&&(await tx.query("SELECT 1 FROM command_role_grants WHERE environment=$1 AND role='owner' AND revoked_at IS NULL",[access.environment])).rowCount===1)throw new AdminAccessError(409,'last_owner_required');await tx.query('UPDATE command_role_grants SET revoked_at=now() WHERE id=$1 AND environment=$2',[id,access.environment]);detail={action,target};}
 }else if(action==='pause') {
 if(typeof body.paused!=='boolean')invalid();await tx.query('INSERT INTO command_controls(environment,paused) VALUES($1,$2) ON CONFLICT(environment) DO UPDATE SET paused=excluded.paused,updated_at=now()',[access.environment,body.paused]);detail={action,paused:body.paused,scope:'preview only; broadcasts remain disabled by isolation'};
 }else if(action==='refresh'||action==='reconcile') {
 const kind=action==='refresh'?'refresh':'reconcile';let resources:string[];
 if(kind==='refresh'){resources=body.accountId?[text(body.accountId,100)]:(await tx.query('SELECT clerk_user_id FROM user_wallets ORDER BY clerk_user_id LIMIT 20')).rows.map(r=>r.clerk_user_id);for(const account of resources)if(!(await tx.query('SELECT 1 FROM user_wallets WHERE clerk_user_id=$1',[account])).rowCount)throw new AdminAccessError(404,'account_not_found');}
 else {const hash=text(body.id,100).replace(/^polygon:/,'').toLowerCase();if(!/^0x[0-9a-f]{64}$/.test(hash))invalid();if(!(await tx.query('SELECT 1 FROM wallet_operations WHERE tx_hash=$1 UNION SELECT 1 FROM command_transactions WHERE environment=$2 AND tx_hash=$1 LIMIT 1',[hash,access.environment])).rowCount)throw new AdminAccessError(404,'operation_not_found');resources=['polygon:'+hash];}
 const jobs:string[]=[];for(const resource of resources){const row=(await tx.query("INSERT INTO command_jobs(environment,kind,resource_id,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(environment,kind,resource_id) WHERE status IN ('queued','running','retry') DO UPDATE SET resource_id=excluded.resource_id RETURNING id",[access.environment,kind,resource,access.userId])).rows[0];jobs.push(row.id);}id=jobs[0]||id;result='queued';detail={action,jobs};
 }else if(action==='export') {
 const resource=text(body.resource,30);const tables:Record<string,string>={accounts:'user_wallets',operations:'command_transactions',audit:'command_audit'};if(!Object.hasOwn(tables,resource))invalid();
 const columns:Record<string,string>={accounts:'clerk_user_id,evm_address,bitcoin_address,created_at',operations:'chain_id,tx_hash,account_id,wallet_address,recipient,amount_raw,state,observed_at',audit:'id,actor_id,permission,resource,reason,result,created_at'};
 const rows=(await tx.query(`SELECT ${columns[resource]} FROM ${tables[resource]} ${resource==='accounts'?'':'WHERE environment=$1'} LIMIT 1000`,resource==='accounts'?[]:[access.environment])).rows;
 const keys=columns[resource].split(',');detail={action,resource,rows:rows.length,coverage:'bounded to 1000 rows'};const csv=[keys.map(csvCell).join(','),...rows.map(row=>keys.map(k=>csvCell(row[k])).join(','))].join('\r\n');detail.csv=csv;
 }else invalid();
 const auditId=randomUUID();const response={id,auditId,result,...detail};const auditDetail={...detail};delete auditDetail.csv;
 await tx.query('INSERT INTO command_audit(id,environment,actor_id,permission,resource,reason,result,request_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[auditId,access.environment,access.userId,actionPermissions[action],action+':'+id,reason,result,key,JSON.stringify(auditDetail)]);
 const storedResponse:Record<string,unknown>={...response};if(action==='export')delete storedResponse.csv;
 await tx.query('INSERT INTO command_action_keys(environment,actor_id,idempotency_key,input_hash,response) VALUES($1,$2,$3,$4,$5)',[access.environment,access.userId,key,inputHash,JSON.stringify(storedResponse)]);
 return response;
 });
}
export { refreshIdentities };
