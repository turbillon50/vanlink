import { auth } from '@clerk/nextjs/server';
import { requireAdmin, AdminAccessError } from '@/lib/admin/access';
import { adminQuery, commandEnvironment } from '@/lib/admin/database';
import { overview, accountRows, accountDetail, listResource, health, activation } from '@/lib/admin/data';
import type { AdminPermission } from '@/lib/admin/policy';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'};
const permissions:Record<string,AdminPermission>={overview:'overview.read',accounts:'accounts.read',account:'accounts.read',operations:'operations.read',cases:'cases.read',health:'health.read',audit:'audit.read',activation:'health.read',grants:'roles.write',incidents:'health.read',jobs:'health.read'};
export async function GET(request:Request,ctx:{params:Promise<{resource:string}>}) {
 const {resource}=await ctx.params;
 try {
 if(!Object.hasOwn(permissions,resource))throw new AdminAccessError(404,'resource_not_found');const permission=permissions[resource];
 const access=await requireAdmin(permission,request);const q=new URL(request.url).searchParams;
 const data=resource==='overview'?await overview():resource==='accounts'?await accountRows(access,q):resource==='account'?await accountDetail(access,q.get('id')||''):resource==='health'?await health():resource==='activation'?await activation():await listResource(resource,q,access);
 const marker=(await adminQuery('SELECT snapshot_at FROM command_environment WHERE singleton=true')).rows[0];
 return Response.json({data,viewer:{role:access.role,permissions:access.permissions},meta:{environment:access.environment,observedAt:new Date().toISOString(),source:'Neon aislado + observaciones de proveedores',coverage:'Datos al corte; cobertura de fuentes indicada por módulo',status:'known',cutoffAt:marker?.snapshot_at}}, {headers});
 } catch(error) {
 const status=error instanceof AdminAccessError?error.status:(error as Error).message==='resource_not_found'?404:503;
 if(status===403)try{const {userId}=await auth();await adminQuery('INSERT INTO command_audit(environment,actor_id,permission,resource,reason,result,request_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[commandEnvironment(),userId||'anonymous',permissions[resource]||'unknown',resource,'Acceso denegado por política','denied',crypto.randomUUID()]);}catch{}
 return Response.json({error:error instanceof AdminAccessError?error.code:status===404?'resource_not_found':'admin_data_unavailable'},{status,headers});
 }
}
