/* =====================================================================
 * TELEGRAM AUTO TOPIC SORTER - VERSI 2 (perbaikan Zero, 2026-11-03)
 *
 * PERUBAHAN DARI VERSI LAMA:
 * 1. Penyebab lambat di versi lama: polling tiap 1 menit. File yang
 *    kamu upload baru diproses saat trigger 1 menit berikutnya jalan,
 *    ditambah jeda penjadwalan Google Apps Script, jadi hapus/pindah
 *    bisa terasa 1-5 menit. Itu bukan salah file-nya, itu batas
 *    polling.
 * 2. V2 menambah MODE WEBHOOK: Telegram langsung mengirim update ke
 *    script begitu file di-upload, jadi salin + hapus asli jalan
 *    dalam hitungan detik, bukan menit.
 * 3. Polling tetap ada sebagai cadangan, TAPI jangan jalan bersamaan
 *    dengan webhook untuk token yang sama. Pilih satu mode saja.
 *    Jalankan switchToWebhook() untuk webhook, atau
 *    switchToPolling() untuk kembali ke polling.
 * 4. PENTING - TOKEN: pakai token bot BARU khusus cloud ini, buat
 *    di BotFather. JANGAN pakai token Fr1day atau token bot jualan,
 *    karena satu token yang dipakai dua bot akan berebut update
 *    (update yang diambil satu bot, dibuang, lalu bot lain tidak
 *    melihatnya).
 * 5. DELETE_ORIGINAL: true = file dipindah (disalin ke topik, lalu
 *    asli di General dihapus). Kalau kamu mau asli tetap di General,
 *    ubah jadi false.
 *
 * CARA PAKAI SINGKAT ada di PETUNJUK.txt yang menyertai file ini.
 * ===================================================================== */
/********************************************************************
 * TELEGRAM AUTO TOPIC SORTER
 * SEMOGA BERMANFAAT GUYS
 * GOOGLE APPS SCRIPT - POLLING VERSION
 *
 * CARA KERJA:
 * Telegram
 *    ↓
 * getUpdates()
 *    ↓
 * Google Apps Script setiap 1 menit
 *    ↓
 * Pesan dari General?
 *    ↓
 * Deteksi IMAGE / VIDEO / AUDIO / DOCUMENT
 *    ↓
 * Copy ke Topic tujuan
 *    ↓
 * Hapus pesan asli dari General
 *
 ********************************************************************/


/********************************************************************
 * 1. KONFIGURASI
 ********************************************************************/

const CONFIG = {

  /*********************
   * TOKEN BOT
   *********************/

  BOT_TOKEN: "ISI DENGAN TOKEN BOT TELEGRAM",


  /*********************
   * CHAT ID GRUP
   *
   * Contoh:
   * -1001234567890
   *********************/

  CHAT_ID: "ISI DENGAN CHAT ID GROUP",


  /*********************
   * GENERAL TOPIC ID
   *
   * Biasanya General = 1.
   *
   * Kalau General Anda memiliki ID berbeda,
   * ganti angka di bawah.
   *********************/

  GENERAL_TOPIC: 1,


  /*********************
   * TOPIC TUJUAN
   *********************/

  TOPICS: {

    IMAGE: 100,

    VIDEO: 200,

    AUDIO: 300,

    DOCUMENT: 400,


  },


  /*********************
   * HAPUS FILE ASLI?
   *
   * true  = hapus dari General
   * false = file tetap di General
   *********************/

  DELETE_ORIGINAL: true,


  /*********************
   * DEBUG LOG
   *********************/

  DEBUG: true,


  /*********************
   * JUMLAH UPDATE
   *
   * Telegram maksimal 100
   *********************/

  UPDATE_LIMIT: 100,

  /*********************
   * URL WEB APP SCRIPT INI
   * Diisi SETELAH deploy Web App.
   * Kosongkan kalau masih pakai polling.
   *********************/

  WEBHOOK_URL: ""

};


/********************************************************************
 * TELEGRAM API URL
 ********************************************************************/

const TELEGRAM_API =
  "https://api.telegram.org/bot" +
  CONFIG.BOT_TOKEN +
  "/";


