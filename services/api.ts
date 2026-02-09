import {
  AppConfig,
  TickerData,
  RowItem,
  DriveImage,
  GiftItem,
  AuthUser,
  UserRecord,
} from '../types';

/**
 * ✅ API_BASE phải đúng Web App URL đang Deploy (Production)
 */
const API_BASE_RAW =
  'https://script.google.com/macros/s/AKfycbzQzgJsM_RVV5CcHxoLxFHD6SI3TevaCdKTLtZaLukjiho4CcZA66zDlq4OQ9RH63dd/exec';

function normalizeApiBase(base: string) {
  let b = String(base || '').trim();
  while (b.endsWith('/')) b = b.slice(0, -1);
  if (!b.endsWith('/exec')) b = `${b}/exec`;
  return b;
}

const API_BASE = normalizeApiBase(API_BASE_RAW);

/** ================== AUTH (token + cached user) ================== */
const TOKEN_KEY = 'ticker_auth_token';
const USER_KEY = 'ticker_auth_user';

export function getAuthToken(): string {
  try {
    return String(localStorage.getItem(TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setAuthToken(token: string) {
  const t = String(token || '').trim();
  try {
    if (!t) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, t);
  } catch {}
}

export function getCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setCachedUser(user: AuthUser | null) {
  try {
    if (!user) localStorage.removeItem(USER_KEY);
    else localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {}
}

export function logout() {
  setAuthToken('');
  setCachedUser(null);
}

/** Helper: check quyền tab theo allowed_tabs */
export function hasTabPermission(user: AuthUser | null | undefined, tab: string): boolean {
  if (!user) return false;
  const role = String((user as any).role || '').toUpperCase();
  if (role === 'ADMIN') return true;

  const allow = String((user as any).allowed_tabs || '')
    .split(',')
    .map((s) => String(s || '').trim().toUpperCase())
    .filter(Boolean);

  const t = String(tab || '').trim().toUpperCase();
  return allow.includes(t);
}

/** ================== JSONP helper (vượt CORS) ================== */
function jsonp<T>(url: string, timeoutMs = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cbName = `__jsonp_cb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const sep = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${sep}callback=${cbName}&_t=${Date.now()}`;

    let done = false;

    (window as any)[cbName] = (data: T) => {
      done = true;
      cleanup();
      resolve(data);
    };

    const script = document.createElement('script');
    script.src = fullUrl;
    script.async = true;

    script.referrerPolicy = 'no-referrer';
    (script as any).crossOrigin = 'anonymous';

    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(`JSONP timeout: ${url}`));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      try {
        delete (window as any)[cbName];
      } catch {}
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(`JSONP load error: ${url}`));
    };

    document.head.appendChild(script);
  });
}

function ensureOk(resp: any) {
  if (!resp) throw new Error('No response from server');
  if (resp.ok === false) {
    const msg = resp.error || resp.message || 'Server returned ok=false';
    const m = String(msg).toLowerCase();
    if (m.includes('unauthorized')) throw new Error('UNAUTHORIZED');
    if (m.includes('forbidden')) throw new Error('FORBIDDEN');
    throw new Error(String(msg));
  }
}

/**
 * ✅ Luôn ép action về lowercase để khớp doGet/doPost (toLowerCase) ở Code.gs
 * ✅ Tự động gắn token nếu có
 */
function buildUrl(action: string, params?: Record<string, any>) {
  const u = new URL(API_BASE);
  u.searchParams.set('action', String(action || '').toLowerCase());

  const token = getAuthToken();
  if (token) u.searchParams.set('token', token);

  if (params) {
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v === undefined || v === null) return;

      // Chỉ stringify nếu là object/array (tránh stringify số/boolean vô ích)
      if (typeof v === 'object') u.searchParams.set(k, JSON.stringify(v));
      else u.searchParams.set(k, String(v));
    });
  }
  return u.toString();
}

