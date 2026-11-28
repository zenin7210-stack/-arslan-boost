import atlas from './card-font.mjs';

const width = 840, margin = 46;
const themes = {
  balance: ['Balans', [135, 235, 199]], credit: ['Kirim', [161, 231, 144]],
  debit: ['Chiqim', [255, 172, 138]], report: ['Hisobot', [183, 183, 255]],
  history: ['Tarix', [146, 204, 255]]
};
const clean = s => s.replace(/<\/?(?:b|i)>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&')
  .replace(/[💳🟢🔴🕓️]/gu,'').trim();
export function cardType(html) {
  const title=clean(html.split('\n')[0]);
  if (/^(Balans|💳)(?: ·|$)/u.test(title)) return 'balance';
  if (/^KIRIM [ +]/.test(title)) return 'credit';
  if (/^CHIQIM [ −-]/.test(title)) return 'debit';
  if (/^(KUNLIK|HAFTALIK|OYLIK) HISOBOT$/.test(title)) return 'report';
  return /^(KIRIMLAR|CHIQIMLAR|BARCHA AMALLAR|TEKSHIRUV)$/.test(title) ? 'history' : null;
}
const advance = (s, face) => [...s].reduce((n,c)=>n+(atlas[face][c]||atlas[face]['?']||atlas.body['?'])[0],0);
function wrap(s,face,limit) {
  const lines=[]; let row='';
  for (const word of s.split(/\s+/)) {
    if (row && advance(row+' '+word,face)>limit) {lines.push(row);row='';}
    for (const ch of (row?' ':'')+word) {
      if (row && advance(row+ch,face)>limit) {lines.push(row);row='';}
      row+=ch;
    }
  }
  if(row) lines.push(row);
  return lines;
}
const glyphCache=new WeakMap();
function glyph(g) {
  if(!glyphCache.has(g)) glyphCache.set(g,Uint8Array.from(atob(g[4]),c=>c.charCodeAt(0)));
  return glyphCache.get(g);
}
const crcTable=Uint32Array.from({length:256},(_,i)=>{
  for(let k=0;k<8;k++) i=(i>>>1)^((i&1)?0xedb88320:0);
  return i>>>0;
});
function chunk(tag,data){
  const out=new Uint8Array(data.length+12), dv=new DataView(out.buffer);
  dv.setUint32(0,data.length);out.set(new TextEncoder().encode(tag),4);out.set(data,8);
  let crc=0xffffffff;for(let i=4;i<out.length-4;i++)crc=crcTable[(crc^out[i])&255]^(crc>>>8);
  dv.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;
}
export async function renderCard(html,type){
  const [section,accent]=themes[type], lines=html.split('\n').map(clean).filter(Boolean);
  const head=lines.shift();
  const detailed=type==='report'||type==='history';
  let title=detailed?head:section;
  let hero='';
  if(type==='balance') hero=head.split(' · ')[1]||'';
  if(type==='credit'||type==='debit'){
    const [amount,ref]=head.split(' · ');hero=amount.replace(/^(KIRIM|CHIQIM)\s+/,'');title=section+'  /  '+ref;
  }
  const layout=[];let y=hero?207:142;
  function text(s,face,x,baseline,color=1){layout.push({s,face,x,baseline,color});}
  text('ARSLAN   /   FINANCE','meta',margin,54,2);
  text(title.toUpperCase(),'bold',margin,117,4);
  if(hero){const face=advance(hero,'hero')<width-margin*2?'hero':'bold';text(hero,face,margin,188);}
  let first=true;
  for(const line of lines){
    const pieces=line.split(' · '), pair=pieces.length===2 && /(?:so‘m| ta)$/.test(pieces[1]);
    if(pair && advance(pieces[0],'body')+advance(pieces[1],'bold')+25<=width-margin*2){
      y+=first?50:57;layout.push({rule:y-36});
      text(pieces[0],'body',margin,y,2);text(pieces[1],'bold',width-margin-advance(pieces[1],'bold'),y);
    }else{
      const face=/^\d{2}[.:]|^\d{4}-|^\d+-sahifa/.test(line)?'meta':'body';
      for(const row of wrap(line,face,width-margin*2)){y+=face==='meta'?36:43;text(row,face,margin,y,face==='meta'?2:1);}
    }
    first=false;
  }
  const height=y+34, stride=width+1, raw=new Uint8Array(stride*height);
  const bg=[18,28,34], colors=[bg,[242,246,244],[175,191,193],[48,66,72],accent];
  const pal=new Uint8Array(5*16*3);
  for(let c=0;c<5;c++) for(let a=0;a<16;a++) for(let k=0;k<3;k++) pal[(c*16+a)*3+k]=Math.round(bg[k]+(colors[c][k]-bg[k])*a/15);
  function point(x,y,c){if(x>=0&&x<width&&y>=0&&y<height)raw[y*stride+1+x]=c;}
  // Engraved arcs stay in the header, clear of the figures.
  for(let ring=0;ring<11;ring++) for(let x=592;x<width;x++){
    const t=(x-595)/245, top=Math.round(23+ring*5+19*Math.sin(t*5+ring*.12)-32*t);
    if(top>=0&&top<87)point(x,top,ring%4===0?69:58);
  }
  for (const item of layout){
    if(item.rule!==undefined){const start=item.rule*stride+1+margin;raw.fill(63,start,start+width-margin*2);continue;}
    let pen=item.x;
    for(const c of item.s){
      const g=atlas[item.face][c]||atlas[item.face]['?']||atlas.body['?'];
      const [step,dx,dy,w]=g;
      if(w){let pos=0;for(const run of glyph(g)){
        const n=(run&15)+1,alpha=run>>4;
        if(alpha)for(let i=0;i<n;i++){const at=pos+i;point(pen+dx+at%w,item.baseline+dy+Math.floor(at/w),item.color*16+alpha);}
        pos+=n;
      }}
      pen+=step;
    }
  }
  const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const hdr=new Uint8Array(13);const dv=new DataView(hdr.buffer);dv.setUint32(0,width);dv.setUint32(4,height);hdr[8]=8;hdr[9]=3;
  return new Blob([Uint8Array.of(137,80,78,71,13,10,26,10),chunk('IHDR',hdr),chunk('PLTE',pal),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],{type:'image/png'});
}

// Only the bound finance chat uses this transport. Files are uploaded directly to Telegram.
export async function photoCall(e, method, p, type) {
  const editing=method==='editMessageText', verb=editing?'editMessageMedia':'sendPhoto';
  const blob=await renderCard(p.text,type);
  const form=new FormData();
  form.set('chat_id',String(p.chat_id));
  // A short searchable caption also supplies the full text if a custom note uses
  // a script outside the card typeface.
  const lines=p.text.split('\n').map(clean).filter(Boolean);
  const caption=lines.some(line=>[...line].some(ch=>!atlas.body[ch]))?lines.join('\n').slice(0,1024):lines[0];
  if(editing) {
    form.set('message_id',String(p.message_id));
    form.set('media',JSON.stringify({type:'photo',media:'attach://card',caption}));
  } else {
    form.set('caption',caption);
    if(p.protect_content)form.set('protect_content','true');
  }
  form.set(editing?'card':'photo',blob,type+'.png');
  if(p.reply_markup)form.set('reply_markup',JSON.stringify(p.reply_markup));
  const response=await fetch('https://api.telegram.org/bot'+e.BOT_TOKEN+'/'+verb,{method:'POST',body:form});
  const result=await response.json();
  if(!result.ok) {
    if(editing && /message is not modified/i.test(result.description||''))return true;
    throw Error('Finance Telegram '+verb+' '+result.error_code);
  }
  return result.result;
}
