from pathlib import Path
import sys
root=Path(sys.argv[1]);p=root/'finance.mjs';s=p.read_text()
def replace(a,b):
 global s
 assert s.count(a)==1,a[:120]
 s=s.replace(a,b,1)
replace("if(c.type!=='channel'||c.username||c.active_usernames?.length)throw Error('Private channel required');","if(!['channel','supergroup','group'].includes(c.type)||c.username||c.active_usernames?.length||c.is_forum)throw Error('Private finance chat required');return c;")
replace("async function initDashboard(e){await verifyChannel(e);await ensureChannelUpdates(e);","async function initDashboard(e){const chat=await verifyChannel(e);if(chat.type==='channel')await ensureChannelUpdates(e);")
replace("await refresh(e);}\nasync function refresh(e)","await refresh(e);if(chat.type!=='channel')await setupGroupMenu(e);}\nasync function refresh(e)")
replace("'/kirim · /chiqim · /hisobot','/ulush · /tarix · /tekshiruv','/balans · /moliya'","small('Menyu: /moliya')")
replace("if(!configured(e)||m.chat?.type!=='channel'||String(m.chat.id)!==String(e.FINANCE_CHANNEL_ID))return false;","if(!configured(e)||m.chat?.type!=='channel'||String(m.chat.id)!==String(e.FINANCE_CHANNEL_ID))return false;")
marker="async function ensureChannelUpdates(e){"
i=s.index(marker)
s=s[:i]+"""const groupButtons={'💰 Balans':'home','👥 Ulushlar':'shares','↙ Kirimlar':'in','↗ Chiqimlar':'out','📊 Hisobot':'month','📋 Tarix':'all','🕓 Tekshiruv':'pending','↻ Yangilash':'home'};
const groupKeyboard={keyboard:[[{text:'💰 Balans'},{text:'👥 Ulushlar'}],[{text:'↙ Kirimlar'},{text:'↗ Chiqimlar'}],[{text:'📊 Hisobot'},{text:'📋 Tarix'}],[{text:'🕓 Tekshiruv'},{text:'↻ Yangilash'}]],resize_keyboard:true,is_persistent:true};
const groupDescriptions={balans:'Karta qoldig‘i',ulush:'Hamkorlar ulushi',kirim:'Kirimlar',chiqim:'Chiqimlar va xarajatlar',hisobot:'Oylik hisobot',tarix:'Amallar tarixi',tekshiruv:'Tekshiruv',moliya:'Menyu'};
async function setupGroupMenu(e){
  const key='menu_group';
  const existing=await stmt(e,'SELECT v FROM fin_config WHERE k=?',key).first();
  if(existing?.v===String(e.FINANCE_CHANNEL_ID))return;
  await call(e,'setMyCommands',{scope:{type:'chat',chat_id:Number(e.FINANCE_CHANNEL_ID)},commands:Object.entries(groupDescriptions).map(([command,description])=>({command,description}))});
  await call(e,'sendMessage',{chat_id:e.FINANCE_CHANNEL_ID,text:'<b>ARSLAN FINANCE</b>\\nQuyidagi menyudan foydalaning.',parse_mode:'HTML',reply_markup:groupKeyboard,protect_content:true});
  await stmt(e,'INSERT OR REPLACE INTO fin_config(k,v) VALUES(?,?)',key,String(e.FINANCE_CHANNEL_ID)).run();
}
async function groupUpdate(e,m){
  if(!configured(e)||!['group','supergroup'].includes(m?.chat?.type)||String(m.chat.id)!==String(e.FINANCE_CHANNEL_ID))return false;
  await verifyChannel(e);
  if(!m.from||m.from.is_bot)return true;
  const command=groupButtons[m.text]?{view:groupButtons[m.text],page:0}:parseChannelCommand(m.text);
  if(!command)return true;
  if(command.view==='home')await refresh(e);
  if(command.view==='help'){await call(e,'sendMessage',{chat_id:m.chat.id,text:'<b>MOLIYA MENYUSI</b>\\nKerakli bo‘limni tanlang.',parse_mode:'HTML',reply_markup:groupKeyboard,protect_content:true});return true;}
  const {text}=await viewContent(e,command.view,command.page);
  await call(e,'sendMessage',{chat_id:m.chat.id,text,parse_mode:'HTML',reply_markup:groupKeyboard,protect_content:true});
  return true;
}
"""+s[i:]
replace("  const q=u.callback_query,m=u.message;\n  const cc=", "  const q=u.callback_query,m=u.message;\n  if(e.FINANCE_DB&&['group','supergroup'].includes(m?.chat?.type)){const x=await financeEnv(e);if(await groupUpdate(x,m))return true;}\n  const cc=")
# Only the authenticated configuration route may move the ledger, and only to a private group verified by Telegram.
replace("if((x.FINANCE_CHANNEL_ID&&String(x.FINANCE_CHANNEL_ID)!==channel)||(x.FINANCE_CARD_LAST4&&String(x.FINANCE_CARD_LAST4)!==card)||(x.FINANCE_HUMO_BOT_ID!=='0'&&String(x.FINANCE_HUMO_BOT_ID)!==peer))return reply({error:'configuration_conflict'},409);","if((x.FINANCE_CARD_LAST4&&String(x.FINANCE_CARD_LAST4)!==card)||(x.FINANCE_HUMO_BOT_ID!=='0'&&String(x.FINANCE_HUMO_BOT_ID)!==peer))return reply({error:'configuration_conflict'},409);\n    const moving=!!x.FINANCE_CHANNEL_ID&&String(x.FINANCE_CHANNEL_ID)!==channel;")
replace("const candidate={...x,FINANCE_CHANNEL_ID:channel};\n    await verifyChannel(candidate);","const candidate={...x,FINANCE_CHANNEL_ID:channel};\n    const chat=await verifyChannel(candidate);\n    if(moving&&chat.type==='channel')return reply({error:'configuration_conflict'},409);")
replace("if(rights.status!=='administrator'||!rights.can_post_messages||!rights.can_edit_messages)return reply({error:'channel_permissions'},403);","if(rights.status!=='administrator'||(chat.type==='channel'?(!rights.can_post_messages||!rights.can_edit_messages):!rights.can_pin_messages))return reply({error:'channel_permissions'},403);")
replace("const track=x.FINANCE_TRACK_FROM||new Date().toISOString();\n    await e.FINANCE_DB.batch([['channel',channel],['card',card],['track_from',track],['humo_peer',peer]].map(([k,v])=>stmt(e,'INSERT OR IGNORE INTO fin_config(k,v) VALUES(?,?)',k,v)));","const track=x.FINANCE_TRACK_FROM||new Date().toISOString();\n    if(moving){await e.FINANCE_DB.batch([stmt(e,\"UPDATE fin_config SET v=? WHERE k='channel'\",channel),stmt(e,\"DELETE FROM fin_config WHERE k IN ('dashboard','menu_group')\"),stmt(e,'UPDATE fin_ops SET post_id=NULL')]);}\n    await e.FINANCE_DB.batch([['channel',channel],['card',card],['track_from',track],['humo_peer',peer]].map(([k,v])=>stmt(e,'INSERT OR IGNORE INTO fin_config(k,v) VALUES(?,?)',k,v)));")
replace("await initDashboard(ready);\n    return reply({accepted:true,configured:true});","await initDashboard(ready);\n    if(chat.type!=='channel'){for(const r of (await rows(ready,\"WHERE kind='pending' AND post_id IS NULL\")).slice(-50))await postEvent(ready,r);}\n    return reply({accepted:true,configured:true});")
# A group command in an unrelated chat must fall through unchanged; no market data used.
p.write_text(s)
t=root/'test.mjs';s=t.read_text()
s=s.replace("assert.match(t,/\\/chiqim/);","assert.match(t,/\\/moliya/);")
s += """
test('private group migration preserves ledger and installs only chat scoped menu',async()=>{const {d,db}=d1test(),orig=globalThis.fetch;const calls=[];let id=80;globalThis.fetch=async(url,opt)=>{const method=String(url).split('/').at(-1),data=JSON.parse(opt.body);calls.push({method,data});let result=true;if(method==='getChat')result={type:String(data.chat_id)==='-1009999999999'?'supergroup':'channel'};else if(method==='getChatMember')result=data.user_id===111?{status:'creator'}:{status:'administrator',can_pin_messages:true,can_post_messages:true,can_edit_messages:true};else if(method==='getMe')result={id:222};else if(method==='sendMessage')result={message_id:id++};return {json:async()=>({ok:true,result})};};const secret='s'.repeat(40),env={FINANCE_DB:db,ADMIN_ID:'111',BOT_TOKEN:'test',P2P_HUMO_SECRET:secret};const invoke=body=>handleFinanceRelay(new Request('https://example.test/finance/relay',{method:'POST',headers:{Authorization:'Bearer '+secret},body:JSON.stringify(body)}),env);try{for(const [k,v] of Object.entries({channel:'-1001234567890',card:'1234',track_from:'2026-11-01T00:00:00Z',humo_peer:'333',dashboard:'50'}))d.prepare('INSERT INTO fin_config VALUES(?,?)').run(k,v);d.prepare("INSERT INTO fin_ops(event_key,ts,amount,balance,kind,post_id) VALUES('a',0,30000,30000,'profit',51)").run();const setup={action:'configure',channel:'-1009999999999',card:'1234',peer:'333'};assert.equal((await (await invoke(setup)).json()).configured,true);assert.equal(d.prepare("SELECT v FROM fin_config WHERE k='channel'").get().v,setup.channel);assert.equal(d.prepare("SELECT kind FROM fin_ops").get().kind,'profit');const menu=calls.find(c=>c.method==='setMyCommands');assert.equal(menu.data.scope.type,'chat');assert.equal(String(menu.data.scope.chat_id),setup.channel);assert.equal(await handleFinanceUpdate(env,{message:{chat:{type:'supergroup',id:-1009999999999},from:{id:111},text:'↗ Chiqimlar'}}),true);assert.ok(calls.some(c=>c.data.reply_markup?.is_persistent));assert.equal(await handleFinanceUpdate(env,{message:{chat:{type:'supergroup',id:-1008888888888},from:{id:111},text:'/chiqim'}}),false);assert.equal((await (await invoke(setup)).json()).configured,true);assert.equal(calls.filter(c=>c.method==='setMyCommands').length,1);}finally{globalThis.fetch=orig;d.close();}});
"""
t.write_text(s)
