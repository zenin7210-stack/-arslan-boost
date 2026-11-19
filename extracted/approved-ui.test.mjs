import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const p2p=readFileSync(new URL('../public/assets/p2p.js',import.meta.url),'utf8');
const shop=readFileSync(new URL('../public/assets/donat/shop.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../public/assets/donat/catalog.json',import.meta.url),'utf8'));
test('wallet offers three distinct selectable payment modes',()=>{
  assert.match(app,/\['uzcard','humo',forOrder\?'balance':'stars'\]/);
  assert.match(app,/data-payment-choice/);
  assert.match(app,/cardExact/);
  assert.match(app,/data-card-amount/);
  assert.match(css,/\.arslan-payment-grid/);
});
test('card top-up creates an actual server invoice, never credits locally',()=>{
  assert.match(app,/p2p\.start\(amount\(\),context\.method/);
  assert.match(p2p,/ui\.api\('invoice', \{amount, method, requestId:nonce/);
  assert.match(p2p,/ui\.api\(`invoice\/\$\{invoice\.id\}\/check`/);
  assert.match(p2p,/ui\.api\(`invoice\/\$\{invoice\.id\}\/status`/);
  assert.doesNotMatch(p2p,/options\.balance\s*\+=/);
});
test('boost checkout uses the same card invoice flow or debits server balance',()=>{
  assert.match(app,/requestTransfer\('checkout'/);
  assert.match(app,/paymentMethod:'balance'/);
  assert.match(app,/paymentMethodTiles\(c\.method, true\)/);
});
test('enhanced product panels preserve dynamic catalog pricing',()=>{
  assert.match(shop,/genericCovers/);
  assert.match(shop,/packageChoices\(item,item\.options,true\)/);
  assert.match(shop,/priceSummary\(total\(order\)/);
  assert.equal(catalog.items.length,10);
  for(const name of ['roblox','mobile-legends','gold-id','gold-rinok','gold-pass','spin-coins'])
    assert.ok(existsSync(new URL(`../public/assets/donat/cover-${name}.webp`,import.meta.url)),name);
});