/********************************************************************
 * 2. FUNGSI UTAMA POLLING
 *
 * Fungsi ini nanti dijalankan otomatis
 * setiap 1 menit oleh Apps Script Trigger.
 ********************************************************************/

function pollTelegram() {

  /*
   * Lock mencegah dua trigger
   * berjalan bersamaan.
   */

  const lock =
    LockService.getScriptLock();


  const locked =
    lock.tryLock(5000);


  if (!locked) {

    debugLog(
      "Polling lain masih berjalan. Skip."
    );

    return;

  }


  try {

    /*********************
     * Ambil offset terakhir
     *********************/

    const properties =
      PropertiesService
        .getScriptProperties();


    let offset =
      Number(
        properties.getProperty(
          "TELEGRAM_OFFSET"
        ) || 0
      );


    debugLog(
      "Current offset: " +
      offset
    );


    /*********************
     * Ambil update Telegram
     *********************/

    const response =
      telegramRequest(
        "getUpdates",
        {

          offset: offset,

          limit:
            CONFIG.UPDATE_LIMIT,

          timeout: 0,

          allowed_updates: [
            "message"
          ]

        }
      );


    if (
      !response ||
      !response.result ||
      response.result.length === 0
    ) {

      debugLog(
        "Tidak ada update baru."
      );

      return;

    }


    debugLog(
      "Update ditemukan: " +
      response.result.length
    );


    /*********************
     * Process satu per satu
     *********************/

    for (
      let i = 0;
      i < response.result.length;
      i++
    ) {

      const update =
        response.result[i];


      try {

        processUpdate(update);

      } catch (error) {

        console.error(
          "PROCESS UPDATE ERROR:",
          error
        );

      }


      /*
       * Update offset.
       *
       * +1 supaya update yang sama
       * tidak dibaca ulang.
       */

      offset =
        update.update_id + 1;


      properties.setProperty(
        "TELEGRAM_OFFSET",
        String(offset)
      );

    }


    debugLog(
      "New offset: " +
      offset
    );


  } catch (error) {

    console.error(
      "pollTelegram ERROR:",
      error
    );

  } finally {

    lock.releaseLock();

  }

}


/********************************************************************
 * 3. PROCESS UPDATE
 ********************************************************************/

function processUpdate(update) {

  if (
    !update ||
    !update.message
  ) {

    return;

  }


  const msg =
    update.message;


  /*********************
   * DEBUG
   *********************/

  debugLog(
    "Message ID: " +
    msg.message_id
  );


  debugLog(
    "Chat ID: " +
    msg.chat.id
  );


  debugLog(
    "Thread ID: " +
    msg.message_thread_id
  );


  /*********************
   * CEK CHAT ID
   *********************/

  if (
    String(msg.chat.id) !==
    String(CONFIG.CHAT_ID)
  ) {

    debugLog(
      "Chat lain diabaikan."
    );

    return;

  }


  /*********************
   * ABAIKAN PESAN BOT
   *********************/

  if (
    msg.from &&
    msg.from.is_bot
  ) {

    debugLog(
      "Pesan dari bot diabaikan."
    );

    return;

  }


  /*********************
   * CEK GENERAL
   *********************/

  if (!isGeneralTopic(msg)) {

    debugLog(
      "Bukan General Topic."
    );

    return;

  }


  /*********************
   * PROCESS FILE
   *********************/

  processMessage(msg);

}


/********************************************************************
 * 4. DETEKSI GENERAL TOPIC
 ********************************************************************/

function isGeneralTopic(msg) {

  /*
   * Kondisi pertama:
   * message_thread_id tidak tersedia.
   *
   * Kita anggap sebagai General.
   */

  if (
    msg.message_thread_id === undefined ||
    msg.message_thread_id === null
  ) {

    return true;

  }


  /*
   * Kondisi kedua:
   * thread ID sama dengan General
   * yang kita konfigurasi.
   */

  if (
    Number(msg.message_thread_id) ===
    Number(CONFIG.GENERAL_TOPIC)
  ) {

    return true;

  }


  return false;

}


