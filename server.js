const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
// Load environment variables if .env exists
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
    }
} catch (e) {
    console.warn('No se pudo cargar .env:', e.message);
}
const url = require('url');
const crypto = require('crypto');
const querystring = require('querystring');
const DAY_MS = 1000 * 60 * 60 * 24;

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const adminAssets = new Set(['/admin.html', '/admin.js', '/admin-styles.css']);
const collaboratorAssets = new Set(['/colaborador.html', '/colaborador.js']);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const CLOUDINARY_ENV = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET
};
const ESTADOS_TURNO = [
    'pendiente',
    'confirmado',
    'en_camino',
    'en_servicio',
    'no_show',
    'finalizado',
    'cancelado',
    // Compatibilidad con estados legacy
    'en_progreso',
    'completado'
];
const ESTADOS_TURNO_ALIAS = {
    en_progreso: 'en_servicio',
    completado: 'finalizado'
};
const ESTADOS_GIFTCARD = ['pendiente', 'pagada', 'entregada', 'cancelado'];
const MAX_BODY_BYTES = Math.max(1024, parseInt(process.env.MAX_BODY_BYTES || '', 10) || (8 * 1024 * 1024));
const STATIC_ASSET_MAX_AGE_SECONDS = Math.max(60, parseInt(process.env.STATIC_ASSET_MAX_AGE_SECONDS || '', 10) || 3600);
const CORS_ALLOWED_ORIGINS = new Set(
    String(process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)
);
const rateLimitState = new Map();
let rateLimitSweepCounter = 0;

if (!process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET no configurado. Usa una variable de entorno para sesiones seguras.');
}

// Archivos JSON
const usuariosPath = path.join(__dirname, 'usuarios.json');
const serviciosPath = path.join(__dirname, 'servicios.json');
const turnosPath = path.join(__dirname, 'turnos.json');
const lookbookPath = path.join(__dirname, 'lookbook.json');
const giftcardsPath = path.join(__dirname, 'giftcards.json');
const bannersPath = path.join(__dirname, 'banners.json');
const sorteosPath = path.join(__dirname, 'sorteos.json');
const configPath = path.join(__dirname, 'config.json');
const defaultConfig = {
    horarioApertura: '09:00',
    horarioCierre: '19:00',
    intervaloTurnos: 30,
    horariosPorDia: {
        lunVie: { activo: true, apertura: '09:00', cierre: '19:00' },
        sab: { activo: true, apertura: '09:00', cierre: '19:00' },
        dom: { activo: false, apertura: '09:00', cierre: '19:00' }
    },
    bloqueosAgenda: [],
    whatsappTemplates: {
        confirmacion: 'Hola {nombre}, confirmamos tu turno de {servicios} el {fecha} a las {hora}.',
        recordatorio: 'Hola {nombre}, te recordamos tu turno de {servicios} el {fecha} a las {hora}.',
        reprogramacion: 'Hola {nombre}, necesitamos reprogramar tu turno de {servicios} del {fecha} a las {hora}.'
    },
    metasColaborador: {
        semanalComision: 0,
        mensualComision: 0
    },
    whatsappNumber: '595981234567',
    pendientesAlerta: 10,
    giftcardVencimientoDias: 365,
    ciudad: 'Asunción, Paraguay',
    direccion: 'Dirección a confirmar',
    mapEmbedUrl: 'https://www.openstreetmap.org/export/embed.html?bbox=-57.674%2C-25.314%2C-57.510%2C-25.252&layer=mapnik&marker=-25.283%2C-57.594',
    mapUrl: 'https://www.openstreetmap.org/?mlat=-25.283&mlon=-57.594#map=13/-25.283/-57.594',
    instagramUrl: 'https://instagram.com/',
    facebookUrl: 'https://facebook.com/',
    tiktokUrl: 'https://tiktok.com/',
    heroMosaic: [
        { titulo: 'Promo destacada', descripcion: 'Descubre nuestras promociones de temporada.', imagen: '', imagenes: [], url: '', activo: false },
        { titulo: 'Novedades', descripcion: 'Nuevos servicios y combinaciones para ti.', imagen: '', imagenes: [], url: '', activo: false },
        { titulo: 'Reserva express', descripcion: 'Agenda en minutos y confirma por WhatsApp.', imagen: '', imagenes: [], url: '', activo: false }
    ],
    giftcardMontos: [100000, 200000, 300000],
    giftcardMensaje: 'Regalá una experiencia Ali Reyes con pago por transferencia.',
    bankInfo: {
        banco: 'Banco a definir',
        titular: 'Ali Reyes',
        cuenta: '0000-0000-0000',
        alias: 'ALI.REYES',
        qrUrl: ''
    }
};

// ==========================
// INICIALIZAR
// ==========================
if (!fs.existsSync(usuariosPath)) {
    const usuarioDefault = {
        id: '1',
        username: 'admin',
        password: hashPassword('admin123'),
        nombre: 'Administrador',
        rol: 'admin',
        activo: true,
        creado: new Date().toISOString()
    };
    fs.writeFileSync(usuariosPath, JSON.stringify([usuarioDefault], null, 2));
}

if (!fs.existsSync(serviciosPath)) {
    fs.writeFileSync(serviciosPath, '[]');
}

if (!fs.existsSync(turnosPath)) {
    fs.writeFileSync(turnosPath, '[]');
}

if (!fs.existsSync(lookbookPath)) {
    fs.writeFileSync(lookbookPath, '[]');
}

if (!fs.existsSync(giftcardsPath)) {
    fs.writeFileSync(giftcardsPath, '[]');
}

if (!fs.existsSync(bannersPath)) {
    fs.writeFileSync(bannersPath, '[]');
}

if (!fs.existsSync(sorteosPath)) {
    fs.writeFileSync(sorteosPath, '[]');
}

if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
}


const backupsDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir);
}


