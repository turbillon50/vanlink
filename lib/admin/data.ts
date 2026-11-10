import 'server-only';
import { adminQuery, commandEnvironment } from './database';
import type { AdminAccess } from './access';
import type { AccountSummary, DataStatus, Metric } from './types';
import { permissionsForRole } from './policy';
import { formatUnits } from 'viem';
import { POLYGON_USDT_ADDRESS } from '@/lib/polygon/asset';
const env=commandEnvironment;
export function cursor(value:unknown) {return value ? Buffer.from(String(value)).toString('base64url'):null;}
export function readCursor(value:string|null) { if(!value)return '';if(!/^[A-Za-z0-9_-]{1,400}$/.test(value))throw new Error('invalid_cursor');return Buffer.from(value,'base64url').toString('utf8'); }
export function limitOf(q:URLSearchParams) {const n=Number(q.get('limit')||50);return Number.isInteger(n)?Math.min(100,Math.max(1,n)):50;}
function statusFor(row:any) {if(!row)return 'unknown';return row.status!=='known'?row.status:Date.now()-new Date(row.observed_at).getTime()>300000?'stale':'known';}
export function coverageState(total:string,covered:string,observedAt:string|Date|null):DataStatus {
 if(BigInt(total)<=BigInt(0)||BigInt(covered)!==BigInt(total)||!observedAt)return 'unknown';
 const age=Date.now()-new Date(observedAt).getTime();return !Number.isFinite(age)||age>300_000?'stale':'known';
}
export async function latestObservation(kind:string,accountId?:string) {
 const values:unknown[]=[env(),kind];let where='environment=$1 AND kind=$2';if(accountId){values.push(accountId);where+=' AND account_id=$3';}
 return (await adminQuery(`SELECT * FROM command_observations WHERE ${where} ORDER BY observed_at DESC LIMIT 1`,values)).rows[0]||null;
}
export async function accountRows(access:AdminAccess,q:URLSearchParams) {
 const take=limitOf(q), after=readCursor(q.get('cursor')), search=(q.get('q')||'').slice(0,120);
 const pii=access.permissions.includes('pii.read');
 const result=await adminQuery(`WITH identities AS (
 SELECT DISTINCT ON(account_id) account_id,payload,observed_at FROM command_observations
 WHERE environment=$1 AND kind='identity' AND status='known' AND account_id IS NOT NULL ORDER BY account_id,observed_at DESC
 ), accounts AS (SELECT clerk_user_id AS id FROM user_wallets UNION SELECT account_id FROM identities)
 SELECT a.id AS clerk_user_id,w.organization_id,w.wallet_id,w.turnkey_user_id,w.evm_address,w.bitcoin_address,w.created_at,
 i.payload AS identity,i.observed_at AS identity_observed_at,t.payload AS turnkey
 FROM accounts a LEFT JOIN user_wallets w ON w.clerk_user_id=a.id LEFT JOIN identities i ON i.account_id=a.id
 LEFT JOIN LATERAL (SELECT payload FROM command_observations WHERE environment=$1 AND account_id=a.id AND kind='turnkey' AND status='known' ORDER BY observed_at DESC LIMIT 1) t ON true
 WHERE a.id>$2 AND ($3='' OR a.id ILIKE $4 OR w.evm_address ILIKE $4 OR w.organization_id ILIKE $4 ${pii?"OR i.payload->>'email' ILIKE $4":''})
 ORDER BY a.id LIMIT $5`,[env(),after,search,'%'+search+'%',take+1]);
 const rows=result.rows.slice(0,take);return {items:rows.map(w=>accountSummary(w,pii)),nextCursor:result.rows.length>take?cursor(rows.at(-1)?.clerk_user_id):null,
 coverage:'Identidades Clerk observadas y vínculos Neon; consulta fecha y cobertura del inventario. Las identidades sin wallet conservan su expediente.'};
}
function accountSummary(w:any,pii:boolean):AccountSummary {
 const issues=[...(w.turnkey?.issues||[])];if(!w.identity)issues.push('Vínculo Neon sin identidad Clerk observada; no demuestra que la identidad haya sido eliminada.');
 if(!w.wallet_id)issues.push('Identidad Clerk observada sin wallet vinculada en Neon.');
 return {id:w.clerk_user_id,email:pii?(w.identity?.email||null):null,emailVerified:w.identity?.emailVerified??null,registeredAt:w.identity?.registeredAt||null,
 linkedAt:w.created_at||null,walletCreatedAt:w.turnkey?.walletCreatedAt||null,organizationId:w.organization_id||null,walletId:w.wallet_id||null,
 ownerId:w.turnkey_user_id||null,evmAddress:w.evm_address||null,bitcoinAddress:w.bitcoin_address||null,issues};
}
export async function accountDetail(access:AdminAccess,id:string) {
 const q=new URLSearchParams({q:id,limit:'100'});const list=await accountRows(access,q);const account=list.items.find(a=>a.id===id);if(!account)throw new Error('resource_not_found');
 const obs=(await adminQuery("SELECT DISTINCT ON (kind) kind,source,status,observed_at,payload FROM command_observations WHERE environment=$1 AND account_id=$2 ORDER BY kind,observed_at DESC",[env(),id])).rows.filter(r=>r.kind!=='identity');
 const turnkey=obs.find(r=>r.kind==='turnkey')?.payload;
 const operations=(await adminQuery(`SELECT t.* FROM command_transactions t WHERE t.environment=$1 AND (t.account_id=$2 OR EXISTS(
   SELECT 1 FROM command_events e WHERE e.environment=t.environment AND e.chain_id=t.chain_id AND e.tx_hash=t.tx_hash
   AND (e.sender=$3 OR e.recipient=$3))) ORDER BY t.observed_at DESC LIMIT 100`,[env(),id,account.evmAddress?.toLowerCase()||null])).rows;
 const cases=(await adminQuery('SELECT * FROM command_cases WHERE environment=$1 AND account_id=$2 ORDER BY created_at DESC LIMIT 50',[env(),id])).rows;
 return {account,observations:obs,operations,cases,device:{keyRegistered:turnkey?.keyRegistered||'sin comprobar',localKey:'sin comprobar en otro navegador',identity:turnkey?.ownerMatches===true?'relación Turnkey contrastada':'sin comprobar',signature:'sin comprobar',recoveryEmail:turnkey?.recoveryEmailPresent===true?'registrado':turnkey?.recoveryEmailPresent===false?'ausente':'sin comprobar',otpPolicy:turnkey?.otpPolicy||'sin comprobar',recoveryE2E:'sin comprobar'}};
}
export async function overview() {
 const counts=(await adminQuery(`SELECT (SELECT count(*)::text FROM user_wallets) wallets,(SELECT count(*)::text FROM wallet_operations) attempts,(SELECT count(*)::text FROM command_cases WHERE environment=$1 AND status NOT IN ('closed','resolved')) cases,(SELECT count(*)::text FROM command_incidents WHERE environment=$1 AND status NOT IN ('closed','resolved')) incidents`,[env()])).rows[0];
 const identity=await latestObservation('clerk_inventory');
 const states=(await adminQuery('SELECT state,count(*)::text AS count FROM command_transactions WHERE environment=$1 GROUP BY state',[env()])).rows;
 const coverage=(await adminQuery(`SELECT count(*)::text total,
 count(*) FILTER(WHERE o.status='known' AND o.payload->>'complete'='true')::text covered,
 min(o.observed_at) FILTER(WHERE o.status='known' AND o.payload->>'complete'='true') observed_at
 FROM user_wallets w LEFT JOIN LATERAL(SELECT status,payload,observed_at FROM command_observations
 WHERE environment=$1 AND account_id=w.clerk_user_id AND kind='indexer' ORDER BY observed_at DESC LIMIT 1)o ON true`,[env()])).rows[0];
 const chainStatus=coverageState(coverage.total,coverage.covered,coverage.observed_at);
 const metrics:Metric[]=[];
 const add=(id:string,label:string,value:string|null,status:any,definition:string,source:string,href:string,observedAt:string|null=new Date().toISOString())=>metrics.push({id,label,value,status,definition,source,href,observedAt});
 add('accounts','Cuentas Clerk',identity?.payload?.totalCount??null,statusFor(identity),'Identidades declaradas por Clerk; no equivale a wallets vinculadas.','Clerk','/admin/accounts',identity?.observed_at||null);
 add('wallets','Wallets vinculadas',counts.wallets,'known','Vínculos presentes en la copia Neon; fecha de vinculación distinta de creación.','Neon · user_wallets','/admin/accounts');
 for(const [state,label] of [['pending','Pendientes'],['included','Incluidas, no finales'],['confirmed','Confirmadas'],['failed','Fallidas'],['investigate','Por investigar']]) {
   const observed=states.find(r=>r.state===state)?.count||'0';
   add(state,label,chainStatus==='unknown'&&observed==='0'?null:observed,chainStatus==='unknown'&&observed!=='0'?'stale':chainStatus,
     `Transacciones observadas con este estado; ${coverage.covered}/${coverage.total} wallets tienen cobertura completada. Confirmada exige receipt, evento exacto y bloque canónico finalizado; no acredita al exchange.`,
     'Neon · command_transactions / RPC','/admin/operations?status='+state,coverage.observed_at||null);
 }
 const volume=(await adminQuery(`SELECT COALESCE(sum(e.amount_raw),0)::text total,
 COALESCE(sum(e.amount_raw) FILTER(WHERE EXISTS(SELECT 1 FROM user_wallets s WHERE lower(s.evm_address)=e.sender)
 AND EXISTS(SELECT 1 FROM user_wallets r WHERE lower(r.evm_address)=e.recipient)),0)::text internal,
 COALESCE(sum(e.amount_raw) FILTER(WHERE NOT(EXISTS(SELECT 1 FROM user_wallets s WHERE lower(s.evm_address)=e.sender)
 AND EXISTS(SELECT 1 FROM user_wallets r WHERE lower(r.evm_address)=e.recipient))),0)::text external
 FROM command_events e WHERE e.environment=$1 AND e.chain_id=137 AND e.contract=$2 AND e.state='confirmed'`,[env(),POLYGON_USDT_ADDRESS.toLowerCase()])).rows[0];
 const volumeStatus=chainStatus;
 for(const [key,label] of [['total','Volumen observado · USDT'],['internal','Transferencias internas · USDT'],['external','Transferencias externas · USDT']]) {
   add('volume_'+key,label,volumeStatus==='unknown'?null:formatUnits(BigInt(volume[key]),6),volumeStatus,
     'Suma exacta de eventos USDT confirmados únicos por red/hash/índice de log en la cobertura observada. Interna: ambos extremos vinculados; externa: al menos un extremo externo. No son ingresos ni tesorería.',
     'Neon · command_events canónicos finalizados','/admin/operations',coverage.observed_at||null);
 }
 add('attempts','Intentos registrados',counts.attempts,'known','Intentos del servidor; no demuestra transmisión ni confirmación.','Neon · wallet_operations','/admin/operations');
 add('recovery','Recuperaciones pendientes',null,'unknown','No existe todavía un historial real y durable de recuperación de las cuentas.','Sin fuente completa','/admin/activation',null);
 add('gas','Problemas de gas',null,'unknown','Requiere simulación de una operación concreta. Un saldo POL por sí solo no acredita suficiencia.','RPC / simulación pendiente','/admin/accounts',null);
 add('cases','Casos abiertos',counts.cases,'known','Casos del preview que no están resueltos ni cerrados.','Neon · command_cases','/admin/cases');
 add('incidents','Incidentes abiertos',counts.incidents,'known','Incidentes registrados del preview.','Neon · command_incidents','/admin/incidents');
 add('revenue','Ingresos VanDeFi',null,'unknown','No hay backend validado de comisiones. Los fondos de usuarios no son ingresos.','Sin fuente financiera','/admin/activation',null);
 const balance=(await adminQuery(`SELECT count(*)::text total,
 count(*) FILTER(WHERE o.status='known' AND o.payload->>'chainId'='137' AND lower(o.payload->>'contract')=$2 AND o.payload->>'amountRaw' ~ '^[0-9]{1,78}$')::text covered,
 count(DISTINCT o.payload->>'blockHash')::text blocks,min(o.payload->>'blockNumber') block_number,min(o.observed_at) observed_at,
 COALESCE(sum(CASE WHEN o.payload->>'amountRaw' ~ '^[0-9]{1,78}$' THEN (o.payload->>'amountRaw')::numeric ELSE 0 END),0)::text raw
 FROM user_wallets w LEFT JOIN LATERAL(SELECT status,payload,observed_at FROM command_observations
 WHERE environment=$1 AND account_id=w.clerk_user_id AND kind='balance' ORDER BY observed_at DESC LIMIT 1)o ON true`,[env(),POLYGON_USDT_ADDRESS.toLowerCase()])).rows[0];
 const balanceStatus=balance.blocks==='1'?coverageState(balance.total,balance.covered,balance.observed_at):'unknown';
 add('user_balances','Saldo observado de usuarios · USDT',balanceStatus==='unknown'?null:formatUnits(BigInt(balance.raw),6),balanceStatus,
   `Suma de snapshots del mismo bloque canónico observado, solo si todas las wallets tienen evidencia. Cobertura ${balance.covered}/${balance.total}; ${balance.blocks} bloques distintos. Los fondos pertenecen a usuarios; no son tesorería.`,
   'RPC balanceOf / snapshots Neon','/admin/accounts',balance.observed_at||null);
 return {metrics,coverage:{wallets:coverage.total,completeWallets:coverage.covered,status:chainStatus,observedAt:coverage.observed_at||null},alerts:[{label:'Entorno aislado',detail:'Copia de datos de producción. Ningún control de este centro activa dinero ni modifica Clerk o Turnkey.',severity:'info'},{label:'Cobertura de cadena',detail:`${balance.covered}/${balance.total} cuentas tienen una observación válida de saldo y ${coverage.covered}/${coverage.total} cobertura completada del indexador. Consulta fuente, bloque y fecha en cada expediente.`,severity:'warning'},{label:'Firma y recuperación pendientes',detail:'Las pruebas automatizadas no demuestran que el navegador original de Luis pueda firmar ni recuperar su wallet.',severity:'warning'}],version:{commit:process.env.VERCEL_GIT_COMMIT_SHA||'desarrollo local',deployedAt:process.env.ADMIN_BUILD_AT||null},limits:['Sin programación automática: las comprobaciones se ejecutan bajo demanda.','Base y Bitcoin se mantienen como legado; no hay cobertura histórica completa.','La confirmación en Polygon no acredita un depósito en Binance.']};
}
const listTables:Record<string,string>={cases:'command_cases',incidents:'command_incidents',audit:'command_audit',grants:'command_role_grants',jobs:'command_jobs',operations:'command_transactions'};
export async function listResource(resource:string,q:URLSearchParams,access:AdminAccess) {
 if(!Object.hasOwn(listTables,resource))throw new Error('resource_not_found');
 const table=listTables[resource],take=limitOf(q),after=readCursor(q.get('cursor'));
 const search=(q.get('q')||'').slice(0,120),state=(q.get('status')||'').slice(0,40);
 const key=resource==='operations'?'tx_hash':'id';
 const params:unknown[]=[];
 const bind=(value:unknown)=>{params.push(value);return '$'+params.length;};
 const conditions=['environment='+bind(env())];
 if(after)conditions.push(`${key}::text>${bind(after)}`);
 if(resource==='grants')conditions.push('revoked_at IS NULL');
 if(state&&['operations','cases','incidents','jobs'].includes(resource))conditions.push(`${resource==='operations'?'state':'status'}=${bind(state)}`);
 if(search) {
  const columns=resource==='operations'?['tx_hash','wallet_address','recipient','account_id']:resource==='grants'?['clerk_user_id']:resource==='audit'?['id::text','resource','actor_id','permission']:resource==='jobs'?['resource_id']:['title'];
  const pattern=bind('%'+search+'%');
  conditions.push('('+columns.map(column=>`${column} ILIKE ${pattern}`).join(' OR ')+')');
 }
 if(resource==='audit'&&access.role==='support')conditions.push('actor_id='+bind(access.userId));
 if(resource==='audit'&&access.role==='operations')conditions.push('permission=ANY('+bind(permissionsForRole('operations'))+'::text[])');
 const limit=bind(take+1);
 const rows=(await adminQuery(`SELECT * FROM ${table} WHERE ${conditions.join(' AND ')} ORDER BY ${key} LIMIT ${limit}`,params)).rows;
 const items=rows.slice(0,take);
 if(resource==='cases'&&access.role!=='auditor')for(const row of items)row.notes=(await adminQuery('SELECT id,actor_id,note,created_at FROM command_case_notes WHERE environment=$1 AND case_id=$2 ORDER BY created_at DESC LIMIT 20',[env(),row.id])).rows;
 return {items,nextCursor:rows.length>take?cursor(rows[take-1]?.[key]):null};
}
export async function health() {
 const start=Date.now();await adminQuery('SELECT 1');
 const rows=(await adminQuery("SELECT DISTINCT ON (kind) kind,status,source,observed_at,payload FROM command_observations WHERE environment=$1 AND kind LIKE 'health:%' ORDER BY kind,observed_at DESC",[env()])).rows;
 const items=['Clerk','Turnkey','Neon','Alchemy','Vercel'].map(provider=>{const row=rows.find(r=>r.kind==='health:'+provider);return {provider,status:provider==='Neon'?'known':statusFor(row),latencyMs:provider==='Neon'?Date.now()-start:row?.payload?.latencyMs??null,observedAt:provider==='Neon'?new Date().toISOString():row?.observed_at||null,detail:provider==='Neon'?'Consulta SELECT 1 en la rama aislada':row?.payload?.detail||'Sin comprobación de disponibilidad; configuración no equivale a salud',usage:'Sin integración de cuota/consumo'};});
 return {items,nextCursor:null,configuration:['CLERK_SECRET_KEY','TURNKEY_SERVICE_USER_ID','TURNKEY_API_PUBLIC_KEY','TURNKEY_API_PRIVATE_KEY','ALCHEMY_API_KEY','DATABASE_URL','ADMIN_NEON_BRANCH_ID'].map(name=>({name,present:Boolean(process.env[name]),validated:name==='DATABASE_URL'})),schedule:'manual'};
}
export async function activation() {
 return {checks:[{id:'isolated',label:'Rama y entorno aislados',status:'known',evidence:'Validados en cada acceso al centro.'},{id:'migration',label:'Migración del centro',status:'known',evidence:'20261110_command_center aplicada; consultar validación de restauración.'},{id:'rpc',label:'RPC privado validado',status:process.env.ALCHEMY_API_KEY?'unknown':'unavailable',evidence:'Consultar salud y lecturas fechadas; una variable no demuestra disponibilidad.'},{id:'signature',label:'Firma real del dueño',status:'unknown',evidence:'Requiere comprobación explícita en el navegador original.'},{id:'recovery',label:'Recuperación real y correo consistente',status:'unknown',evidence:'OTP y prueba completa siguen pendientes; no modificar desde administración.'},{id:'canary',label:'Canario aprobado',status:'unknown',evidence:'No ejecutado por este preview.'},{id:'money',label:'Movimientos de producción',status:'unavailable',evidence:'No se activan ni se modifican mediante este centro.'}],planning:['Comisiones y spread: backend y decisión comercial pendientes.','Referidos: atribución, reglas y validación pendientes.','Gas patrocinado: presupuesto y arquitectura pendientes.','Wallets financieras y tesorería: titulares y controles pendientes.','Retención de datos personales: decisión previa al lanzamiento productivo.']};
}
