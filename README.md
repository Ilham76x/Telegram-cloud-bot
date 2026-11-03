# Telegram Auto Topic Sorter

Bot ringan untuk menyimpan dan mengatur file yang di-upload ke
Telegram: file di topik General dikenali jenisnya, disalin ke
topik tujuan, lalu pesan asli di General dihapus (jadi file
"pindah", bukan duplikat).

- Gambar -> topik IMAGE
- Video / GIF / video note -> topik VIDEO
- Audio / voice note -> topik AUDIO
- Dokumen lain -> topik DOCUMENT

Bot ini polling dengan long polling, jadi salin + hapus jalan
dalam hitungan detik. Tidak mengunduh file: penyalinan dikerjakan
server Telegram sendiri, jadi RAM, CPU, dan bandwidth sangat kecil.
Hanya memakai standard library Python, tidak perlu `pip install`.

## Penting: GitHub itu tempat simpan, bukan tempat jalan

Kode yang di-upload ke GitHub **tidak jalan sendiri**. GitHub hanya
menyimpan project ini supaya kalau nanti dibutuhkan, tinggal
di-clone dan dijalankan di tempat lain: VPS, atau Google Apps
Script (lihat folder `apps-script/` untuk versi Apps Script-nya).
GitHub Actions tidak cocok untuk bot yang harus jalan 24 jam,
karena Actions dibatasi waktu per job dan bukan server yang
terus hidup.

## Keamanan token: pakai .env, jangan pernah hardcode

**Ya, pakai `.env`.** Token dibaca dari environment variable
`BOT_TOKEN`, atau dari file `.env` di folder yang sama.

1. Salin `.env.example` menjadi `.env`.
2. Isi `.env` dengan token bot **baru** khusus cloud ini (dari
   @BotFather), ID grup, dan ID topik asli.
3. **Jangan pernah upload `.env` ke GitHub.** File `.env` sudah
   ada di `.gitignore` di project ini.
4. Yang di-upload ke GitHub hanya `.env.example` (berisi contoh),
   kode, dan README ini.
5. Kalau token pernah ter-upload ke GitHub, walaupun repo privat
   dan walaupun file-nya sudah dihapus, **cabut token itu lewat
   @BotFather (`/revoke`) dan buat token baru**, karena riwayat
   Git tetap menyimpan token lama.

Jangan pakai token bot lain (misalnya Fr1day atau bot jualan) di
bot ini. Satu token yang dipakai dua bot akan berebut update.

## Menjalankan di VPS (Docker, direkomendasikan)

```bash
cp .env.example .env
# isi .env dengan token dan ID asli, lalu:
docker compose up -d --build
docker compose logs -f bot-cloud-drive
```

Tanpa Docker:

```bash
cp .env.example .env
# isi .env, lalu:
python3 bot_cloud_drive.py
```

## Menjalankan di Google Apps Script

Pakai file di folder `apps-script/` (versi 2, mode webhook).
Token di Apps Script jangan ditulis di kode yang di-upload ke
GitHub; isi token langsung di project Apps Script milikmu saja.
Batas Google Apps Script ada di bawah.

## Batas waktu di Google Apps Script

Tidak ada tanggal kedaluwarsa untuk project atau deployment-nya:
selama akun Google aktif dan deployment tidak dihapus, script
tetap ada. Yang ada adalah **kuota harian**, bukan batas aktif:

- Satu eksekusi maksimal **6 menit** (akun gratis maupun Workspace).
- Total runtime semua trigger: **90 menit/hari** untuk akun gratis
  (gmail.com), **6 jam/hari** untuk Workspace. Kuota ini dipakai
  bersama semua project di akun yang sama, dan reset 24 jam
  setelah request pertama.
- URL Fetch: **20.000 panggilan/hari** untuk akun gratis,
  100.000/hari untuk Workspace.
- Maksimal 20 trigger per script.

Untuk bot ini, satu proses file hanya butuh beberapa detik, jadi
masih jauh dari batas. Yang perlu diperhatikan: mode polling
tiap 1 menit memakai kuota trigger terus-menerus, sedangkan mode
webhook hanya jalan saat ada file masuk, jadi jauh lebih hemat
kuota. Kalau kuota habis, trigger berhenti sampai reset keesokan
harinya, dan file baru tidak diproses sampai saat itu.

Sumber kuota: halaman resmi Google, "Quotas for Google Services"
(Apps Script).
