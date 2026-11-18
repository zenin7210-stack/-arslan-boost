import os
import re
import logging
import threading
import http.server
import socketserver
import asyncio
from telethon import TelegramClient, events
from telethon.sessions import StringSession
import requests

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Запуск микро-сервера для Render Web Service (для прохождения проверки порта)
PORT = int(os.getenv("PORT", 10000))

class HealthCheckHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Bot is alive!")
    def log_message(self, format, *args):
        pass

def run_web_server():
    try:
        with socketserver.TCPServer(("", PORT), HealthCheckHandler) as httpd:
            logger.info(f"🌐 HTTP-сервер для Render запущен на порту {PORT}")
            httpd.serve_forever()
    except Exception as e:
        logger.error(f"Ошибка HTTP-сервера: {e}")

# Запускаем веб-сервер в отдельном потоке
threading.Thread(target=run_web_server, daemon=True).start()

# Получение переменных окружения
API_ID = os.getenv("API_ID")
API_HASH = os.getenv("API_HASH")
SESSION_STRING = os.getenv("SESSION_STRING", "")
WORKER_WEBHOOK_URL = os.getenv(
    "WORKER_WEBHOOK_URL", 
    "https://arslan-boost.zenin7210.workers.dev/api/webhook/payment"
)

if not API_ID or not API_HASH or not SESSION_STRING:
    logger.error("❌ ОШИБКА: Не заданы API_ID, API_HASH или SESSION_STRING!")
    exit(1)

try:
    API_ID = int(API_ID)
except ValueError:
    logger.error("❌ ОШИБКА: API_ID должен быть числом!")
    exit(1)

# Инициализация клиента через StringSession
client = TelegramClient(StringSession(SESSION_STRING), API_ID, API_HASH)

@client.on(events.NewMessage(incoming=True))
async def handle_bank_notification(event):
    text = event.message.text or ""
    
    keywords = ["поступление", "зачислено", "uzcard", "humo"]
    if not any(kw in text.lower() for kw in keywords):
        return

    logger.info(f"📥 Новое уведомление: {text}")
    amounts = re.findall(r'([\d\s\.]+)\s*(?:сум|so\'m|UZS)', text, re.IGNORECASE)
    
    if not amounts:
        return

    raw_amount = amounts[0].replace(" ", "").replace("\xa0", "")
    try:
        incoming_amount = float(raw_amount)
    except ValueError:
        return

    logger.info(f"🧮 Распознанная сумма: {incoming_amount}")

    try:
        response = requests.post(
            WORKER_WEBHOOK_URL, 
            json={
                "amount": incoming_amount,
                "raw_text": text
            },
            timeout=10
        )
        if response.status_code == 200:
            logger.info("🚀 Успешно передано в Worker!")
        else:
            logger.warning(f"⚠️ Worker отклонил сумму {incoming_amount}: {response.text}")
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Ошибка соединения с Worker: {e}")

async def main():
    logger.info("🤖 Telethon-юзербот запускается через StringSession...")
    await client.start()
    logger.info("✅ Юзербот успешно авторизован и ожидает уведомления от банков...")
    await client.run_until_disconnected()

if __name__ == "__main__":
    asyncio.run(main())
