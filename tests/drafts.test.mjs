import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAmount, readDrafts, saveDraft } from '../lib/drafts.ts';
const data = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => data.get(key) ?? null,
  setItem: (key,value) => data.set(key,value)
}});
test('rejects zero, negative, scientific notation and excess USDC precision', () => {
  for (const value of ['0','0.000000','-1','1e3','NaN','Infinity','1.0000001','1000000000','<script>']) assert.equal(normalizeAmount(value),null,value);
  assert.equal(normalizeAmount(' 25.500001 '),'25.500001');
  assert.equal(normalizeAmount('0.000001'),'0.000001');
});
test('draft survives a subsequent read with its own identifier and amount', () => {
  data.clear();
  saveDraft({id:'first',amount:'25.50',concept:'Servicio',expiresIn:'7',createdAt:'2026-09-16T00:00:00Z'});
  saveDraft({id:'second',amount:'0.000001',concept:'Otro',expiresIn:'1',createdAt:'2026-09-16T01:00:00Z'});
  assert.deepEqual(readDrafts().map(d=>[d.id,d.amount]),[['second','0.000001'],['first','25.50']]);
});
test('corrupt storage is not silently overwritten by saving a new draft', () => {
  data.set('vandefi.link-drafts.v1','{broken');
  assert.throws(()=>saveDraft({id:'third',amount:'1',concept:'Test',expiresIn:'7',createdAt:'2026-09-16'}));
  assert.equal(data.get('vandefi.link-drafts.v1'),'{broken');
});
test('saving additional drafts retains previous drafts beyond one hundred', () => {
  data.clear();
  for(let i=0;i<101;i++) saveDraft({id:String(i),amount:'1',concept:'Draft',expiresIn:'7',createdAt:'2026-09-16'});
  assert.equal(readDrafts().length,101);
  assert.equal(readDrafts().at(-1).id,'0');
});
