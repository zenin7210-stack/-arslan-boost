from pathlib import Path
import sys
root=Path(sys.argv[1]);p=root/'finance.mjs';s=p.read_text()
def rep(a,b):
 global s
 assert s.count(a)==1,a[:150]
 s=s.replace(a,b,1)
# New dashboard: bank balance, lifetime outstanding amounts, integrity warnings.
rep("small('Menyu: /moliya')","small('Menyu: /moliya')")
rep("small('Kartadagi qoldiq'),' ',...names.map((n,i)=>line(n,fmt(s.due[i])))","small('Kartadagi qoldiq'+(last?' · '+date(last.ts):'')),' ',heading('Qolgan ulushlar'),...names.map((n,i)=>line(n,fmt(s.due[i])))")
# Compact operation notifications, still retaining card, amount, time, merchant, category and choices.
rep("heading(incoming?'↙  KIRIM':'↗  CHIQIM')+'  ·  #'+esc(r.id),small(date(r.ts)+' · Toshkent'),'',bold(signed(r.amount)),line('Karta qoldig‘i',fmt(r.balance))","heading(incoming?'🟢 KIRIM':'🔴 CHIQIM')+' · #'+esc(r.id),bold(signed(r.amount)),line('Karta qoldig‘i',fmt(r.balance)),small(date(r.ts)+' · Toshkent')")
rep("...(merchant?[line('Amal joyi',merchant)]:[]),'',r.kind","...(merchant?[line('Amal joyi',merchant)]:[]),...(r.note?[line('Izoh',r.note)]:[]),'',r.kind")
rep("async function postEvent(e,r){if(r.post_id)","async function postEvent(e,r){r={...r,note:(await stmt(e,'SELECT v FROM fin_config WHERE k=?','note:'+r.id).first())?.v};if(r.post_id)")
# Keep old buttons accepted so already delivered keyboards work during transition.
a=s.index("const groupButtons=");b=s.index("async function ensureChannelUpdates",a)
s=s[:a]+"""const groupButtons={'💳 Balans':'home','💰 Balans':'home','👥 Hamkorlar':'shares','👥 Ulushlar':'shares','📥 Kirimlar':'in','↙ Kirimlar':'in','📤 Chiqimlar':'out','↗ Chiqimlar':'out','📊 Hisobot':'report_menu','📋 Tarix':'all','⚙️ Boshqaruv':'management','🕓 Tekshiruv':'pending','↻ Yangilash':'home','Kunlik':'day','Haftalik':'week','Oylik':'month','‹ Asosiy menyu':'help'};
const groupKeyboard={keyboard:[[{text:'💳 Balans'}],[{text:'📥 Kirimlar'},{text:'📤 Chiqimlar'}],[{text:'👥 Hamkorlar'},{text:'📊 Hisobot'}],[{text:'📋 Tarix'},{text:'⚙️ Boshqaruv'}]],resize_keyboard:true,is_persistent:true};
const reportKeyboard={keyboard:[[{text:'Kunlik'},{text:'Haftalik'},{text:'Oylik'}],[{text:'‹ Asosiy menyu'}]],resize_keyboard:true,is_persistent:true};
const groupDescriptions={balans:'Karta qoldig‘i',ulush:'Hamkorlar ulushi',kirim:'Kirimlar',chiqim:'Chiqimlar va xarajatlar',hisobot:'Oylik hisobot',tarix:'Amallar tarixi',tekshiruv:'Tekshiruv',moliya:'Menyu',kun:'Kunlik hisobot',hafta:'Haftalik hisobot',oy:'Oylik hisobot',boshqaruv:'Boshqaruv'};
const extraCommand=t=>typeof t==='string'&&(t.match(/^\\/(kun|hafta|oy|boshqaruv)(?:@arslanboostbot)?$/i)||t.match(/^\\/(izoh|tuzatish)(?:@arslanboostbot)?\\s+\\d+\\s+.{1,240}$/u));
const extraViews={kun:'day',hafta:'week',oy:'month',boshqaruv:'management'};
const localDate=ts=>new Date(ts+18000000).toISOString().slice(0,10);
export function reportRange(now,period,previous=false){
  const local=new Date(now+18000000),y=local.getUTCFullYear(),m=local.getUTCMonth(),d=local.getUTCDate();
  let start,end;
  if(period==='month'){start=Date.UTC(y,m-(previous?1:0),1)-18000000;end=previous?Date.UTC(y,m,1)-18000000:now+1;}
  else {const midnight=Date.UTC(y,m,d)-18000000;const offset=period==='week'?(local.getUTCDay()+6)%7:0;start=midnight-(offset+(previous?(period==='week'?7:1):0))*86400000;end=previous?start+(period==='week'?7:1)*86400000:now+1;}
  return {start,end};
}
export function reportText(rs,period,start,end){const a=rs.filter(r=>r.ts>=start&&r.ts<end),s=summarize(a);return [heading({day:'KUNLIK HISOBOT',week:'HAFTALIK HISOBOT',month:'OYLIK HISOBOT'}[period]),small(localDate(start)+' — '+localDate(end-1)+' · Toshkent'),' ',line('Kirim',fmt(a.reduce((n,r)=>n+Math.max(0,r.amount),0))),line('Chiqim',fmt(a.reduce((n,r)=>n+Math.max(0,-r.amount),0))),line('Sof foyda',fmt(s.income)),line('Umumiy xarajat',fmt(s.expense)),line('Sof natija',fmt(s.pool)),' ',heading('Hamkorlar yechimi'),...names.map((n,i)=>line(n,fmt(s.taken[i]))),line('Tekshiruvda',s.pending+' ta'),small('Ulushlar davr oxirida nollanmaydi.')].join('\\n');}
async function setupGroupMenu(e){
  const key='menu_group',revision='v5:'+String(e.FINANCE_CHANNEL_ID);
  const existing=await stmt(e,'SELECT v FROM fin_config WHERE k=?',key).first();
  if(existing?.v===revision)return;
  await call(e,'setMyCommands',{scope:{type:'chat',chat_id:Number(e.FINANCE_CHANNEL_ID)},commands:Object.entries(groupDescriptions).map(([command,description])=>({command,description}))});
  await call(e,'sendMessage',{chat_id:e.FINANCE_CHANNEL_ID,text:'<b>ARSLAN FINANCE</b>\\nQuyidagi menyudan foydalaning.',parse_mode:'HTML',reply_markup:groupKeyboard,protect_content:true});
  await stmt(e,'INSERT OR REPLACE INTO fin_config(k,v) VALUES(?,?)',key,revision).run();
}
async function queueDelete(e,id,now=Date.now()){
  if(!Number.isSafeInteger(Number(id))||Number(id)<=0)return;
  await stmt(e,'INSERT OR IGNORE INTO fin_config(k,v) VALUES(?,?)','temp:'+e.FINANCE_CHANNEL_ID+':'+id,String(now+300000)).run();
}
async function transient(e,m,text,markup=groupKeyboard){
  const p=await call(e,'sendMessage',{chat_id:m.chat.id,text,parse_mode:'HTML',reply_markup:markup,protect_content:true});
  await queueDelete(e,p?.message_id);
  // Only known finance command/button messages, never a bank notification or arbitrary chat message.
  if(m.message_id)await queueDelete(e,m.message_id);
}
async function groupUpdate(e,m){
  if(!configured(e)||!['group','supergroup'].includes(m?.chat?.type)||String(m.chat.id)!==String(e.FINANCE_CHANNEL_ID))return false;
  await verifyChannel(e);
  if(!m.from||m.from.is_bot)return true;
  const special=extraCommand(m.text);
  if(special&&['izoh','tuzatish'].includes(special[1].toLowerCase())){
    if(!owner(e,m.from.id)){await transient(e,m,'Faqat mas’ul admin uchun.');return true;}
    const match=m.text.match(/^\\/\\w+(?:@arslanboostbot)?\\s+(\\d+)\\s+(.+)$/u);
    const id=Number(match?.[1]),value=match?.[2]?.trim();
    const r=await stmt(e,'SELECT * FROM fin_ops WHERE id=?',id).first();
    if(!r||!value){await transient(e,m,'Amal topilmadi.');return true;}
    if(special[1].toLowerCase()==='izoh'){
      await stmt(e,'INSERT OR REPLACE INTO fin_config(k,v) VALUES(?,?)','note:'+id,value.slice(0,240)).run();
    }else{
      if(!choices(r).includes(value)){await transient(e,m,'Amal turi noto‘g‘ri.');return true;}
      await stmt(e,'UPDATE fin_ops SET kind=?,actor=?,classified_at=? WHERE id=? AND kind<>?',value,String(m.from.id),Date.now(),id,value).run();
      r.kind=value;
    }
    await postEvent(e,r);await refresh(e);await transient(e,m,'Saqlandi.');return true;
  }
  const command=Object.hasOwn(groupButtons,m.text)?{view:groupButtons[m.text],page:0}:special?{view:extraViews[special[1].toLowerCase()],page:0}:parseChannelCommand(m.text);
  if(!command)return true;
  if(command.view==='home'){await refresh(e);await setupGroupMenu(e);}
  if(command.view==='help'){await transient(e,m,'<b>MOLIYA MENYUSI</b>\\nKerakli bo‘limni tanlang.');return true;}
  if(command.view==='report_menu'){await transient(e,m,'<b>HISOBOT</b>\\nDavrni tanlang.',reportKeyboard);return true;}
  if(command.view==='management'){await transient(e,m,[heading('BOSHQARUV'),'/tekshiruv — tasdiqlanmagan amallar','/izoh 12 Izoh matni — amalga izoh','/tuzatish 12 expense — turini tuzatish',small('Tuzatish va izoh faqat mas’ul admin uchun.'),small('Turlar: profit, expense, ignore, ARSLAN, BEXA, ASAD')].join('\\n'));return true;}
  if(['day','week','month'].includes(command.view)){const {start,end}=reportRange(Date.now(),command.view);await transient(e,m,reportText(await rows(e),command.view,start,end),reportKeyboard);return true;}
  const {text}=await viewContent(e,command.view,command.page);
  await transient(e,m,text);return true;
}
export async function financeMaintenance(env,now=Date.now()){
  if(!env.FINANCE_DB)return;
  const e=await financeEnv(env);if(!configured(e))return;
  const chat=await verifyChannel(e);if(chat.type==='channel')return;
  await setupGroupMenu(e);
  const prefix='temp:'+e.FINANCE_CHANNEL_ID+':';
  const jobs=(await stmt(e,"SELECT k,v FROM fin_config WHERE k LIKE ? AND CAST(v AS INTEGER)<=? LIMIT 40",prefix+'%',now).all()).results;
  for(const j of jobs){const id=Number(j.k.slice(prefix.length));try{await call(e,'deleteMessage',{chat_id:e.FINANCE_CHANNEL_ID,message_id:id});await stmt(e,'DELETE FROM fin_config WHERE k=?',j.k).run();}catch{if(now-Number(j.v)>86400000)await stmt(e,'DELETE FROM fin_config WHERE k=?',j.k).run();}}
  // At first cron after midnight in Tashkent; reports never reset the ledger.
  const today=localDate(now);
  for(const period of ['day',...(today.endsWith('-01')?['month']:[])]){
    const {start,end}=reportRange(now,period,true);
    if(end<=Date.parse(e.FINANCE_TRACK_FROM))continue;
    const key='report:'+period+':'+localDate(start);
    const claim=await stmt(e,'INSERT OR IGNORE INTO fin_config(k,v) VALUES(?,?)',key,'sending').run();
    if(!claim.meta.changes)continue;
    try{await call(e,'sendMessage',{chat_id:e.FINANCE_CHANNEL_ID,text:reportText(await rows(e),period,start,end),parse_mode:'HTML',protect_content:true});await stmt(e,'UPDATE fin_config SET v=? WHERE k=?','sent',key).run();}
    catch{await stmt(e,'DELETE FROM fin_config WHERE k=?',key).run();}
  }
}
"""+s[b:]
rep("(Object.hasOwn(groupButtons,m.text)||parseChannelCommand(m.text))&&e.FINANCE_DB","(Object.hasOwn(groupButtons,m.text)||parseChannelCommand(m.text)||extraCommand(m.text))&&e.FINANCE_DB")
# show lifetime earnings in shares, independently from bank card balance
rep("line('Qolgan',fmt(s.due[i])),line('Olingan',fmt(s.taken[i]))","line('Hisoblangan',fmt(s.due[i]+s.taken[i])),line('Olingan',fmt(s.taken[i])),line('Qolgan',fmt(s.due[i]))")
# Pass only financial and Telegram bindings instead of spreading the entire Worker environment.
rep("return {...e,FINANCE_OWNER_ID:e.FINANCE_OWNER_ID||e.ADMIN_ID,", "return {FINANCE_DB:e.FINANCE_DB,BOT_TOKEN:e.BOT_TOKEN,WEBHOOK_SECRET:e.WEBHOOK_SECRET,FINANCE_ADMIN_IDS:e.FINANCE_ADMIN_IDS,FINANCE_OWNER_ID:e.FINANCE_OWNER_ID||e.ADMIN_ID,")
p.write_text(s)
t=root/'test.mjs';s=t.read_text()
s += """
import {reportRange,reportText,financeMaintenance} from './finance.mjs';
test('Tashkent day boundaries and previous month do not reset balances',()=>{const n=Date.parse('2026-12-01T00:04:00+05:00');assert.deepEqual(reportRange(n,'day',true),{start:Date.parse('2026-11-30T00:00:00+05:00'),end:Date.parse('2026-12-01T00:00:00+05:00')});assert.deepEqual(reportRange(n,'month',true),{start:Date.parse('2026-11-01T00:00:00+05:00'),end:Date.parse('2026-12-01T00:00:00+05:00')});const rs=[{ts:n-1000000,amount:30000,balance:30000,kind:'profit'},{ts:n,amount:-1000,balance:29000,kind:'ARSLAN'}];assert.match(reportText(rs,'month',...Object.values(reportRange(n,'month',true))),/Sof foyda · <b>300 so‘m/);assert.equal(summarize(rs).due[0],9000);});
test('scheduled finance maintenance only deletes queued transient IDs and sends each period once',async()=>{const {d,db}=d1test(),orig=globalThis.fetch;const n=Date.parse('2026-12-01T00:04:00+05:00'),calls=[];globalThis.fetch=async(url,opt)=>{const method=String(url).split('/').at(-1),data=JSON.parse(opt.body);calls.push({method,data});return {json:async()=>({ok:true,result:method==='getChat'?{type:'supergroup'}:{message_id:900}})};};try{const ch='-1001234567890';for(const [k,v] of Object.entries({channel:ch,card:'1234',track_from:'2026-11-01T00:00:00Z',humo_peer:'333',dashboard:'50',menu_group:'v5:'+ch,['temp:'+ch+':70']:String(n-1),['temp:'+ch+':71']:String(n+60000)}))d.prepare('INSERT INTO fin_config VALUES(?,?)').run(k,v);d.prepare("INSERT INTO fin_ops(event_key,ts,amount,balance,kind,post_id) VALUES('a',?,30000,30000,'profit',51)").run(n-600000);const e={FINANCE_DB:db,ADMIN_ID:'111',BOT_TOKEN:'test',get DB(){throw Error('market DB touched')}};await financeMaintenance(e,n);await financeMaintenance(e,n+1000);assert.deepEqual(calls.filter(c=>c.method==='deleteMessage').map(c=>c.data.message_id),[70]);assert.equal(calls.filter(c=>c.method==='sendMessage').length,2);assert.equal(d.prepare('SELECT kind FROM fin_ops').get().kind,'profit');}finally{globalThis.fetch=orig;d.close();}});
"""
t.write_text(s)