/********************************************************************
 * 5. PROCESS MESSAGE
 ********************************************************************/

function processMessage(msg) {

  try {

    /*********************
     * Deteksi file
     *********************/

    const detected =
      detectFileType(msg);


    if (!detected) {

      debugLog(
        "Bukan file/media. Skip."
      );

      return;

    }


    debugLog(
      "File Type: " +
      detected.type
    );


    /*********************
     * Tentukan topik
     *********************/

    const topicId =
      getTopicByType(
        detected.type
      );


    if (!topicId) {

      console.error(
        "Topic ID tidak ditemukan: " +
        detected.type
      );

      return;

    }


    debugLog(
      "Destination Topic: " +
      topicId
    );


    /*********************
     * Copy pesan
     *********************/

    const copyResult =
      copyMessageToTopic(
        msg.message_id,
        topicId
      );


    if (
      !copyResult ||
      !copyResult.ok
    ) {

      throw new Error(
        "Copy message gagal."
      );

    }


    debugLog(
      "✅ COPY SUCCESS"
    );


    /*********************
     * Delete original
     *********************/

    if (
      CONFIG.DELETE_ORIGINAL
    ) {

      const deleteResult =
        deleteTelegramMessage(
          msg.message_id
        );


      if (
        deleteResult &&
        deleteResult.ok
      ) {

        debugLog(
          "✅ ORIGINAL DELETED"
        );

      }

    }


    debugLog(
      "✅ SELESAI | " +
      detected.type +
      " → " +
      topicId
    );


  } catch (error) {

    console.error(
      "processMessage ERROR:",
      error
    );

  }

}


/********************************************************************
 * 6. DETEKSI JENIS FILE
 ********************************************************************/

function detectFileType(msg) {


  /*********************
   * PHOTO
   *********************/

  if (msg.photo) {

    return {
      type: "IMAGE"
    };

  }


  /*********************
   * VIDEO
   *********************/

  if (msg.video) {

    return {
      type: "VIDEO"
    };

  }


  /*********************
   * ANIMATION / GIF
   *********************/

  if (msg.animation) {

    return {
      type: "VIDEO"
    };

  }


  /*********************
   * VIDEO NOTE
   *********************/

  if (msg.video_note) {

    return {
      type: "VIDEO"
    };

  }


  /*********************
   * AUDIO
   *********************/

  if (msg.audio) {

    return {
      type: "AUDIO"
    };

  }


  /*********************
   * VOICE NOTE
   *********************/

  if (msg.voice) {

    return {
      type: "AUDIO"
    };

  }


  /*********************
   * DOCUMENT
   *********************/

  if (msg.document) {

    const fileName =
      msg.document.file_name || "";


    const mimeType =
      msg.document.mime_type || "";


    const extension =
      getFileExtension(
        fileName
      );


    const type =
      detectByExtension(
        extension,
        mimeType
      );


    return {

      type: type,

      fileName: fileName,

      extension: extension,

      mimeType: mimeType

    };

  }


  return null;

}


/********************************************************************
 * 7. GET FILE EXTENSION
 ********************************************************************/

function getFileExtension(fileName) {

  if (!fileName) {

    return "";

  }


  const pieces =
    String(fileName)
      .toLowerCase()
      .split(".");


  if (
    pieces.length < 2
  ) {

    return "";

  }


  return pieces.pop();

}


/********************************************************************
 * 8. DETEKSI EXTENSION
 ********************************************************************/