function limpiarBackups(maxFiles = 30) {
    try {
        const files = fs.readdirSync(backupsDir)
            .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
            .map(f => ({
                name: f,
                time: fs.statSync(path.join(backupsDir, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        const toDelete = files.slice(maxFiles);
        toDelete.forEach(f => {
            fs.unlinkSync(path.join(backupsDir, f.name));
        });
    } catch (e) {
        console.error('Error limpiando backups:', e.message);
    }
}

function generarBackup() {
    const payload = {
        servicios: readJSON(serviciosPath, []),
        turnos: readJSON(turnosPath, []),
        lookbook: readJSON(lookbookPath, []),
        giftcards: readJSON(giftcardsPath, []),
        usuarios: readJSON(usuariosPath, []),
        banners: readJSON(bannersPath, []),
        sorteos: readJSON(sorteosPath, []),
        config: readJSON(configPath, defaultConfig),
        exportado: new Date().toISOString()
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(backupsDir, `backup-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    limpiarBackups();
}

generarBackup();

setInterval(() => {
    try {
        generarBackup();
    } catch (e) {
        console.error('Error generando backup:', e.message);
    }
}, 1000 * 60 * 60 * 6);

// ==========================
// HELPERS
// ==========================
function readJSON(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        if (error && error.code !== 'ENOENT') {
            console.warn(`No se pudo leer ${path.basename(filePath)}: ${error.message}`);
        }
        if (fallback && typeof fallback === 'object') {
            return JSON.parse(JSON.stringify(fallback));
        }
        return fallback;
    }
}

function writeJSON(filePath, data) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const payload = JSON.stringify(data, null, 2);
    try {
        fs.writeFileSync(tmpPath, payload, 'utf8');
        fs.renameSync(tmpPath, filePath);
    } catch (error) {
        console.warn(`Escritura atómica falló para ${path.basename(filePath)}: ${error.message}. Reintentando escritura directa.`);
        fs.writeFileSync(filePath, payload, 'utf8');
        try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
            // ignore cleanup errors
        }
    }
}

function base64UrlEncode(value) {
    return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(value.length + (4 - (value.length % 4 || 4)), '=');
    return Buffer.from(padded, 'base64').toString('utf8');
}

function safeCompare(a, b) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function signSession(payload) {
    const body = base64UrlEncode(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64');
    const sigUrl = signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return `${body}.${sigUrl}`;
}

function verifySession(token) {
    if (!token || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64');
    const expectedUrl = expected.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    if (!safeCompare(sig, expectedUrl)) return null;
    try {
        const payload = JSON.parse(base64UrlDecode(body));
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

function parseCookies(header = '') {
    return header.split(';').reduce((acc, part) => {
        const [key, ...rest] = part.trim().split('=');
        if (!key) return acc;
        acc[key] = rest.join('=');
        return acc;
    }, {});
}

function buildSessionCookie(token, req, maxAge = 86400) {
    const secure = req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https';
    const secureFlag = secure ? '; Secure' : '';
    return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const iterations = 120000;
    const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
    return `pbkdf2$${iterations}$${salt}$${hash}`;
}

function isPbkdf2Hash(value) {
    return typeof value === 'string' && value.startsWith('pbkdf2$');
}

function isSha256Hash(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function verifyPassword(password, stored) {
    if (!stored) return false;
    if (isPbkdf2Hash(stored)) {
        const parts = stored.split('$');
        if (parts.length !== 4) return false;
        const iterations = parseInt(parts[1], 10);
        const salt = parts[2];
        const hash = parts[3];
        const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
        return safeCompare(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
    }
    if (isSha256Hash(stored)) {
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        return safeCompare(Buffer.from(hash, 'hex'), Buffer.from(stored, 'hex'));
    }
    return password === stored;
}

function needsPasswordUpgrade(stored) {
    return stored && !isPbkdf2Hash(stored);
}

function sanitizeText(value, maxLength = 200) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/[<>]/g, '').trim().slice(0, maxLength);
}

function sanitizeNumber(value, fallback, { min = null, max = null } = {}) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    if (min !== null && parsed < min) return fallback;
    if (max !== null && parsed > max) return fallback;
    return parsed;
}

function sanitizeDigits(value, maxLength = 20) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/\D/g, '').slice(0, maxLength);
}

function sanitizeTime(value) {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    if (!/^\d{2}:\d{2}$/.test(str)) return null;
    const [h, m] = str.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return str;
}

function sanitizeDate(value) {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    const date = new Date(`${str}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return str;
}

function sanitizeIsoDateTime(value) {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function normalizarEstadoGiftcard(estado) {
    const val = (estado || '').toLowerCase();
    if (ESTADOS_GIFTCARD.includes(val)) return val;
    if (val === 'solicitado' || val === 'procesando') return 'pendiente';
    return 'pendiente';
}

function normalizarEstadoTurno(estado, fallback = 'pendiente') {
    const raw = sanitizeText(estado, 30).toLowerCase();
    if (!raw) return fallback;
    if (ESTADOS_TURNO.includes(raw)) {
        return ESTADOS_TURNO_ALIAS[raw] || raw;
    }
    return fallback;
}

function codigoGiftcardPrincipal(giftcard) {
    if (!giftcard) return '';
    const codigo = giftcard.codigo ? String(giftcard.codigo).trim() : '';
    if (codigo) return codigo;
    if (giftcard.id) {
        const base = String(giftcard.id).trim();
        if (base) return base.slice(-8).toUpperCase();
    }
    return '';
}

function matchGiftcardByCode(giftcards = [], code = '') {
    const target = String(code || '').trim().toUpperCase();
    if (!target) return null;
    return giftcards.find(g => {
        const codes = [];
        if (g.codigo) codes.push(String(g.codigo).trim().toUpperCase());
        if (g.id) {
            const idStr = String(g.id).trim().toUpperCase();
            codes.push(idStr);
            if (idStr.length > 6) codes.push(idStr.slice(-6));
            if (idStr.length > 8) codes.push(idStr.slice(-8));
        }
        return codes.some(c => c && c === target);
    }) || null;
}

function obtenerDiasVencimiento(config) {
    const diasConfig = sanitizeNumber(
        config?.giftcardVencimientoDias ?? config?.giftcardValidezDias,
        defaultConfig.giftcardVencimientoDias,
        { min: 1, max: 3650 }
    );
    return diasConfig || defaultConfig.giftcardVencimientoDias;
}

function calcularFechaVencimiento(gift, config) {
    const cfg = config || readConfig();
    if (gift?.fechaVencimiento) {
        const d = new Date(gift.fechaVencimiento);
        if (!Number.isNaN(d.getTime())) return d;
    }
    const baseStr = gift?.creado || gift?.fechaPago || gift?.fechaEntrega;
    const base = baseStr ? new Date(baseStr) : new Date();
    if (Number.isNaN(base.getTime())) return null;
    const dias = obtenerDiasVencimiento(cfg);
    return new Date(base.getTime() + dias * DAY_MS);
}

function giftcardExpirada(gift, config) {
    const venc = calcularFechaVencimiento(gift, config);
    if (!venc) return false;
    return Date.now() > venc.getTime();
}

function sanitizeUrl(value) {
    if (value === undefined || value === null) return '';
    const str = String(value).trim();
    if (!str) return '';
    try {
        const parsed = new URL(str, 'http://localhost');
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return str;
    } catch {
        return null;
    }
    return null;
}

function isCloudinaryUrl(value) {
    return typeof value === 'string' && value.includes('res.cloudinary.com');
}

async function resolveImageUrl({ imageData, imageUrl }) {
    if (imageData) {
        const upload = await uploadToCloudinary(imageData);
        return upload.secure_url;
    }
    const safeUrl = sanitizeUrl(imageUrl);
    if (!safeUrl) return '';
    return safeUrl;
}

async function resolveImageList(items = [], limit = 8) {
    const result = [];
    for (const item of items) {
        if (result.length >= limit) break;
        if (!item) continue;
        const value = String(item).trim();
        if (!value) continue;
        let url = '';
        if (value.startsWith('data:image')) {
            url = await resolveImageUrl({ imageData: value });
        } else {
            const safeUrl = sanitizeUrl(value);
            if (!safeUrl) continue;
            url = safeUrl;
        }
        if (url && !result.includes(url)) result.push(url);
    }
    return result;
}

function normalizeHeroMosaicConfig(value, fallback = defaultConfig.heroMosaic) {
    const baseList = Array.isArray(fallback) ? fallback : defaultConfig.heroMosaic;
    const sourceList = Array.isArray(value) ? value : [];

    return Array.from({ length: 3 }, (_, index) => {
        const base = baseList[index] && typeof baseList[index] === 'object' ? baseList[index] : {};
        const source = sourceList[index] && typeof sourceList[index] === 'object' ? sourceList[index] : {};

        const titulo = source.titulo !== undefined
            ? sanitizeText(source.titulo, 80)
            : sanitizeText(base.titulo, 80);
        const descripcion = source.descripcion !== undefined
            ? sanitizeText(source.descripcion, 160)
            : sanitizeText(base.descripcion, 160);
        const imagenesRaw = source.imagenes !== undefined ? source.imagenes : base.imagenes;
        const imagenes = Array.isArray(imagenesRaw)
            ? Array.from(new Set(imagenesRaw.map(item => sanitizeUrl(item)).filter(Boolean))).slice(0, 12)
            : [];
        const imagenRaw = source.imagen !== undefined ? source.imagen : base.imagen;
        const urlRaw = source.url !== undefined ? source.url : base.url;
        let imagen = sanitizeUrl(imagenRaw) || '';
        let imagenesFinal = imagenes;
        if (!imagenesFinal.length && imagen) imagenesFinal = [imagen];
        if (!imagen && imagenesFinal.length) imagen = imagenesFinal[0];

        return {
            titulo,
            descripcion,
            imagen,
            imagenes: imagenesFinal,
            url: sanitizeUrl(urlRaw) || '',
            activo: source.activo !== undefined ? source.activo !== false : base.activo !== false
        };
    });
}

function buildHorariosPorDiaDefault(apertura = defaultConfig.horarioApertura, cierre = defaultConfig.horarioCierre) {
    const aperturaSafe = sanitizeTime(apertura) || defaultConfig.horarioApertura;
    const cierreSafe = sanitizeTime(cierre) || defaultConfig.horarioCierre;
    return {
        lunVie: { activo: true, apertura: aperturaSafe, cierre: cierreSafe },
        sab: { activo: true, apertura: aperturaSafe, cierre: cierreSafe },
        dom: { activo: false, apertura: aperturaSafe, cierre: cierreSafe }
    };
}

function normalizeHorariosPorDiaConfig(value, fallback = null) {
    const fallbackBase = fallback && typeof fallback === 'object'
        ? fallback
        : buildHorariosPorDiaDefault();
    const source = value && typeof value === 'object' ? value : {};
    const keys = ['lunVie', 'sab', 'dom'];
    const result = {};

    keys.forEach(key => {
        const src = source[key] && typeof source[key] === 'object' ? source[key] : {};
        const base = fallbackBase[key] && typeof fallbackBase[key] === 'object'
            ? fallbackBase[key]
            : buildHorariosPorDiaDefault()[key];
        let apertura = src.apertura !== undefined ? sanitizeTime(src.apertura) : sanitizeTime(base.apertura);
        let cierre = src.cierre !== undefined ? sanitizeTime(src.cierre) : sanitizeTime(base.cierre);
        const activo = src.activo !== undefined ? src.activo !== false : base.activo !== false;

        if (!apertura) apertura = sanitizeTime(defaultConfig.horarioApertura) || '09:00';
        if (!cierre) cierre = sanitizeTime(defaultConfig.horarioCierre) || '19:00';
        const aperturaMin = parseHora(apertura);
        const cierreMin = parseHora(cierre);
        if (aperturaMin >= cierreMin) {
            apertura = sanitizeTime(base.apertura) || defaultConfig.horarioApertura;
            cierre = sanitizeTime(base.cierre) || defaultConfig.horarioCierre;
        }

        result[key] = { activo, apertura, cierre };
    });

    return result;
}

function normalizeBloqueosAgenda(value, fallback = []) {
    const source = Array.isArray(value) ? value : (Array.isArray(fallback) ? fallback : []);
    const cleaned = [];

    for (const item of source) {
        if (!item || typeof item !== 'object') continue;
        const fecha = sanitizeDate(item.fecha);
        const desde = sanitizeTime(item.desde);
        const hasta = sanitizeTime(item.hasta);
        if (!fecha || !desde || !hasta) continue;
        if (parseHora(desde) >= parseHora(hasta)) continue;
        cleaned.push({
            id: sanitizeText(item.id || `${fecha}-${desde}-${hasta}`, 80) || `${fecha}-${desde}-${hasta}`,
            fecha,
            desde,
            hasta,
            motivo: sanitizeText(item.motivo || '', 120)
        });
        if (cleaned.length >= 300) break;
    }

    return cleaned;
}

function normalizeWhatsappTemplates(value, fallback = defaultConfig.whatsappTemplates) {
    const source = value && typeof value === 'object' ? value : {};
    const base = fallback && typeof fallback === 'object' ? fallback : defaultConfig.whatsappTemplates;
    return {
        confirmacion: source.confirmacion !== undefined
            ? sanitizeText(source.confirmacion, 500)
            : sanitizeText(base.confirmacion, 500),
        recordatorio: source.recordatorio !== undefined
            ? sanitizeText(source.recordatorio, 500)
            : sanitizeText(base.recordatorio, 500),
        reprogramacion: source.reprogramacion !== undefined
            ? sanitizeText(source.reprogramacion, 500)
            : sanitizeText(base.reprogramacion, 500)
    };
}

function normalizeMetasColaborador(value, fallback = defaultConfig.metasColaborador) {
    const source = value && typeof value === 'object' ? value : {};
    const base = fallback && typeof fallback === 'object' ? fallback : defaultConfig.metasColaborador;
    return {
        semanalComision: sanitizeNumber(
            source.semanalComision,
            sanitizeNumber(base.semanalComision, 0, { min: 0, max: 1000000000 }),
            { min: 0, max: 1000000000 }
        ) || 0,
        mensualComision: sanitizeNumber(
            source.mensualComision,
            sanitizeNumber(base.mensualComision, 0, { min: 0, max: 1000000000 }),
            { min: 0, max: 1000000000 }
        ) || 0
    };
}

function normalizeConfigInput(data, current) {
    let apertura = data.horarioApertura !== undefined ? sanitizeTime(data.horarioApertura) : current.horarioApertura;
    let cierre = data.horarioCierre !== undefined ? sanitizeTime(data.horarioCierre) : current.horarioCierre;
    const intervaloTurnos = data.intervaloTurnos !== undefined
        ? sanitizeNumber(data.intervaloTurnos, current.intervaloTurnos || defaultConfig.intervaloTurnos, { min: 5, max: 120 })
        : (current.intervaloTurnos || defaultConfig.intervaloTurnos);
    const whatsappRaw = data.whatsappNumber !== undefined ? String(data.whatsappNumber).trim() : current.whatsappNumber;
    const whatsappNumber = /^\d{7,15}$/.test(whatsappRaw) ? whatsappRaw : current.whatsappNumber;
    const pendientesAlerta = data.pendientesAlerta !== undefined
        ? sanitizeNumber(data.pendientesAlerta, current.pendientesAlerta || 10, { min: 1, max: 999 })
        : current.pendientesAlerta || 10;

    const ciudad = data.ciudad !== undefined ? sanitizeText(data.ciudad, 80) : current.ciudad;
    const direccion = data.direccion !== undefined ? sanitizeText(data.direccion, 120) : current.direccion;

    const mapEmbed = data.mapEmbedUrl !== undefined ? sanitizeUrl(data.mapEmbedUrl) : current.mapEmbedUrl;
    const mapUrl = data.mapUrl !== undefined ? sanitizeUrl(data.mapUrl) : current.mapUrl;
    const instagram = data.instagramUrl !== undefined ? sanitizeUrl(data.instagramUrl) : current.instagramUrl;
    const facebook = data.facebookUrl !== undefined ? sanitizeUrl(data.facebookUrl) : current.facebookUrl;
    const tiktok = data.tiktokUrl !== undefined ? sanitizeUrl(data.tiktokUrl) : current.tiktokUrl;
    const giftcardMontos = Array.isArray(data.giftcardMontos)
        ? data.giftcardMontos.map(n => sanitizeNumber(n, null, { min: 1000, max: 1000000000 }))
            .filter(n => n !== null)
        : (current.giftcardMontos || defaultConfig.giftcardMontos);
    const giftcardMensaje = data.giftcardMensaje !== undefined
        ? sanitizeText(data.giftcardMensaje, 200)
        : (current.giftcardMensaje || defaultConfig.giftcardMensaje);
    const giftcardVencimientoDias = data.giftcardVencimientoDias !== undefined
        ? sanitizeNumber(data.giftcardVencimientoDias, current.giftcardVencimientoDias || defaultConfig.giftcardVencimientoDias, { min: 1, max: 3650 })
        : (current.giftcardVencimientoDias || defaultConfig.giftcardVencimientoDias);
    const heroMosaicBase = normalizeHeroMosaicConfig(current.heroMosaic, defaultConfig.heroMosaic);
    const heroMosaic = data.heroMosaic !== undefined
        ? normalizeHeroMosaicConfig(data.heroMosaic, heroMosaicBase)
        : heroMosaicBase;
    const horariosPorDiaBase = normalizeHorariosPorDiaConfig(
        current.horariosPorDia,
        buildHorariosPorDiaDefault(current.horarioApertura, current.horarioCierre)
    );
    const horariosPorDia = data.horariosPorDia !== undefined
        ? normalizeHorariosPorDiaConfig(data.horariosPorDia, horariosPorDiaBase)
        : horariosPorDiaBase;
    const bloqueosAgenda = data.bloqueosAgenda !== undefined
        ? normalizeBloqueosAgenda(data.bloqueosAgenda, current.bloqueosAgenda)
        : normalizeBloqueosAgenda(current.bloqueosAgenda, []);
    const whatsappTemplates = data.whatsappTemplates !== undefined
        ? normalizeWhatsappTemplates(data.whatsappTemplates, current.whatsappTemplates || defaultConfig.whatsappTemplates)
        : normalizeWhatsappTemplates(current.whatsappTemplates, defaultConfig.whatsappTemplates);
    const metasColaborador = data.metasColaborador !== undefined
        ? normalizeMetasColaborador(data.metasColaborador, current.metasColaborador || defaultConfig.metasColaborador)
        : normalizeMetasColaborador(current.metasColaborador, defaultConfig.metasColaborador);

    const bankSource = data.bankInfo || {};
    const bankInfo = {
        banco: bankSource.banco !== undefined ? sanitizeText(bankSource.banco, 80) : (current.bankInfo?.banco || defaultConfig.bankInfo.banco),
        titular: bankSource.titular !== undefined ? sanitizeText(bankSource.titular, 80) : (current.bankInfo?.titular || defaultConfig.bankInfo.titular),
        cuenta: bankSource.cuenta !== undefined ? sanitizeText(bankSource.cuenta, 80) : (current.bankInfo?.cuenta || defaultConfig.bankInfo.cuenta),
        alias: bankSource.alias !== undefined ? sanitizeText(bankSource.alias, 80) : (current.bankInfo?.alias || defaultConfig.bankInfo.alias),
        qrUrl: bankSource.qrUrl !== undefined ? (sanitizeUrl(bankSource.qrUrl) || '') : (current.bankInfo?.qrUrl || defaultConfig.bankInfo.qrUrl)
    };

    if (apertura && cierre) {
        const aperturaMin = parseHora(apertura);
        const cierreMin = parseHora(cierre);
        if (aperturaMin >= cierreMin) {
            apertura = current.horarioApertura;
            cierre = current.horarioCierre;
        }
    }

    return {
        horarioApertura: apertura || current.horarioApertura,
        horarioCierre: cierre || current.horarioCierre,
        intervaloTurnos,
        horariosPorDia,
        bloqueosAgenda,
        whatsappTemplates,
        metasColaborador,
        whatsappNumber,
        pendientesAlerta,
        ciudad,
        direccion,
        mapEmbedUrl: mapEmbed === null ? current.mapEmbedUrl : mapEmbed,
        mapUrl: mapUrl === null ? current.mapUrl : mapUrl,
        instagramUrl: instagram === null ? current.instagramUrl : instagram,
        facebookUrl: facebook === null ? current.facebookUrl : facebook,
        tiktokUrl: tiktok === null ? current.tiktokUrl : tiktok,
        giftcardMontos,
        giftcardMensaje,
        giftcardVencimientoDias,
        heroMosaic,
        bankInfo
    };
}

function readConfig() {
    const config = readJSON(configPath, {});
    const { cloudinary, ...publicConfig } = config || {};
    const intervaloTurnos = sanitizeNumber(
        publicConfig.intervaloTurnos,
        defaultConfig.intervaloTurnos,
        { min: 5, max: 120 }
    );
    const montos = Array.isArray(publicConfig.giftcardMontos)
        ? publicConfig.giftcardMontos.map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n) && n > 0)
        : defaultConfig.giftcardMontos;
    const vencDias = sanitizeNumber(
        publicConfig.giftcardVencimientoDias ?? publicConfig.giftcardValidezDias,
        defaultConfig.giftcardVencimientoDias,
        { min: 1, max: 3650 }
    );
    const heroMosaic = normalizeHeroMosaicConfig(publicConfig.heroMosaic, defaultConfig.heroMosaic);
    const horariosPorDia = normalizeHorariosPorDiaConfig(
        publicConfig.horariosPorDia,
        buildHorariosPorDiaDefault(
            publicConfig.horarioApertura || defaultConfig.horarioApertura,
            publicConfig.horarioCierre || defaultConfig.horarioCierre
        )
    );
    const bloqueosAgenda = normalizeBloqueosAgenda(publicConfig.bloqueosAgenda, defaultConfig.bloqueosAgenda);
    const whatsappTemplates = normalizeWhatsappTemplates(publicConfig.whatsappTemplates, defaultConfig.whatsappTemplates);
    const metasColaborador = normalizeMetasColaborador(publicConfig.metasColaborador, defaultConfig.metasColaborador);
    return {
        ...defaultConfig,
        ...publicConfig,
        intervaloTurnos: intervaloTurnos || defaultConfig.intervaloTurnos,
        horariosPorDia,
        bloqueosAgenda,
        whatsappTemplates,
        metasColaborador,
        giftcardMontos: montos.length ? montos : defaultConfig.giftcardMontos,
        giftcardMensaje: publicConfig.giftcardMensaje || defaultConfig.giftcardMensaje,
        giftcardVencimientoDias: vencDias || defaultConfig.giftcardVencimientoDias,
        heroMosaic,
        bankInfo: {
            ...defaultConfig.bankInfo,
            ...(publicConfig.bankInfo || {})
        }
    };
}

function getCloudinaryConfig() {
    const envReady = CLOUDINARY_ENV.cloudName && CLOUDINARY_ENV.apiKey && CLOUDINARY_ENV.apiSecret;
    if (envReady) return CLOUDINARY_ENV;

    const legacy = readJSON(configPath, {}).cloudinary;
    if (legacy && legacy.cloudName && legacy.apiKey && legacy.apiSecret) {
        console.warn('Cloudinary cargado desde config.json. Configura variables de entorno para mayor seguridad.');
        return legacy;
    }

    return null;
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        ...extraHeaders
    });
    res.end(JSON.stringify(payload));
}

function setSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function normalizeOrigin(rawOrigin) {
    if (!rawOrigin) return '';
    try {
        return new URL(rawOrigin).origin;
    } catch {
        return '';
    }
}

function resolveCorsOrigin(req) {
    const rawOrigin = req.headers.origin;
    if (!rawOrigin) return null;
    const origin = normalizeOrigin(rawOrigin);
    if (!origin) return null;

    if (CORS_ALLOWED_ORIGINS.size) {
        return CORS_ALLOWED_ORIGINS.has(origin) ? origin : null;
    }

    const host = req.headers.host;
    if (host) {
        const isSecure = req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https';
        const selfOrigin = `${isSecure ? 'https' : 'http'}://${host}`;
        if (origin === selfOrigin) return origin;
    }

    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
    return null;
}

function applyCorsHeaders(req, res) {
    const rawOrigin = req.headers.origin;
    const allowedOrigin = resolveCorsOrigin(req);

    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (!rawOrigin) return true;
    if (!allowedOrigin) return false;

    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return true;
}

function getClientIp(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
}

function enforceRateLimit(req, res, {
    bucket,
    limit = 100,
    windowMs = 60 * 1000,
    message = 'Demasiadas solicitudes. Intenta nuevamente en un momento.'
}) {
    const now = Date.now();
    const ip = getClientIp(req);
    const key = `${bucket}:${ip}`;
    const entry = rateLimitState.get(key);

    if (!entry || now >= entry.resetAt) {
        rateLimitState.set(key, { count: 1, resetAt: now + windowMs });
    } else {
        entry.count += 1;
        if (entry.count > limit) {
            const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
            sendJson(res, 429, { error: message }, { 'Retry-After': String(retryAfter) });
            return true;
        }
    }

    rateLimitSweepCounter += 1;
    if (rateLimitSweepCounter >= 200) {
        for (const [stateKey, state] of rateLimitState.entries()) {
            if (state.resetAt <= now) rateLimitState.delete(stateKey);
        }
        rateLimitSweepCounter = 0;
    }

    return false;
}

function rejectInvalidBody(req, res, data, message = 'Datos inválidos') {
    if (data !== null) return false;
    if (req.bodyParseError === 'too_large') {
        sendJson(res, 413, { error: 'Payload demasiado grande' });
        return true;
    }
    sendJson(res, 400, { error: message });
    return true;
}

function parseBody(req, limitBytes = MAX_BODY_BYTES) {
    return new Promise(resolve => {
        let body = '';
        let bodySize = 0;
        let done = false;

        req.bodyParseError = null;

        const finish = value => {
            if (done) return;
            done = true;
            resolve(value);
        };

        req.on('data', chunk => {
            if (done) return;
            bodySize += chunk.length;
            if (bodySize > limitBytes) {
                req.bodyParseError = 'too_large';
                finish(null);
                req.resume();
                return;
            }
            body += chunk;
        });
        req.on('end', () => {
            if (done) return;
            if (!body) {
                req.bodyParseError = 'empty';
                finish(null);
                return;
            }
            try {
                finish(JSON.parse(body));
            } catch {
                req.bodyParseError = 'invalid_json';
                finish(null);
            }
        });
        req.on('aborted', () => {
            req.bodyParseError = 'aborted';
            finish(null);
        });
        req.on('error', () => {
            req.bodyParseError = 'error';
            finish(null);
        });
    });
}

function isValidBackupFilename(name) {
    return typeof name === 'string' && /^backup-[A-Za-z0-9-]+\.json$/.test(name);
}

function resolveBackupPath(name) {
    if (!isValidBackupFilename(name)) return null;
    const safeName = path.basename(name);
    const baseDir = path.resolve(backupsDir);
    const fullPath = path.resolve(backupsDir, safeName);
    if (!fullPath.startsWith(baseDir + path.sep)) return null;
    return fullPath;
}

function buildWeakEtag(stat) {
    return `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

function resolveStaticCacheControl(contentType) {
    const type = typeof contentType === 'string' ? contentType : 'application/octet-stream';
    if (type === 'text/html') return 'no-store';
    if (type === 'text/css' || type === 'application/javascript') {
        return `public, max-age=${STATIC_ASSET_MAX_AGE_SECONDS}`;
    }
    if (type.startsWith('image/') || type.startsWith('font/')) {
        return `public, max-age=${STATIC_ASSET_MAX_AGE_SECONDS}`;
    }
    return 'public, max-age=600';
}

function isRequestFresh(req, etag, lastModifiedMs) {
    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string' && ifNoneMatch.split(',').map(v => v.trim()).includes(etag)) {
        return true;
    }

    const ifModifiedSince = req.headers['if-modified-since'];
    if (typeof ifModifiedSince === 'string' && ifModifiedSince.trim()) {
        const since = Date.parse(ifModifiedSince);
        if (!Number.isNaN(since) && lastModifiedMs <= since) return true;
    }

    return false;
}

function serveStatic(req, res, filePath, contentType) {
    fs.stat(filePath, (statErr, stat) => {
        if (statErr || !stat || !stat.isFile()) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        const etag = buildWeakEtag(stat);
        const lastModified = stat.mtime.toUTCString();
        const cacheControl = resolveStaticCacheControl(contentType);
        const staticHeaders = {
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            ETag: etag,
            'Last-Modified': lastModified
        };

        if (isRequestFresh(req, etag, stat.mtime.getTime())) {
            res.writeHead(304, staticHeaders);
            res.end();
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Server Error');
                return;
            }
            res.writeHead(200, {
                ...staticHeaders,
                'Content-Length': String(data.length)
            });
            res.end(data);
        });
    });
}

function parseHora(horaStr) {
    const [h, m] = horaStr.split(':').map(Number);
    return (h * 60) + m;
}

function obtenerClaveHorarioPorFecha(fechaStr) {
    const fecha = new Date(`${fechaStr}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) return 'lunVie';
    const day = fecha.getDay();
    if (day === 0) return 'dom';
    if (day === 6) return 'sab';
    return 'lunVie';
}

function obtenerHorarioAtencionParaFecha(config, fechaStr) {
    const cfg = config || readConfig();
    const clave = obtenerClaveHorarioPorFecha(fechaStr);
    const fallback = buildHorariosPorDiaDefault(cfg.horarioApertura, cfg.horarioCierre);
    const horariosPorDia = normalizeHorariosPorDiaConfig(cfg.horariosPorDia, fallback);
    const horario = horariosPorDia[clave] || fallback[clave];
    const apertura = sanitizeTime(horario.apertura) || cfg.horarioApertura || defaultConfig.horarioApertura;
    const cierre = sanitizeTime(horario.cierre) || cfg.horarioCierre || defaultConfig.horarioCierre;
    const aperturaMin = parseHora(apertura);
    const cierreMin = parseHora(cierre);
    if (aperturaMin >= cierreMin) {
        return {
            activo: false,
            apertura,
            cierre,
            inicio: 0,
            fin: 0,
            clave
        };
    }
    return {
        activo: horario.activo !== false,
        apertura,
        cierre,
        inicio: aperturaMin,
        fin: cierreMin,
        clave
    };
}

function obtenerBloqueosPorFecha(config, fechaStr) {
    const cfg = config || readConfig();
    const bloqueos = normalizeBloqueosAgenda(cfg.bloqueosAgenda, []);
    return bloqueos.filter(b => b.fecha === fechaStr);
}

function rangosSolapan(inicioA, finA, inicioB, finB) {
    return inicioA < finB && finA > inicioB;
}

function obtenerBloqueosSolapados(config, fechaStr, inicioMinutos, finMinutos) {
    const bloqueos = obtenerBloqueosPorFecha(config, fechaStr);
    return bloqueos.filter(b => {
        const desde = parseHora(b.desde);
        const hasta = parseHora(b.hasta);
        return rangosSolapan(inicioMinutos, finMinutos, desde, hasta);
    });
}

function turnoSeSolapa(turno, inicioMinutos, finMinutos) {
    const [tHora, tMinuto] = turno.hora.split(':').map(Number);
    const tInicio = (tHora * 60) + tMinuto;
    const tFin = tInicio + (parseInt(turno.duracion) || 0);
    return rangosSolapan(inicioMinutos, finMinutos, tInicio, tFin);
}

function colaboradorEstaLibre(turnosDia, colaboradorId, inicio, fin) {
    for (const turno of turnosDia) {
        if (turno.estado === 'cancelado') continue;
        if (!turno.colaboradorId || turno.colaboradorId === colaboradorId) {
            if (turnoSeSolapa(turno, inicio, fin)) return false;
        }
    }
    return true;
}

function colaboradorPuedeAtender(colaborador, serviciosSeleccionados = []) {
    if (!colaborador) return false;
    const lista = Array.isArray(colaborador.serviciosIds)
        ? colaborador.serviciosIds.filter(Boolean)
        : [];
    if (!lista.length) return true; // sin restricciones
    const requeridos = serviciosSeleccionados.map(s => s.id);
    return requeridos.every(id => lista.includes(id));
}

function encontrarColaboradorDisponible(turnosDia, colaboradores, inicio, fin, serviciosSeleccionados = []) {
    const libres = [];
    for (const colab of colaboradores) {
        if (!colaboradorPuedeAtender(colab, serviciosSeleccionados)) continue;
        if (colaboradorEstaLibre(turnosDia, colab.id, inicio, fin)) {
            const carga = turnosDia.filter(t => t.colaboradorId === colab.id && t.estado !== 'cancelado').length;
            libres.push({ colab, carga });
        }
    }
    libres.sort((a, b) => a.carga - b.carga);
    return libres.length ? libres[0].colab : null;
}

function encontrarColaboradorMenorCarga(turnosDia, colaboradores, serviciosSeleccionados = []) {
    const candidatos = [];
    for (const colab of colaboradores) {
        if (!colaboradorPuedeAtender(colab, serviciosSeleccionados)) continue;
        const carga = turnosDia.filter(t => t.colaboradorId === colab.id && t.estado !== 'cancelado').length;
        candidatos.push({ colab, carga });
    }
    candidatos.sort((a, b) => a.carga - b.carga);
    return candidatos.length ? candidatos[0].colab : null;
}

function generarHorariosDisponibles(turnos, fecha, duracionServicio, config, colaboradoresLista = null, serviciosSeleccionados = []) {
    const horarios = [];
    const horarioAtencion = obtenerHorarioAtencionParaFecha(config, fecha);
    if (!horarioAtencion.activo) return horarios;
    const inicioJornada = horarioAtencion.inicio;
    const finJornada = horarioAtencion.fin;
    const intervalo = sanitizeNumber(config?.intervaloTurnos, defaultConfig.intervaloTurnos, { min: 5, max: 120 }) || defaultConfig.intervaloTurnos;
    const bloqueosFecha = obtenerBloqueosPorFecha(config, fecha);

    const turnosDia = turnos.filter(t => t.fecha === fecha && t.estado !== 'cancelado');
    const colaboradores = (Array.isArray(colaboradoresLista) ? colaboradoresLista : readJSON(usuariosPath, []))
        .filter(u => u.rol === 'colaborador' && u.activo !== false);
    const colaboradoresHabiles = serviciosSeleccionados.length
        ? colaboradores.filter(c => colaboradorPuedeAtender(c, serviciosSeleccionados))
        : colaboradores;
    const usarColaboradores = colaboradores.length > 0;

    for (let minutos = inicioJornada; minutos < finJornada; minutos += intervalo) {
        const hora = Math.floor(minutos / 60);
        const minuto = minutos % 60;
        const horaStr = `${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`;

        let disponible = true;
        const inicio = minutos;
        const fin = inicio + duracionServicio;
        if (fin > finJornada) {
            continue;
        }
        const bloqueado = bloqueosFecha.some(b => rangosSolapan(inicio, fin, parseHora(b.desde), parseHora(b.hasta)));
        if (bloqueado) continue;

        if (usarColaboradores) {
            disponible = colaboradoresHabiles.some(colab => colaboradorEstaLibre(turnosDia, colab.id, inicio, fin));
        } else {
            for (const turno of turnosDia) {
                if (turnoSeSolapa(turno, inicio, fin)) {
                    disponible = false;
                    break;
                }
            }
        }

        if (disponible) {
            horarios.push(horaStr);
        }
    }

    return horarios;
}

function normalizeServiciosSelection(data, catalogo) {
    const ids = Array.isArray(data.servicios) ? data.servicios : null;
    const nombres = Array.isArray(data.serviciosNombres) ? data.serviciosNombres : null;

    let seleccion = [];

    if (ids && ids.length) {
        seleccion = catalogo.filter(s => ids.includes(s.id));
    } else if (nombres && nombres.length) {
        seleccion = catalogo.filter(s => nombres.includes(s.nombre));
    } else if (data.servicio) {
        const match = catalogo.find(s => s.id === data.servicio || s.nombre === data.servicio);
        if (match) seleccion = [match];
    }

    const duracionTotal = seleccion.reduce((acc, s) => acc + (parseInt(s.duracion) || 0), 0);
    const precioTotal = seleccion.reduce((acc, s) => acc + (parseInt(s.precio) || 0), 0);

    return {
        seleccion,
        duracionTotal,
        precioTotal
    };
}

function calcularComisionTurno(serviciosSeleccionados = [], colaborador = null) {
    let comision = 0;
    let totalServicios = 0;
    const pctColaborador = colaborador && colaborador.comisionBase !== undefined
        ? sanitizeNumber(colaborador.comisionBase, null, { min: 0, max: 100 })
        : null;

    for (const servicio of serviciosSeleccionados) {
        const precio = parseInt(servicio.precio) || 0;
        const pctServicio = sanitizeNumber(servicio.comisionColaborador, null, { min: 0, max: 100 });
        const porcentaje = pctServicio !== null ? pctServicio : (pctColaborador !== null ? pctColaborador : 0);
        comision += Math.round(precio * (porcentaje / 100));
        totalServicios += precio;
    }

    const porcentajeEfectivo = totalServicios > 0 ? Math.round((comision / totalServicios) * 100) : 0;
    return {
        comision,
        porcentaje: porcentajeEfectivo
    };
}

function uploadToCloudinary(imageData) {
    return new Promise((resolve, reject) => {
        const cloudinary = getCloudinaryConfig();
        if (!cloudinary) {
            reject(new Error('Cloudinary no configurado'));
            return;
        }
        if (typeof imageData !== 'string') {
            reject(new Error('Formato de imagen inválido'));
            return;
        }
        const isDataImage = imageData.startsWith('data:image');
        const isRemoteUrl = /^https?:\/\//i.test(imageData);
        if (!isDataImage && !isRemoteUrl) {
            reject(new Error('Formato de imagen inválido'));
            return;
        }
        const timestamp = Math.floor(Date.now() / 1000);
        const folder = 'ali-reyes';
        const signatureBase = `folder=${folder}&timestamp=${timestamp}${cloudinary.apiSecret}`;
        const signature = crypto.createHash('sha1').update(signatureBase).digest('hex');

        const postData = querystring.stringify({
            file: imageData,
            api_key: cloudinary.apiKey,
            timestamp,
            folder,
            signature
        });

        const options = {
            hostname: 'api.cloudinary.com',
            path: `/v1_1/${cloudinary.cloudName}/image/upload`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        reject(new Error(parsed.error.message || 'Error subiendo imagen'));
                        return;
                    }
                    resolve(parsed);
                } catch (e) {
                    reject(new Error('Respuesta inválida de Cloudinary'));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// ==========================
// AUTH
// ==========================
function obtenerUsuarioSesion(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    const sessionToken = cookies.session;
    if (!sessionToken) return null;

    const sessionData = verifySession(sessionToken);
    if (!sessionData) return null;

    const usuarios = readJSON(usuariosPath, []);
    const usuario = usuarios.find(u => u.id === sessionData.userId && u.activo !== false);
    return usuario || null;
}

function verificarAuth(req, roles = ['admin']) {
    const usuario = obtenerUsuarioSesion(req);
    if (!usuario) return null;
    if (roles && roles.length && !roles.includes(usuario.rol)) return null;
    return usuario;
}

// ==========================
// RUTAS API
// ==========================
const server = http.createServer(async (req, res) => {
    const { pathname, query } = url.parse(req.url, true);

    setSecurityHeaders(res);
    const corsAllowed = applyCorsHeaders(req, res);
    if (!corsAllowed && req.headers.origin) {
        sendJson(res, 403, { error: 'Origen no permitido' });
        return;
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const isApiMutation = pathname.startsWith('/api/')
        && (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE');
    if (isApiMutation) {
        const limited = enforceRateLimit(req, res, {
            bucket: 'api-mutation',
            limit: 240,
            windowMs: 60 * 1000,
            message: 'Demasiadas solicitudes en poco tiempo. Intenta de nuevo en un minuto.'
        });
        if (limited) return;
    }

    // LOGIN
    if (pathname === '/api/login' && req.method === 'POST') {
        const loginRateLimited = enforceRateLimit(req, res, {
            bucket: 'login',
            limit: 8,
            windowMs: 10 * 60 * 1000,
            message: 'Demasiados intentos de acceso. Intenta nuevamente en 10 minutos.'
        });
        if (loginRateLimited) return;

        const data = await parseBody(req);
        if (rejectInvalidBody(req, res, data, 'Datos inválidos')) return;

        const usuarios = readJSON(usuariosPath, []);
        const username = sanitizeText(data.username, 60);
        const password = String(data.password || '');
        const usuario = usuarios.find(u => u.username === username && u.activo === true);

        if (!usuario || !verifyPassword(password, usuario.password)) {
            res.writeHead(401);
            res.end(JSON.stringify({ success: false, error: 'Credenciales inválidas' }));
            return;
        }

        if (needsPasswordUpgrade(usuario.password)) {
            usuario.password = hashPassword(password);
        }
        usuario.ultimo_acceso = new Date().toISOString();
        writeJSON(usuariosPath, usuarios);

        const sessionToken = signSession({ userId: usuario.id, role: usuario.rol, iat: Date.now(), exp: Date.now() + (1000 * 60 * 60 * 24) });
        res.setHeader('Set-Cookie', buildSessionCookie(sessionToken, req, 86400));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, role: usuario.rol || 'admin' }));
        return;
    }

    // CHECK AUTH
    if (pathname === '/api/check-auth') {
        const usuario = obtenerUsuarioSesion(req);
        if (usuario) {
            const { password, ...publicUser } = usuario;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ authenticated: true, user: publicUser }));
        } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ authenticated: false }));
        }
        return;
    }

    // LOGOUT
    if (pathname === '/api/logout' && req.method === 'POST') {
        res.setHeader('Set-Cookie', buildSessionCookie('', req, 0));
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // CONFIG
    if (pathname === '/api/config') {
        if (req.method === 'GET') {
            const config = readConfig();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(config));
            return;
        }

        if (req.method === 'PUT') {
            const usuario = verificarAuth(req);
            if (!usuario) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'No autorizado' }));
                return;
            }

            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'Datos inválidos')) return;

            const current = readConfig();
            const nextConfig = normalizeConfigInput(data, current);

            writeJSON(configPath, nextConfig);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, config: nextConfig }));
            return;
        }
    }

    // UPLOAD (Cloudinary)
    if (pathname === '/api/upload' && req.method === 'POST') {
        const usuario = verificarAuth(req);
        if (!usuario) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'No autorizado' }));
            return;
        }

        const uploadRateLimited = enforceRateLimit(req, res, {
            bucket: 'upload',
            limit: 25,
            windowMs: 60 * 1000,
            message: 'Demasiadas cargas en poco tiempo. Espera un minuto y vuelve a intentar.'
        });
        if (uploadRateLimited) return;

        const data = await parseBody(req);
        if (rejectInvalidBody(req, res, data, 'Imagen requerida')) return;
        if (!data.imageData) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Imagen requerida' }));
            return;
        }

        try {
            const result = await uploadToCloudinary(data.imageData);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, url: result.secure_url, public_id: result.public_id }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message || 'Error subiendo imagen' }));
        }
        return;
    }

    // COLABORADORES
    if (pathname === '/api/colaboradores') {
        const usuarios = readJSON(usuariosPath, []);

        if (req.method === 'GET') {
            const publico = query.public === '1';
            const activos = usuarios.filter(u => u.rol === 'colaborador' && u.activo !== false);

            if (publico) {
                const list = activos.map(({ password, ...rest }) => ({
                    id: rest.id,
                    nombre: rest.nombre,
                    foto: rest.foto || '',
                    color: rest.color || '',
                    especialidades: Array.isArray(rest.especialidades) ? rest.especialidades : [],
                    comisionBase: rest.comisionBase || 0
                }));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(list));
                return;
            }

            const usuarioSesion = verificarAuth(req, ['admin', 'colaborador']);
            if (!usuarioSesion) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'No autorizado' }));
                return;
            }

            const lista = usuarioSesion.rol === 'admin'
                ? usuarios.filter(u => u.rol === 'colaborador')
                : activos.filter(u => u.id === usuarioSesion.id);

            const respuesta = lista.map(u => {
                const { password, ...rest } = u;
                return rest;
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(respuesta));
            return;
        }

        const admin = verificarAuth(req, ['admin', 'colaborador']);
        if (!admin) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'No autorizado' }));
            return;
        }

        if (req.method === 'POST') {
            if (admin.rol !== 'admin') {
                res.writeHead(403);
                res.end(JSON.stringify({ error: 'Solo administradores' }));
                return;
            }
            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'Nombre, usuario y contraseña son obligatorios')) return;
            const nombre = sanitizeText(data?.nombre, 80);
            const username = sanitizeText(data?.username, 60);
            const password = data?.password ? String(data.password) : '';
            if (!nombre || !username || !password) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Nombre, usuario y contraseña son obligatorios' }));
                return;
            }
            const usernameExists = usuarios.some(u => u.username === username);
            if (usernameExists) {
                res.writeHead(409);
                res.end(JSON.stringify({ error: 'El usuario ya existe' }));
                return;
            }

            let foto = '';
            if (data.fotoData || data.foto) {
                try {
                    foto = await resolveImageUrl({ imageData: data.fotoData, imageUrl: data.foto });
                } catch {
                    foto = '';
                }
            }

            const especialidades = Array.isArray(data?.especialidades)
                ? data.especialidades.map(e => sanitizeText(e, 40)).filter(Boolean).slice(0, 10)
                : [];
            const serviciosIds = Array.isArray(data?.serviciosIds || data?.servicios)
                ? (data.serviciosIds || data.servicios).map(id => sanitizeText(id, 60)).filter(Boolean).slice(0, 30)
                : [];

            const nuevo = {
                id: Date.now().toString(),
                nombre,
                username,
                password: hashPassword(password),
                rol: 'colaborador',
                telefono: sanitizeDigits(data?.telefono, 20),
                email: sanitizeText(data?.email, 120),
                foto,
                color: sanitizeText(data?.color, 16),
                comisionBase: sanitizeNumber(data?.comisionBase, 40, { min: 0, max: 100 }),
                especialidades,
                serviciosIds,
                activo: data?.activo !== false,
                creado: new Date().toISOString(),
                ultimo_acceso: null
            };

            usuarios.push(nuevo);
            writeJSON(usuariosPath, usuarios);
            const { password: _, ...publicData } = nuevo;

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, colaborador: publicData }));
            return;
        }

        if (req.method === 'PUT') {
            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'Datos incompletos')) return;
            const targetId = sanitizeText(data.id, 60) || (admin.rol === 'colaborador' ? admin.id : null);
            if (!targetId) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }
            const index = usuarios.findIndex(u => u.id === targetId && u.rol === 'colaborador');
            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Colaborador no encontrado' }));
                return;
            }

            const actual = usuarios[index];
            const nombre = data.nombre !== undefined ? sanitizeText(data.nombre, 80) : actual.nombre;
            const username = data.username !== undefined ? sanitizeText(data.username, 60) : actual.username;
            if (username !== actual.username && usuarios.some(u => u.username === username)) {
                res.writeHead(409);
                res.end(JSON.stringify({ error: 'El usuario ya existe' }));
                return;
            }

            let foto = actual.foto || '';
            if (data.fotoData || data.foto) {
                try {
                    const nueva = await resolveImageUrl({ imageData: data.fotoData, imageUrl: data.foto });
                    if (nueva) foto = nueva;
                } catch {
                    // ignore image errors silently
                }
            }

            const especialidades = data.especialidades !== undefined
                ? (Array.isArray(data.especialidades)
                    ? data.especialidades.map(e => sanitizeText(e, 40)).filter(Boolean).slice(0, 10)
                    : actual.especialidades || [])
                : (actual.especialidades || []);

            const comisionBase = data.comisionBase !== undefined
                ? sanitizeNumber(data.comisionBase, actual.comisionBase || 0, { min: 0, max: 100 })
                : (actual.comisionBase || 0);

            const puedeActualizarServicios = admin.rol === 'admin' && (data.serviciosIds !== undefined || data.servicios !== undefined);
            const serviciosIds = puedeActualizarServicios
                ? (Array.isArray(data.serviciosIds || data.servicios)
                    ? (data.serviciosIds || data.servicios).map(id => sanitizeText(id, 60)).filter(Boolean).slice(0, 30)
                    : (actual.serviciosIds || []))
                : (actual.serviciosIds || []);

            let password = actual.password;
            if (data.password) {
                password = hashPassword(String(data.password));
            }

            const activo = data.activo !== undefined && admin.rol === 'admin'
                ? data.activo !== false
                : actual.activo;

            usuarios[index] = {
                ...actual,
                nombre,
                username,
                password,
                telefono: data.telefono !== undefined ? sanitizeDigits(data.telefono, 20) : actual.telefono,
                email: data.email !== undefined ? sanitizeText(data.email, 120) : actual.email,
                foto,
                color: data.color !== undefined ? sanitizeText(data.color, 16) : (actual.color || ''),
                comisionBase,
                especialidades,
                serviciosIds,
                activo
            };

            writeJSON(usuariosPath, usuarios);
            const { password: _, ...publicData } = usuarios[index];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, colaborador: publicData }));
            return;
        }

        if (req.method === 'DELETE') {
            if (admin.rol !== 'admin') {
                res.writeHead(403);
                res.end(JSON.stringify({ error: 'Solo administradores' }));
                return;
            }
            const id = sanitizeText(query.id, 60);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }
            const index = usuarios.findIndex(u => u.id === id && u.rol === 'colaborador');
            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Colaborador no encontrado' }));
                return;
            }
            usuarios.splice(index, 1);
            writeJSON(usuariosPath, usuarios);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }
    }

    // SERVICIOS
    if (pathname === '/api/servicios') {
        const servicios = readJSON(serviciosPath, []);

        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(servicios));
            return;
        }

        const usuario = verificarAuth(req);
        if (!usuario) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'No autorizado' }));
            return;
        }

        if (req.method === 'POST') {
            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'Datos incompletos')) return;
            const nombre = sanitizeText(data?.nombre, 80);
            const duracion = sanitizeNumber(data?.duracion, null, { min: 10, max: 600 });
            const precio = sanitizeNumber(data?.precio, null, { min: 0, max: 1000000000 });
            const comisionColaborador = data?.comisionColaborador !== undefined
                ? sanitizeNumber(data.comisionColaborador, 0, { min: 0, max: 100 })
                : 40;
            if (!nombre || duracion === null || precio === null) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Datos incompletos' }));
                return;
            }

            const descripcion = data.descripcion !== undefined ? sanitizeText(data.descripcion, 240) : '';
            const categoria = sanitizeText(data.categoria, 40) || 'corte';
            const imagenesInput = Array.isArray(data?.imagenes) ? data.imagenes : null;
            const hasSingleImage = Boolean(data.imagenData) || (typeof data.imagen === 'string' && data.imagen.trim() !== '');
            let imagen = '';
            let imagenes = [];

            if (imagenesInput !== null) {
                try {
                    imagenes = await resolveImageList(imagenesInput);
                } catch (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'Error subiendo imagen' }));
                    return;
                }
            }

            if (!imagenes.length && hasSingleImage) {
                try {
                    imagen = await resolveImageUrl({ imageData: data.imagenData, imageUrl: data.imagen });
                } catch (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'Error subiendo imagen' }));
                    return;
                }
                if (!imagen) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Imagen inválida' }));
                    return;
                }
                imagenes = imagen ? [imagen] : [];
            } else if (imagenes.length) {
                imagen = imagenes[0];
            }

            const nuevoServicio = {
                id: Date.now().toString(),
                nombre,
                descripcion,
                duracion,
                precio,
                categoria,
                comisionColaborador,
                imagen: imagen || '',
                imagenes,
                activo: data.activo !== false,
                creado: new Date().toISOString()
            };

            servicios.push(nuevoServicio);
            writeJSON(serviciosPath, servicios);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, servicio: nuevoServicio }));
            return;
        }

        if (req.method === 'PUT') {
            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'Datos incompletos')) return;

            const id = sanitizeText(data.id, 40);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }

            const index = servicios.findIndex(s => s.id === id);
            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Servicio no encontrado' }));
                return;
            }

            const actual = servicios[index];

            const nombre = data.nombre !== undefined ? sanitizeText(data.nombre, 80) : actual.nombre;
            if (data.nombre !== undefined && !nombre) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Nombre inválido' }));
                return;
            }

            const duracion = data.duracion !== undefined
                ? sanitizeNumber(data.duracion, null, { min: 10, max: 600 })
                : actual.duracion;
            if (data.duracion !== undefined && duracion === null) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Duración inválida' }));
                return;
            }

            const precio = data.precio !== undefined
                ? sanitizeNumber(data.precio, null, { min: 0, max: 1000000000 })
                : actual.precio;
            if (data.precio !== undefined && precio === null) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Precio inválido' }));
                return;
            }
            const comisionColaborador = data.comisionColaborador !== undefined
                ? sanitizeNumber(data.comisionColaborador, actual.comisionColaborador || 0, { min: 0, max: 100 })
                : (actual.comisionColaborador || 0);

            const descripcion = data.descripcion !== undefined ? sanitizeText(data.descripcion, 240) : (actual.descripcion || '');
            const categoria = data.categoria !== undefined ? (sanitizeText(data.categoria, 40) || 'corte') : (actual.categoria || 'corte');

            const imagenesInput = Array.isArray(data?.imagenes) ? data.imagenes : null;
            const hasSingleImage = Boolean(data.imagenData) || (typeof data.imagen === 'string' && data.imagen.trim() !== '');
            const updateImages = imagenesInput !== null || hasSingleImage;
            let imagenesFinal = Array.isArray(actual.imagenes) && actual.imagenes.length
                ? actual.imagenes
                : (actual.imagen ? [actual.imagen] : []);
            let imagenFinal = imagenesFinal[0] || actual.imagen || '';

            if (updateImages) {
                let imagenes = [];
                if (imagenesInput !== null) {
                    try {
                        imagenes = await resolveImageList(imagenesInput);
                    } catch (error) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: 'Error subiendo imagen' }));
                        return;
                    }
                }
                if (!imagenes.length && hasSingleImage) {
                    try {
                        const imagen = await resolveImageUrl({ imageData: data.imagenData, imageUrl: data.imagen });
                        if (!imagen) {
                            res.writeHead(400);
                            res.end(JSON.stringify({ error: 'Imagen inválida' }));
                            return;
                        }
                        imagenes = [imagen];
                    } catch (error) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: 'Error subiendo imagen' }));
                        return;
                    }
                }

                imagenesFinal = imagenes;
                imagenFinal = imagenesFinal[0] || '';
            }

            const activo = data.activo !== undefined ? data.activo !== false : actual.activo;

            servicios[index] = {
                ...actual,
                nombre,
                descripcion,
                duracion,
                precio,
                comisionColaborador,
                categoria,
                imagen: imagenFinal,
                imagenes: imagenesFinal,
                activo
            };

            writeJSON(serviciosPath, servicios);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, servicio: servicios[index] }));
            return;
        }

        if (req.method === 'DELETE') {
            const id = sanitizeText(query.id, 40);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }
            const index = servicios.findIndex(s => s.id === id);

            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Servicio no encontrado' }));
                return;
            }

            servicios.splice(index, 1);
            writeJSON(serviciosPath, servicios);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }
    }

    // LOOKBOOK
    if (pathname === '/api/lookbook') {
        const lookbook = readJSON(lookbookPath, []);

        if (req.method === 'GET') {
            const usuario = verificarAuth(req);
            const isAdmin = usuario && query.admin === '1';
            const lista = isAdmin ? lookbook : lookbook.filter(item => item.activo !== false);
            const ordenada = lista.slice().sort((a, b) => {
                if (a.orden !== undefined && b.orden !== undefined) return a.orden - b.orden;
                return new Date(b.creado) - new Date(a.creado);
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ordenada));
            return;
        }

        const usuario = verificarAuth(req);
        if (!usuario) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'No autorizado' }));
            return;
        }

        if (req.method === 'POST') {
            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'Datos incompletos')) return;
            const titulo = sanitizeText(data?.titulo, 80);
            const descripcion = data?.descripcion !== undefined ? sanitizeText(data.descripcion, 200) : '';
            const activo = data?.activo !== false;
            const orden = sanitizeNumber(data?.orden, Date.now(), { min: 0, max: 9999999999 });
            if (!titulo) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Datos incompletos' }));
                return;
            }

            const hasImageInput = Boolean(data.imagenData) || (typeof data.imagen === 'string' && data.imagen.trim() !== '');
            if (!hasImageInput) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Imagen requerida' }));
                return;
            }

            let imagen = '';
            try {
                imagen = await resolveImageUrl({ imageData: data.imagenData, imageUrl: data.imagen });
            } catch (error) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Error subiendo imagen' }));
                return;
            }

            if (!imagen) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Imagen inválida' }));
                return;
            }

            const nuevoItem = {
                id: Date.now().toString(),
                titulo,
                descripcion,
                imagen,
                activo,
                orden,
                creado: new Date().toISOString()
            };

            lookbook.push(nuevoItem);
            writeJSON(lookbookPath, lookbook);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, item: nuevoItem }));
            return;
        }

        if (req.method === 'PUT') {
            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'ID requerido')) return;
            const id = sanitizeText(data?.id, 40);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }

            const index = lookbook.findIndex(item => item.id === id);
            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Item no encontrado' }));
                return;
            }

            const titulo = data.titulo !== undefined ? sanitizeText(data.titulo, 80) : lookbook[index].titulo;
            const descripcion = data.descripcion !== undefined ? sanitizeText(data.descripcion, 200) : lookbook[index].descripcion;
            const activo = data.activo !== undefined ? data.activo !== false : lookbook[index].activo;
            const orden = data.orden !== undefined
                ? sanitizeNumber(data.orden, lookbook[index].orden, { min: 0, max: 9999999999 })
                : lookbook[index].orden;

            let imagen = lookbook[index].imagen;
            const hasImageInput = Boolean(data.imagenData) || (typeof data.imagen === 'string' && data.imagen.trim() !== '');
            if (hasImageInput) {
                try {
                    imagen = await resolveImageUrl({ imageData: data.imagenData, imageUrl: data.imagen });
                } catch (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'Error subiendo imagen' }));
                    return;
                }
                if (!imagen) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Imagen inválida' }));
                    return;
                }
            }

            lookbook[index] = {
                ...lookbook[index],
                titulo,
                descripcion,
                activo,
                orden,
                imagen
            };

            writeJSON(lookbookPath, lookbook);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, item: lookbook[index] }));
            return;
        }

        if (req.method === 'DELETE') {
            const id = sanitizeText(query.id, 40);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }

            const index = lookbook.findIndex(item => item.id === id);
            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Item no encontrado' }));
                return;
            }

            lookbook.splice(index, 1);
            writeJSON(lookbookPath, lookbook);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }
    }

    // GIFTCARDS
    if (pathname === '/api/giftcards/validate') {
        const codeRaw = sanitizeText(query.code, 80);
        const code = codeRaw ? codeRaw.toUpperCase() : '';
        if (!code) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Código requerido', found: false, status: 'invalid' }));
            return;
        }
        const giftcards = readJSON(giftcardsPath, []);
        const config = readConfig();
        const gift = matchGiftcardByCode(giftcards, code);
        if (!gift) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ found: false, status: 'not_found', message: 'Código no encontrado' }));
            return;
        }
        const estadoOriginal = normalizarEstadoGiftcard(gift.estado);
        const expirada = giftcardExpirada(gift, config);
        const estado = expirada && !['entregada', 'cancelado'].includes(estadoOriginal)
            ? 'caducado'
            : estadoOriginal;
        const fechaVencimiento = calcularFechaVencimiento(gift, config);
        const payload = {
            found: true,
            id: gift.id || '',
            status: estado === 'entregada' ? 'usado'
                : estado === 'cancelado' ? 'cancelado'
                : estado === 'caducado' ? 'caducado'
                : estado === 'pagada' ? 'pagada'
                : 'pendiente',
            estado,
            estadoOriginal,
            disponible: !['entregada', 'cancelado', 'caducado'].includes(estado),
            usado: estado === 'entregada',
            cancelado: estado === 'cancelado',
            expirada,
            pagada: estado === 'pagada',
            codigo: codigoGiftcardPrincipal(gift),
            monto: gift.monto || 0,
            destinatario: gift.destinatario || '',
            cliente: gift.clienteNombre || '',
            servicios: Array.isArray(gift.servicios) ? gift.servicios.map(s => s.nombre || '').filter(Boolean) : [],
            mensaje: gift.mensaje || '',
            fechaPago: gift.fechaPago || null,
            fechaEntrega: gift.fechaEntrega || null,
            creado: gift.creado || null,
            fechaVencimiento: fechaVencimiento ? fechaVencimiento.toISOString() : null
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
    }

    if (pathname === '/api/giftcards') {
        let giftcards = readJSON(giftcardsPath, []);

        if (req.method === 'GET') {
            const usuario = verificarAuth(req, ['admin']);
            if (!usuario) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'No autorizado' }));
                return;
            }
            let changed = false;
            giftcards = giftcards.map(g => {
                const estadoNorm = normalizarEstadoGiftcard(g.estado);
                if (estadoNorm !== g.estado) changed = true;
                return { ...g, estado: estadoNorm };
            });
            if (changed) writeJSON(giftcardsPath, giftcards);

            const estadoFiltro = query.estado ? sanitizeText(query.estado, 30).toLowerCase() : null;
            const lista = estadoFiltro
                ? giftcards.filter(g => (g.estado || '').toLowerCase() === estadoFiltro)
                : giftcards;
            const ordenada = lista.slice().sort((a, b) => new Date(b.creado || b.fechaSolicitud || 0) - new Date(a.creado || a.fechaSolicitud || 0));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ordenada));
            return;
        }

        if (req.method === 'POST') {
            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'Datos incompletos para la giftcard')) return;
            const clienteNombre = sanitizeText(data?.clienteNombre || data?.nombre, 120);
            const telefono = sanitizeDigits(data?.telefono || data?.clienteTelefono, 20);
            const destinatario = sanitizeText(data?.destinatario || data?.para, 120);
            const monto = sanitizeNumber(data?.monto, null, { min: 10000, max: 1000000000 });
            const montoCustom = sanitizeNumber(data?.montoCustom, null, { min: 10000, max: 1000000000 });
            const montoFinal = montoCustom !== null ? montoCustom : monto;

            if (!clienteNombre || !telefono || !destinatario || montoFinal === null) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Datos incompletos para la giftcard' }));
                return;
            }

            const serviciosCatalogo = readJSON(serviciosPath, []);
            const { seleccion } = normalizeServiciosSelection(data, serviciosCatalogo);
            const serviciosSeleccionados = seleccion.map(s => ({
                id: s.id,
                nombre: s.nombre,
                precio: s.precio,
                duracion: s.duracion
            }));

            const config = readConfig();
            const banco = config.bankInfo || defaultConfig.bankInfo;
            const diasVenc = obtenerDiasVencimiento(config);
            const fechaVencimiento = new Date(Date.now() + diasVenc * DAY_MS).toISOString();

            let comprobante = '';
            if (data.comprobanteData || data.comprobanteUrl) {
                try {
                    comprobante = await resolveImageUrl({ imageData: data.comprobanteData, imageUrl: data.comprobanteUrl });
                } catch {
                    comprobante = '';
                }
            }

            const nuevo = {
                id: `g-${Date.now()}`,
                clienteNombre,
                telefono,
                destinatario,
                monto: montoFinal,
                servicios: serviciosSeleccionados,
                mensaje: sanitizeText(data?.mensaje || data?.dedicatoria, 240),
                estado: 'pendiente',
                banco,
                comprobante,
                creado: new Date().toISOString(),
                fechaVencimiento,
                medioPago: sanitizeText(data?.medioPago || 'transferencia', 40),
                estadoHistorial: [{ estado: 'pendiente', fecha: new Date().toISOString() }]
            };

            giftcards.push(nuevo);
            writeJSON(giftcardsPath, giftcards);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, giftcard: nuevo }));
            return;
        }

        const admin = verificarAuth(req, ['admin']);
        if (!admin) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'No autorizado' }));
            return;
        }

        if (req.method === 'PUT') {
            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'ID requerido')) return;
            const id = sanitizeText(data?.id, 40);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }
            const index = giftcards.findIndex(g => g.id === id);
            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Giftcard no encontrada' }));
                return;
            }
            const estadoAnterior = normalizarEstadoGiftcard(giftcards[index].estado);
            const estado = data.estado ? normalizarEstadoGiftcard(data.estado) : estadoAnterior;
            let estadoHistorial = Array.isArray(giftcards[index].estadoHistorial)
                ? [...giftcards[index].estadoHistorial]
                : [];
            if (estado !== estadoAnterior) {
                estadoHistorial.push({ estado, fecha: new Date().toISOString() });
            }
            let fechaPago = giftcards[index].fechaPago;
            let fechaEntrega = giftcards[index].fechaEntrega;
            if (estado === 'pagada' && estadoAnterior !== 'pagada') {
                fechaPago = new Date().toISOString();
            }
            if (estado === 'entregada' && estadoAnterior !== 'entregada') {
                fechaEntrega = new Date().toISOString();
            }

            giftcards[index] = {
                ...giftcards[index],
                estado,
                codigo: data.codigo !== undefined ? sanitizeText(data.codigo, 60) : giftcards[index].codigo,
                notaAdmin: data.notaAdmin !== undefined ? sanitizeText(data.notaAdmin, 240) : giftcards[index].notaAdmin,
                estadoHistorial,
                fechaPago,
                fechaEntrega,
                actualizado: new Date().toISOString()
            };
            writeJSON(giftcardsPath, giftcards);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, giftcard: giftcards[index] }));
            return;
        }

        if (req.method === 'DELETE') {
            const id = sanitizeText(query.id, 40);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }
            const index = giftcards.findIndex(g => g.id === id);
            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Giftcard no encontrada' }));
                return;
            }
            giftcards.splice(index, 1);
            writeJSON(giftcardsPath, giftcards);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }
    }

    // BANNERS / PROMOS
    if (pathname === '/api/banners') {
        const banners = readJSON(bannersPath, []);

        if (req.method === 'GET') {
            const usuario = query.admin === '1' ? verificarAuth(req, ['admin']) : null;
            if (query.admin === '1' && !usuario) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'No autorizado' }));
                return;
            }
            const lista = query.admin === '1'
                ? banners
                : banners.filter(b => b.activo !== false);
            const ordenada = lista.slice().sort((a, b) => {
                if (a.orden !== undefined && b.orden !== undefined) return a.orden - b.orden;
                return new Date(b.creado || 0) - new Date(a.creado || 0);
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ordenada));
            return;
        }

        const admin = verificarAuth(req, ['admin']);
        if (!admin) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'No autorizado' }));
            return;
        }

        if (req.method === 'POST') {
            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'Título requerido')) return;
            const titulo = sanitizeText(data?.titulo, 120);
            if (!titulo) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Título requerido' }));
                return;
            }
            let imagen = '';
            if (data.imagenData || data.imagen) {
                try {
                    imagen = await resolveImageUrl({ imageData: data.imagenData, imageUrl: data.imagen });
                } catch {
                    imagen = '';
                }
            }
            const nuevo = {
                id: `b-${Date.now()}`,
                titulo,
                descripcion: sanitizeText(data?.descripcion, 240),
                imagen,
                url: sanitizeUrl(data?.url) || '',
                activo: data?.activo !== false,
                orden: sanitizeNumber(data?.orden, Date.now(), { min: 0, max: 999999999 }),
                creado: new Date().toISOString()
            };
            banners.push(nuevo);
            writeJSON(bannersPath, banners);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, banner: nuevo }));
            return;
        }

        if (req.method === 'PUT') {
            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'ID requerido')) return;
            const id = sanitizeText(data?.id, 80);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }
            const index = banners.findIndex(b => b.id === id);
            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Banner no encontrado' }));
                return;
            }
            let imagen = banners[index].imagen || '';
            if (data.imagenData || data.imagen) {
                try {
                    const img = await resolveImageUrl({ imageData: data.imagenData, imageUrl: data.imagen });
                    if (img) imagen = img;
                } catch {
                    // ignore errors
                }
            }
            banners[index] = {
                ...banners[index],
                titulo: data.titulo !== undefined ? sanitizeText(data.titulo, 120) : banners[index].titulo,
                descripcion: data.descripcion !== undefined ? sanitizeText(data.descripcion, 240) : banners[index].descripcion,
                imagen,
                url: data.url !== undefined ? (sanitizeUrl(data.url) || '') : banners[index].url,
                activo: data.activo !== undefined ? data.activo !== false : banners[index].activo,
                orden: data.orden !== undefined
                    ? sanitizeNumber(data.orden, banners[index].orden, { min: 0, max: 999999999 })
                    : banners[index].orden,
                actualizado: new Date().toISOString()
            };
            writeJSON(bannersPath, banners);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, banner: banners[index] }));
            return;
        }

        if (req.method === 'DELETE') {
            const id = sanitizeText(query.id, 80);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }
            const index = banners.findIndex(b => b.id === id);
            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Banner no encontrado' }));
                return;
            }
            banners.splice(index, 1);
            writeJSON(bannersPath, banners);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }
    }

    // SORTEOS
    if (pathname === '/api/sorteos') {
        const sorteos = readJSON(sorteosPath, []);

        if (req.method === 'GET') {
            const admin = verificarAuth(req, ['admin']);
            if (!admin) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'No autorizado' }));
                return;
            }
            const ordenados = sorteos.slice().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ordenados));
            return;
        }

        const admin = verificarAuth(req, ['admin']);
        if (!admin) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'No autorizado' }));
            return;
        }

        if (req.method === 'POST') {
            const data = await parseBody(req);
            if (data === null && req.bodyParseError && req.bodyParseError !== 'empty') {
                if (rejectInvalidBody(req, res, data, 'Datos inválidos')) return;
            }
            const payload = data || {};
            const titulo = sanitizeText(payload.titulo || 'Sorteo', 160);
            const cantidad = sanitizeNumber(payload.ganadores || payload.cantidad, 1, { min: 1, max: 50 });
            const desde = payload.desde ? sanitizeDate(payload.desde) : null;
            const hasta = payload.hasta ? sanitizeDate(payload.hasta) : null;

            const turnos = readJSON(turnosPath, []);
            const participantesMap = new Map();
            turnos.forEach(t => {
                if (t.estado === 'cancelado') return;
                if (desde && t.fecha < desde) return;
                if (hasta && t.fecha > hasta) return;
                const key = (t.telefono || t.ci || t.nombre || '').toString().trim().toLowerCase();
                if (!key) return;
                if (!participantesMap.has(key)) {
                    participantesMap.set(key, {
                        nombre: t.nombre || 'Cliente',
                        telefono: t.telefono || '',
                        ci: t.ci || ''
                    });
                }
            });

            const participantes = Array.from(participantesMap.values());
            if (!participantes.length) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'No hay participantes disponibles' }));
                return;
            }

            const pool = [...participantes];
            const ganadores = [];
            const picks = Math.min(cantidad || 1, pool.length);
            for (let i = 0; i < picks; i++) {
                const idx = crypto.randomInt(0, pool.length);
                ganadores.push(pool[idx]);
                pool.splice(idx, 1);
            }

            const sorteo = {
                id: `s-${Date.now()}`,
                titulo,
                ganadores,
                totalParticipantes: participantes.length,
                fecha: new Date().toISOString(),
                desde,
                hasta
            };

            sorteos.push(sorteo);
            writeJSON(sorteosPath, sorteos);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, sorteo }));
            return;
        }

        if (req.method === 'DELETE') {
            const id = sanitizeText(query.id, 60);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }
            const index = sorteos.findIndex(s => s.id === id);
            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Sorteo no encontrado' }));
                return;
            }
            sorteos.splice(index, 1);
            writeJSON(sorteosPath, sorteos);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }
    }

    // TURNOS
    if (pathname === '/api/turnos') {
        const turnos = readJSON(turnosPath, []);

        if (req.method === 'GET') {
            const usuario = verificarAuth(req, ['admin', 'colaborador']);
            if (!usuario) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No autorizado' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            const lista = usuario.rol === 'admin'
                ? turnos
                : turnos.filter(t => t.colaboradorId === usuario.id);
            res.end(JSON.stringify(lista));
            return;
        }

        if (req.method === 'POST') {
            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'Datos incompletos')) return;
            const adminSesion = verificarAuth(req, ['admin']);
            const nombre = sanitizeText(data?.nombre, 80);
            const ci = sanitizeDigits(data?.ci, 20);
            const telefono = sanitizeDigits(data?.telefono, 20);
            const fecha = sanitizeDate(data?.fecha);
            const hora = sanitizeTime(data?.hora);
            const estado = adminSesion
                ? normalizarEstadoTurno(data?.estado, 'pendiente')
                : 'pendiente';
            const forzarSobreturno = Boolean(adminSesion && data?.forzarSobreturno === true);
            const sobreturnoMotivo = forzarSobreturno ? sanitizeText(data?.sobreturnoMotivo, 120) : '';
            const notaInterna = adminSesion ? sanitizeText(data?.notaInterna, 400) : '';
            if (!nombre || !ci || !telefono || !fecha || !hora) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Datos incompletos' }));
                return;
            }

            const servicios = readJSON(serviciosPath, []);
            const colaboradores = readJSON(usuariosPath, []).filter(u => u.rol === 'colaborador' && u.activo !== false);
            const { seleccion, duracionTotal, precioTotal } = normalizeServiciosSelection(data, servicios);
            const colaboradoresCapaces = colaboradores.filter(c => colaboradorPuedeAtender(c, seleccion));

            if (!seleccion.length) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Servicio no encontrado' }));
                return;
            }

            let colaboradorId = data?.colaboradorId !== undefined ? sanitizeText(data.colaboradorId, 60) : null;
            let colaborador = colaboradorId ? colaboradores.find(c => c.id === colaboradorId) : null;
            let asignadoAutomatico = false;

            if (colaborador && !colaboradorPuedeAtender(colaborador, seleccion)) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'El colaborador seleccionado no realiza todos los servicios elegidos' }));
                return;
            }

            const inicio = hora;
            const config = readConfig();
            const horarioAtencion = obtenerHorarioAtencionParaFecha(config, fecha);

            const inicioMinutos = parseHora(inicio);
            const finMinutos = inicioMinutos + duracionTotal;
            const inicioJornada = horarioAtencion.inicio;
            const finJornada = horarioAtencion.fin;

            if (!horarioAtencion.activo) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No hay atención configurada para ese día' }));
                return;
            }

            if (inicioMinutos < inicioJornada || finMinutos > finJornada) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Horario fuera del rango de atención' }));
                return;
            }

            const bloqueosSolapados = obtenerBloqueosSolapados(config, fecha, inicioMinutos, finMinutos);
            if (bloqueosSolapados.length) {
                const sugerencias = generarHorariosDisponibles(turnos, fecha, duracionTotal, config, colaboradoresCapaces, seleccion);
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'El horario está bloqueado por agenda interna',
                    detalle: bloqueosSolapados.map(b => `${b.desde}-${b.hasta}${b.motivo ? ` (${b.motivo})` : ''}`).join(', '),
                    sugerencias: sugerencias.slice(0, 5)
                }));
                return;
            }

            const advertenciasSobreturno = [];

            if (!['cancelado', 'no_show', 'finalizado'].includes(estado)) {
                const turnosDia = turnos.filter(t => t.fecha === fecha && t.estado !== 'cancelado');
                const hayColaboradores = colaboradoresCapaces.length > 0;

                if (hayColaboradores) {
                    if (colaborador) {
                        const libre = colaboradorEstaLibre(turnosDia, colaborador.id, inicioMinutos, finMinutos);
                        if (!libre) {
                            if (!forzarSobreturno) {
                                const sugerencias = generarHorariosDisponibles(turnos, fecha, duracionTotal, config, colaboradoresCapaces, seleccion);
                                res.writeHead(409, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    error: 'El colaborador seleccionado no está disponible en ese horario',
                                    sugerencias: sugerencias.slice(0, 5),
                                    permiteSobreturno: Boolean(adminSesion)
                                }));
                                return;
                            }
                            advertenciasSobreturno.push('Colaborador ocupado en ese horario');
                        }
                    } else {
                        const candidato = encontrarColaboradorDisponible(turnosDia, colaboradoresCapaces, inicioMinutos, finMinutos, seleccion);
                        if (!candidato) {
                            if (!forzarSobreturno) {
                                const sugerencias = generarHorariosDisponibles(turnos, fecha, duracionTotal, config, colaboradoresCapaces, seleccion);
                                res.writeHead(409, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    error: 'No hay colaboradores disponibles en ese horario',
                                    sugerencias: sugerencias.slice(0, 5),
                                    permiteSobreturno: Boolean(adminSesion)
                                }));
                                return;
                            }
                            const colabSobreturno = encontrarColaboradorMenorCarga(turnosDia, colaboradoresCapaces, seleccion);
                            if (!colabSobreturno) {
                                res.writeHead(409, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'No se pudo asignar colaborador para sobreturno' }));
                                return;
                            }
                            colaborador = colabSobreturno;
                            colaboradorId = colabSobreturno.id;
                            asignadoAutomatico = true;
                            advertenciasSobreturno.push('No había colaboradores libres; se asignó con solapamiento');
                        } else {
                            colaborador = candidato;
                            colaboradorId = candidato.id;
                            asignadoAutomatico = true;
                        }
                    }
                } else if (colaboradores.length > 0) {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Ningún colaborador tiene esos servicios habilitados'
                    }));
                    return;
                } else {
                    for (const turno of turnosDia) {
                        if (turnoSeSolapa(turno, inicioMinutos, finMinutos)) {
                            if (!forzarSobreturno) {
                                const sugerencias = generarHorariosDisponibles(turnos, fecha, duracionTotal, config, null, seleccion);
                                res.writeHead(409, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    error: 'Horario no disponible',
                                    sugerencias: sugerencias.slice(0, 5),
                                    permiteSobreturno: Boolean(adminSesion)
                                }));
                                return;
                            }
                            advertenciasSobreturno.push('Se registró solapamiento en la agenda');
                            break;
                        }
                    }
                }
            }

            const comisionInfo = calcularComisionTurno(seleccion, colaborador);

            const nuevoTurno = {
                id: Date.now().toString(),
                nombre,
                ci,
                telefono,
                servicios: seleccion.map(s => ({
                    id: s.id,
                    nombre: s.nombre,
                    duracion: s.duracion,
                    precio: s.precio,
                    comisionColaborador: s.comisionColaborador
                })),
                servicio: seleccion.length === 1 ? seleccion[0].nombre : '',
                duracion: duracionTotal,
                precio: precioTotal,
                fecha,
                hora,
                estado,
                creado: new Date().toISOString(),
                colaboradorId: colaborador ? colaborador.id : null,
                colaboradorNombre: colaborador ? colaborador.nombre : '',
                colaboradorComision: comisionInfo.comision,
                colaboradorPorcentaje: comisionInfo.porcentaje,
                asignadoAutomatico,
                sobreturno: forzarSobreturno && advertenciasSobreturno.length > 0,
                sobreturnoMotivo: forzarSobreturno ? sobreturnoMotivo : '',
                sobreturnoAdvertencias: advertenciasSobreturno,
                notaInterna,
                contactos: 0,
                ultimoContacto: null,
                contactoHistorial: [],
                checkInAt: null,
                checkOutAt: null,
                tiempoServicioMin: 0
            };

            turnos.push(nuevoTurno);
            writeJSON(turnosPath, turnos);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                turno: nuevoTurno,
                warning: nuevoTurno.sobreturno ? 'Turno guardado como sobreturno' : null
            }));
            return;
        }

        if (req.method === 'PUT') {
            const usuario = verificarAuth(req, ['admin', 'colaborador']);
            if (!usuario) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'No autorizado' }));
                return;
            }
            const esColaborador = usuario.rol === 'colaborador';

            const data = await parseBody(req);
            if (rejectInvalidBody(req, res, data, 'ID requerido')) return;
            const id = sanitizeText(data?.id, 40);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }

            const index = turnos.findIndex(t => t.id === id);
            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Turno no encontrado' }));
                return;
            }

            const estado = data.estado !== undefined
                ? normalizarEstadoTurno(data.estado, normalizarEstadoTurno(turnos[index].estado, 'pendiente'))
                : normalizarEstadoTurno(turnos[index].estado, 'pendiente');
            const forzarSobreturno = Boolean(!esColaborador && data?.forzarSobreturno === true);
            const sobreturnoMotivo = forzarSobreturno
                ? sanitizeText(data?.sobreturnoMotivo, 120)
                : sanitizeText(turnos[index].sobreturnoMotivo || '', 120);

            if (esColaborador && turnos[index].colaboradorId !== usuario.id) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: 'No puedes modificar turnos de otro colaborador' }));
                return;
            }
            const colaboradorOriginalId = turnos[index].colaboradorId || null;

            const contactos = esColaborador ? (turnos[index].contactos || 0) : (data.contactos !== undefined
                ? sanitizeNumber(data.contactos, turnos[index].contactos || 0, { min: 0, max: 999 })
                : (turnos[index].contactos || 0));

            let ultimoContacto = turnos[index].ultimoContacto;
            if (data.ultimoContacto === null) {
                ultimoContacto = null;
            } else if (data.ultimoContacto !== undefined) {
                const iso = sanitizeIsoDateTime(data.ultimoContacto);
                if (iso) ultimoContacto = iso;
            }

            let contactoHistorial = Array.isArray(turnos[index].contactoHistorial)
                ? [...turnos[index].contactoHistorial]
                : [];
            if (!esColaborador && data.contactoHistorial) {
                const evento = data.contactoHistorial;
                const fechaEvento = sanitizeIsoDateTime(evento.fecha) || new Date().toISOString();
                const canal = sanitizeText(evento.canal || 'contacto', 20) || 'contacto';
                const mensaje = sanitizeText(evento.mensaje || '', 240);
                contactoHistorial.push({ fecha: fechaEvento, canal, mensaje });
                if (contactoHistorial.length > 200) {
                    contactoHistorial = contactoHistorial.slice(-200);
                }
            }

            const nombre = esColaborador ? turnos[index].nombre : (data.nombre !== undefined ? sanitizeText(data.nombre, 80) : turnos[index].nombre);
            const ci = esColaborador ? turnos[index].ci : (data.ci !== undefined ? sanitizeDigits(data.ci, 20) : turnos[index].ci);
            const telefono = esColaborador ? turnos[index].telefono : (data.telefono !== undefined ? sanitizeDigits(data.telefono, 20) : turnos[index].telefono);
            const notaInterna = data.notaInterna !== undefined
                ? sanitizeText(data.notaInterna, 400)
                : sanitizeText(turnos[index].notaInterna || '', 400);

            let checkInAt = turnos[index].checkInAt || null;
            if (data.checkInAt !== undefined) {
                if (data.checkInAt === null || data.checkInAt === '') {
                    checkInAt = null;
                } else {
                    const iso = sanitizeIsoDateTime(data.checkInAt);
                    if (!iso) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Check-in inválido' }));
                        return;
                    }
                    checkInAt = iso;
                }
            }

            let checkOutAt = turnos[index].checkOutAt || null;
            if (data.checkOutAt !== undefined) {
                if (data.checkOutAt === null || data.checkOutAt === '') {
                    checkOutAt = null;
                } else {
                    const iso = sanitizeIsoDateTime(data.checkOutAt);
                    if (!iso) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Check-out inválido' }));
                        return;
                    }
                    checkOutAt = iso;
                }
            }

            if (checkInAt && checkOutAt && new Date(checkOutAt).getTime() < new Date(checkInAt).getTime()) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Check-out no puede ser anterior al check-in' }));
                return;
            }

            const actualizarServicios = esColaborador ? false : (data.servicios !== undefined || data.serviciosNombres !== undefined || data.servicio !== undefined);
            const colaboradores = readJSON(usuariosPath, []).filter(u => u.rol === 'colaborador' && u.activo !== false);
            let serviciosFinal = Array.isArray(turnos[index].servicios) ? turnos[index].servicios : [];
            let duracionTotal = parseInt(turnos[index].duracion) || 0;
            let precioTotal = parseInt(turnos[index].precio) || 0;

            if (actualizarServicios) {
                const serviciosCatalogo = readJSON(serviciosPath, []);
                const { seleccion, duracionTotal: nuevaDuracion, precioTotal: nuevoPrecio } = normalizeServiciosSelection(data, serviciosCatalogo);
                if (!seleccion.length) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Servicio no encontrado' }));
                    return;
                }
                serviciosFinal = seleccion.map(s => ({
                    id: s.id,
                    nombre: s.nombre,
                    duracion: s.duracion,
                    precio: s.precio,
                    comisionColaborador: s.comisionColaborador
                }));
                duracionTotal = nuevaDuracion;
                precioTotal = nuevoPrecio;
            }

            const colaboradoresCapaces = colaboradores.filter(c => colaboradorPuedeAtender(c, serviciosFinal));

            const colaboradorInputRaw = data.colaboradorId !== undefined
                ? sanitizeText(data.colaboradorId, 60)
                : undefined;
            let colaboradorId = colaboradorOriginalId;
            if (data.colaboradorId !== undefined) {
                colaboradorId = colaboradorInputRaw ? colaboradorInputRaw : null;
            }

            let asignadoAutomatico = turnos[index].asignadoAutomatico || false;
            if (esColaborador) {
                if (data.colaboradorId === undefined) {
                    colaboradorId = colaboradorOriginalId || usuario.id;
                } else if (!colaboradorInputRaw) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Debes seleccionar un colaborador para reasignar' }));
                    return;
                } else {
                    colaboradorId = colaboradorInputRaw;
                }
                asignadoAutomatico = false;
            }

            let colaborador = colaboradorId ? colaboradores.find(c => c.id === colaboradorId) : null;
            if (colaboradorInputRaw && !colaborador) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Colaborador no encontrado' }));
                return;
            }

            if (colaborador && !colaboradorPuedeAtender(colaborador, serviciosFinal)) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'El colaborador seleccionado no realiza todos los servicios elegidos' }));
                return;
            }

            const fecha = esColaborador
                ? (data.fecha !== undefined ? sanitizeDate(data.fecha) : turnos[index].fecha)
                : (data.fecha !== undefined ? sanitizeDate(data.fecha) : turnos[index].fecha);
            if (data.fecha !== undefined && !fecha) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Fecha inválida' }));
                return;
            }
            const hora = esColaborador
                ? (data.hora !== undefined ? sanitizeTime(data.hora) : turnos[index].hora)
                : (data.hora !== undefined ? sanitizeTime(data.hora) : turnos[index].hora);
            if (data.hora !== undefined && !hora) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Hora inválida' }));
                return;
            }

            if (esColaborador && (data.fecha !== undefined || data.hora !== undefined)) {
                const estadoActual = normalizarEstadoTurno(turnos[index].estado, 'pendiente');
                if (['cancelado', 'finalizado', 'no_show'].includes(estadoActual)) {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No puedes reprogramar un turno finalizado, no-show o cancelado' }));
                    return;
                }
                const fechaHoraNuevo = new Date(`${fecha || ''}T${hora || '00:00'}`);
                if (Number.isNaN(fechaHoraNuevo.getTime())) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Fecha u hora inválida para reprogramación' }));
                    return;
                }
                const ahora = Date.now();
                const limite = new Date();
                limite.setDate(limite.getDate() + 21);
                if (fechaHoraNuevo.getTime() < ahora || fechaHoraNuevo.getTime() > limite.getTime()) {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Solo puedes reprogramar entre hoy y los próximos 21 días' }));
                    return;
                }
            }

            const estadoAnterior = turnos[index].estado;
            const estadoAnteriorCanon = normalizarEstadoTurno(estadoAnterior, 'pendiente');
            const cambioColaborador = colaboradorId !== colaboradorOriginalId;
            const estadoCanon = normalizarEstadoTurno(estado, 'pendiente');
            const estadoCerradoAntes = ['cancelado', 'no_show', 'finalizado'].includes(estadoAnteriorCanon);
            const estadoActivoAhora = !['cancelado', 'no_show', 'finalizado'].includes(estadoCanon);
            const requiereValidacion = actualizarServicios ||
                fecha !== turnos[index].fecha ||
                hora !== turnos[index].hora ||
                cambioColaborador ||
                (estadoCerradoAntes && estadoActivoAhora);

            if (requiereValidacion && !['cancelado', 'no_show', 'finalizado'].includes(estadoCanon)) {
                if (!hora || !fecha) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Fecha u hora inválida' }));
                    return;
                }
                const config = readConfig();
                const inicioMinutos = parseHora(hora);
                const finMinutos = inicioMinutos + duracionTotal;
                const horarioAtencion = obtenerHorarioAtencionParaFecha(config, fecha);
                const inicioJornada = horarioAtencion.inicio;
                const finJornada = horarioAtencion.fin;

                if (!horarioAtencion.activo) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No hay atención configurada para ese día' }));
                    return;
                }

                if (inicioMinutos < inicioJornada || finMinutos > finJornada) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Horario fuera del rango de atención' }));
                    return;
                }

                const bloqueosSolapados = obtenerBloqueosSolapados(config, fecha, inicioMinutos, finMinutos);
                if (bloqueosSolapados.length) {
                    const sugerencias = generarHorariosDisponibles(turnos, fecha, duracionTotal, config, colaboradoresCapaces, serviciosFinal);
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'El horario está bloqueado por agenda interna',
                        detalle: bloqueosSolapados.map(b => `${b.desde}-${b.hasta}${b.motivo ? ` (${b.motivo})` : ''}`).join(', '),
                        sugerencias: sugerencias.slice(0, 5)
                    }));
                    return;
                }

                const turnosDia = turnos.filter(t => t.fecha === fecha && t.estado !== 'cancelado' && t.id !== id);
                const hayColaboradores = colaboradoresCapaces.length > 0;
                const advertenciasSobreturno = [];

                if (hayColaboradores) {
                    if (colaborador) {
                        const libre = colaboradorEstaLibre(turnosDia, colaborador.id, inicioMinutos, finMinutos);
                        if (!libre) {
                            if (!forzarSobreturno) {
                                const sugerencias = generarHorariosDisponibles(turnos, fecha, duracionTotal, config, colaboradoresCapaces, serviciosFinal);
                                res.writeHead(409, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    error: 'El colaborador seleccionado no está disponible en ese horario',
                                    sugerencias: sugerencias.slice(0, 5),
                                    permiteSobreturno: !esColaborador
                                }));
                                return;
                            }
                            advertenciasSobreturno.push('Colaborador ocupado en ese horario');
                        }
                    } else {
                        const candidato = encontrarColaboradorDisponible(turnosDia, colaboradoresCapaces, inicioMinutos, finMinutos, serviciosFinal);
                        if (!candidato) {
                            if (!forzarSobreturno) {
                                const sugerencias = generarHorariosDisponibles(turnos, fecha, duracionTotal, config, colaboradoresCapaces, serviciosFinal);
                                res.writeHead(409, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    error: 'No hay colaboradores disponibles en ese horario',
                                    sugerencias: sugerencias.slice(0, 5),
                                    permiteSobreturno: !esColaborador
                                }));
                                return;
                            }
                            const colabSobreturno = encontrarColaboradorMenorCarga(turnosDia, colaboradoresCapaces, serviciosFinal);
                            if (!colabSobreturno) {
                                res.writeHead(409, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'No se pudo asignar colaborador para sobreturno' }));
                                return;
                            }
                            colaborador = colabSobreturno;
                            colaboradorId = colabSobreturno.id;
                            asignadoAutomatico = true;
                            advertenciasSobreturno.push('No había colaboradores libres; se reasignó con solapamiento');
                        } else {
                            colaborador = candidato;
                            colaboradorId = candidato.id;
                            asignadoAutomatico = true;
                        }
                    }
                } else if (colaboradores.length > 0) {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Ningún colaborador tiene esos servicios habilitados' }));
                    return;
                } else {
                    for (const turno of turnosDia) {
                        if (turnoSeSolapa(turno, inicioMinutos, finMinutos)) {
                            if (!forzarSobreturno) {
                                const sugerencias = generarHorariosDisponibles(turnos, fecha, duracionTotal, config, null, serviciosFinal);
                                res.writeHead(409, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    error: 'Horario no disponible',
                                    sugerencias: sugerencias.slice(0, 5),
                                    permiteSobreturno: !esColaborador
                                }));
                                return;
                            }
                            advertenciasSobreturno.push('Se mantuvo un solapamiento de horario');
                            break;
                        }
                    }
                }

                if (forzarSobreturno && advertenciasSobreturno.length) {
                    turnos[index].sobreturno = true;
                    turnos[index].sobreturnoMotivo = sobreturnoMotivo;
                    turnos[index].sobreturnoAdvertencias = advertenciasSobreturno;
                } else if (!forzarSobreturno) {
                    turnos[index].sobreturno = Boolean(turnos[index].sobreturno);
                    turnos[index].sobreturnoMotivo = sanitizeText(turnos[index].sobreturnoMotivo || '', 120);
                    turnos[index].sobreturnoAdvertencias = Array.isArray(turnos[index].sobreturnoAdvertencias)
                        ? turnos[index].sobreturnoAdvertencias.slice(0, 10).map(item => sanitizeText(item, 120)).filter(Boolean)
                        : [];
                }
            }

            const comisionInfo = calcularComisionTurno(serviciosFinal, colaborador);
            if (!checkInAt) checkOutAt = null;
            let estadoFinal = estado;
            if (checkInAt && !checkOutAt && ['pendiente', 'confirmado', 'en_camino'].includes(estadoFinal)) {
                estadoFinal = 'en_servicio';
            }
            if (checkInAt && checkOutAt && !['cancelado', 'no_show'].includes(estadoFinal)) {
                estadoFinal = 'finalizado';
            }
            let tiempoServicioMin = parseInt(turnos[index].tiempoServicioMin, 10) || 0;
            if (checkInAt && checkOutAt) {
                tiempoServicioMin = Math.max(0, Math.round((new Date(checkOutAt).getTime() - new Date(checkInAt).getTime()) / 60000));
            }
            const sobreturnoAdvertencias = Array.isArray(turnos[index].sobreturnoAdvertencias)
                ? turnos[index].sobreturnoAdvertencias.map(item => sanitizeText(item, 120)).filter(Boolean).slice(0, 10)
                : [];

            turnos[index] = {
                ...turnos[index],
                nombre,
                ci,
                telefono,
                estado: estadoFinal,
                contactos,
                ultimoContacto,
                contactoHistorial,
                servicios: serviciosFinal,
                duracion: duracionTotal,
                precio: precioTotal,
                fecha,
                hora,
                colaboradorId: colaborador ? colaborador.id : null,
                colaboradorNombre: colaborador ? colaborador.nombre : (turnos[index].colaboradorNombre || ''),
                colaboradorComision: comisionInfo.comision,
                colaboradorPorcentaje: comisionInfo.porcentaje,
                asignadoAutomatico,
                sobreturno: Boolean(turnos[index].sobreturno),
                sobreturnoMotivo: sanitizeText(turnos[index].sobreturnoMotivo || sobreturnoMotivo || '', 120),
                sobreturnoAdvertencias,
                notaInterna,
                checkInAt,
                checkOutAt,
                tiempoServicioMin,
                servicio: serviciosFinal.length === 1 ? serviciosFinal[0].nombre : (turnos[index].servicio || ''),
                id: turnos[index].id,
                creado: turnos[index].creado
            };

            writeJSON(turnosPath, turnos);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, turno: turnos[index] }));
            return;
        }

        if (req.method === 'DELETE') {
            const usuario = verificarAuth(req);
            if (!usuario) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'No autorizado' }));
                return;
            }

            const id = sanitizeText(query.id, 40);
            if (!id) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'ID requerido' }));
                return;
            }
            const index = turnos.findIndex(t => t.id === id);

            if (index === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Turno no encontrado' }));
                return;
            }

            turnos.splice(index, 1);
            writeJSON(turnosPath, turnos);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }
    }

    
    // BACKUPS
    if (pathname === '/api/backups' && req.method === 'GET') {
        const usuario = verificarAuth(req);
        if (!usuario) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'No autorizado' }));
            return;
        }

        try {
            const files = fs.readdirSync(backupsDir)
                .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
                .map(f => {
                    const stats = fs.statSync(path.join(backupsDir, f));
                    return { name: f, size: stats.size, updatedAt: stats.mtime.toISOString() };
                })
                .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                .slice(0, 2);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ backups: files }));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Error listando backups' }));
        }
        return;
    }

    if (pathname === '/api/backups/download' && req.method === 'GET') {
        const usuario = verificarAuth(req);
        if (!usuario) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'No autorizado' }));
            return;
        }

        const filePath = resolveBackupPath(query.file);
        if (!filePath) {
            res.writeHead(400);
            res.end('Archivo inválido');
            return;
        }

        if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end('Archivo no encontrado');
            return;
        }

        const fileName = path.basename(filePath);
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${fileName}"`
        });
        fs.createReadStream(filePath).pipe(res);
        return;
    }

