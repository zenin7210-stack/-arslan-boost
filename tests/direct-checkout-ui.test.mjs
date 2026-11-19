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
test('DONAT card checkout visibly disables Stars, unlike BOOST',()=>{
  assert.match(shop,/paymentMethodTiles\(method,true,available\)/);
  assert.match(shop,/startCardOrder\(payload,submit,/);
  assert.match(shop,/api\('donat\/create',\{\.\.\.payload,acceptTerms:true\}\)/);
  assert.match(shop,/method !== 'stars' && connected\(\) && paymentReady\(method\)/);
  assert.match(shop,/paymentMethodTiles\(method,true,available\)/);
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
test('DONAT Stars rejected by API, BOOST Stars invoice preserved',()=>{
  assert.match(worker,/const byStars = data\.paymentMethod === "stars"/);
  assert.match(worker,/kind === "donat" && byStars/);
  assert.match(worker,/\["order","donat"\]\.includes\(payment\.kind\)/);
  assert.match(store,/kind IN \('order','donat'\)/);
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

test('Balance and Cashback panels no longer appear, while financial history stays intact',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/id="quick-balance"|id="setting-balance"|class="balance-row"|data-sheet="balance"/);
  assert.match(html,/id="history"/);
  assert.match(html,/id="history-payments-tab"/);
  assert.ok(app.includes("if($('#quick-balance'))$('#quick-balance').textContent"));
  assert.ok(app.includes("if($('#setting-balance'))$('#setting-balance').textContent"));
});
test('All DONAT product sheets use visual viewport and keep Done button outside modal',()=>{
  assert.match(app,/keyboardDone\.parentElement !== document\.body/);
  assert.match(app,/--visible-height/);
  assert.match(app,/--visible-top/);
  assert.match(app,/field\.closest\('\.widget-scroll'\)/);
  assert.match(css,/body\.keyboard-open \.product-sheet \.widget-footer\{display:none!important\}/);
  assert.match(css,/\.overlay\{top:var\(--visible-top/);
});
test('Order exact amount allocation tries +100 steps and preserves listed price',()=>{
  assert.match(p2p,/TRANSFER_STEPS = \[0,100,200,300,400,500,600,700,800,900\]/);
  assert.doesNotMatch(p2p,/order \? \[0\] : TRANSFER_STEPS/);
  assert.ok(p2p.includes("json_each('${JSON.stringify(TRANSFER_STEPS)}')"));
  assert.ok(!p2p.includes("SELECT '+step+' AS bump"), 'D1 crashes on compound SELECT candidate list');
  assert.match(store,/requested_amount = \?\)/);
});