function detectByExtension(
  extension,
  mimeType
) {

  const ext =
    String(
      extension || ""
    ).toLowerCase();


  const mime =
    String(
      mimeType || ""
    ).toLowerCase();


  /**************************************************************
   * 🖼 IMAGE / GAMBAR
   **************************************************************/

  const IMAGE = [

    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "bmp",
    "tif",
    "tiff",
    "svg",
    "heic",
    "heif",
    "avif",
    "ico",
    "raw",
    "dng"

  ];


  /**************************************************************
   * 🎥 VIDEO
   **************************************************************/

  const VIDEO = [

    "mp4",
    "mkv",
    "avi",
    "mov",
    "wmv",
    "flv",
    "webm",
    "m4v",
    "mpeg",
    "mpg",
    "3gp",
    "3g2",
    "ts",
    "mts",
    "m2ts",
    "vob"

  ];


  /**************************************************************
   * 🎵 AUDIO
   **************************************************************/

  const AUDIO = [

    "mp3",
    "wav",
    "aac",
    "ogg",
    "oga",
    "m4a",
    "flac",
    "wma",
    "opus",
    "aiff",
    "aif",
    "amr",
    "mid",
    "midi"

  ];


  /**************************************************************
   * 📱 APK
   **************************************************************/

  const APK = [

    "apk",
    "xapk",
    "apks",
    "aab",
    "apkm"

  ];


  /**************************************************************
   * 📦 ZIP / ARCHIVE
   **************************************************************/

  const ZIP = [

    "zip",
    "rar",
    "7z",
    "tar",
    "gz",
    "gzip",
    "tgz",
    "bz2",
    "xz",
    "cab",
    "lz",
    "lzma",
    "z",
    "001"

  ];


  /**************************************************************
   * 💿 ISO / DISK IMAGE
   **************************************************************/

  const ISO = [

    "iso",
    "img",
    "bin",
    "cue",
    "nrg",
    "mdf",
    "mds",
    "vhd",
    "vhdx",
    "vmdk",
    "qcow",
    "qcow2"

  ];


  /**************************************************************
   * 💻 SOFTWARE / INSTALLER
   **************************************************************/

  const SOFTWARE = [

    "exe",
    "msi",
    "msix",
    "msixbundle",
    "appx",
    "appxbundle",

    "dmg",
    "pkg",

    "deb",
    "rpm",

    "appimage",

    "jar",

    "bat",
    "cmd",
    "com"

  ];


  /**************************************************************
   * 🔤 FONT
   **************************************************************/

  const FONT = [

    "ttf",
    "otf",
    "woff",
    "woff2",
    "eot",
    "fon"

  ];


  /**************************************************************
   * 🎨 PROJECT
   *
   * File project editing/design/video/audio/3D.
   **************************************************************/

  const PROJECT = [

    // Adobe Photoshop

    "psd",
    "psb",


    // Adobe Illustrator

    "ai",
    "ait",


    // After Effects

    "aep",
    "aet",


    // Premiere Pro

    "prproj",


    // Audition

    "sesx",


    // Lightroom

    "lrcat",


    // DaVinci Resolve

    "drp",


    // Final Cut

    "fcpxml",


    // Blender

    "blend",


    // Cinema 4D

    "c4d",


    // SketchUp

    "skp",


    // AutoCAD

    "dwg",
    "dxf",


    // Figma

    "fig",


    // Sketch

    "sketch",


    // Adobe XD

    "xd",


    // CorelDRAW

    "cdr",


    // FL Studio

    "flp",


    // Ableton

    "als",


    // Unity

    "unitypackage",


    // Unreal Engine

    "uproject"

  ];


  /**************************************************************
   * 📄 DOCUMENT
   **************************************************************/

  const DOCUMENT = [

    "pdf",

    "doc",
    "docx",
    "docm",
    "odt",
    "rtf",

    "xls",
    "xlsx",
    "xlsm",
    "ods",
    "csv",

    "ppt",
    "pptx",
    "pptm",
    "odp",

    "txt",
    "md",
    "log",

    "epub",
    "mobi",
    "azw",
    "azw3",

    "torrent",

    "json",
    "xml",
    "yaml",
    "yml"

  ];


  /**************************************************************
   * DETEKSI BERDASARKAN EXTENSION
   **************************************************************/

  if (
    IMAGE.includes(ext)
  ) {

    return "IMAGE";

  }


  if (
    VIDEO.includes(ext)
  ) {

    return "VIDEO";

  }


  if (
    AUDIO.includes(ext)
  ) {

    return "AUDIO";

  }


  if (
    APK.includes(ext)
  ) {

    return "APK";

  }


  if (
    ZIP.includes(ext)
  ) {

    return "ZIP";

  }


  if (
    ISO.includes(ext)
  ) {

    return "ISO";

  }


  if (
    SOFTWARE.includes(ext)
  ) {

    return "SOFTWARE";

  }


  if (
    FONT.includes(ext)
  ) {

    return "FONT";

  }


  if (
    PROJECT.includes(ext)
  ) {

    return "PROJECT";

  }


  if (
    DOCUMENT.includes(ext)
  ) {

    return "DOCUMENT";

  }


  /**************************************************************
   * FALLBACK MIME TYPE
   **************************************************************/

  if (
    mime.startsWith(
      "image/"
    )
  ) {

    return "IMAGE";

  }


  if (
    mime.startsWith(
      "video/"
    )
  ) {

    return "VIDEO";

  }


  if (
    mime.startsWith(
      "audio/"
    )
  ) {

    return "AUDIO";

  }


  /**************************************************************
   * FILE TIDAK DIKENALI
   *
   * Masukkan ke DOKUMEN.
   **************************************************************/

  return "DOCUMENT";

}


