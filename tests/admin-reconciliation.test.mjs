import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as viem from "viem";
import { inspectPolygonEvidence } from "../lib/chain/polygon-evidence.ts";
import { POLYGON_USDT_ADDRESS } from "../lib/polygon/asset.ts";
import { ERC20_TRANSFER_TOPIC } from "../lib/polygon/transfer-log.ts";
import { trackOperation,reconcileOperation,readTrackedOperations } from "../lib/operations/tracker.ts";

const hash="0x"+"a".repeat(64),blockHash="0x"+"b".repeat(64),owner="0x"+"1".repeat(40),recipient="0x"+"2".repeat(40);
const topic=address=>"0x"+address.slice(2).padStart(64,"0");
const amount="900719925474099312345678901234567890";
const event={address:POLYGON_USDT_ADDRESS,topics:[ERC20_TRANSFER_TOPIC,topic(owner),topic(recipient)],
  data:"0x"+BigInt(amount).toString(16).padStart(64,"0"),logIndex:"0x1",transactionHash:hash,blockHash};
function evidenceRpc(overrides={}) {
  const calls=[];
  const rpc=async(method,params)=>{
    calls.push({method,params});
    assert.ok(["eth_getTransactionReceipt","eth_getTransactionByHash","eth_blockNumber","eth_getBlockByNumber"].includes(method),"read-only RPC capability");
    const key=method === "eth_getBlockByNumber" ? method+":"+params[0] : method;
    if (Object.hasOwn(overrides,key)) {
      const result=overrides[key];if(result instanceof Error)throw result;return result;
    }
    if(method === "eth_getTransactionReceipt")return {transactionHash:hash,status:"0x1",blockNumber:"0x64",blockHash,logs:[event]};
    if(method === "eth_getTransactionByHash")return {hash,from:owner,to:POLYGON_USDT_ADDRESS,nonce:"0x2"};
    if(method === "eth_blockNumber")return "0x70";
    if(params[0] === "finalized")return {number:"0x69",hash:"0x"+"c".repeat(64)};
    return {number:"0x64",hash:blockHash};
  };
  return {rpc,calls};
}
const inspect=(fixture,expected={recipient,amountRaw:amount})=>inspectPolygonEvidence({hash,walletAddress:owner,rpc:fixture.rpc,expected});

test("reconciliation verifies canonical finalized exact transfer without floating-point amounts",async()=>{
  const fixture=evidenceRpc();const result=await inspect(fixture);
  assert.equal(result.state,"confirmed");assert.equal(result.expectedMatched,true);assert.equal(result.finalized,true);
  assert.equal(result.amountRaw,amount);assert.equal(result.nonce,"2");assert.equal(result.confirmations,"13");
  assert.equal(result.transfers[0].logIndex,1);assert.equal(result.transfers[0].amountRaw,amount);
  assert.equal(fixture.calls.some(call=>call.method.includes("send") || call.method.includes("sign")),false);
});
test("one inclusion is not finality and unsupported finalized remains unknown",async()=>{
  const notFinal=await inspect(evidenceRpc({"eth_getBlockByNumber:finalized":{number:"0x63",hash:blockHash}}));
  assert.equal(notFinal.state,"included");assert.equal(notFinal.finalized,false);
  const unsupported=await inspect(evidenceRpc({"eth_getBlockByNumber:finalized":new Error("unsupported")}));
  assert.equal(unsupported.state,"included");assert.equal(unsupported.finalized,null);assert.equal(unsupported.reason,"finality_unavailable");
});
test("receipt success with wrong recipient, amount, contract or missing event is investigated",async()=>{
  for(const patch of [
    {topics:[ERC20_TRANSFER_TOPIC,topic(owner),topic(owner)]},
    {data:"0x"+"0".repeat(63)+"1"},
    {address:recipient},
    {removed:true},
    {logIndex:undefined},
  ]) {
    const result=await inspect(evidenceRpc({eth_getTransactionReceipt:{status:"0x1",blockNumber:"0x64",blockHash,logs:[{...event,...patch}]}}));
    assert.equal(result.state,"investigate");assert.equal(result.expectedMatched,false);
  }
});
test("noncanonical receipt is corrected instead of preserving a stale confirmed result",async()=>{
  const result=await inspect(evidenceRpc({"eth_getBlockByNumber:0x64":{number:"0x64",hash:"0x"+"d".repeat(64)}}));
  assert.equal(result.state,"investigate");assert.equal(result.canonical,false);assert.deepEqual(result.transfers,[]);
});
test("duplicate logs count once while distinct indices in one hash remain distinct",async()=>{
  const fixture=evidenceRpc({eth_getTransactionReceipt:{status:"0x1",blockNumber:"0x64",blockHash,logs:[event,event,{...event,logIndex:"0x2"}]}});
  const result=await inspect(fixture);assert.equal(result.transfers.length,2);
  assert.deepEqual(result.transfers.map(row=>row.logIndex),[1,2]);
});
test("pending, not located, execution revert and provider failure remain distinct",async()=>{
  assert.equal((await inspect(evidenceRpc({eth_getTransactionReceipt:null}))).state,"pending");
  assert.equal((await inspect(evidenceRpc({eth_getTransactionReceipt:null,eth_getTransactionByHash:null}))).state,"not_seen");
  assert.equal((await inspect(evidenceRpc({eth_getTransactionReceipt:{status:"0x0",blockNumber:"0x64",blockHash}}))).state,"failed");
  await assert.rejects(inspect(evidenceRpc({eth_getTransactionReceipt:new Error("timeout")})),/timeout/);
});

