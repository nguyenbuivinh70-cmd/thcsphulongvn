import React, { useEffect, useMemo, useState } from 'react';
import { AppConfig, AppTab, AuthUser, SaveStatus } from './types';
import {
  fetchConfig,
  saveConfig,
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  getAuthToken,
} from './services/api';

import ConfigTab from './components/ConfigTab';
import PresentationTab from './components/PresentationTab';
import DataEntryTab from './components/DataEntryTab';
import GiftsTab from './components/GiftsTab';
import AccountsTab from './components/AccountsTab';

const DEFAULT_CONFIG: AppConfig = {
  speed: 50,
  position: 'bottom',
  direction: 'rtl',
  bgType: 'image',
  bgYoutube: '',
  bgVideo: '',
  bgImage: 'https://picsum.photos/1920/1080',
  bgFolderId: '',
  bgRotateSec: 10,
  refreshSec: 60,
  separator: ' - ',
  showClass: true,
  fontSize: 32,
  textColor: '#ffffff',
  barColor: 'rgba(0,0,0,0.6)',
  barHeight: 70,
  barBorderColor: 'rgba(255,255,255,0.1)',
  barBorderSize: 0,
  scrollbarColor: '#374151',
  scrollbarWidth: 8,
  loseSlots: 0,
  spinDuration: 4.2,
  effectMai: false,
  effectMaiDensity: 20,
  effectPeach: false,
  effectPeachDensity: 20,
  effectPhaoHoa: false,
  effectPhaoHoaDensity: 5,
  effectSparkles: false,
  totalShowInterval: 300,
  totalShowDuration: 10,
};

function normalizeTabsList(s: any): string[] {
  const raw = String(s ?? '')
    .split(',')
    .map((x) => String(x).trim().toUpperCase())
    .filter(Boolean);
  // unique
  return Array.from(new Set(raw));
}

function tabToKey(tab: AppTab): string {
  // AppTab trong types.ts đang dùng 'config' | 'data_entry' | ...
  // Sheet USERS đang lưu allowed_tabs dạng CONFIG,DATA_ENTRY,...
  switch (tab) {
    case AppTab.CONFIG:
      return 'CONFIG';
    case AppTab.DATA_ENTRY:
      return 'DATA_ENTRY';
    case AppTab.GIFTS:
      return 'GIFTS';
    case AppTab.PRESENTATION:
      return 'PRESENTATION';
    // @ts-ignore - nếu AppTab có ACCOUNTS trong types.ts
    case (AppTab as any).ACCOUNTS:
      return 'ACCOUNTS';
    default:
      return String(tab).toUpperCase();
  }
}