/********************************************************************
 * 9. PILIH TOPIC
 ********************************************************************/

function getTopicByType(type) {

  if (
    CONFIG.TOPICS[type] !== undefined &&
    CONFIG.TOPICS[type] !== null
  ) {

    return CONFIG.TOPICS[type];

  }


  /*
   * Fallback
   */

  return CONFIG.TOPICS.DOCUMENT;

}


/********************************************************************
 * 10. COPY MESSAGE KE TOPIC
 ********************************************************************/

function copyMessageToTopic(
  messageId,
  topicId
) {

  return telegramRequest(
    "copyMessage",
    {

      chat_id:
        CONFIG.CHAT_ID,

      from_chat_id:
        CONFIG.CHAT_ID,

      message_id:
        messageId,

      message_thread_id:
        topicId

    }
  );

}


/********************************************************************
 * 11. DELETE PESAN ASLI
 ********************************************************************/

function deleteTelegramMessage(
  messageId
) {

  return telegramRequest(
    "deleteMessage",
    {

      chat_id:
        CONFIG.CHAT_ID,

      message_id:
        messageId

    }
  );

}


/********************************************************************
 * 12. TELEGRAM API REQUEST
 ********************************************************************/

function telegramRequest(
  method,
  data
) {

  const url =
    TELEGRAM_API +
    method;


  /*
   * Retry maksimal 3 kali.
   */

  const MAX_ATTEMPTS = 3;


  let lastError = null;


  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt++
  ) {

    try {

      const response =
        UrlFetchApp.fetch(
          url,
          {

            method: "post",

            contentType:
              "application/json",

            payload:
              JSON.stringify(
                data || {}
              ),

            muteHttpExceptions:
              true

          }
        );


      const statusCode =
        response.getResponseCode();


      const responseText =
        response.getContentText();


      debugLog(
        method +
        " HTTP " +
        statusCode
      );


      const result =
        JSON.parse(
          responseText
        );


      if (result.ok) {

        return result;

      }


      /*
       * Telegram API error
       */

      lastError =
        new Error(
          result.description ||
          "Telegram API Error"
        );


      console.error(
        "Telegram Error [" +
        method +
        "] attempt " +
        attempt +
        ": " +
        responseText
      );


    } catch (error) {

      lastError =
        error;


      console.error(
        "Request Error [" +
        method +
        "] attempt " +
        attempt +
        ": " +
        error.message
      );

    }


    /*
     * Tunggu sebentar sebelum retry.
     */

    if (
      attempt < MAX_ATTEMPTS
    ) {

      Utilities.sleep(
        1000 * attempt
      );

    }

  }


  throw lastError ||
    new Error(
      "Telegram request gagal."
    );

}


/********************************************************************
 * 13. TEST KONEKSI BOT
 ********************************************************************/

function testConnection() {

  const result =
    telegramRequest(
      "getMe",
      {}
    );


  console.log(
    "✅ BOT CONNECTED"
  );


  console.log(
    "BOT NAME: " +
    result.result.first_name
  );


  console.log(
    "USERNAME: @" +
    result.result.username
  );


  return result;

}