/**
 * ✅ Payload JSON cho các action mutation (GET/JSONP)
 * ✅ Tự động gắn token nếu có
 */
function buildPayloadUrl(action: string, payloadObj?: any, extraParams?: Record<string, string>) {
  const u = new URL(API_BASE);
  u.searchParams.set('action', String(action || '').toLowerCase());

  const token = getAuthToken();
  if (token) u.searchParams.set('token', token);

  if (payloadObj !== undefined) {
    u.searchParams.set('payload', JSON.stringify(payloadObj ?? {}));
  }
  if (extraParams) {
    for (const key in extraParams) u.searchParams.set(key, extraParams[key]);
  }
  return u.toString();
}

/** ================== AUTH APIs ================== */
export const login = async (
  username: string,
  password: string
): Promise<{ token: string; user: AuthUser }> => {
  const payload = {
    username: String(username || '').trim(),
    password: String(password || '').trim(),
  };

  const resp: any = await jsonp<any>(buildPayloadUrl('login', payload));
  ensureOk(resp);

  const token = String(resp.token || '').trim();
  if (!token) throw new Error('Login failed: missing token');

  setAuthToken(token);

  const user = (resp.user || {}) as AuthUser;
  setCachedUser(user);

  return { token, user };
};

export const fetchMe = async (): Promise<AuthUser> => {
  const resp: any = await jsonp<any>(buildUrl('me'));
  ensureOk(resp);
  const user = (resp.user || {}) as AuthUser;
  setCachedUser(user);
  return user;
};

