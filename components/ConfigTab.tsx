
import React, { useState, useRef, useEffect } from 'react';
import { AppConfig, SaveStatus } from '../types';
import { convertDriveUrl } from '../utils/drive';

interface ConfigTabProps {
  config: AppConfig;
  onChange: (newConfig: AppConfig) => void;
  onSave: (config: AppConfig) => Promise<AppConfig | void>;
  onPreview: () => void;
  status: SaveStatus;
}

const THEME_COLORS = [
  ['#ffffff', '#000000', '#eeece1', '#1f497d', '#4f81bd', '#c0504d', '#9bbb59', '#8064a2', '#4bacc6', '#f79646'],
  ['#f2f2f2', '#7f7f7f', '#ddd9c3', '#c6d9f0', '#dbe5f1', '#f2dcdb', '#ebf1de', '#e5e0ec', '#dbeef3', '#fdeada'],
  ['#d8d8d8', '#595959', '#c4bd97', '#8db3e2', '#b8cce4', '#e5b9b7', '#d7e3bc', '#ccc1d9', '#b7dde8', '#fbd5b5'],
  ['#bfbfbf', '#3f3f3f', '#938953', '#548dd4', '#95b3d7', '#d99694', '#c3d69b', '#b2a2c7', '#92cddc', '#fac08f'],
  ['#a5a5a5', '#262626', '#494429', '#17365d', '#366092', '#953734', '#76923c', '#5f497a', '#31859b', '#e36c09'],
  ['#7f7f7f', '#0c0c0c', '#1d1b10', '#0f243e', '#244061', '#632423', '#4f6128', '#3f3151', '#205867', '#974806'],
];

const STANDARD_COLORS = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];

