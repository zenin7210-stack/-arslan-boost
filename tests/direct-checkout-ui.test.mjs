import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const shop=readFileSync(new URL('../public/assets/donat/shop.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');
const store=readFileSync(new URL('../src/store.mjs',import.meta.url),'utf8');
const p2p=readFileSync(new URL('../src/p2p.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
test('BOOST checkout directly offers UZCARD HUMO and Telegram Stars',()=>{
  assert.match(app,/\['uzcard','humo','stars'\]/);
  assert.match(app,/paymentMethodTiles\(c\.method, true, available\)/);
  assert.match(app,/requestTransfer\('checkout'/);
  assert.match(app,/paymentMethod:'stars',acceptTerms:true/);
  assert.doesNotMatch(app,/id="order-topup"/);
  assert.ok(css.includes('.arslan-payment-grid'));
});
test('DONAT direct order supports same 3 methods, never requires prepaid wallet balance',()=>{
  assert.match(shop,/paymentMethodTiles\(method,true,available\)/);
  assert.match(shop,/startCardOrder\(payload,submit,/);
  assert.match(shop,/api\('donat\/create',\{\.\.\.payload,acceptTerms:true\}\)/);
  assert.match(shop,/onStarsOrder\(response\.payment,/);
  assert.doesNotMatch(shop,/id="donat-topup"/);
  assert.doesNotMatch(shop,/paymentMethod = 'balance'/);
  assert.doesNotMatch(shop,/api\('donat\/create',\{\.\.\.orderPayload\(order\),/);
});
test('No new wallet top-up endpoints, old invoices and balances remain inspectable',()=>{
  assert.match(worker,/case "topup":\s*\/\/ New wallet credits are disabled/);
  assert.match(worker,/topup_disabled/);
  assert.match(p2p,/path === "invoice\/quote" \|\| path === "invoice"/);
  assert.match(app,/balance-readonly/);
  assert.match(app,/browse-products/);
  assert.match(p2p,/path === "invoice\/recover"/);
});
test('DONAT Stars orders have genuine Telegram invoice and atomic settlement',()=>{
  assert.match(worker,/const byStars = data\.paymentMethod === "stars"/);
  assert.match(worker,/\["topup","order","donat"\]\.includes\(payment\.kind\)/);
  assert.match(store,/kind IN \('topup','order','donat'\)/);
  assert.match(store,/AND NOT EXISTS \(SELECT 1 FROM payments WHERE telegram_charge_id = \?\)/);
  assert.match(worker,/answerPreCheckoutQuery/);
  assert.match(worker,/createInvoiceLink/);
});
test('Existing payment records, admin fulfillment and card safety guards remain',()=>{
  assert.match(worker,/case "donat\/state"/);
  assert.match(worker,/sendNotice\(/);
  assert.match(p2p,/p2p_settle_on_paid|createP2pOrder/);
  assert.match(readFileSync(new URL('../public/assets/p2p.js',import.meta.url),'utf8'),/invoice\.canCancel/);
});