/********************************************************************
 * 14. TEST KIRIM PESAN KE GRUP
 ********************************************************************/

function testSendMessage() {

  return telegramRequest(
    "sendMessage",
    {

      chat_id:
        CONFIG.CHAT_ID,

      text:
        "✅ Telegram Auto Sorter Polling berhasil terhubung."

    }
  );

}


/********************************************************************
 * 15. TEST TOPIC GAMBAR
 ********************************************************************/

function testImageTopic() {

  return telegramRequest(
    "sendMessage",
    {

      chat_id:
        CONFIG.CHAT_ID,

      message_thread_id:
        CONFIG.TOPICS.IMAGE,

      text:
        "🖼 Test Topic GAMBAR berhasil."

    }
  );

}


/********************************************************************
 * 16. TEST TOPIC VIDEO
 ********************************************************************/

function testVideoTopic() {

  return telegramRequest(
    "sendMessage",
    {

      chat_id:
        CONFIG.CHAT_ID,

      message_thread_id:
        CONFIG.TOPICS.VIDEO,

      text:
        "🎥 Test Topic VIDEO berhasil."

    }
  );

}


/********************************************************************
 * 17. TEST TOPIC AUDIO
 ********************************************************************/

function testAudioTopic() {

  return telegramRequest(
    "sendMessage",
    {

      chat_id:
        CONFIG.CHAT_ID,

      message_thread_id:
        CONFIG.TOPICS.AUDIO,

      text:
        "🎵 Test Topic AUDIO berhasil."

    }
  );

}


/********************************************************************
 * 18. TEST TOPIC DOCUMENT
 ********************************************************************/

function testDocumentTopic() {

  return telegramRequest(
    "sendMessage",
    {

      chat_id:
        CONFIG.CHAT_ID,

      message_thread_id:
        CONFIG.TOPICS.DOCUMENT,

      text:
        "📄 Test Topic DOKUMEN berhasil."

    }
  );

}


/********************************************************************
 * 19. HAPUS WEBHOOK
 *
 * WAJIB dijalankan sekali sebelum polling.
 *
 * getUpdates TIDAK BISA digunakan
 * selama webhook masih aktif.
 ********************************************************************/

function removeWebhook() {

  const result =
    telegramRequest(
      "deleteWebhook",
      {

        /*
         * false:
         *
         * Update lama tidak langsung
         * dibuang.
         */

        drop_pending_updates:
          false

      }
    );


  console.log(
    "✅ WEBHOOK DIHAPUS"
  );


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}


/********************************************************************
 * 20. CEK WEBHOOK
 ********************************************************************/

function checkWebhook() {

  const result =
    telegramRequest(
      "getWebhookInfo",
      {}
    );


  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}


/********************************************************************
 * 21. BUAT TRIGGER 1 MENIT
 *
 * Jalankan fungsi ini SATU KALI.
 ********************************************************************/

function setupPollingTrigger() {

  /*
   * Hapus trigger pollTelegram lama
   * agar tidak terjadi duplikat.
   */

  deletePollingTriggers();


  /*
   * Buat trigger baru.
   */

  ScriptApp
    .newTrigger(
      "pollTelegram"
    )
    .timeBased()
    .everyMinutes(1)
    .create();


  console.log(
    "✅ TRIGGER POLLING 1 MENIT BERHASIL DIBUAT"
  );

}


/********************************************************************
 * 22. HAPUS TRIGGER POLLING
 ********************************************************************/

function deletePollingTriggers() {

  const triggers =
    ScriptApp.getProjectTriggers();


  let deleted = 0;


  triggers.forEach(
    function(trigger) {

      if (
        trigger.getHandlerFunction() ===
        "pollTelegram"
      ) {

        ScriptApp.deleteTrigger(
          trigger
        );


        deleted++;

      }

    }
  );


  console.log(
    "Polling trigger dihapus: " +
    deleted
  );

}


/********************************************************************
 * 23. RESET OFFSET
 *
 * Jangan sering menjalankan ini.
 *
 * Gunakan kalau ingin mereset posisi
 * getUpdates.
 ********************************************************************/

