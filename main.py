import os
import re
import logging
from telethon import TelegramClient, events
import requests

# Настройка логирования для Render
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Получение переменных окружения
API_ID = os.getenv("API_ID")
API_HASH = os.getenv("API_HASH")
WORKER_WEBHOOK_URL = os.getenv(
    "WORKER_WEBHOOK_URL", 
    "https://arslan-boost.zenin7210.workers.dev/api/webhook/payment"
)

# Проверка обязательных параметров
if not API_ID or not API_HASH:
    logger.error("❌ ОШИБКА: Не заданы API_ID или API_HASH в переменных окружения Render!")
    exit(1)

try:
    API_ID = int(API_ID)
except ValueError:
    logger.error("❌ ОШИБКА: API_ID должен быть числом!")
    exit(1)

client = TelegramClient("session_name", API_ID, API_HASH)

@client.on(events.NewMessage(incoming=True))
async def handle_bank_notification(event):
    text = event.message.text or ""
    
    # Фильтруем ключевые слова банковских уведомлений
    keywords = ["поступление", "зачислено", "uzcard", "humo"]
    if not any(kw in text.lower() for kw in keywords):
        return

    logger.info(f"📥 Новое уведомление: {text}")
    
    # Поиск суммы в тексте (поддерживает пробелы и неразрывные пробелы)
    amounts = re.findall(r'([\d\s\.]+)\s*(?:сум|so\'m|UZS)', text, re.IGNORECASE)
    
    if not amounts:
        logger.warning("⚠️ Не удалось выделить сумму из текста уведомления.")
        return

    # Очищаем сумму от лишних символов
    raw_amount = amounts[0].replace(" ", "").replace("\xa0", "")
    
    try:
        incoming_amount = float(raw_amount)
    except ValueError:
        logger.error(f"❌ Не удалось конвертировать сумму в число: {raw_amount}")
        return

    logger.info(f"🧮 Распознанная сумма: {incoming_amount}")

    # Отправка данных в Cloudflare Worker с таймаутом
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
            logger.info("🚀 Уведомление успешно передано в Worker, баланс обновлен!")
        else:
            logger.warning(f"⚠️ Worker отклонил сумму {incoming_amount}: {response.text}")
            
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Ошибка соединения с Cloudflare Worker: {e}")

def main():
    logger.info("🤖 Telethon-юзербот запущен и ожидает уведомления от банков...")
    client.start()
    client.run_until_disconnected()

if __name__ == "__main__":
    main()
