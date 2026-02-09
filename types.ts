// types.ts

export type Position = 'top' | 'middle' | 'bottom';
export type BackgroundType = 'youtube' | 'image' | 'video' | 'folder';
export type TickerDirection = 'rtl' | 'ltr';

export interface AppConfig {
  speed: number;
  position: Position;
  direction: TickerDirection;

  bgType: BackgroundType;

  bgYoutube: string;
  bgYoutubeEmbed?: string;

  bgVideo: string;
  bgImage: string;
  bgValue?: string;

  bgFolderId: string;
  bgRotateSec: number;

  refreshSec: number;
  separator: string;
  showClass: boolean;

  fontSize: number;
  textColor: string;
  barColor: string;

  barHeight: number;
  barBorderColor: string;
  barBorderSize: number;

  scrollbarColor: string;
  scrollbarWidth: number;

  loseSlots: number;
  spinDuration: number;

  effectMai: boolean;
  effectMaiDensity: number;
  effectPeach: boolean;
  effectPeachDensity: number;
  effectPhaoHoa: boolean;
  effectPhaoHoaDensity: number;
  effectSparkles: boolean;

  totalShowInterval: number;
  totalShowDuration: number;
}

export interface TickerData {
  rows: any[];
  tickerText: string;
}

export interface RowItem {
  rowIndex: number;
  stt: number;
  name: string;
  cls: string;
  money: number;
}

export interface DriveImage {
  id: string;
  name: string;
  url: string;
}

export interface GiftItem {
  rowIndex: number;
  id?: string;
  name: string;
  spun?: boolean;
  time?: string;
}

/** Tabs code dùng cho phân quyền */
export type TabCode = 'CONFIG' | 'DATA_ENTRY' | 'GIFTS' | 'PRESENTATION' | 'ACCOUNTS';

export enum AppTab {
  CONFIG = 'config',
  DATA_ENTRY = 'data_entry',
  GIFTS = 'gifts',
  PRESENTATION = 'presentation',
  ACCOUNTS = 'accounts',
}

export interface SaveStatus {
  type: 'idle' | 'saving' | 'success' | 'error';
  message?: string;
}

/** ===== AUTH ===== */
export type UserRole = 'ADMIN' | 'USER';
export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface AuthUser {
  username: string;
  full_name?: string;
  role?: UserRole | string;
  allowed_tabs?: string; // VD: "CONFIG,DATA_ENTRY"
  status?: UserStatus | string;
  valid_from?: string;
  valid_to?: string;
  last_login?: string;
}

export interface UserRecord {
  username: string;
  full_name?: string;
  role?: UserRole | string;
  allowed_tabs?: string;
  status?: UserStatus | string;
  valid_from?: string;
  valid_to?: string;
  last_login?: string;
}


