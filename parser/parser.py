# parser.py — слушаем только public.channels (is_enabled=true), с нормализацией id и безопасной перерегистрацией
import asyncio
import os
import logging
from datetime import datetime, timezone
import re
import httpx
from telethon import TelegramClient, events
from telethon.errors.rpcerrorlist import UsernameNotOccupiedError, ChannelInvalidError

API_ID = os.environ.get('API_ID')
API_HASH = os.environ.get('API_HASH')
SESSION_NAME = os.environ.get('SESSION_NAME')

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY')
SUPABASE_FUNCTION_URL = os.environ.get('SUPABASE_FUNCTION_URL')

logging.basicConfig(level=logging.INFO, format='%(asctime)s  %(levelname)s  %(message)s')
log = logging.getLogger("oshu_bot_work")

client = TelegramClient(SESSION_NAME, int(API_ID), API_HASH)

# ===== helpers =====
def normalize_channel_id(raw: str) -> str:
    """@name / name / https://t.me/name -> @name"""
    if not raw:
        return ""
    s = str(raw).strip()
    if "t.me/" in s:
        s = s.split("t.me/")[1].split("/")[0]
    if not s.startswith("@"):
        s = "@" + s.lstrip("@")
    return s

# простенький кеш валидности на время жизни процесса
_valid_cache: dict[str, bool] = {}

async def http_get_json(url: str) -> list:
    headers = {"apikey": SUPABASE_ANON_KEY}
    async with httpx.AsyncClient() as c:
        r = await c.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        return r.json()

# ===== keywords =====
current_keywords: list[str] = []
keyword_rx = None

def rebuild_keyword_rx():
    global keyword_rx
    pattern = "|".join(re.escape(k) for k in current_keywords)
    keyword_rx = re.compile(pattern, re.IGNORECASE) if pattern else None

async def fetch_keywords() -> list[str]:
    url = f"{SUPABASE_URL}/rest/v1/settings?select=keywords"
    data = await http_get_json(url)
    if not data:
        return []
    kws = (data[0].get("keywords") or "")
    return [w.strip().lower() for w in kws.split(",") if w.strip()]

# ===== channels =====
async def fetch_enabled_channels() -> list[str]:
    # фильтруем сразу на стороне БД
    url = f"{SUPABASE_URL}/rest/v1/channels?select=channel_id&is_enabled=eq.true"
    data = await http_get_json(url)
    raw = [d.get("channel_id", "") for d in data]
    # нормализуем и убираем дубликаты
    norm = [normalize_channel_id(x) for x in raw if x]
    seen = set()
    uniq = []
    for x in norm:
        if x not in seen:
            seen.add(x)
            uniq.append(x)
    return uniq

async def validate_channels(chs: list[str]) -> list[str]:
    """Проверяем, что канал существует. Ошибочные пропускаем."""
    if not chs:
        return []
    ok: list[str] = []
    for ch in chs:
        if ch in _valid_cache:
            if _valid_cache[ch]:
                ok.append(ch)
            continue
        try:
            await client.get_input_entity(ch)  # ошибка => канала нет
            _valid_cache[ch] = True
            ok.append(ch)
        except (ValueError, UsernameNotOccupiedError, ChannelInvalidError):
            _valid_cache[ch] = False
            log.warning(f"Channel not found/invalid: {ch} — skipped")
        except Exception as e:
            log.error(f"Check channel error [{ch}]: {e}")
    return ok

# ===== handler =====
async def on_new_message(event):
    if not keyword_rx:
        return
    text = event.message.text or ""
    if not text:
        return
    m = keyword_rx.search(text)
    if not m:
        return

    found = m.group(0)
    try:
        chat = await event.get_chat()
        title = getattr(chat, "title", "Unknown Channel")
        uname = getattr(chat, "username", None)
        msg_link = f"https://t.me/{uname}/{event.message.id}" if uname else ""
        has_img = bool(event.message.photo)

        payload = {
            "text": text,
            "channel": title,
            "keyword": found,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message_link": msg_link,
            "has_image": has_img,
        }

        async with httpx.AsyncClient() as c:
            r = await c.post(SUPABASE_FUNCTION_URL, json=payload, timeout=30)
            r.raise_for_status()
        log.info(f"Keyword '{found}' → sent to Brain OK: {r.status_code}")
    except Exception as e:
        log.error(f"Process message error: {e}")

# ===== periodic updater =====
_current_bound = []  # для логов/сравнения

async def refresh_configuration_loop():
    global current_keywords, _current_bound
    while True:
        try:
            # 1) keywords
            current_keywords = await fetch_keywords()
            rebuild_keyword_rx()
            log.info(f"Keywords updated: {len(current_keywords)}")

            # 2) channels
            wanted = await fetch_enabled_channels()
            valid = await validate_channels(wanted)

            # если набор изменился — перевешиваем обработчик
            if set(valid) != set(_current_bound):
                try:
                    client.remove_event_handler(on_new_message)
                except Exception:
                    pass
                if valid:
                    client.add_event_handler(on_new_message, events.NewMessage(chats=valid))
                    _current_bound = valid
                    log.info(f"Whitelist loaded ({len(valid)}): {', '.join(valid)}")
                else:
                    _current_bound = []
                    log.warning("No active (valid) channels. Handler idle.")
            else:
                log.info(f"Channels unchanged: {len(valid)} listening.")
        except Exception as e:
            log.error(f"Refresh config failed: {e}")

        await asyncio.sleep(600)  # 10 мин

# ===== entry =====
async def main():
    log.info("Starting parser…")
    await client.connect()
    if not await client.is_user_authorized():
        log.fatal("Not authorized. Create/renew Telegram session.")
        return

    # пустой хэндлер; real chats навесит рефрешер
    client.add_event_handler(on_new_message, events.NewMessage(chats=[]))
    asyncio.create_task(refresh_configuration_loop())
    await client.run_until_disconnected()

if __name__ == "__main__":
    need = [API_ID, API_HASH, SESSION_NAME, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_FUNCTION_URL]
    if not all(need):
        log.fatal("Missing env vars. Exiting.")
    else:
        with client:
            client.loop.run_until_complete(main())
