import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
const start=app.indexOf('  function renderHistory() {');
const end=app.indexOf('  function openHistoryEntry(',start);
assert.ok(start>=0&&end>start,'history function exists');
const fn=app.slice(start,end);
function prepare({orders=[],donatOrders=[],payments=[],filter='all',historyTab='orders',historyLoaded=true}={}){
  const state={orders,donatOrders,payments,filter,historyTab,historyLoaded,lang:'uz'};
  const nodes=new Map();
  const element=()=>({hidden:false,textContent:'',innerHTML:'',dataset:{},attributes:{},
    classList:{toggle(){},add(){},remove(){}},
    setAttribute(name,val){this.attributes[name]=val;}});
  for(const key of ['#filters','#history-content','#history-orders-count','#history-payments-count'])
    nodes.set(key,element());
  const filters=['all','completed','pending','cancelled'].map(k=>({
    dataset:{historyFilter:k},
    classList:{toggle(){}},
    attributes:{},
    setAttribute(name,val){this.attributes[name]=val;},
    count:element(),
    querySelector(selector){if(selector!=='.history-filter-count')throw Error('bad selector');return this.count;}
  }));
  const tabs=['orders','payments'].map(k=>({dataset:{history:k},classList:{toggle(){}},
    attributes:{},setAttribute(k,v){this.attributes[k]=v;}}));
  const context={
    state, Date,Intl,Number,String,
    $:selector=>nodes.get(selector),
    all:selector=>selector==='[data-history]'?tabs:selector==='#filters [data-history-filter]'?filters:[],
    glyph:()=>'<svg class="glyph"></svg>',
    t:key=>({historyNoOrders:'Hozircha buyurtmalar yo‘q',historyNoPayments:'Hozircha to‘lovlar yo‘q',
      historyNoOrdersHint:'Buyurtma berganingizdan keyin',historyNoPaymentsHint:'To‘lovlar shu yerda',
      historyNoMatches:'Bu holatda yozuvlar yo‘q',historyNoMatchesHint:'Barchasini ko‘ring',
      historyClearFilter:'Barchasini ko‘rsatish',historyStartOrder:'Buyurtma berish',
      historyStartTopup:'Mahsulotlar',historyRefresh:'Yangilash',unavailableHistory:'Ulanmagan',
      historyConnectionHint:'Tarmoqni tekshiring',paymentNumber:'To‘lov',
      walletTitle:'Hamyonni to‘ldirish',historyOrderPaidWaiting:'To‘langan · bajarilishi kutilmoqda'
    })[key]||key,
    escape:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    rankName:n=>'Rank'+n,
    statusName:s=>s,
    shop:{productTitle:x=>x,optionLabel:x=>x},
    sum:n=>n+' so‘m'
  };
  const render=vm.runInNewContext('(()=>{'+fn+'return renderHistory;})()',context);
  render();
  return {state,nodes,filters,tabs,html:nodes.get('#history-content').innerHTML};
}

test('history has compact accessible tabs and a functional refresh entrypoint',()=>{
  assert.match(html,/id="history-refresh"/);
  assert.match(html,/role="tablist"/);
  assert.match(html,/data-history-filter="completed"/);
  assert.match(app,/\$\('#history-refresh'\)\.onclick/);
  assert.match(css,/#history \.history-row/);
  assert.match(css,/#history \.history-empty/);
});
test('no orders shows a helpful CTA and hides pointless filters',()=>{
  const u=prepare();
  assert.match(u.html,/Hozircha buyurtmalar yo‘q/);
  assert.match(u.html,/data-history-action="new-order"/);
  assert.equal(u.nodes.get('#filters').hidden,true);
});
test('no payments shows products instead of a wallet top-up',()=>{
  const u=prepare({historyTab:'payments'});
  assert.match(u.html,/Hozircha to‘lovlar yo‘q/);
  assert.match(u.html,/data-history-action="browse-products"/);
});
test('paid BOOST is in paid filter with accurate status, not waiting',()=>{
  const order={id:15,status:'paid',mode:'wing',game_id:'12345',current_rank:1,target_rank:2,
    created_at:'2026-11-19T10:01:00.000Z',amount:13000};
  const paid=prepare({orders:[order],filter:'completed'});
  assert.match(paid.html,/BOOST #15/);
  assert.match(paid.html,/To‘langan · bajarilishi kutilmoqda/);
  assert.equal(paid.nodes.get('#filters').hidden,false);
  assert.equal(paid.filters[1].count.textContent,'1');
  assert.equal(paid.filters[2].count.textContent,'');
  assert.equal(paid.nodes.get('#history-orders-count').textContent,'1');
  assert.equal(paid.nodes.get('#history-orders-count').hidden,false);
  const waiting=prepare({orders:[order],filter:'pending'});
  assert.match(waiting.html,/data-history-action="clear-filter"/);
  assert.doesNotMatch(waiting.html,/data-history-id="15"/);
});
test('payment and cancelled entries remain filterable and display date and amount',()=>{
  const p={id:9,kind:'topup',method:'stars',status:'paid',amount:16000,stars:100,
    created_at:'2026-11-19T10:01:00.000Z'};
  const entries=prepare({payments:[p],historyTab:'payments',filter:'completed'});
  assert.match(entries.html,/To‘lov #9/);
  assert.match(entries.html,/Telegram Stars/);
  assert.match(entries.html,/16,000|16000/);
  assert.match(entries.html,/history-date/);
  assert.equal(entries.nodes.get('#history-payments-count').textContent,'1');
  const cancelled=prepare({orders:[{...p,id:19,status:'cancelled'}],filter:'cancelled'});
  assert.match(cancelled.html,/data-history-id="19"/);
});
test('HTML escaping guards descriptions; no payment state mutation in history rendering',()=>{
  const entries=prepare({donatOrders:[{id:3,kind:'donat',product:'x',option_label:'<img src=x>',
    method:'uzcard',status:'pending',created_at:'2026-11-19T10:01:00.000Z',amount:13000}]});
  assert.match(entries.html,/&lt;img src=x&gt;/);
  assert.doesNotMatch(entries.html,/<img src=x>/);
  assert.doesNotMatch(fn,/api\(['"]checkout/);
});
test('a disconnected server does not misleadingly claim history is empty',()=>{
  const a=prepare({historyLoaded:false});
  assert.match(a.html,/Ulanmagan/);
  assert.match(a.html,/data-history-action="refresh"/);
  assert.equal(a.nodes.get('#filters').hidden,true);
});
test('pending Telegram Stars BOOST invoices can be resumed from history',()=>{
  assert.match(app,/const starsPayment = kind === 'payment' \? item : state\.payments\.find/);
  assert.match(app,/paymentId:starsPayment\.id/);
});