/** ================== CONFIG ================== */
function toBool(v: any): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes';
}
function toNum(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const fetchConfig = async (): Promise<AppConfig> => {
  const resp: any = await jsonp<any>(buildUrl('config'));
  ensureOk(resp);

  const data: any = resp;
  const fontSize = toNum(data.fontSize, 48);
  const defaultBarHeight = Math.floor(fontSize * 2.2);

  return {
    speed: toNum(data.speed, 120),
    position: (data.position as any) || 'bottom',
    direction: (data.direction as any) || 'rtl',

    bgType: (data.bgType as any) || 'image',
    bgYoutube: String(data.bgYoutube ?? ''),
    bgYoutubeEmbed: data.bgYoutubeEmbed ? String(data.bgYoutubeEmbed) : undefined,
    bgVideo: String(data.bgVideo ?? ''),
    bgImage: String(data.bgImage ?? 'https://picsum.photos/1920/1080'),

    bgFolderId: String(data.bgFolderId ?? ''),
    bgRotateSec: toNum(data.bgRotateSec, 10),

    bgValue: data.bgValue ? String(data.bgValue) : undefined,

    refreshSec: toNum(data.refreshSec, 60),
    separator: String(data.separator ?? ' - '),
    showClass: toBool(data.showClass),
    fontSize: fontSize,
    textColor: String(data.textColor ?? '#ffffff'),
    barColor: String(data.barColor ?? 'rgba(0,0,0,0.45)'),

    barHeight: toNum(data.barHeight, defaultBarHeight),
    barBorderColor: String(data.barBorderColor ?? 'rgba(255,255,255,0.1)'),
    barBorderSize: toNum(data.barBorderSize, 0),

    scrollbarColor: String(data.scrollbarColor ?? '#374151'),
    scrollbarWidth: toNum(data.scrollbarWidth, 8),

    loseSlots: Math.max(0, Math.floor(toNum(data.loseSlots, 0))),
    spinDuration: toNum(data.spinDuration, 4.2),

    effectMai: toBool(data.effectMai),
    effectMaiDensity: toNum(data.effectMaiDensity, 20),
    effectPeach: toBool(data.effectPeach),
    effectPeachDensity: toNum(data.effectPeachDensity, 20),
    effectPhaoHoa: toBool(data.effectPhaoHoa),
    effectPhaoHoaDensity: toNum(data.effectPhaoHoaDensity, 5),
    effectSparkles: toBool(data.effectSparkles),

    totalShowInterval: toNum(data.totalShowInterval, 300),
    totalShowDuration: toNum(data.totalShowDuration, 10),
  };
};

export const saveConfig = async (config: Partial<AppConfig>): Promise<void> => {
  const resp: any = await jsonp<any>(buildPayloadUrl('saveconfig', config));
  ensureOk(resp);
};

/** ================== TICKER DATA ================== */
export const fetchData = async (): Promise<TickerData> => {
  const resp: any = await jsonp<any>(buildUrl('data'));
  ensureOk(resp);
  return {
    rows: Array.isArray(resp.rows) ? resp.rows : [],
    tickerText: String(resp.tickerText ?? ''),
  };
};

/** ================== BACKGROUND IMAGES (FOLDER) ================== */
export const listImages = async (folderId: string): Promise<DriveImage[]> => {
  const fid = String(folderId || '').trim();
  if (!fid) return [];
  const resp: any = await jsonp<any>(buildUrl('listimages', { folderId: fid }));
  ensureOk(resp);
  const images = Array.isArray(resp.images) ? resp.images : [];
  return images
    .map((x: any) => ({
      id: String(x?.id ?? ''),
      name: String(x?.name ?? ''),
      url: String(x?.url ?? ''),
    }))
    .filter((x: DriveImage) => !!x.url);
};

/** ================== DATA ENTRY (CRUD) ================== */
export const listRows = async (): Promise<RowItem[]> => {
  const resp: any = await jsonp<any>(buildUrl('listrows'));
  ensureOk(resp);
  const rows = Array.isArray(resp.rows) ? resp.rows : [];
  return rows.map((r: any) => ({
    rowIndex: Number(r.rowIndex),
    stt: Number(r.stt),
    name: String(r.name ?? ''),
    cls: String(r.cls ?? ''),
    money: Number(r.money ?? 0),
  }));
};

export const addRow = async (payload: { name: string; cls?: string; money: number }): Promise<void> => {
  const resp: any = await jsonp<any>(buildPayloadUrl('addrow', payload));
  ensureOk(resp);
};

export const updateRow = async (payload: RowItem): Promise<void> => {
  const resp: any = await jsonp<any>(buildPayloadUrl('updaterow', payload));
  ensureOk(resp);
};

export const deleteRow = async (rowIndex: number): Promise<void> => {
  const resp: any = await jsonp<any>(buildPayloadUrl('deleterow', { rowIndex }));
  ensureOk(resp);
};

/** ================== CLASSES (LOP) ================== */
export const listClasses = async (): Promise<string[]> => {
  const resp: any = await jsonp<any>(buildUrl('listclasses'));
  ensureOk(resp);
  const classes = Array.isArray(resp.classes) ? resp.classes : [];
  const normalized = classes.map((x: any) => String(x ?? ''));
  if (normalized.length === 0 || normalized[0] !== '') normalized.unshift('');
  return normalized;
};

/** ================== GIFTS (QUA) — use `id` ưu tiên ================== */
function mapGift(g: any): GiftItem {
  return {
    rowIndex: Number(g.rowIndex),
    id: g.id ? String(g.id) : undefined,
    name: String(g.name ?? ''),
    spun: Boolean(g.spun),
    time: g.time ? String(g.time) : undefined,
  };
}

export const listGifts = async (): Promise<GiftItem[]> => {
  const resp: any = await jsonp<any>(buildUrl('listgifts'));
  ensureOk(resp);
  const gifts = Array.isArray(resp.gifts) ? resp.gifts : [];
  return gifts.map(mapGift).filter((g: GiftItem) => !!g.name);
};

export const listGiftsAll = async (): Promise<GiftItem[]> => {
  const resp: any = await jsonp<any>(buildUrl('listgiftsall'));
  ensureOk(resp);
  const gifts = Array.isArray(resp.gifts) ? resp.gifts : [];
  return gifts.map(mapGift).filter((g: GiftItem) => !!g.name);
};

export const addGift = async (name: string): Promise<{ rowIndex: number; id?: string }> => {
  const resp: any = await jsonp<any>(
    buildPayloadUrl('addgift', { name: String(name || '').trim() })
  );
  ensureOk(resp);
  return { rowIndex: Number(resp.rowIndex ?? 0), id: resp.id ? String(resp.id) : undefined };
};

export const updateGift = async (gift: { id?: string; rowIndex?: number; name: string }): Promise<void> => {
  const payload: any = { name: String(gift.name || '').trim() };
  if (gift.id) payload.id = String(gift.id);
  else if (gift.rowIndex) payload.rowIndex = Number(gift.rowIndex);
  const resp: any = await jsonp<any>(buildPayloadUrl('updategift', payload));
  ensureOk(resp);
};

export const deleteGift = async (gift: { id?: string; rowIndex?: number }): Promise<void> => {
  const payload: any = {};
  if (gift.id) payload.id = String(gift.id);
  else if (gift.rowIndex) payload.rowIndex = Number(gift.rowIndex);
  const resp: any = await jsonp<any>(buildPayloadUrl('deletegift', payload));
  ensureOk(resp);
};

export const markGift = async (gift: { id?: string; rowIndex?: number }): Promise<GiftItem> => {
  const payload: any = {};
  if (gift.id) payload.id = String(gift.id);
  else if (gift.rowIndex) payload.rowIndex = Number(gift.rowIndex);
  const resp: any = await jsonp<any>(buildPayloadUrl('markgift', payload));
  ensureOk(resp);
  const g = resp.gift ?? resp;
  return mapGift(g);
};

export const resetGifts = async (): Promise<void> => {
  const resp: any = await jsonp<any>(buildUrl('resetgifts'));
  ensureOk(resp);
};

/** ================== ACCOUNTS (ADMIN) ================== */
export const listUsers = async (): Promise<UserRecord[]> => {
  const resp: any = await jsonp<any>(buildUrl('listusers'));
  ensureOk(resp);
  const users = Array.isArray(resp.users) ? resp.users : [];
  return users.map((u: any) => ({
    username: String(u.username ?? ''),
    full_name: u.full_name ? String(u.full_name) : '',
    role: u.role ? String(u.role) : '',
    allowed_tabs: u.allowed_tabs ? String(u.allowed_tabs) : '',
    status: u.status ? String(u.status) : '',
    valid_from: u.valid_from ? String(u.valid_from) : '',
    valid_to: u.valid_to ? String(u.valid_to) : '',
    last_login: u.last_login ? String(u.last_login) : '',
  }));
};

export const addUser = async (payload: {
  username: string;
  full_name?: string;
  password: string;
  role: 'ADMIN' | 'USER' | string;
  allowed_tabs?: string;
  status?: 'ACTIVE' | 'DISABLED' | string;
  valid_from?: string;
  valid_to?: string;
}): Promise<UserRecord> => {
  const resp: any = await jsonp<any>(buildPayloadUrl('adduser', payload));
  ensureOk(resp);
  return (resp.user || {}) as UserRecord;
};

export const updateUser = async (payload: {
  username: string;
  full_name?: string;
  role?: string;
  allowed_tabs?: string;
  status?: string;
  valid_from?: string;
  valid_to?: string;
}): Promise<UserRecord> => {
  const resp: any = await jsonp<any>(buildPayloadUrl('updateuser', payload));
  ensureOk(resp);
  return (resp.user || {}) as UserRecord;
};

export const deleteUser = async (username: string): Promise<void> => {
  const resp: any = await jsonp<any>(
    buildPayloadUrl('deleteuser', { username: String(username || '').trim() })
  );
  ensureOk(resp);
};

export const setPassword = async (username: string, password: string): Promise<void> => {
  const resp: any = await jsonp<any>(
    buildPayloadUrl('setpassword', {
      username: String(username || '').trim(),
      password: String(password || ''),
    })
  );
  ensureOk(resp);
};

