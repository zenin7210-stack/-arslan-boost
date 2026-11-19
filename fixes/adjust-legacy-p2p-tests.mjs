import fs from 'node:fs';
const file=process.argv[2];
if(!file)throw Error('Missing path to p2p.test.mjs');
let source=fs.readFileSync(file,'utf8');
function replaceOnce(a,b,name){
 const i=source.indexOf(a);
 if(i<0||source.indexOf(a,i+1)>=0)throw Error('Unexpected upstream P2P tests: '+name);
 source=source.slice(0,i)+b+source.slice(i+a.length);
}
replaceOnce(
 '  const sameAmount = await system.api(2, "invoice", form);\n  assert.equal(sameAmount.status, 409);\n  assert.equal(sameAmount.data.error, "p2p_amount_unavailable");\n',
 '',
 'Amount collision now has a safe alternative');
replaceOnce(
 '  assert.equal((await system.api(3, "invoice", form)).status, 409);\n  system.db.prepare("UPDATE invoices SET created_at = created_at - 601, expires_at = expires_at - 601 WHERE id = ?")\n    .run(first.data.id);\n  const reused = await system.api(3, "invoice", form);',
 '  const alternative = await system.api(3, "invoice", form);\n  assert.equal(alternative.status, 200);\n  assert.equal(alternative.data.uniqueAmount, 50100);\n  assert.equal((await system.api(3, "invoice/" + alternative.data.id + "/cancel", {})).data.status, "cancelled");\n  system.db.prepare("UPDATE invoices SET created_at = created_at - 601, expires_at = expires_at - 601 WHERE id = ?")\n    .run(first.data.id);\n  const reused = await system.api(3, "invoice", {...form,requestId:"req-003-reuse-original"});',
 'Previously pending 50000 now gets fallback 50100');
replaceOnce(
 '  assert.equal((await system.api(2, "invoice", form)).status, 409);\n  const { data: second } = await system.api(2, "invoice", { ...form, amount: 10000 });',
 '  const offered = await system.api(2, "invoice/quote", form);\n  assert.equal(offered.data.uniqueAmount, 50100);\n  const { data: second } = await system.api(2, "invoice", { ...form, amount: 10000 });',
 'A delayed bank event must still settle the original old invoice');
fs.writeFileSync(file,source);
