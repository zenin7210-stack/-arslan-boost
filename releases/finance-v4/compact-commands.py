from pathlib import Path
import sys
root=Path(sys.argv[1])
p=root/'finance.mjs'
s=p.read_text()
def replace(old,new):
    global s
    assert s.count(old)==1, old[:100]
    s=s.replace(old,new,1)
a=s.index('const keyboard=')
b=s.index('\nconst back=',a)
s=s[:a]+"const keyboard={inline_keyboard:[]};"+s[b:]
a=s.index('export function dashboardText(')
b=s.index('\nasync function dashboardId',a)
s=s[:a]+"""export function dashboardText(rs){const s=summarize(rs),last=rs.at(-1);let gaps=0;for(let i=1;i<rs.length;i++)if(rs[i-1].balance+rs[i].amount!==rs[i].balance)gaps++;return [heading('ARSLAN  /  FINANCE'),'💳 '+heading(last?fmt(last.balance):'Ma’lumot yo‘q'),small('Kartadagi qoldiq'),' ',...names.map((n,i)=>line(n,fmt(s.due[i]))),...(s.pending?[small(s.pending+' ta amal tekshiruvda')]:[]),...(gaps?[small('⚠ '+gaps+' ta balans tafovuti')]:[]),'','/kirim · /chiqim · /hisobot','/ulush · /tarix · /tekshiruv','/balans · /moliya'].join('\\n');}
""".rstrip()+s[b:]
# Keep the existing report and history content. Separate rendering from editing the pinned message.
replace("async function show(e,q,view,page){const id=await dashboardId(e);if(!id||String(q.message.message_id)!==String(id)){await answer(e,q,'Moliya panelidan foydalaning.');return;}let text,markup=back;", "async function viewContent(e,view,page){let text,markup=back;")
replace("await edit(e,id,text,markup);await answer(e,q,'Yangilandi.');}", "return {text,markup};}\nasync function show(e,q,view,page){const id=await dashboardId(e);if(!id||String(q.message.message_id)!==String(id)){await answer(e,q,'Moliya panelidan foydalaning.');return;}const {text,markup}=await viewContent(e,view,page);await edit(e,id,text,markup);await answer(e,q,'Yangilandi.');}")
# Add expenses totals to the existing expense history response.
replace("text=[heading(headings[view]),small((page+1)+'-sahifa'),'',", "const totals=view==='out'?await rows(e,'WHERE amount<0'):view==='in'?await rows(e,'WHERE amount>0'):null;const summary=totals?summarize(totals):null;text=[heading(headings[view]),...(totals?[line(view==='out'?'Jami chiqim':'Jami kirim',fmt(totals.reduce((a,r)=>a+Math.abs(r.amount),0))),...(view==='out'?[line('Umumiy xarajat',fmt(summary.expense)),line('Hamkorlar yechimi',fmt(summary.taken.reduce((a,b)=>a+b,0)))]:[])]:[]),small((page+1)+'-sahifa'),'',")
# Only read-only commands from the bound private finance channel are recognized.
marker='const privateCommand=(u)=>'
idx=s.index(marker)
s=s[:idx]+"""const channelCommands={balans:'home',ulush:'shares',kirim:'in',chiqim:'out',hisobot:'month',tarix:'all',tekshiruv:'pending',moliya:'help'};
export function parseChannelCommand(text){if(typeof text!=='string')return null;const m=text.trim().match(/^\\/(balans|ulush|kirim|chiqim|hisobot|tarix|tekshiruv|moliya)(?:@arslanboostbot)?(?:\\s+([1-9]\\d{0,3}))?$/i);if(!m)return null;const view=channelCommands[m[1].toLowerCase()];if(m[2]&&!['in','out','all','pending'].includes(view))return null;return {view,page:Number(m[2]||1)-1};}
async function handleChannelCommand(e,u,cmd){
  const m=u.channel_post;
  if(!configured(e)||m.chat?.type!=='channel'||String(m.chat.id)!==String(e.FINANCE_CHANNEL_ID))return false;
  await verifyChannel(e);
  if(cmd.view==='home'){await refresh(e);}
  const text=cmd.view==='help'?[heading('MOLIYA BUYRUQLARI'),'/balans — karta qoldig‘i','/ulush — hamkorlar ulushi','/kirim — tushumlar','/chiqim — xarajat va yechimlar','/hisobot — oylik hisobot','/tarix — barcha amallar','/tekshiruv — tasdiqlanmagan amallar','',small('Keyingi sahifa: /kirim 2 yoki /chiqim 2')].join('\\n'):(await viewContent(e,cmd.view,cmd.page)).text;
  await call(e,'sendMessage',{chat_id:e.FINANCE_CHANNEL_ID,text,parse_mode:'HTML',protect_content:true});
  return true;
}
async function ensureChannelUpdates(e){
  const w=await call(e,'getWebhookInfo',{});
  // Empty allowed_updates already includes channel_post by default.
  if(!Array.isArray(w?.allowed_updates)||!w.allowed_updates.length||w.allowed_updates.includes('channel_post'))return;
  if(w.has_custom_certificate||typeof e.WEBHOOK_SECRET!=='string'||!e.WEBHOOK_SECRET)throw Error('Cannot safely extend Telegram update subscription');
  const u=new URL(w.url);
  if(u.protocol!=='https:'||u.hostname!=='arslan-boost-bot.zenin7210.workers.dev'||u.pathname!=='/telegram'||u.search||u.hash)throw Error('Unexpected Telegram webhook origin');
  await call(e,'setWebhook',{url:w.url,secret_token:e.WEBHOOK_SECRET,drop_pending_updates:false,allowed_updates:[...new Set([...w.allowed_updates,'channel_post'])],...(Number.isInteger(w.max_connections)?{max_connections:w.max_connections}:{})});
  const check=await call(e,'getWebhookInfo',{});
  if(check.url!==w.url||!w.allowed_updates.every(v=>check.allowed_updates?.includes(v))||!check.allowed_updates?.includes('channel_post'))throw Error('Webhook update subscription not verified');
}
"""+s[idx:]
replace("  const q=u.callback_query,m=u.message;\n  const f=privateCommand(u)", "  const q=u.callback_query,m=u.message;\n  const cc=parseChannelCommand(u.channel_post?.text);\n  if(cc&&e.FINANCE_DB){const x=await financeEnv(e);return handleChannelCommand(x,u,cc);}\n  const f=privateCommand(u)")
replace("async function initDashboard(e){await verifyChannel(e);", "async function initDashboard(e){await verifyChannel(e);await ensureChannelUpdates(e);")
# Refresh subscriptions when a legacy dashboard button is pressed; all existing payment updates remain unchanged.
replace("if(view==='home'){text=dashboardText(await rows(e));markup=keyboard;}", "if(view==='home'){text=dashboardText(await rows(e));markup=keyboard;}")
replace("const {text,markup}=await viewContent(e,view,page);await edit(e,id,text,markup);", "if(view==='home')await ensureChannelUpdates(e);const {text,markup}=await viewContent(e,view,page);await edit(e,id,text,markup);")
p.write_text(s)
t=root/'test.mjs'
s=t.read_text()
s=s.replace("assert.match(t,/Jami qolgan ulush · <b>300 so‘m<\\/b>/);","assert.doesNotMatch(t,/Jami qolgan ulush/);assert.match(t,/\\/chiqim/);")
a=s.index("test('expense and all outgoing totals separately visible'")
b=s.index("\ntest(",a+1)
s=s[:a]+"""test('compact dashboard keeps shares and moves detailed expenses to commands',()=>{const t=dashboardText([{amount:30000,balance:30000,kind:'profit',ts:0},{amount:-6000,balance:24000,kind:'expense',ts:1},{amount:-1000,balance:23000,kind:'ARSLAN',ts:2},{amount:-2000,balance:21000,kind:'pending',ts:3}]);assert.doesNotMatch(t,/Jami chiqim|Umumiy xarajat|Hamkorlar yechimi/);assert.match(t,/\\/chiqim/);assert.match(t,/1 ta amal tekshiruvda/);});"""+s[b:]
s += """
import {parseChannelCommand} from './finance.mjs';
test('channel commands exact, pagination bounded, no shop interception',()=>{assert.deepEqual(parseChannelCommand('/chiqim 2'),{view:'out',page:1});assert.deepEqual(parseChannelCommand('/balans@arslanboostbot'),{view:'home',page:0});assert.equal(parseChannelCommand('/start'),null);assert.equal(parseChannelCommand('/kirim@otherbot'),null);assert.equal(parseChannelCommand('/hisobot 2'),null);});
test('expense command only reads the configured private channel and keeps dashboard separate',async()=>{const {d,db}=d1test(),orig=globalThis.fetch;const calls=[];globalThis.fetch=async(url,opt)=>{const method=String(url).split('/').at(-1),data=JSON.parse(opt.body);calls.push({method,data});return {json:async()=>({ok:true,result:method==='getChat'?{type:'channel'}:{message_id:90}})};};try{for(const [k,v] of Object.entries({channel:'-1001234567890',card:'1234',track_from:'2026-11-01T00:00:00Z',humo_peer:'333',dashboard:'50'}))d.prepare('INSERT INTO fin_config VALUES(?,?)').run(k,v);d.prepare("INSERT INTO fin_ops(event_key,ts,amount,balance,kind) VALUES('a',0,-6000,24000,'expense')").run();const env={FINANCE_DB:db,ADMIN_ID:'111',BOT_TOKEN:'test'};assert.equal(await handleFinanceUpdate(env,{channel_post:{chat:{id:-1009999999999,type:'channel'},text:'/chiqim'}}),false);assert.equal(calls.length,0);assert.equal(await handleFinanceUpdate(env,{channel_post:{chat:{id:-1001234567890,type:'channel'},text:'/chiqim'}}),true);assert.match(calls.find(c=>c.method==='sendMessage').data.text,/Umumiy xarajat · <b>60 so‘m/);assert.ok(!calls.some(c=>c.method==='editMessageText'));}finally{globalThis.fetch=orig;d.close();}});
"""
t.write_text(s)
