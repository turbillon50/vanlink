import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import { Turnkey } from '@turnkey/sdk-server';
import { createHash } from 'node:crypto';
import { adminQuery, commandEnvironment } from './database';
import { assertServiceIdentity } from '@/lib/wallet/service-identity';
async function observe(accountId:string|null,kind:string,source:string,status:string,payload:unknown) {await adminQuery('INSERT INTO command_observations(environment,account_id,kind,source,status,payload) VALUES($1,$2,$3,$4,$5,$6)',[commandEnvironment(),accountId,kind,source,status,JSON.stringify(payload)]);}
export async function refreshIdentities() {
 const start=Date.now();let clerkCount=0,turnkeyCount=0;
 try {
 const clerk=await clerkClient();const list=await clerk.users.getUserList({limit:100});
 await observe(null,'clerk_inventory','Clerk','known',{totalCount:String(list.totalCount),coverage:list.totalCount>100?'Primeras 100 identidades; conteo total del proveedor':'Listado completo al corte'});
 for(const user of list.data) {const email=user.primaryEmailAddress;await observe(user.id,'identity','Clerk','known',{email:email?.emailAddress||null,emailVerified:email?.verification?.status==='verified',registeredAt:new Date(user.createdAt).toISOString(),lastSignInAt:user.lastSignInAt?new Date(user.lastSignInAt).toISOString():null});clerkCount++;}
 await observe(null,'health:Clerk','Clerk API','known',{latencyMs:Date.now()-start,detail:'Lectura autenticada de identidades; no modifica usuarios.'});
 } catch {await observe(null,'health:Clerk','Clerk API','unavailable',{detail:'No se pudo contrastar el inventario de identidades.'});}
 const tkStart=Date.now();
 try {
 if(!process.env.TURNKEY_API_PRIVATE_KEY||!process.env.TURNKEY_ORGANIZATION_ID||!process.env.TURNKEY_SERVICE_USER_ID)throw new Error('unavailable');
 const parent=process.env.TURNKEY_ORGANIZATION_ID;
 const client=new Turnkey({apiBaseUrl:'https://api.turnkey.com',defaultOrganizationId:parent,apiPublicKey:process.env.TURNKEY_API_PUBLIC_KEY!,apiPrivateKey:process.env.TURNKEY_API_PRIVATE_KEY}).apiClient();
 await assertServiceIdentity(client,parent,process.env.TURNKEY_SERVICE_USER_ID);
 const rows=(await adminQuery('SELECT clerk_user_id,organization_id,turnkey_user_id,wallet_id,evm_address FROM user_wallets ORDER BY clerk_user_id LIMIT 20')).rows;
 for(const row of rows) {
 try {
 const users=await client.getUsers({organizationId:row.organization_id});const wallets=await client.getWallets({organizationId:row.organization_id});
 const owner=users.users.find(u=>u.userId===row.turnkey_user_id);const wallet=wallets.wallets.find(w=>w.walletId===row.wallet_id);
 const accounts=wallet?await client.getWalletAccounts({organizationId:row.organization_id,walletId:row.wallet_id}):null;
 const addressMatches=accounts?.accounts.some(a=>a.address.toLowerCase()===row.evm_address.toLowerCase())||false;
 const issues=[];if(!owner)issues.push('Dueño Turnkey no localizado');if(!wallet)issues.push('Wallet Turnkey no localizada');if(!addressMatches)issues.push('Dirección no contrastada en wallet Turnkey');
 const keyFingerprints=(owner?.apiKeys||[]).map(k=>createHash('sha256').update(k.credential.publicKey.toLowerCase()).digest('hex').slice(0,16));
 await observe(row.clerk_user_id,'turnkey','Turnkey','known',{ownerMatches:Boolean(owner),addressMatches,recoveryEmailPresent:Boolean(owner?.userEmail),keyRegistered:keyFingerprints.length?'llaves registradas en Turnkey':'sin comprobar',keyFingerprints,otpPolicy:'sin comprobar',walletCreatedAt:(wallet as any)?.createdAt?.seconds?new Date(Number((wallet as any).createdAt.seconds)*1000).toISOString():null,issues});turnkeyCount++;
 } catch {await observe(row.clerk_user_id,'turnkey','Turnkey','unavailable',{issues:['Consulta Turnkey no disponible; no implica wallet ausente']});}
 }
 await observe(null,'health:Turnkey','Turnkey API','known',{latencyMs:Date.now()-tkStart,detail:`Identidad de servicio no root validada; ${turnkeyCount} relaciones consultadas.`});
 } catch {await observe(null,'health:Turnkey','Turnkey API','unavailable',{detail:'Identidad o permisos de servicio sin validar; no se utilizaron credenciales root.'});}
 return {clerkCount,turnkeyCount};
}
