import os
import re
from telethon import TelegramClient, events
import requests

API_ID = int(os.getenv("API_ID", "0"))
API_HASH = os.getenv("API_HASH", "")
WORKER_WEBHOOK_URL = os.getenv("WORKER_WEBHOOK_URL", "https://arslan-boost.zenin7210.workers.dev/api/webhook/payment")

client = TelegramClient("session_name", API_ID, API_HASH)

@client.on(events.NewMessage)
async def handle_bank_notification(event):
    text = event.message.text or ""

    if any(keyword in text.lower() for keyword in ["поступление", "зачислено", "uzcard", "humo"]):
        print(f"📥 Новое уведомление: {text}")
        amounts = re.findall(r'([\d\s]+)\s*(?:сум|so\'m|UZS)', text, re.IGNORECASE)

        if amounts:
            raw_amount = amounts[0].replace(" ", "").replace("\xa0", "")
            try:
                incoming_amount = float(raw_amount)
            except ValueError:
                return

            print(f"🧮 Распознанная сумма: {incoming_amount}")

            try:
                response = requests.post(WORKER_WEBHOOK_URL, json={
                    "amount": incoming_amount,
                    "raw_text": text
                })
                if response.status_code == 200:
                    print("🚀 Уведомление передано в Worker, баланс обновлен!")
                else:
                    print(f"⚠️ Worker отклонил сумму {incoming_amount}: {response.text}")
            except Exception as e:
                print(f"❌ Ошибка отправки в Worker: {e}")

print("🤖 Telethon-юзербот запущен...")
client.start()
client.run_until_disconnected()