// DISPONIBILIDAD
    if (pathname === '/api/disponibilidad' && req.method === 'GET') {
        const fecha = sanitizeDate(query.fecha);
        const servicio = query.servicio ? sanitizeText(query.servicio, 60) : null;
        const servicios = query.servicios ? query.servicios : null;
        const horaSeleccionada = query.hora ? sanitizeTime(query.hora) : null;

        if (!fecha || (!servicio && !servicios)) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Fecha y servicio(s) requeridos' }));
            return;
        }

        const serviciosCatalogo = readJSON(serviciosPath, []);
        const turnos = readJSON(turnosPath, []);
        const colaboradores = readJSON(usuariosPath, []).filter(u => u.rol === 'colaborador' && u.activo !== false);
        const config = readConfig();
        const horarioAtencion = obtenerHorarioAtencionParaFecha(config, fecha);
        const bloqueosFecha = obtenerBloqueosPorFecha(config, fecha);

        let data = {};
        if (servicios) {
            data.servicios = servicios.split(',')
                .map(item => sanitizeText(item, 60))
                .filter(Boolean);
        } else if (servicio) {
            data.servicio = servicio;
        }

        const { seleccion, duracionTotal } = normalizeServiciosSelection(data, serviciosCatalogo);
        if (!seleccion.length) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Servicio no encontrado' }));
            return;
        }

        const colaboradoresCapaces = colaboradores.filter(c => colaboradorPuedeAtender(c, seleccion));
        const horariosDisponibles = generarHorariosDisponibles(turnos, fecha, duracionTotal, config, colaboradoresCapaces, seleccion);

        let colaboradoresDisponibles = [];
        if (horaSeleccionada && duracionTotal > 0) {
            const turnosDia = turnos.filter(t => t.fecha === fecha && t.estado !== 'cancelado');
            const inicio = parseHora(horaSeleccionada);
            const fin = inicio + duracionTotal;
            colaboradoresDisponibles = colaboradoresCapaces
                .filter(colab => colaboradorEstaLibre(turnosDia, colab.id, inicio, fin))
                .map(colab => ({
                    id: colab.id,
                    nombre: colab.nombre,
                    foto: colab.foto || '',
                    color: colab.color || ''
                }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            horariosDisponibles,
            duracionTotal,
            colaboradoresDisponibles,
            horarioAtencion: {
                activo: horarioAtencion.activo,
                apertura: horarioAtencion.apertura,
                cierre: horarioAtencion.cierre
            },
            bloqueos: bloqueosFecha
        }));
        return;
    }

    
    // BACKUPS RESTORE
    if (pathname === '/api/backups/restore' && req.method === 'POST') {
        const usuario = verificarAuth(req);
        if (!usuario) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'No autorizado' }));
            return;
        }

        const data = await parseBody(req);
        if (rejectInvalidBody(req, res, data, 'Archivo inválido')) return;
        const filePath = resolveBackupPath(data && data.file);
        if (!filePath) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Archivo inválido' }));
            return;
        }

        if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Archivo no encontrado' }));
            return;
        }

        try {
            const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (!payload || !Array.isArray(payload.servicios) || !Array.isArray(payload.turnos)) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Backup inválido' }));
                return;
            }
            const lookbookData = Array.isArray(payload.lookbook) ? payload.lookbook : [];
            const giftcardsData = Array.isArray(payload.giftcards) ? payload.giftcards : [];
            const bannersData = Array.isArray(payload.banners) ? payload.banners : [];
            const sorteosData = Array.isArray(payload.sorteos) ? payload.sorteos : [];
            const usuariosData = Array.isArray(payload.usuarios) ? payload.usuarios : null;
            const configData = payload.config ? { ...defaultConfig, ...payload.config } : null;
            writeJSON(serviciosPath, payload.servicios);
            writeJSON(turnosPath, payload.turnos);
            writeJSON(lookbookPath, lookbookData);
            writeJSON(giftcardsPath, giftcardsData);
            writeJSON(bannersPath, bannersData);
            writeJSON(sorteosPath, sorteosData);
            if (usuariosData) writeJSON(usuariosPath, usuariosData);
            if (configData) writeJSON(configPath, configData);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Error restaurando backup' }));
        }
        return;
    }

