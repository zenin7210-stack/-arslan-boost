"""ARSLAN BOOST bank notification listener.

Only pinned Telegram bank-bot messages are read. This relay is not a
signed banking gateway. Public automatic credits require payer attribution.
Safe default: RELAY_DRY_RUN=1. Never log secrets or message bodies.
"""

import asyncio
import logging
import os
import re
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import requests
from telethon import TelegramClient
from telethon.sessions import StringSession

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("arslan-payment-notices")
BOT_NAMES = {"cardxabar": "CardXabarBot", "humo": "HUMOcardbot"}
CREDIT = re.compile(r"^[+➕]\s*\d[\d\s.,\u00a0\u202f]*\s*UZS\s*$", re.I | re.M)
NEGATIVE = re.compile(r"^(?:[-−➖]\s*\d|💸\s*to['‘’]lov\s*$|(?:🔴\s*)?списание(?: с карты)?\s*$)", re.I | re.M)
OTP = re.compile(r"\botp\b|код подтверждения|verification code|tasdiqlash kodi|one.time password", re.I)
CARD_LINE = re.compile(r"(?:💳|card\s*:|карта\s*:)\s*(?:(?:HUMOCARD|HUMO)\s*)?[*•xX ]*\d{4}\b", re.I)
SECRET_PATTERN = re.compile(r"[A-Za-z0-9_-]{32,256}\Z")
RECHECK = timedelta(minutes=30)
SCAN_SECONDS = 8


def notice_type(text, source):
    """Fail closed: only credit lines after the exact incoming-transfer header."""
    if not isinstance(text, str) or len(text) > 2500 or OTP.search(text):
        return False
    normalized = text.replace("\ufe0f", "")
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    if not lines or NEGATIVE.search(normalized):
        return False
    heading = re.sub(r"^[🟢🎉]\s*", "", lines[0]).strip().casefold()
    if source == "cardxabar":
        if heading not in ("перевод на карту", "perevod na kartu"):
            return False
    elif source == "humo":
        if heading not in ("to'ldirish", "to‘ldirish", "to’ldirish"):
            return False
    else:
        return False
    return len(CREDIT.findall(normalized)) == 1 and bool(CARD_LINE.search(normalized))



def is_verified_bot_identity(bot, expected):
    """Validate Telegram primary or active secondary bot username, never a stale alias."""
    if not bool(getattr(bot, "bot", False)):
        return False
    names = set()
    primary = getattr(bot, "username", None)
    if isinstance(primary, str):
        names.add(primary.casefold())
    for alias in getattr(bot, "usernames", None) or []:
        alias_name = getattr(alias, "username", None)
        if getattr(alias, "active", False) and isinstance(alias_name, str):
            names.add(alias_name.casefold())
    return expected.casefold() in names


def get_credentials():
    try:
        api_id = int(os.getenv("TG_API_ID") or os.getenv("API_ID") or "")
    except ValueError as exc:
        raise RuntimeError("Missing or invalid Telegram API ID") from exc
    api_hash = (os.getenv("TG_API_HASH") or os.getenv("API_HASH") or "").strip()
    session = (os.getenv("TG_SESSION") or os.getenv("SESSION_STRING") or "").strip()
    if not api_hash or not session or api_id <= 0:
        raise RuntimeError("Missing Telegram credentials or private user session")
    return api_id, api_hash, session


def get_relay_config():
    dry_run = os.getenv("RELAY_DRY_RUN", "1") != "0"
    origin = os.getenv("WORKER_URL", "").rstrip("/")
    parsed = urlsplit(origin)
    config = {}
    for source in BOT_NAMES:
        secret = os.getenv(f"P2P_{source.upper()}_SECRET", "").strip()
        peer_id = os.getenv(f"P2P_{source.upper()}_PEER_ID", "").strip()
        peer_id = peer_id or os.getenv(f"{source.upper()}_PEER_ID", "").strip()
        if not dry_run and (not peer_id.isdigit() or int(peer_id) <= 0
                            or not SECRET_PATTERN.fullmatch(secret)):
            raise RuntimeError("Missing pinned bank bot ID or strong secret for " + source)
        config[source] = {"secret": secret, "peer_id": int(peer_id) if peer_id.isdigit() else None}
    if not dry_run and (parsed.scheme != "https" or not parsed.hostname
                        or parsed.username or parsed.password or parsed.path
                        or parsed.query or parsed.fragment):
        raise RuntimeError("WORKER_URL must be an HTTPS origin without a path")
    return dry_run, origin, config


def send_event(worker_url, secret, source, peer_id, message):
    """A 200 response alone is never confirmation; require an accepted JSON reply."""
    endpoint = worker_url + "/relay/" + source
    payload = {"eventId": f"tg:{peer_id}:{message.id}", "text": message.raw_text}
    try:
        response = requests.post(
            endpoint, json=payload,
            headers={"Authorization": "Bearer " + secret},
            timeout=12, allow_redirects=False)
        if response.status_code == 200 and response.headers.get(
                "content-type", "").lower().startswith("application/json"):
            result = response.json()
            if result.get("accepted") is True:
                LOG.info("Webhook accepted source=%s msg=%s matched=%s duplicate=%s",
                         source, message.id, bool(result.get("matched")),
                         bool(result.get("duplicate")))
                return True
        LOG.warning("Webhook not accepted: source=%s HTTP=%s",
                    source, response.status_code)
    except (requests.RequestException, ValueError) as exc:
        LOG.warning("Webhook error: source=%s type=%s", source, type(exc).__name__)
    return False


