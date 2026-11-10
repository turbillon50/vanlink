import { auth, reverificationError } from '@clerk/nextjs/server';
import { requireAdmin, AdminAccessError } from '@/lib/admin/access';
import { executeAction, actionPermissions, refreshIdentities } from '@/lib/admin/actions';
import { adminQuery, commandEnvironment } from '@/lib/admin/database';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=60;
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'};
export async function POST(request:Request) {
 let action='unknown';
 try {
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new AdminAccessError(403,'origin_denied');
 const raw=await request.text();if(raw.length>8192)throw new AdminAccessError(413,'input_too_large');
 let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{throw new AdminAccessError(400,'invalid_json');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw new AdminAccessError(400,'invalid_json');
 action=String(body.action);if(!Object.hasOwn(actionPermissions,action))throw new AdminAccessError(400,'unknown_action');const permission=actionPermissions[action];
 const access=await requireAdmin(permission,request);
 const rate=(await adminQuery("SELECT count(*)::int count FROM command_audit WHERE environment=$1 AND actor_id=$2 AND created_at>now()-interval '1 minute'",[access.environment,access.userId])).rows[0];if(rate.count>=30)throw new AdminAccessError(429,'admin_rate_limited');
 const result=await executeAction(access,body);
 // Identity refresh is explicitly requested and read-only; it never changes Clerk/Turnkey.
 if(action==='refresh'&&result.result==='queued'&&!result.replayed&&!body.accountId){await requireAdmin('reconcile.run',request);await refreshIdentities();}
 if(action==='export'&&typeof result.csv==='string')return new Response(result.csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="vandefi-preview.csv"','X-Audit-Id':String(result.auditId)}});
 return Response.json(result,{headers});
 }catch(error){
 const status=error instanceof AdminAccessError?error.status:503;
 try{const {userId}=await auth();if(userId)await adminQuery('INSERT INTO command_audit(environment,actor_id,permission,resource,reason,result,request_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[commandEnvironment(),userId,actionPermissions[action]||'unknown',action,'Solicitud rechazada o incompleta',status===403?'denied':'failed',crypto.randomUUID(),JSON.stringify({code:error instanceof AdminAccessError?error.code:'action_unavailable'})]);}catch{}
 const stepUp=error instanceof AdminAccessError&&error.code==='admin_reverification_required'?reverificationError({level:'multi_factor',afterMinutes:5}):{};
 const message=error instanceof AdminAccessError&&error.code==='admin_mfa_required'?'Configura y verifica un segundo factor de Clerk antes de realizar esta acción.':error instanceof AdminAccessError&&error.code==='export_already_generated'?'Esta exportación ya se generó. Abre una solicitud nueva para volver a descargarla.':undefined;
 return Response.json({error:error instanceof AdminAccessError?error.code:'admin_action_unavailable',...(message?{message}:{}),...stepUp},{status,headers});
 }
}