// ADMIN
    if (pathname === '/admin' || pathname === '/admin/') {
        const usuario = verificarAuth(req);
        if (!usuario) {
            serveStatic(req, res, path.join(publicDir, 'login.html'), 'text/html');
        } else {
            serveStatic(req, res, path.join(publicDir, 'admin.html'), 'text/html');
        }
        return;
    }

    // COLABORADOR
    if (pathname === '/colaborador' || pathname === '/colaborador/') {
        const usuario = verificarAuth(req, ['colaborador', 'admin']);
        if (!usuario) {
            serveStatic(req, res, path.join(publicDir, 'login.html'), 'text/html');
        } else if (usuario.rol === 'admin') {
            serveStatic(req, res, path.join(publicDir, 'admin.html'), 'text/html');
        } else {
            serveStatic(req, res, path.join(publicDir, 'colaborador.html'), 'text/html');
        }
        return;
    }

    // ARCHIVOS ESTATICOS
    const ext = path.extname(pathname);
    const types = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.json': 'application/json',
        '.txt': 'text/plain'
    };

    if (pathname === '/' || pathname === '/index.html') {
        serveStatic(req, res, path.join(publicDir, 'index.html'), 'text/html');
    } else if (pathname === '/login.html') {
        serveStatic(req, res, path.join(publicDir, 'login.html'), 'text/html');
    } else if (adminAssets.has(pathname)) {
        const usuario = verificarAuth(req);
        if (!usuario) {
            if (pathname === '/admin.html') {
                serveStatic(req, res, path.join(publicDir, 'login.html'), 'text/html');
            } else {
                res.writeHead(401);
                res.end('No autorizado');
            }
            return;
        }
        const filePath = path.join(publicDir, pathname.replace(/^\/+/, ''));
        serveStatic(req, res, filePath, types[ext] || 'application/octet-stream');
    } else if (collaboratorAssets.has(pathname)) {
        const usuario = verificarAuth(req, ['colaborador', 'admin']);
        if (!usuario) {
            if (pathname === '/colaborador.html') {
                serveStatic(req, res, path.join(publicDir, 'login.html'), 'text/html');
            } else {
                res.writeHead(401);
                res.end('No autorizado');
            }
            return;
        }
        const filePath = path.join(publicDir, pathname.replace(/^\/+/, ''));
        serveStatic(req, res, filePath, types[ext] || 'application/octet-stream');
    } else if (types[ext]) {
        const safePath = pathname.replace(/^\/+/, '');
        const filePath = path.join(publicDir, safePath);
        const normalized = path.normalize(filePath);

        if (!normalized.startsWith(publicDir)) {
            res.writeHead(400);
            res.end('Bad Request');
            return;
        }

        serveStatic(req, res, normalized, types[ext]);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`Sistema activo: http://localhost:${PORT}`);
    console.log(`Página principal: http://localhost:${PORT}/`);
    console.log(`Panel admin: http://localhost:${PORT}/admin`);
});