function convertDriveImageToLh3(url: string): string {
  if (!url) return url;
  const s = String(url).trim();
  if (s.includes('lh3.googleusercontent.com/d/')) return s;
  if (!s.includes('drive.google.com')) return s;
  const m = s.match(/\/file\/d\/([^\/?#]+)/) || s.match(/[?&]id=([^&?#]+)/) || s.match(/\/uc\?export=download&id=([^&?#]+)/) || s.match(/\/uc\?id=([^&?#]+)/);
  const fileId = m?.[1];
  if (!fileId) return s;
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

function extractYouTubeEmbedSrc(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  const iframeSrcMatch = raw.match(/src\s*=\s*["']([^"']+)["']/i);
  if (iframeSrcMatch?.[1]) return normalizeYouTubeEmbedSrc(iframeSrcMatch[1]);
  return normalizeYouTubeEmbedSrc(raw);
}

function normalizeYouTubeEmbedSrc(urlOrId: string): string {
  const s = (urlOrId || '').trim();
  if (!s) return '';
  const isEmbed = /youtube\.com\/embed\//i.test(s);
  if (isEmbed) return s;
  const patterns = [/v=([a-zA-Z0-9_-]{6,})/i, /youtu\.be\/([a-zA-Z0-9_-]{6,})/i, /shorts\/([a-zA-Z0-9_-]{6,})/i, /embed\/([a-zA-Z0-9_-]{6,})/i];
  for (const p of patterns) {
    const m = s.match(p);
    if (m?.[1]) return `https://www.youtube.com/embed/${m[1]}`;
  }
  if (/^[a-zA-Z0-9_-]{6,}$/.test(s)) return `https://www.youtube.com/embed/${s}`;
  return s;
}

const ColorSelector: React.FC<{ label: string; value: string; name: keyof AppConfig; onChange: (name: keyof AppConfig, value: string) => void; isRgba?: boolean; }> = ({ label, value, name, onChange, isRgba }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const handleColorSelect = (color: string) => {
    if (isRgba) {
      const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
      onChange(name, `rgba(${r}, ${g}, ${b}, 0.6)`);
    } else onChange(name, color);
    setIsOpen(false);
  };
  const handleCustomColor = (e: React.ChangeEvent<HTMLInputElement>) => onChange(name, e.target.value);
  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>
      <div onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 w-full bg-gray-900 border border-gray-600 rounded p-2 cursor-pointer hover:border-blue-500 transition">
        <div className="w-6 h-6 rounded border border-gray-700 shadow-inner" style={{ backgroundColor: value || '#ffffff' }} />
        <span className="text-sm font-mono text-gray-300 flex-1 truncate">{value}</span>
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
      </div>
      {isOpen && (
        <div className="absolute z-[100] mt-2 left-0 bg-white text-gray-800 p-3 rounded-lg shadow-2xl border border-gray-200 w-64 animate-in fade-in zoom-in duration-150">
          <div className="text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Màu chủ đề</div>
          <div className="grid grid-cols-10 gap-1 mb-3">{THEME_COLORS.map((row, rIdx) => row.map((color, cIdx) => <div key={`${rIdx}-${cIdx}`} onClick={() => handleColorSelect(color)} className="w-5 h-5 cursor-pointer border border-gray-100 hover:scale-110 hover:shadow-md transition" style={{ backgroundColor: color }} />))}</div>
          <div className="text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Màu tiêu chuẩn</div>
          <div className="grid grid-cols-10 gap-1 mb-4">{STANDARD_COLORS.map((color, idx) => <div key={idx} onClick={() => handleColorSelect(color)} className="w-5 h-5 cursor-pointer border border-gray-100 hover:scale-110 hover:shadow-md transition" style={{ backgroundColor: color }} />)}</div>
          <div className="border-t border-gray-100 pt-2"><button onClick={() => hiddenInputRef.current?.click()} className="flex items-center gap-2 text-[12px] text-blue-600 hover:text-blue-800 font-medium w-full text-left">Màu khác...</button><input ref={hiddenInputRef} type="color" className="hidden" onChange={handleCustomColor} /></div>
        </div>
      )}
    </div>
  );
};

const ConfigTab: React.FC<ConfigTabProps> = ({ config, onChange, onSave, onPreview, status }) => {
  const [timeError, setTimeError] = useState<string | null>(null);

  const validateTiming = (interval: number, duration: number) => {
    if (interval <= 0 || duration <= 0) return "Thời gian phải lớn hơn 0 giây.";
    if (duration >= interval) return "Thời gian lặp lại phải lớn hơn thời gian hiển thị.";
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let newValue: any = value;
    if (type === 'number') newValue = Number(value);
    if (type === 'checkbox') newValue = (e.target as HTMLInputElement).checked;
    if (name === 'showClass') newValue = value === 'true';
    if (name === 'bgVideo') newValue = convertDriveUrl(value);
    if (name === 'bgImage') newValue = convertDriveImageToLh3(value);
    
    const newConfig = { ...config, [name]: newValue };
    
    // Validate timing logic
    if (name === 'totalShowInterval' || name === 'totalShowDuration') {
      const err = validateTiming(Number(newConfig.totalShowInterval), Number(newConfig.totalShowDuration));
      setTimeError(err);
    }

    onChange(newConfig);
  };

  useEffect(() => {
    const err = validateTiming(Number(config.totalShowInterval), Number(config.totalShowDuration));
    setTimeError(err);
  }, []);

  const handleSaveClick = async () => {
    if (timeError) return;
    try {
      const rawYoutube = String((config.bgYoutubeEmbed ?? config.bgYoutube ?? '') || '').trim();
      const fixed: AppConfig = { ...config, bgYoutubeEmbed: extractYouTubeEmbedSrc(rawYoutube), bgImage: convertDriveImageToLh3(config.bgImage || ''), bgVideo: convertDriveUrl(config.bgVideo || '') };
      onChange(fixed); await onSave(fixed);
    } catch { }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-blue-400">Cấu hình</h2>
          <div className="text-xs text-gray-400">
            {status.type === 'saving' && 'Đang lưu...'}
            {status.type === 'success' && <span className="text-emerald-400">{status.message}</span>}
            {status.type === 'error' && <span className="text-red-400">{status.message}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
          {/* Trình chiếu Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-700 pb-1">Trình chiếu</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-400 mb-1">Tốc độ chạy (px/s)</label><input name="speed" type="number" value={config.speed} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2" /></div>
              <div><label className="block text-sm font-medium text-gray-400 mb-1">Tự cập nhật (s)</label><input name="refreshSec" type="number" value={config.refreshSec} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-400 mb-1">Vị trí ticker</label><select name="position" value={config.position} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2"><option value="top">Trên</option><option value="middle">Giữa</option><option value="bottom">Dưới</option></select></div>
              <div><label className="block text-sm font-medium text-gray-400 mb-1">Hướng chạy</label><select name="direction" value={config.direction} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2"><option value="rtl">Phải sang Trái</option><option value="ltr">Trái sang Phải</option></select></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1">Ngăn cách</label><input name="separator" value={config.separator} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2" /></div>
            <div><label className="block text-sm font-medium text-gray-400 mb-1">Hiện lớp</label><select name="showClass" value={String(config.showClass)} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2"><option value="true">Có</option><option value="false">Không</option></select></div>
          </div>

          {/* Kiểu dáng Ticker */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-700 pb-1">Kiểu dáng Ticker</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-400 mb-1">Cỡ chữ (px)</label><input name="fontSize" type="number" value={config.fontSize} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2" /></div>
              <div><label className="block text-sm font-medium text-gray-400 mb-1">Chiều cao thanh (px)</label><input name="barHeight" type="number" value={config.barHeight} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2" /></div>
            </div>
            <ColorSelector label="Màu chữ" value={config.textColor} name="textColor" onChange={(n, v) => onChange({...config, [n]:v})} />
            <ColorSelector label="Màu nền thanh" value={config.barColor} name="barColor" onChange={(n, v) => onChange({...config, [n]:v})} isRgba />
            <div className="grid grid-cols-2 gap-4">
              <ColorSelector label="Màu viền" value={config.barBorderColor} name="barBorderColor" onChange={(n, v) => onChange({...config, [n]:v})} isRgba />
              <div><label className="block text-sm font-medium text-gray-400 mb-1">Viền (px)</label><input name="barBorderSize" type="number" value={config.barBorderSize} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2" /></div>
            </div>
          </div>

          {/* Popup Tổng tiền */}
          <div className="md:col-span-2 space-y-4">
            <h3 className="text-lg font-semibold text-amber-300 border-b border-amber-900/50 pb-1 flex items-center gap-2">
              Thông báo Tổng tiền tự động
              {timeError && <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full animate-pulse">{timeError}</span>}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-gray-900/50 rounded-xl border border-gray-700">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Lặp lại mỗi (giây)</label>
                <input name="totalShowInterval" type="number" value={config.totalShowInterval} onChange={handleChange} className={`w-full bg-gray-800 border ${timeError ? 'border-red-500' : 'border-gray-600'} rounded p-2`} />
                <p className="text-[10px] text-gray-500 mt-1 italic font-medium">💡 Gợi ý: Nên để 300s (5 phút) - 600s (10 phút)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Hiển thị trong (giây)</label>
                <input name="totalShowDuration" type="number" value={config.totalShowDuration} onChange={handleChange} className={`w-full bg-gray-800 border ${timeError ? 'border-red-500' : 'border-gray-600'} rounded p-2`} />
                <p className="text-[10px] text-gray-500 mt-1 italic font-medium">💡 Gợi ý: Nên để 10s - 20s</p>
              </div>
            </div>
          </div>

          {/* Phông nền */}
          <div className="md:col-span-2 space-y-4">
            <h3 className="text-lg font-semibold text-gray-200 border-b border-gray-700 pb-1">Phông nền</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div><label className="block text-sm font-medium text-gray-400 mb-1">Loại nền</label><select name="bgType" value={config.bgType} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2"><option value="image">Ảnh</option><option value="folder">Thư mục ảnh</option><option value="video">Video</option><option value="youtube">YouTube</option></select></div>
              {config.bgType === 'folder' && <div><label className="block text-sm font-medium text-gray-400 mb-1">Đổi ảnh mỗi (s)</label><input name="bgRotateSec" type="number" value={config.bgRotateSec} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2" /></div>}
            </div>
            {config.bgType === 'youtube' && <textarea name="bgYoutubeEmbed" value={config.bgYoutubeEmbed ?? config.bgYoutube ?? ''} onChange={handleChange} rows={2} className="w-full bg-gray-900 border border-gray-600 rounded p-2 font-mono text-sm" placeholder="Link hoặc Iframe YouTube" />}
            {config.bgType === 'video' && <input name="bgVideo" value={config.bgVideo} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2" placeholder="Link Video Direct" />}
            {config.bgType === 'image' && <input name="bgImage" value={config.bgImage} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2" placeholder="Link Ảnh" />}
            {config.bgType === 'folder' && <input name="bgFolderId" value={config.bgFolderId} onChange={handleChange} className="w-full bg-gray-900 border border-gray-600 rounded p-2" placeholder="Google Drive Folder ID" />}
          </div>

          {/* Hiệu ứng Trình chiếu */}
          <div className="md:col-span-2 space-y-4">
            <h3 className="text-lg font-semibold text-amber-300 border-b border-amber-900/50 pb-1">Hiệu ứng Tết (Mai, Đào, Pháo hoa)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700 space-y-3">
                <div className="flex items-center justify-between"><label className="text-sm font-medium text-yellow-500">Hoa Mai rơi</label><input name="effectMai" type="checkbox" checked={config.effectMai} onChange={handleChange} className="w-5 h-5 accent-yellow-500" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Mật độ: {config.effectMaiDensity}</label><input name="effectMaiDensity" type="range" min="5" max="150" value={config.effectMaiDensity} onChange={handleChange} className="w-full h-2 bg-gray-700 rounded-lg accent-yellow-500" /></div>
              </div>
              <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700 space-y-3">
                <div className="flex items-center justify-between"><label className="text-sm font-medium text-pink-500">Hoa Đào rơi</label><input name="effectPeach" type="checkbox" checked={config.effectPeach} onChange={handleChange} className="w-5 h-5 accent-pink-500" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Mật độ: {config.effectPeachDensity}</label><input name="effectPeachDensity" type="range" min="5" max="150" value={config.effectPeachDensity} onChange={handleChange} className="w-full h-2 bg-gray-700 rounded-lg accent-pink-500" /></div>
              </div>
              <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700 space-y-3">
                <div className="flex items-center justify-between"><label className="text-sm font-medium text-red-500">Pháo hoa chùm</label><input name="effectPhaoHoa" type="checkbox" checked={config.effectPhaoHoa} onChange={handleChange} className="w-5 h-5 accent-red-500" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Tần suất nổ: {config.effectPhaoHoaDensity}</label><input name="effectPhaoHoaDensity" type="range" min="1" max="20" value={config.effectPhaoHoaDensity} onChange={handleChange} className="w-full h-2 bg-gray-700 rounded-lg accent-red-500" /></div>
              </div>
              <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700 flex items-center justify-between">
                <label className="text-sm font-medium text-emerald-500">Lấp lánh (Sparkles)</label><input name="effectSparkles" type="checkbox" checked={config.effectSparkles} onChange={handleChange} className="w-5 h-5 accent-emerald-500" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-3 border-t border-gray-700 pt-6">
          <button 
            onClick={handleSaveClick} 
            disabled={!!timeError}
            className={`px-6 py-3 rounded-lg font-bold shadow-lg transition ${timeError ? 'bg-gray-600 cursor-not-allowed text-gray-400' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
          >
            Lưu cấu hình
          </button>
          <button onClick={onPreview} className="px-6 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition font-bold shadow-lg">Trình chiếu</button>
        </div>
      </div>
    </div>
  );
};

export default ConfigTab;
