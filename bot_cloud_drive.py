#!/usr/bin/env python3
"""
Telegram Auto Topic Sorter - versi Python (ringan, tanpa library luar).

Cara kerja, sama seperti versi Google Apps Script:
  file di-upload ke topik General
  -> dikenali jenisnya (gambar / video / audio / dokumen)
  -> disalin ke topik tujuan
  -> pesan asli di General dihapus (kalau DELETE_ORIGINAL=true)

Bedanya dengan versi Apps Script: bot ini polling langsung ke
Telegram dengan long polling (timeout 30 detik), jadi salin + hapus
jalan dalam hitungan detik, bukan menunggu trigger 1 menit.

Keamanan token (PENTING):
  - Token TIDAK ditulis di kode ini.
  - Token dibaca dari environment variable BOT_TOKEN, atau dari
    file .env di folder yang sama (lihat .env.example).
  - File .env TIDAK BOLEH di-upload ke GitHub. Sudah ada di
    .gitignore. Kalau token pernah ter-upload ke GitHub, cabut
    token itu lewat @BotFather (/revoke) dan buat token baru.
  - Pakai token bot BARU khusus cloud ini. Jangan pakai token
    bot lain (misalnya Fr1day atau bot jualan), karena satu token
    yang dipakai dua bot akan berebut update.

Menjalankan:
  1. Salin .env.example menjadi .env, isi dengan bot baru, ID grup,
     dan ID topik asli (bukan angka contoh).
  2. python3 bot_cloud_drive.py
  Atau dengan Docker: docker compose up -d --build
  (lihat Dockerfile dan docker-compose.yml)

Hanya memakai standard library Python, jadi tidak perlu pip install.
"""

import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("cloud-drive")


def load_dotenv(path=".env"):
    """Baca file .env sederhana (KEY=value) ke environment, tanpa
    menimpa variable yang sudah ada. Abaikan baris kosong dan #."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


load_dotenv()

BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
CHAT_ID = os.environ.get("CHAT_ID", "")
GENERAL_TOPIC = int(os.environ.get("GENERAL_TOPIC", "1") or 1)
DELETE_ORIGINAL = os.environ.get("DELETE_ORIGINAL", "true").lower() == "true"

TOPICS = {
    "IMAGE": int(os.environ.get("TOPIC_IMAGE", "0") or 0),
    "VIDEO": int(os.environ.get("TOPIC_VIDEO", "0") or 0),
    "AUDIO": int(os.environ.get("TOPIC_AUDIO", "0") or 0),
    "DOCUMENT": int(os.environ.get("TOPIC_DOCUMENT", "0") or 0),
}

IMAGE_EXT = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff",
             "svg", "heic", "heif", "avif", "ico", "raw", "dng"}
VIDEO_EXT = {"mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v",
             "mpeg", "mpg", "3gp", "3g2", "ts", "mts", "m2ts", "vob"}
AUDIO_EXT = {"mp3", "wav", "aac", "ogg", "oga", "m4a", "flac", "wma",
             "opus", "aiff", "aif", "amr", "mid", "midi"}


def detect_type(msg):
    """Kembalikan IMAGE / VIDEO / AUDIO / DOCUMENT, atau None kalau
    bukan file/media. Logikanya sama dengan versi Apps Script."""
    if msg.get("photo"):
        return "IMAGE"
    if msg.get("video") or msg.get("animation") or msg.get("video_note"):
        return "VIDEO"
    if msg.get("audio") or msg.get("voice"):
        return "AUDIO"
    doc = msg.get("document")
    if doc:
        name = (doc.get("file_name") or "").lower()
        mime = (doc.get("mime_type") or "").lower()
        ext = name.rsplit(".", 1)[-1] if "." in name else ""
        if ext in IMAGE_EXT or mime.startswith("image/"):
            return "IMAGE"
        if ext in VIDEO_EXT or mime.startswith("video/"):
            return "VIDEO"
        if ext in AUDIO_EXT or mime.startswith("audio/"):
            return "AUDIO"
        return "DOCUMENT"
    return None


def is_general_topic(msg):
    """General = tidak ada message_thread_id, atau sama dengan
    GENERAL_TOPIC yang dikonfigurasi."""
    thread = msg.get("message_thread_id")
    return thread is None or int(thread) == GENERAL_TOPIC


def topic_for(file_type):
    """Topik tujuan, fallback ke DOCUMENT kalau jenisnya tidak
    punya topik sendiri (sama seperti versi Apps Script)."""
    topic = TOPICS.get(file_type) or 0
    return topic if topic else TOPICS["DOCUMENT"]


class Telegram:
    def __init__(self, token):
        self.base = "https://api.telegram.org/bot" + token + "/"

    def call(self, method, data):
        req = urllib.request.Request(
            self.base + method,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        if not result.get("ok"):
            raise RuntimeError(f"{method} gagal: {result}")
        return result["result"]

    def get_updates(self, offset):
        return self.call("getUpdates", {
            "offset": offset, "limit": 100, "timeout": 30,
            "allowed_updates": ["message"],
        })

    def copy_to_topic(self, message_id, topic_id):
        return self.call("copyMessage", {
            "chat_id": CHAT_ID, "from_chat_id": CHAT_ID,
            "message_id": message_id, "message_thread_id": topic_id,
        })

    def delete(self, message_id):
        return self.call("deleteMessage", {
            "chat_id": CHAT_ID, "message_id": message_id,
        })


def process_update(api, update):
    """Proses satu update. Kembalikan True kalau update ini file
    yang berhasil dipindah, False kalau diabaikan."""
    msg = update.get("message") or {}
    if not msg:
        return False
    if str(msg.get("chat", {}).get("id")) != str(CHAT_ID):
        return False  # chat lain diabaikan
    if (msg.get("from") or {}).get("is_bot"):
        return False  # pesan dari bot diabaikan
    if not is_general_topic(msg):
        return False  # bukan General, sudah di topik lain
    file_type = detect_type(msg)
    if not file_type:
        return False  # bukan file/media
    topic = topic_for(file_type)
    if not topic:
        log.error("Topik tujuan %s belum diisi di .env", file_type)
        return False
    api.copy_to_topic(msg["message_id"], topic)
    log.info("%s -> topik %s (pesan %s)", file_type, topic, msg["message_id"])
    if DELETE_ORIGINAL:
        api.delete(msg["message_id"])
        log.info("Pesan asli %s dihapus dari General", msg["message_id"])
    return True


def main():
    if not BOT_TOKEN or not CHAT_ID or not TOPICS["DOCUMENT"]:
        print("Config belum lengkap. Salin .env.example menjadi .env "
              "dan isi BOT_TOKEN, CHAT_ID, dan ID topik. "
              "Jangan pernah isi token asli di file yang di-upload "
              "ke GitHub.", file=sys.stderr)
        return 2
    api = Telegram(BOT_TOKEN)
    me = api.call("getMe", {})
    log.info("Bot jalan sebagai @%s, memantau grup %s",
             me.get("username"), CHAT_ID)
    offset = 0
    while True:
        try:
            for update in api.get_updates(offset):
                try:
                    process_update(api, update)
                except Exception as exc:  # satu file gagal, lanjut ke berikut
                    log.error("Gagal memproses update %s: %s",
                              update.get("update_id"), exc)
                offset = update["update_id"] + 1
        except urllib.error.URLError as exc:
            log.warning("Jaringan bermasalah, coba lagi 5 detik: %s", exc)
            time.sleep(5)
        except Exception as exc:
            log.error("Loop error: %s", exc)
            time.sleep(5)


if __name__ == "__main__":
    raise SystemExit(main())
