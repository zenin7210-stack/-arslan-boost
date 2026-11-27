"""Isolated finance poller. Existing marketplace relay remains unchanged."""
import asyncio
import logging
import re
import time
from datetime import datetime, timezone, timedelta
import requests

LOG = logging.getLogger('arslan-finance')
OTP = re.compile(r'\botp\b|код подтверждения|verification code|tasdiqlash kodi', re.I)
TITLE = re.compile(r"^(?:🎉|💸|💸️)?\s*to['‘’](ldirish|lov)\s*$", re.I)
CARD = re.compile(r'\bHUMOCARD\s*\*(\d{4})\b', re.I)
AMOUNT = re.compile(r'^([+➕−\-–➖])\s*\d[\d., \u00a0\u202f]*\s*UZS$', re.I)

def eligible(text, card):
    if not isinstance(text,str) or len(text)>2500 or OTP.search(text): return False
    lines=[x.strip() for x in text.splitlines() if x.strip()]
    if len(lines)<5: return False
    h=TITLE.fullmatch(lines[0]); a=AMOUNT.fullmatch(lines[1]); c=CARD.findall(text)
    return bool(h and a and c==[card] and (h[1].lower()=='ldirish')==(a[1] in '+➕'))

def send(origin, secret, peer, message):
    try:
        r=requests.post(origin+'/finance/relay',json={'eventId':f'tg:{peer}:{message.id}','text':message.raw_text},headers={'Authorization':'Bearer '+secret},timeout=10,allow_redirects=False)
        return r.status_code==200 and r.json().get('accepted') is True
    except (requests.RequestException, ValueError):
        return False

def send_snapshot(origin, secret, peer, message):
    """A balance observation is never a payment event or profit entry."""
    try:
        r=requests.post(origin+'/finance/relay',json={'action':'balance_snapshot','eventId':f'tg:{peer}:{message.id}','text':message.raw_text},headers={'Authorization':'Bearer '+secret},timeout=10,allow_redirects=False)
        return r.status_code==200 and r.json().get('snapshot') is True
    except (requests.RequestException, ValueError):
        return False

def latest_notice(messages,card):
    return max((m for m in messages if m.date and not m.out and not m.fwd_from and eligible(m.raw_text,card)),key=lambda m:m.id,default=None)

def configure(origin, secret, peer, card, channel):
    try:
        r=requests.post(origin+'/finance/relay',json={'action':'configure','channel':channel,'card':card,'peer':str(peer)},headers={'Authorization':'Bearer '+secret},timeout=15,allow_redirects=False)
        if r.status_code==200 and r.json().get('configured') is True:
            LOG.info('Finance channel configured successfully');return True
        LOG.warning('Finance configuration not accepted: HTTP %s',r.status_code)
    except (requests.RequestException, ValueError) as exc:
        LOG.warning('Finance configuration retry: %s',type(exc).__name__)
    return False

async def poll_finance(client, bot, origin, secret, pinned_peer, card, channel=''):
    """Run in separate task on the same authorized Telegram client, no extra session."""
    if not (bot and bot.id==pinned_peer and re.fullmatch(r'\d{4}',card or '') and len(secret)>=32 and origin.startswith('https://')):
        LOG.warning('Finance listener disabled: missing verified configuration'); return
    if channel:
        if not re.fullmatch(r'-100\d{5,17}',channel):
            LOG.warning('Finance listener disabled: invalid channel');return
        while not await asyncio.to_thread(configure,origin,secret,bot.id,card,channel):
            await asyncio.sleep(60)
    seen={}
    snapshot_seen=0
    next_history_search=0
    while True:
        try:
            cutoff=datetime.now(timezone.utc)-timedelta(hours=24)
            recent=await client.get_messages(bot,limit=150)
            latest=latest_notice(recent,card)
            if latest is None and not snapshot_seen and time.monotonic()>=next_history_search:
                next_history_search=time.monotonic()+300
                latest=latest_notice(await client.get_messages(bot,limit=100,search=card),card)
            if latest is not None and latest.id>snapshot_seen:
                if await asyncio.to_thread(send_snapshot,origin,secret,bot.id,latest):
                    snapshot_seen=latest.id
                    LOG.info('Verified HUMO balance snapshot accepted')
            for m in reversed(recent):
                if not m.date or m.date<cutoff or m.out or m.fwd_from or m.id in seen or not eligible(m.raw_text,card):continue
                if await asyncio.to_thread(send,origin,secret,bot.id,m): seen[m.id]=m.date
            seen={i:t for i,t in seen.items() if t>=cutoff}
        except asyncio.CancelledError: raise
        except Exception as exc: LOG.warning('Finance listener retry: %s',type(exc).__name__)
        await asyncio.sleep(15)
