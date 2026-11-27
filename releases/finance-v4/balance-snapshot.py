from pathlib import Path
import sys
root=Path(sys.argv[1]);p=root/'finance.mjs';s=p.read_text()
def rep(a,b):
 global s
 assert s.count(a)==1,a[:120]
 s=s.replace(a,b,1)
# A bank balance snapshot is separate from operations, including the opening balance.
rep("export function dashboardText(rs){const s=summarize(rs),last=rs.at(-1);","export function dashboardText(rs,snapshot=null){const s=summarize(rs),event=rs.at(-1),last=snapshot&&(!event||snapshot.ts>=event.ts)?snapshot:event;")
rep("small('Kartadagi qoldiq'+(last?' · '+date(last.ts):''))","small('HUMO xabaridagi qoldiq'+(last?' · '+date(last.ts):''))")
idx=s.index("async function dashboardId")
s=s[:idx]+"""async function balanceSnapshot(e){const r=await stmt(e,"SELECT v FROM fin_config WHERE k='bank_balance'").first();try{const b=JSON.parse(r?.v||'null');return b&&Number.isSafeInteger(b.balance)&&Number.isSafeInteger(b.ts)?b:null;}catch{return null;}}
async function currentDashboard(e){return dashboardText(await rows(e),await balanceSnapshot(e));}
"""+s[idx:]
s=s.replace("dashboardText(await rows(e))","await currentDashboard(e)")
# Read-only snapshot uses the same authenticated and source-checked relay, but does not insert ledger operations.
rep("  if(p.ts<Date.parse(x.FINANCE_TRACK_FROM))return reply({accepted:true,ignored:true});","""  if(body.action==='balance_snapshot'){
    if(peer==='0'||peer!==match[1])return reply({error:'source_mismatch'},403);
    if(p.ts>Date.now()+300000)return reply({error:'future_notice'},400);
    const next={balance:p.balance,ts:p.ts,message:match[2]};
    const saved=await stmt(e,"INSERT INTO fin_config(k,v) VALUES('bank_balance',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v WHERE CAST(json_extract(excluded.v,'$.ts') AS INTEGER)>CAST(json_extract(fin_config.v,'$.ts') AS INTEGER) OR (CAST(json_extract(excluded.v,'$.ts') AS INTEGER)=CAST(json_extract(fin_config.v,'$.ts') AS INTEGER) AND CAST(json_extract(excluded.v,'$.message') AS INTEGER)>CAST(json_extract(fin_config.v,'$.message') AS INTEGER))",JSON.stringify(next)).run();
    if(saved.meta.changes)await refresh(x);
    return reply({accepted:true,snapshot:true});
  }
  if(p.ts<Date.parse(x.FINANCE_TRACK_FROM))return reply({accepted:true,ignored:true});""")
p.write_text(s)
t=root/'test.mjs'
with t.open('a') as f:
 f.write("""
test('verified old bank balance initializes dashboard without counting historical money as income',async()=>{const {d,db}=d1test(),orig=globalThis.fetch,calls=[];globalThis.fetch=async(url,opt)=>{const method=String(url).split('/').at(-1),data=JSON.parse(opt.body);calls.push({method,data});return {json:async()=>({ok:true,result:method==='getChat'?{type:'supergroup'}:true})};};try{const ch='-1001234567890';for(const [k,v] of Object.entries({channel:ch,card:'1234',track_from:'2026-11-27T00:00:00Z',humo_peer:'333',dashboard:'50'}))d.prepare('INSERT INTO fin_config VALUES(?,?)').run(k,v);const secret='s'.repeat(40),env={FINANCE_DB:db,ADMIN_ID:'111',BOT_TOKEN:'test',P2P_HUMO_SECRET:secret};const notice="💸 To'lov\\n− 2.050,25 UZS\\n📍 TEST\\n💳 HUMOCARD *1234\\n🕒 19:11 15.11.2026\\n💰 10.050,25 UZS";const invoke=(id,raw=notice)=>handleFinanceRelay(new Request('https://example.test/finance/relay',{method:'POST',headers:{Authorization:'Bearer '+secret},body:JSON.stringify({action:'balance_snapshot',eventId:id,text:raw})}),env);assert.equal((await invoke('tg:444:8')).status,403);assert.equal((await (await invoke('tg:333:8')).json()).snapshot,true);assert.equal(d.prepare('SELECT COUNT(*) n FROM fin_ops').get().n,0);const saved=JSON.parse(d.prepare("SELECT v FROM fin_config WHERE k='bank_balance'").get().v);assert.equal(saved.balance,1005025);assert.match(calls.find(c=>c.method==='editMessageText').data.text,/10 050,25/);await invoke('tg:333:7',notice.replace('10.050,25','99.999,00'));assert.equal(JSON.parse(d.prepare("SELECT v FROM fin_config WHERE k='bank_balance'").get().v).balance,1005025);assert.match(dashboardText([{amount:30000,balance:30000,kind:'profit',ts:saved.ts+60000}],saved),/300 so‘m/);}finally{globalThis.fetch=orig;d.close();}});
""")