class Health(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/":
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(
            b"ARSLAN listener process alive; not a bank payment confirmation.\n")

    def log_message(self, fmt, *args):
        pass


def start_health_server():
    server = ThreadingHTTPServer(
        ("0.0.0.0", int(os.getenv("PORT", "10000"))), Health)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    LOG.info("Health server started")


async def process_messages(client, peers, config, dry_run, worker_url, already_seen):
    minimum = datetime.now(timezone.utc) - RECHECK
    for source, bot in peers.items():
        recent = await client.get_messages(bot, limit=150)
        for message in reversed(recent):
            if not message.date or message.date < minimum:
                continue
            if message.out or message.fwd_from or not notice_type(message.raw_text, source):
                continue
            key = (bot.id, message.id)
            if key in already_seen:
                continue
            if dry_run:
                LOG.info("Read-only incoming notice source=%s message=%s; no webhook",
                         source, message.id)
                already_seen[key] = message.date
                continue
            if await asyncio.to_thread(
                    send_event, worker_url, config[source]["secret"],
                    source, bot.id, message):
                already_seen[key] = message.date
            else:
                LOG.warning("Notice pending retry source=%s message=%s",
                            source, message.id)
    for key, stamp in list(already_seen.items()):
        if stamp < minimum:
            del already_seen[key]


async def listen():
    LOG.info("Listener setup stage=credentials")
    api_id, api_hash, session = get_credentials()
    LOG.info("Listener setup stage=configuration")
    dry_run, worker_url, config = get_relay_config()
    LOG.info("Listener setup stage=telegram_connect")
    client = TelegramClient(StringSession(session), api_id, api_hash)
    await client.connect()
    LOG.info("Listener setup stage=telegram_connected")
    try:
        if not await client.is_user_authorized():
            raise RuntimeError("User Telegram session is not authorized")
        me = await client.get_me()
        if me.bot:
            raise RuntimeError("The listener needs a user session, not a bot token")
        peers = {}
        for source, name in BOT_NAMES.items():
            LOG.info("Listener setup stage=resolve_bot source=%s", source)
            try:
                bot = await client.get_entity(name)
            except (ValueError, RuntimeError) as exc:
                LOG.warning("Bank source disabled: %s reason=entity_lookup_%s",
                            source, type(exc).__name__)
                continue
            correct_name = is_verified_bot_identity(bot, name)
            if not correct_name:
                LOG.warning("Bank source disabled: %s reason=identity_invalid is_bot=%s username_match=%s",
                            source, bool(getattr(bot, "bot", False)), correct_name)
                continue
            if not dry_run and bot.id != config[source]["peer_id"]:
                LOG.warning("Bank source disabled: %s reason=pinned_peer_mismatch", source)
                continue
            peers[source] = bot
            LOG.info("Bank notification bot verified: %s id=%s", source, bot.id)
        if not peers:
            raise RuntimeError("No verified bank notification bots accessible")
        LOG.info("Telethon authorized; verified_sources=%s mode=%s",
                 ",".join(peers), "READ_ONLY" if dry_run else "RELAY")
        seen = {}
        while True:
            try:
                await process_messages(
                    client, peers, config, dry_run, worker_url, seen)
            except (OSError, TimeoutError) as exc:
                LOG.warning("Temporary Telegram error type=%s", type(exc).__name__)
            await asyncio.sleep(SCAN_SECONDS)
    finally:
        await client.disconnect()


async def main():
    backoff = 5
    while True:
        try:
            await listen()
        except (KeyboardInterrupt, SystemExit):
            raise
        except Exception as exc:
            # Whitelist diagnostic reasons; never print credentials or Telegram data.
            safe_codes = {
                "Missing or invalid Telegram API ID": "missing_api_id",
                "Missing Telegram credentials or private user session": "missing_credentials",
                "User Telegram session is not authorized": "session_not_authorized",
                "The listener needs a user session, not a bot token": "wrong_session_type",
                "Unexpected Telegram bank bot identity for cardxabar": "cardxabar_identity",
                "Unexpected Telegram bank bot identity for humo": "humo_identity",
                "Pinned Telegram bot ID mismatch for cardxabar": "cardxabar_peer_mismatch",
                "Pinned Telegram bot ID mismatch for humo": "humo_peer_mismatch",
                "No verified bank notification bots accessible": "no_verified_bank_sources",
            }
            code = safe_codes.get(str(exc), type(exc).__name__)
            LOG.error("Listener stopped reason=%s; retrying", code)
        await asyncio.sleep(backoff)
        backoff = min(60, backoff * 2)


if __name__ == "__main__":
    start_health_server()
    asyncio.run(main())