function getFirstAllowedTab(allowed: Set<string>): AppTab {
  // Ưu tiên cho USER: DATA_ENTRY
  if (allowed.has('DATA_ENTRY')) return AppTab.DATA_ENTRY;
  if (allowed.has('CONFIG')) return AppTab.CONFIG;
  if (allowed.has('GIFTS')) return AppTab.GIFTS;
  if (allowed.has('PRESENTATION')) return AppTab.PRESENTATION;
  // @ts-ignore
  if (allowed.has('ACCOUNTS')) return (AppTab as any).ACCOUNTS;
  return AppTab.DATA_ENTRY;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.DATA_ENTRY);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ type: 'idle' });

  const [booting, setBooting] = useState(true);
  const [configLoading, setConfigLoading] = useState(false);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const allowedTabsSet = useMemo(() => {
    // ADMIN: coi như full quyền (nhưng vẫn tôn trọng allowed_tabs nếu bạn muốn)
    const role = String((user as any)?.role ?? '').toUpperCase();
    const tabs = normalizeTabsList((user as any)?.allowed_tabs);

    if (role === 'ADMIN') {
      // FULL
      return new Set(['CONFIG', 'DATA_ENTRY', 'GIFTS', 'PRESENTATION', 'ACCOUNTS']);
    }

    if (tabs.length === 0) {
      // Mặc định USER chỉ DATA_ENTRY
      return new Set(['DATA_ENTRY']);
    }

    return new Set(tabs);
  }, [user]);

  const canSee = (tab: AppTab) => allowedTabsSet.has(tabToKey(tab));

  const visibleTabs = useMemo(() => {
    const tabs: AppTab[] = [];
    if (canSee(AppTab.CONFIG)) tabs.push(AppTab.CONFIG);
    if (canSee(AppTab.DATA_ENTRY)) tabs.push(AppTab.DATA_ENTRY);
    if (canSee(AppTab.GIFTS)) tabs.push(AppTab.GIFTS);
    if (canSee(AppTab.PRESENTATION)) tabs.push(AppTab.PRESENTATION);
    // @ts-ignore
    if (typeof (AppTab as any).ACCOUNTS !== 'undefined' && canSee((AppTab as any).ACCOUNTS)) tabs.push((AppTab as any).ACCOUNTS);
    return tabs;
  }, [allowedTabsSet]);

  // ===== BOOT: check token => fetchMe =====
  useEffect(() => {
    const boot = async () => {
      try {
        const token = getAuthToken();
        if (token) {
          const me = await fetchMe();
          setUser(me);
        } else {
          setUser(null);
        }
      } catch (e: any) {
        // token invalid
        apiLogout();
        setUser(null);
      } finally {
        setBooting(false);
      }
    };
    boot();
  }, []);

  // ===== Khi đã có user: set default tab hợp lệ =====
  useEffect(() => {
    if (!user) return;
    const first = getFirstAllowedTab(allowedTabsSet);
    setActiveTab((prev) => {
      const prevKey = tabToKey(prev);
      if (allowedTabsSet.has(prevKey)) return prev;
      return first;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, allowedTabsSet]);

  // ===== Load config khi user có quyền CONFIG/PRESENTATION/GIFTS (cần config) =====
  useEffect(() => {
    const needConfig = user && (allowedTabsSet.has('CONFIG') || allowedTabsSet.has('PRESENTATION') || allowedTabsSet.has('GIFTS'));
    if (!needConfig) return;

    const loadCfg = async () => {
      setConfigLoading(true);
      try {
        const remoteConfig = await fetchConfig();
        setConfig({ ...DEFAULT_CONFIG, ...remoteConfig });
      } catch (err) {
        console.error('Failed to load config:', err);
        setSaveStatus({ type: 'error', message: 'Không thể tải cấu hình từ máy chủ' });
      } finally {
        setConfigLoading(false);
      }
    };

    loadCfg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSave = async (cfg: AppConfig): Promise<AppConfig | void> => {
    setSaveStatus({ type: 'saving', message: 'Đang lưu cấu hình...' });
    try {
      await saveConfig(cfg);
      setSaveStatus({ type: 'success', message: 'Đã lưu cấu hình thành công!' });
      setConfig(cfg);
      window.setTimeout(() => setSaveStatus({ type: 'idle' }), 3000);
      return cfg;
    } catch (err: any) {
      console.error(err);
      setSaveStatus({ type: 'error', message: err?.message || 'Lỗi khi lưu cấu hình.' });
    }
  };

  const handlePreview = () => {
    if (canSee(AppTab.PRESENTATION)) setActiveTab(AppTab.PRESENTATION);
  };

  const doLogin = async () => {
    setLoginError('');
    setAuthLoading(true);
    try {
      const u = String(loginUsername || '').trim();
      const p = String(loginPassword || '').trim();
      if (!u || !p) throw new Error('Vui lòng nhập username và password.');

      const resp = await apiLogin(u, p);
      setUser(resp.user);
      setLoginPassword('');
    } catch (e: any) {
      const msg = String(e?.message || e || 'Đăng nhập thất bại');
      setLoginError(msg === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const doLogout = () => {
    apiLogout();
    setUser(null);
    setActiveTab(AppTab.DATA_ENTRY);
  };

  // ===== BOOTING =====
  if (booting) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // ===== LOGIN UI =====
  if (!user) {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center bg-gray-950 text-gray-100 p-4">
        <div className="w-full max-w-md rounded-2xl bg-gray-900/60 border border-gray-800 shadow-xl p-6">
          <div className="text-xl font-bold mb-4">Đăng nhập</div>

          <div className="space-y-3">
            <input
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 outline-none focus:border-blue-500"
              placeholder="Username"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              autoComplete="username"
            />
            <input
              className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 outline-none focus:border-blue-500"
              placeholder="Password"
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doLogin();
              }}
              autoComplete="current-password"
            />

            <button
              onClick={doLogin}
              disabled={authLoading}
              className={`w-full py-3 rounded-lg font-semibold transition ${
                authLoading ? 'bg-blue-600/60 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {authLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>

            {loginError ? (
              <div className="text-red-400 text-sm">
                {loginError}
                <div className="text-xs text-gray-400 mt-1">
                  * Nếu gặp lỗi, hãy kiểm tra sheet USERS (password_hash, status, valid_from/valid_to) và URL Web App.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ===== APP UI =====
  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-100">
      <style>{`
        ::-webkit-scrollbar {
          width: ${config.scrollbarWidth}px;
          height: ${config.scrollbarWidth}px;
        }
        ::-webkit-scrollbar-track {
          background: #111827;
        }
        ::-webkit-scrollbar-thumb {
          background: ${config.scrollbarColor};
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          filter: brightness(1.2);
        }
        * {
          scrollbar-width: thin;
          scrollbar-color: ${config.scrollbarColor} #111827;
        }
      `}</style>

      <nav
        className={`z-50 ${
          activeTab === AppTab.PRESENTATION
            ? 'fixed top-0 left-0 w-full opacity-0 hover:opacity-100 transition-opacity duration-300'
            : 'relative'
        }`}
      >
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex justify-between items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {canSee(AppTab.CONFIG) ? (
              <button
                onClick={() => setActiveTab(AppTab.CONFIG)}
                className={`px-4 md:px-6 py-2 rounded-md font-medium transition text-sm md:text-base ${
                  activeTab === AppTab.CONFIG ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Cấu hình
              </button>
            ) : null}

            {canSee(AppTab.DATA_ENTRY) ? (
              <button
                onClick={() => setActiveTab(AppTab.DATA_ENTRY)}
                className={`px-4 md:px-6 py-2 rounded-md font-medium transition text-sm md:text-base ${
                  activeTab === AppTab.DATA_ENTRY
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Nhập liệu
              </button>
            ) : null}

            {canSee(AppTab.GIFTS) ? (
              <button
                onClick={() => setActiveTab(AppTab.GIFTS)}
                className={`px-4 md:px-6 py-2 rounded-md font-medium transition text-sm md:text-base ${
                  activeTab === AppTab.GIFTS ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Quà tặng
              </button>
            ) : null}

            {canSee(AppTab.PRESENTATION) ? (
              <button
                onClick={() => setActiveTab(AppTab.PRESENTATION)}
                className={`px-4 md:px-6 py-2 rounded-md font-medium transition text-sm md:text-base ${
                  activeTab === AppTab.PRESENTATION
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Trình chiếu
              </button>
            ) : null}

            {/* @ts-ignore */}
            {typeof (AppTab as any).ACCOUNTS !== 'undefined' && canSee((AppTab as any).ACCOUNTS) ? (
              <button
                // @ts-ignore
                onClick={() => setActiveTab((AppTab as any).ACCOUNTS)}
                className={`px-4 md:px-6 py-2 rounded-md font-medium transition text-sm md:text-base ${
                  // @ts-ignore
                  activeTab === (AppTab as any).ACCOUNTS
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Tài khoản
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:block text-xs text-gray-500 uppercase tracking-widest">Ticker Display System v1.1</div>
            <div className="text-xs text-gray-300 hidden md:block">
              {(user as any)?.full_name ? String((user as any).full_name) : String((user as any)?.username || '')}{' '}
              <span className="text-gray-500">({String((user as any)?.role || 'USER')})</span>
            </div>
            <button
              onClick={doLogout}
              className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 hover:bg-gray-700 text-sm"
              title="Đăng xuất"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 relative overflow-hidden">
        {/* Nếu user không có quyền tab nào đó thì không render */}
        {configLoading ? (
          <div className="h-full w-full flex items-center justify-center bg-gray-950">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {canSee(AppTab.CONFIG) ? (
              <div className={activeTab === AppTab.CONFIG ? 'h-full' : 'hidden'}>
                <div className="h-full p-4 overflow-y-auto">
                  <ConfigTab config={config} onChange={setConfig} onSave={handleSave} onPreview={handlePreview} status={saveStatus} />
                </div>
              </div>
            ) : null}

            {canSee(AppTab.DATA_ENTRY) ? (
              <div className={activeTab === AppTab.DATA_ENTRY ? 'h-full' : 'hidden'}>
                <div className="h-full overflow-y-auto">
                  <DataEntryTab />
                </div>
              </div>
            ) : null}

            {canSee(AppTab.GIFTS) ? (
              <div className={activeTab === AppTab.GIFTS ? 'h-full' : 'hidden'}>
                <div className="h-full overflow-y-auto">
                  <GiftsTab config={config} />
                </div>
              </div>
            ) : null}

            {canSee(AppTab.PRESENTATION) ? (
              <div className={activeTab === AppTab.PRESENTATION ? 'h-full' : 'hidden'}>
                <PresentationTab config={config} />
              </div>
            ) : null}

            {/* @ts-ignore */}
            {typeof (AppTab as any).ACCOUNTS !== 'undefined' && canSee((AppTab as any).ACCOUNTS) ? (
              // @ts-ignore
              <div className={activeTab === (AppTab as any).ACCOUNTS ? 'h-full' : 'hidden'}>
                <div className="h-full p-4 overflow-y-auto">
                  <AccountsTab />
                </div>
              </div>
            ) : null}

            {/* Fallback nếu user bị cấu hình sai allowed_tabs */}
            {visibleTabs.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center p-6 text-center text-gray-300">
                Tài khoản của bạn chưa được cấp quyền tab nào. Vui lòng liên hệ ADMIN để cấu hình cột <b>allowed_tabs</b> trong sheet USERS.
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
};

export default App;

