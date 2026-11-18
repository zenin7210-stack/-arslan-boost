// Scoped payment form correction. Applied after extracting the approved archive.
import fs from 'node:fs';
const dir='deploy_src/arslan-boost-cloudflare/';
const appPath=dir+'public/app.js';
const p2pPath=dir+'public/assets/p2p.js';
const testPath=dir+'tests/approved-ui.test.mjs';
function replaceOnce(s,oldText,newText,label){
  const at=s.indexOf(oldText);
  if(at<0||s.indexOf(oldText,at+1)>=0)throw new Error('Unexpected '+label+' source; refusing to patch');
  return s.slice(0,at)+newText+s.slice(at+oldText.length);
}
let app=fs.readFileSync(appPath,'utf8');
app=replaceOnce(app,
  "const amount=()=>/^\\d{1,9}$/.test(input.value.trim())?Number(input.value.trim()):0;",
  "const amount=()=>{const digits=input.value.replace(/[\\s\\u00A0\\u202F]/gu,'');return /^\\d{1,9}$/.test(digits)?Number(digits):0;};",
  'wallet card amount');
app=replaceOnce(app,'||n<1000||n>100_000_000;', '||n<10000||n>100_000_000;', 'minimum card top-up');
fs.writeFileSync(appPath,app);
let p2p=fs.readFileSync(p2pPath,'utf8');
p2p=replaceOnce(p2p,
  "      return /^[0-9]{1,9}$/.test(amount) && Number(amount) >= options.minAmount &&\n        Number(amount) <= options.maxAmount;",
  "      const digits=amount.replace(/[\\s\\u00A0\\u202F]/gu,'');\n      return /^[0-9]{1,9}$/.test(digits) && Number(digits) >= options.minAmount &&\n        Number(digits) <= options.maxAmount;",
  'direct card amount validation');
p2p=replaceOnce(p2p,
  "const result = await ui.api('invoice', { amount, method, requestId: key, lang: ui.lang() });",
  "const result = await ui.api('invoice', { amount: amount.replace(/[\\s\\u00A0\\u202F]/gu,''), method, requestId: key, lang: ui.lang() });",
  'card amount submission');
fs.writeFileSync(p2pPath,p2p);
let tests=fs.readFileSync(testPath,'utf8');
tests += [
  "test('formatted sum input is normalized before card invoice creation',()=>{",
  "  assert.match(app,/input\\.value\\.replace\\(/);",
  "  assert.match(p2p,/amount\\.replace\\(/);",
  "  assert.match(app,/n<10000/);",
  "  const clean=s=>s.replace(/[\\s\\u00A0\\u202F]/gu,'');",
  "  for(const n of ['10001','10 001','10\\u00A0001','10\\u202F001']) assert.equal(Number(clean(n)),10001);",
  "  assert.ok(Number(clean('9 999'))<10000);",
  "});"
].join('\n')+'\n';
fs.writeFileSync(testPath,tests);
console.log('Payment amount normalization checked; no card, database, or pricing settings changed.');