function loadServerModule(path,imports,globals={}) {
  const source=readFileSync(new URL(path,import.meta.url),"utf8");
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};vm.runInNewContext(compiled,{exports,Response,Request,URL,AbortSignal,console,
    require:name=>{assert.ok(Object.hasOwn(imports,name),"unexpected dependency "+name);return imports[name];},...globals});return exports;
}
test("indexer uses fixed range, continuation and raw integers, rejects filter leaks",async()=>{
  const requests=[];
  const exports=loadServerModule("../lib/chain/polygon-operations.ts",{
    "server-only":{},viem,"@/lib/chain/polygon":{POLYGON_USDT:POLYGON_USDT_ADDRESS},
    "@/lib/polygon/asset":{},"@/lib/polygon/transfer-log":{},"./polygon-evidence":{},
  },{process:{env:{ALCHEMY_API_KEY:"test-only-key"}},fetch:async(_url,init)=>{
    const request=JSON.parse(init.body);requests.push(request);
    return Response.json([{id:1,result:"0x89"},{id:2,result:{transfers:[
      {hash,from:owner,to:recipient,rawContract:{address:POLYGON_USDT_ADDRESS,value:"0x"+BigInt(amount).toString(16)}},
      {hash,from:owner,to:owner,rawContract:{address:POLYGON_USDT_ADDRESS,value:"0x1"}},
    ],pageKey:"next-page"}}]);
  }});
  const page=await exports.polygonTransfersPage({address:recipient,direction:"in",fromBlock:"12",toBlock:"345",pageKey:"previous-page"});
  assert.equal(page.transfers.length,1);assert.equal(page.transfers[0].amountRaw,amount);assert.equal(page.pageKey,"next-page");
  const params=requests[0][1].params[0];assert.equal(params.fromBlock,"0xc");assert.equal(params.toBlock,"0x159");
  assert.equal(params.pageKey,"previous-page");assert.equal(params.toAddress,recipient);assert.equal(params.order,"asc");
});
test("indexer rate limit preserves Retry-After without returning provider text",async()=>{
  const exports=loadServerModule("../lib/chain/polygon-operations.ts",{
    "server-only":{},viem,"@/lib/chain/polygon":{POLYGON_USDT:POLYGON_USDT_ADDRESS},
    "@/lib/polygon/asset":{},"@/lib/polygon/transfer-log":{},"./polygon-evidence":{},
  },{process:{env:{ALCHEMY_API_KEY:"test-only-key"}},fetch:async()=>new Response("sensitive upstream text",{status:429,headers:{"Retry-After":"12"}})});
  await assert.rejects(exports.polygonTransfersPage({address:owner,direction:"out",fromBlock:"0",toBlock:"1"}),error=>
    error.message === "polygon_indexer_429" && error.retryAfterMs === 12_000);
});
test("job retry policy is bounded and provider errors cannot leak URLs or credentials",()=>{
  const exports=loadServerModule("../lib/admin/jobs.ts",{"server-only":{},"node:crypto":{},"./database":{},"./reconcile":{}});
  assert.equal(exports.retryDelayMs(1),5000);assert.equal(exports.retryDelayMs(5),80000);assert.equal(exports.retryDelayMs(5,12000),12000);
  assert.equal(exports.classifyJobError(new Error("polygon_wrong_chain")).retryable,false);
  assert.equal(exports.classifyJobError(new Error("https://provider.test/secret")).code,"command_provider_unavailable");
});
test("async environment denial blocks queue writes before transaction starts",async()=>{
  let writes=0;
  const exports=loadServerModule("../lib/admin/jobs.ts",{"server-only":{},"node:crypto":{},"./reconcile":{},"./database":{
    assertAdminDatabase:async()=>{throw new Error("admin_environment_denied");},adminTransaction:async()=>{writes++;},commandEnvironment:()=>"preview",
  }});
  await assert.rejects(exports.enqueueJob({kind:"refresh",resourceId:"user_test1234",actorId:"user_actor1234",reason:"Revisión de soporte"}),/admin_environment_denied/);
  assert.equal(writes,0);
});
test("duplicate queued resource returns existing job and audits the second request without inserting another",async()=>{
  const calls=[];
  const client={query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.startsWith("SELECT id FROM command_jobs"))return {rows:[{id:"existing-job"}],rowCount:1};
    return {rows:[],rowCount:0};
  }};
  const exports=loadServerModule("../lib/admin/jobs.ts",{"server-only":{},"node:crypto":{randomUUID:()=>"test-id"},"./reconcile":{},"./database":{
    assertAdminDatabase:async()=>{},adminTransaction:async fn=>fn(client),commandEnvironment:()=>"preview",
  }});
  const result=await exports.enqueueJob({kind:"refresh",resourceId:"user_test1234",actorId:"user_actor1234",reason:"Revisión de soporte"});
  assert.equal(result.id,"existing-job");assert.equal(result.deduplicated,true);
  assert.equal(calls.filter(call=>call.sql.startsWith("INSERT INTO command_jobs")).length,0);
  assert.equal(calls.filter(call=>call.sql.startsWith("INSERT INTO command_audit")).length,1);
  assert.ok(calls[0].sql.includes("pg_advisory_xact_lock"));
});
test("tracker accepts explicit reorganization correction but preserves confirmation on uncertain reads",()=>{
  const previous=globalThis.localStorage,data=new Map();
  globalThis.localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  try {
    trackOperation("user_reorg_test",{id:hash,network:"polygon",label:"1 USDT",direction:"out"});
    reconcileOperation("user_reorg_test",hash,"polygon",{phase:"confirmed",confirmations:10,checkedAt:new Date().toISOString()});
    reconcileOperation("user_reorg_test",hash,"polygon",{phase:"not_seen",confirmations:null,checkedAt:new Date().toISOString()});
    assert.equal(readTrackedOperations("user_reorg_test")[0].phase,"confirmed");
    reconcileOperation("user_reorg_test",hash,"polygon",{phase:"unavailable",confirmations:0,checkedAt:new Date().toISOString(),canonical:false,reorg:true});
    assert.equal(readTrackedOperations("user_reorg_test")[0].phase,"unavailable");
  }finally{if(previous === undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
test("complete fresh coverage is required before aggregate zero or a portfolio total is known",()=>{
  const exports=loadServerModule("../lib/admin/data.ts",{"server-only":{},"./database":{},"./policy":{},viem,
    "@/lib/polygon/asset":{POLYGON_USDT_ADDRESS}},{Buffer});
  const now=new Date().toISOString(),old=new Date(Date.now()-600_000).toISOString();
  assert.equal(exports.coverageState("5","0",null),"unknown");
  assert.equal(exports.coverageState("5","4",now),"unknown");
  assert.equal(exports.coverageState("5","5",old),"stale");
  assert.equal(exports.coverageState("5","5",now),"known");
  assert.equal(exports.coverageState("0","0",now),"unknown");
});