function resetOffset() {

  PropertiesService
    .getScriptProperties()
    .deleteProperty(
      "TELEGRAM_OFFSET"
    );


  console.log(
    "✅ OFFSET DI-RESET"
  );

}


/********************************************************************
 * 24. LIHAT OFFSET SEKARANG
 ********************************************************************/

function showOffset() {

  const offset =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        "TELEGRAM_OFFSET"
      );


  console.log(
    "Current Telegram Offset: " +
    (
      offset ||
      "BELUM ADA"
    )
  );

}


/********************************************************************
 * 25. JALANKAN POLLING MANUAL
 *
 * Sama seperti pollTelegram,
 * hanya dibuat supaya mudah dikenali.
 ********************************************************************/

function runNow() {

  pollTelegram();

}


/********************************************************************
 * 26. DEBUG LOGGER
 ********************************************************************/

function debugLog(message) {

  if (
    CONFIG.DEBUG
  ) {

    console.log(
      message
    );

  }

}

/********************************************************************
 * 27. SCAN CHAT ID & TOPIC ID
 *
 * Cara pakai:
 * 1. Kirim pesan teks ke General, misalnya: CEK GENERAL
 * 2. Kirim pesan ke topik Gambar: CEK GAMBAR
 * 3. Kirim pesan ke topik Video: CEK VIDEO
 * 4. Kirim pesan ke topik Audio: CEK AUDIO
 * 5. Kirim pesan ke topik Dokumen: CEK DOKUMEN
 * 6. Jalankan scanTelegramIds()
 *
 * Catatan:
 * Fungsi ini TIDAK mengubah TELEGRAM_OFFSET sorter utama.
 ********************************************************************/

function scanTelegramIds() {

  try {

    const response =
      telegramRequest(
        "getUpdates",
        {
          limit: 100,
          timeout: 0,
          allowed_updates: [
            "message"
          ]
        }
      );


    if (
      !response ||
      !response.result ||
      response.result.length === 0
    ) {

      console.log(
        "❌ Tidak ada update yang tersedia."
      );

      console.log(
        "Coba kirim pesan baru ke General dan masing-masing topik, lalu jalankan lagi."
      );

      return;

    }


    console.log(
      "========== TELEGRAM ID SCANNER =========="
    );


    response.result.forEach(
      function(update) {

        if (
          !update ||
          !update.message
        ) {
          return;
        }


        const msg =
          update.message;


        const chatId =
          msg.chat
            ? msg.chat.id
            : "UNKNOWN";


        const chatTitle =
          msg.chat &&
          msg.chat.title
            ? msg.chat.title
            : "-";


        const threadId =
          (
            msg.message_thread_id !== undefined &&
            msg.message_thread_id !== null
          )
            ? msg.message_thread_id
            : "GENERAL / NO THREAD ID";


        const text =
          msg.text ||
          msg.caption ||
          "(MEDIA / FILE)";


        const sender =
          getSenderNameForScanner(
            msg
          );


        console.log(
          "\n--------------------------------"
        );

        console.log(
          "UPDATE ID : " +
          update.update_id
        );

        console.log(
          "CHAT      : " +
          chatTitle
        );

        console.log(
          "CHAT ID   : " +
          chatId
        );

        console.log(
          "TOPIC ID  : " +
          threadId
        );

        console.log(
          "PENGIRIM  : " +
          sender
        );

        console.log(
          "MESSAGE   : " +
          text
        );

      }
    );


    console.log(
      "\n========================================="
    );


  } catch (error) {

    console.error(
      "scanTelegramIds ERROR:",
      error
    );

  }

}


/********************************************************************
 * 28. HELPER: NAMA PENGIRIM UNTUK SCANNER
 ********************************************************************/

function getSenderNameForScanner(msg) {

  if (
    !msg ||
    !msg.from
  ) {

    return "UNKNOWN";

  }


  let name = "";


  if (
    msg.from.first_name
  ) {

    name +=
      msg.from.first_name;

  }


  if (
    msg.from.last_name
  ) {

    name +=
      " " +
      msg.from.last_name;

  }


  if (
    msg.from.username
  ) {

    name +=
      " (@" +
      msg.from.username +
      ")";

  }


  return (
    name.trim() ||
    String(
      msg.from.id
    )
  );

}


/********************************************************************
 * 29. SCAN RINGKAS CHAT & TOPIC ID
 *
 * Output lebih pendek dan gampang dibaca.
 ********************************************************************/

function scanTelegramIdsSimple() {

  try {

    const response =
      telegramRequest(
        "getUpdates",
        {
          limit: 100,
          timeout: 0,
          allowed_updates: [
            "message"
          ]
        }
      );


    if (
      !response ||
      !response.result ||
      response.result.length === 0
    ) {

      console.log(
        "❌ Tidak ada update."
      );

      return;

    }


    console.log(
      "===== CHAT & TOPIC ID ====="
    );


    response.result.forEach(
      function(update) {

        if (
          !update.message
        ) {
          return;
        }


        const msg =
          update.message;


        const text =
          msg.text ||
          msg.caption ||
          "(FILE)";


        const chatId =
          msg.chat.id;


        const topicId =
          (
            msg.message_thread_id !== undefined &&
            msg.message_thread_id !== null
          )
            ? msg.message_thread_id
            : "GENERAL";


        console.log(
          text +
          " | CHAT ID: " +
          chatId +
          " | TOPIC ID: " +
          topicId
        );

      }
    );


  } catch (error) {

    console.error(
      error
    );

  }

}

/********************************************************************
 * V2 - MODE WEBHOOK (INSTAN)
 * Telegram kirim update langsung ke doPost(), tidak perlu menunggu
 * trigger 1 menit. Fungsi-fungsi lama di atas dipakai ulang:
 * processUpdate() -> processMessage() -> copy + delete.
 ********************************************************************/

/*
 * doPost dipanggil Telegram setiap ada pesan baru, kalau webhook
 * sudah dipasang. Harus return cepat, jadi kerjakan lalu balas OK.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("OK");
    }
    const update = JSON.parse(e.postData.contents);
    processUpdate(update);
  } catch (error) {
    console.error("doPost ERROR:", error.message);
  }
  return ContentService.createTextOutput("OK");
}

/*
 * Jalankan SATU KALI setelah:
 * 1. Deploy > New deployment > Web app, Execute as: Me,
 *    Who has access: Anyone (wajib, supaya server Telegram bisa
 *    memanggil URL ini tanpa login Google).
 * 2. Salin URL Web App ke CONFIG.WEBHOOK_URL di atas, simpan.
 * Fungsi ini: hapus trigger polling, lalu pasang webhook.
 */
function switchToWebhook() {
  if (!CONFIG.WEBHOOK_URL) {
    throw new Error("Isi dulu CONFIG.WEBHOOK_URL dengan URL Web App, lalu simpan dan jalankan lagi.");
  }
  deletePollingTriggers();
  const result = telegramRequest("setWebhook", {
    url: CONFIG.WEBHOOK_URL,
    allowed_updates: ["message"],
    drop_pending_updates: true
  });
  console.log("WEBHOOK DIPASANG. Cek dengan checkWebhook().");
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/*
 * Kembali ke polling: hapus webhook, lalu buat trigger 1 menit.
 * Dipakai hanya kalau kamu tidak mau pakai webhook lagi.
 * Ingat: polling = lambat (1 menit + jeda Google), itu batasnya.
 */
function switchToPolling() {
  removeWebhook();
  resetOffset();
  setupPollingTrigger();
  console.log("KEMBALI KE POLLING 1 MENIT.");
}

/*
 * Cek cepat: webhook aktif atau tidak, dan ada antrean update
 * yang tertahan atau tidak. Jalankan ini kalau file tidak pindah.
 */
function cekStatusWebhook() {
  const info = checkWebhook();
  console.log("URL webhook: " + (info.result && info.result.url ? info.result.url : "(tidak ada)"));
  console.log("Update tertahan: " + (info.result ? info.result.pending_update_count : "?"));
  return info;
}
