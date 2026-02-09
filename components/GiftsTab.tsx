import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { AppConfig, GiftItem } from '../types';
import {
  addGift,
  deleteGift,
  listGiftsAll,
  markGift,
  resetGifts,
  updateGift,
} from '../services/api';

type UiStatus =
  | { type: 'idle' }
  | { type: 'loading'; message?: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

type WheelItem =
  | ({ kind: 'gift' } & GiftItem)
  | { kind: 'lose'; rowIndex: number; name: string };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function easeOutQuart(t: number) {
  return 1 - Math.pow(1 - t, 4);
}

function normalizeAngle(rad: number) {
  const two = Math.PI * 2;
  let a = rad % two;
  if (a < 0) a += two;
  return a;
}

function truncateLabel(s: string, maxLen: number) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  return t.slice(0, Math.max(1, maxLen - 1)).trimEnd() + '…';
}

const SLICE_COLORS = [
  '#4ADE80',
  '#818CF8',
  '#FACC15',
  '#2DD4BF',
  '#F87171',
  '#FB923C',
  '#A78BFA',
  '#F472B6',
  '#38BDF8',
  '#86EFAC',
  '#E879F9',
  '#94A3B8',
];

function giftColor(i: number) {
  return SLICE_COLORS[i % SLICE_COLORS.length];
}
function loseColor() {
  return '#F43F5E';
}

const TET_BG =
  'radial-gradient(1200px 600px at 10% 10%, rgba(255,215,0,0.08), transparent 55%),' +
  'radial-gradient(1000px 600px at 80% 30%, rgba(208,2,27,0.1), transparent 55%),' +
  'linear-gradient(135deg, #0F172A 0%, #020617 100%)';

/** 🔊 AUDIO SYSTEM REFINEMENT */
function ensureAudioContext(): AudioContext | null {
  const AnyCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AnyCtx) return null;
  const ctx = new AnyCtx();
  return ctx;
}

async function resumeAudio(ctx: AudioContext | null) {
  if (ctx && ctx.state === 'suspended') {
    await ctx.resume();
  }
}

function playTick(ctx: AudioContext | null) {
  if (!ctx) return;
  resumeAudio(ctx);
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1200, t);
  osc.frequency.exponentialRampToValueAtTime(400, t + 0.04);

  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}

function playWin(ctx: AudioContext | null) {
  if (!ctx) return;
  resumeAudio(ctx);
  const t = ctx.currentTime;
  // C major arpeggio: C5, E5, G5, C6
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t + i * 0.1);

    gain.gain.setValueAtTime(0, t + i * 0.1);
    gain.gain.linearRampToValueAtTime(0.2, t + i * 0.1 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.1 + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + i * 0.1);
    osc.stop(t + i * 0.1 + 0.5);
  });
}

function playLose(ctx: AudioContext | null) {
  if (!ctx) return;
  resumeAudio(ctx);
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, t);
  osc.frequency.linearRampToValueAtTime(100, t + 0.6);

  gain.gain.setValueAtTime(0.1, t);
  gain.gain.linearRampToValueAtTime(0.0001, t + 0.6);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.6);
}

function buildInterleavedWheel(gifts: GiftItem[], loseSlots: number): WheelItem[] {
  const g = gifts
    .filter((x) => !x.spun && String(x?.name || '').trim())
    .map((x) => ({ ...x, kind: 'gift' as const }));

  const loses: WheelItem[] = Array.from({ length: Math.max(0, loseSlots) }).map((_, i) => ({
    kind: 'lose' as const,
    rowIndex: -1 - i,
    name: 'Mất lượt',
  }));

  const out: WheelItem[] = [];
  let gi = 0,
    li = 0;
  while (gi < g.length || li < loses.length) {
    if (gi < g.length) out.push(g[gi++]);
    if (li < loses.length) out.push(loses[li++]);
  }
  return out;
}

/** ✅ Modal Confirm thay cho window.confirm (Preview sandbox chặn confirm) */
type ConfirmState =
  | {
      open: true;
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      danger?: boolean;
      onConfirm: () => Promise<void> | void;
    }
  | { open: false };

const GiftsTab: React.FC<{ config: AppConfig }> = ({ config }) => {
  const [allGifts, setAllGifts] = useState<GiftItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<UiStatus>({ type: 'idle' });
  const [spinning, setSpinning] = useState(false);
  const [resultData, setResultData] = useState<{ name: string; isLose: boolean } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [newGiftName, setNewGiftName] = useState('');
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState(520);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastTickIndexRef = useRef<number>(-1);

  const loseSlots = useMemo(
    () => Math.max(0, Math.floor(Number(config.loseSlots) || 0)),
    [config.loseSlots]
  );
  const spinDurationMs = useMemo(
    () => clamp((config.spinDuration || 4.2) * 1000, 500, 30000),
    [config.spinDuration]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listGiftsAll();
      setAllGifts(all || []);
      setStatus({ type: 'idle' });
    } catch (e: any) {
      setStatus({ type: 'error', message: 'Lỗi tải dữ liệu quà tặng.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remainingGifts = useMemo(() => allGifts.filter((g) => !g.spun), [allGifts]);
  const wheelItems = useMemo(
    () => buildInterleavedWheel(allGifts, loseSlots),
    [allGifts, loseSlots]
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const calc = () => setCanvasSize(clamp(el.clientWidth, 320, 640));
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stopRaf = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };
  useEffect(() => () => stopRaf(), []);

  const drawWheel = (rotation: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const size = canvasSize;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = size / 2,
      cy = size / 2,
      R = Math.min(cx, cy) - 15;
    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.restore();

    const items = wheelItems.length ? wheelItems : ([{ kind: 'lose', name: 'Hết quà' }] as WheelItem[]);
    const n = items.length;
    const step = (Math.PI * 2) / n;

    for (let i = 0; i < n; i++) {
      const start = rotation + i * step,
        end = start + step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R - 15, start, end);
      ctx.fillStyle = items[i].kind === 'lose' ? loseColor() : giftColor(i);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + step / 2);
      ctx.translate((R - 25) * 0.72, 0);
      ctx.rotate(Math.PI / 2);
      ctx.font = `900 ${clamp(size / 28, 12, 20)}px "Be Vietnam Pro"`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'white';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.fillText(truncateLabel(items[i].name, 10), 0, 0);
      ctx.restore();
    }

    // Viền trang trí ngoài cùng
    ctx.beginPath();
    ctx.arc(cx, cy, R - 8, 0, Math.PI * 2);
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 6;
    ctx.stroke();
  };

  useEffect(() => {
    drawWheel(rotationRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize, wheelItems]);

  const getIndexAtPointer = (rotation: number) => {
    const n = wheelItems.length || 1;
    const step = (Math.PI * 2) / n;
    const rel = normalizeAngle(-Math.PI / 2 - rotation);
    return clamp(Math.floor(rel / step), 0, n - 1);
  };

  const spinToIndex = async (targetIndex: number) => {
    stopRaf();
    lastTickIndexRef.current = -1;
    if (!audioCtxRef.current) audioCtxRef.current = ensureAudioContext();

    const n = wheelItems.length;
    const step = (Math.PI * 2) / n;
    const startRotation = rotationRef.current;

    const minFullCircles = Math.max(6, Math.floor(spinDurationMs / 700));
    const extraTurns = Math.PI * 2 * minFullCircles;
    const stopAngle = -Math.PI / 2 - (targetIndex + 0.5) * step;

    let extraRelative = (stopAngle - startRotation) % (Math.PI * 2);
    if (extraRelative > 0) extraRelative -= Math.PI * 2;

    const target = startRotation - extraTurns + extraRelative;
    const start = performance.now();

    return new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const t = clamp((now - start) / spinDurationMs, 0, 1);
        const cur = startRotation + (target - startRotation) * easeOutQuart(t);
        rotationRef.current = cur;
        drawWheel(cur);
        const idx = getIndexAtPointer(cur);
        if (idx !== lastTickIndexRef.current) {
          lastTickIndexRef.current = idx;
          playTick(audioCtxRef.current);
        }
        if (t >= 1) {
          resolve();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    });
  };

  const handleSpin = async () => {
    if (spinning || !wheelItems.length || wheelItems[0]?.name === 'Hết quà') return;
    setSpinning(true);
    setShowResult(false);
    try {
      const targetIdx = Math.floor(Math.random() * wheelItems.length);
      await spinToIndex(targetIdx);

      const picked = wheelItems[getIndexAtPointer(rotationRef.current)];
      if (picked.kind === 'lose') {
        setResultData({ name: 'Mất lượt 😅', isLose: true });
        playLose(audioCtxRef.current);
      } else {
        // ✅ gọi đúng API mới
        const updated = await markGift({ rowIndex: picked.rowIndex });
        setResultData({ name: updated.name, isLose: false });
        playWin(audioCtxRef.current);
        setAllGifts((prev) =>
          prev.map((g) => (g.rowIndex === picked.rowIndex ? { ...g, spun: true } : g))
        );
      }
      setShowResult(true);
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', message: 'Quay thất bại. Vui lòng thử lại.' });
    } finally {
      setSpinning(false);
    }
  };

  const openConfirm = (cfg: Omit<Extract<ConfirmState, { open: true }>, 'open'>) => {
    setConfirmState({ open: true, ...cfg });
  };

  const closeConfirm = () => setConfirmState({ open: false });

  const handleReset = () => {
    if (spinning || loading) return;
    openConfirm({
      title: 'Reset quà',
      message: 'Bạn muốn reset tất cả quà về trạng thái CHƯA quay?',
      danger: true,
      confirmText: 'Reset',
      cancelText: 'Hủy',
      onConfirm: async () => {
        closeConfirm();
        setLoading(true);
        try {
          await resetGifts();
          rotationRef.current = 0;
          drawWheel(0);
          await load();
          setStatus({ type: 'success', message: 'Đã reset quà.' });
        } catch (e) {
          setStatus({ type: 'error', message: 'Reset thất bại.' });
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleAddGift = async () => {
    if (!newGiftName.trim()) return;
    setLoading(true);
    try {
      await addGift(newGiftName);
      setNewGiftName('');
      await load();
      setStatus({ type: 'success', message: 'Đã thêm quà.' });
    } catch (e) {
      setStatus({ type: 'error', message: 'Thêm quà lỗi.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (g: GiftItem) => {
    if (spinning || loading) return;
    openConfirm({
      title: 'Xóa quà',
      message: `Xóa phần quà: "${g.name}" ?`,
      danger: true,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      onConfirm: async () => {
        closeConfirm();
        setLoading(true);
        try {
          // ✅ gọi đúng API mới
          await deleteGift({ rowIndex: g.rowIndex, id: g.id });
          setAllGifts((prev) => prev.filter((x) => x.rowIndex !== g.rowIndex));
          setStatus({ type: 'success', message: 'Đã xóa quà.' });
        } catch (e) {
          setStatus({ type: 'error', message: 'Xóa thất bại.' });
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const startEdit = (g: GiftItem) => {
    setEditingRow(g.rowIndex);
    setEditingName(g.name);
  };
  const cancelEdit = () => {
    setEditingRow(null);
    setEditingName('');
  };
  const commitEdit = async () => {
    if (editingRow == null || !editingName.trim()) return;
    setLoading(true);
    try {
      const g = allGifts.find((x) => x.rowIndex === editingRow);
      // ✅ gọi đúng API mới
      await updateGift({ rowIndex: editingRow, id: g?.id, name: editingName.trim() });
      setAllGifts((prev) =>
        prev.map((x) => (x.rowIndex === editingRow ? { ...x, name: editingName.trim() } : x))
      );
      cancelEdit();
      setStatus({ type: 'success', message: 'Đã cập nhật quà.' });
    } catch (e) {
      setStatus({ type: 'error', message: 'Cập nhật lỗi.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 h-full overflow-y-auto custom-scrollbar-main">
      {/* Confirm Modal */}
      {confirmState.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeConfirm}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl">
            <div className="text-xl font-black text-white">{confirmState.title}</div>
            <div className="mt-3 text-sm text-gray-300 leading-relaxed">{confirmState.message}</div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeConfirm}
                className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition font-bold text-sm text-gray-200"
              >
                {confirmState.cancelText || 'Hủy'}
              </button>
              <button
                onClick={() => confirmState.onConfirm?.()}
                className={`px-4 py-2 rounded-xl transition font-black text-sm ${
                  confirmState.danger
                    ? 'bg-red-500/20 border border-red-500/30 text-red-200 hover:bg-red-500 hover:text-white'
                    : 'bg-yellow-500/20 border border-yellow-500/30 text-yellow-100 hover:bg-yellow-500 hover:text-slate-900'
                }`}
              >
                {confirmState.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="rounded-[40px] border border-white/5 shadow-2xl p-6 md:p-12 relative overflow-hidden"
        style={{ background: TET_BG }}
      >
        {/* Decorative elements */}
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-yellow-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-red-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-8 relative z-10">
          <div>
            <h2 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-amber-600 uppercase tracking-tighter italic drop-shadow-sm">
              Vòng Quay May Mắn
            </h2>
            <div className="flex items-center gap-4 mt-3">
              <span className="flex items-center gap-2 text-gray-400 text-sm font-semibold">
                <i className="w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)] animate-pulse"></i>
                Quà còn: <b className="text-white text-base">{remainingGifts.length}</b>
              </span>
              <span className="w-px h-4 bg-white/10"></span>
              <span className="text-gray-400 text-sm font-semibold">
                Ô mất lượt: <b className="text-white text-base">{loseSlots}</b>
              </span>
            </div>
          </div>
          <div className="flex gap-4">
            <button
              onClick={load}
              disabled={spinning || loading}
              className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all font-bold text-sm backdrop-blur-xl disabled:opacity-50"
            >
              Tải lại
            </button>
            <button
              onClick={handleReset}
              disabled={spinning || loading}
              className="px-6 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl hover:bg-red-500 hover:text-white transition-all font-bold text-sm backdrop-blur-xl disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start relative z-10">
          {/* Wheel Section */}
          <div
            ref={wrapRef}
            className="lg:col-span-7 flex flex-col items-center justify-center p-12 bg-white/5 rounded-[60px] border border-white/5 backdrop-blur-md relative shadow-2xl"
          >
            <div className="relative group" style={{ width: canvasSize, height: canvasSize }}>
              <canvas ref={canvasRef} className="rounded-full transition-transform duration-500" />

              {/* Pointer */}
              <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-5 z-20">
                <div className="w-0 h-0 border-l-[24px] border-l-transparent border-r-[24px] border-r-transparent border-t-[48px] border-t-yellow-400 filter drop-shadow-[0_8px_15px_rgba(0,0,0,0.6)]" />
                <div className="w-4 h-4 bg-white rounded-full absolute top-1.5 left-1/2 -translate-x-1/2 shadow-inner" />
              </div>

              {/* Start Button */}
              <button
                onClick={handleSpin}
                disabled={spinning || loading || !remainingGifts.length}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full bg-gradient-to-br from-yellow-200 via-yellow-500 to-amber-700 border-[8px] border-[#0f172a] shadow-[0_0_50px_rgba(245,158,11,0.4)] flex flex-col items-center justify-center text-[#0F172A] font-black text-2xl z-30 hover:scale-110 active:scale-95 transition-all group-disabled:opacity-50 cursor-pointer overflow-hidden"
              >
                <span className="relative z-10">{spinning ? '...' : 'QUAY'}</span>
                {!spinning && (
                  <div className="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform duration-300" />
                )}
              </button>
            </div>

            {/* Result toast */}
            {showResult && resultData && (
              <div
                className={`mt-8 px-6 py-4 rounded-2xl border backdrop-blur-xl shadow-xl text-center max-w-xl ${
                  resultData.isLose
                    ? 'bg-red-500/10 border-red-500/20 text-red-200'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100'
                }`}
              >
                <div className="text-sm opacity-90 font-semibold">Kết quả</div>
                <div className="text-2xl font-black mt-1">{resultData.name}</div>
              </div>
            )}
          </div>

          {/* List Section */}
          <div className="lg:col-span-5 space-y-8">
            <div className="bg-gray-900/40 backdrop-blur-xl rounded-[40px] border border-white/5 p-10 shadow-2xl flex flex-col h-full">
              <h3 className="text-2xl font-black text-white mb-8 flex items-center gap-3">
                <div className="p-2 bg-yellow-500/20 rounded-xl text-yellow-500">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </div>
                Phần quà
              </h3>

              {/* Add */}
              <div className="flex gap-3 mb-6">
                <input
                  value={newGiftName}
                  onChange={(e) => setNewGiftName(e.target.value)}
                  placeholder="Nhập tên quà..."
                  className="flex-1 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-yellow-500/40"
                />
                <button
                  onClick={handleAddGift}
                  disabled={loading || !newGiftName.trim()}
                  className="px-5 py-3 rounded-2xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-100 hover:bg-yellow-500 hover:text-slate-900 transition font-black disabled:opacity-50"
                >
                  Thêm
                </button>
              </div>

              {/* Status */}
              {status.type !== 'idle' && (
                <div
                  className={`mb-6 px-4 py-3 rounded-2xl border text-sm ${
                    status.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                      : status.type === 'error'
                      ? 'bg-red-500/10 border-red-500/20 text-red-200'
                      : 'bg-white/5 border-white/10 text-gray-200'
                  }`}
                >
                  {'message' in status ? status.message : ''}
                </div>
              )}

              {/* List */}
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2 custom-scrollbar-main">
                {allGifts
                  .filter((g) => String(g?.name || '').trim())
                  .map((g) => {
                    const isEditing = editingRow === g.rowIndex;
                    return (
                      <div
                        key={g.rowIndex}
                        className="p-4 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-xs text-gray-400 font-semibold">
                              #{g.rowIndex} {g.spun ? '• Đã quay' : '• Chưa quay'}
                            </div>

                            {!isEditing ? (
                              <div className="mt-1 text-lg font-black text-white">{g.name}</div>
                            ) : (
                              <input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="mt-2 w-full px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-white outline-none focus:ring-2 focus:ring-yellow-500/40"
                              />
                            )}

                            {g.time && (
                              <div className="mt-2 text-xs text-gray-500 break-all">
                                Time: {g.time}
                              </div>
                            )}
                          </div>

                          {!isEditing ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => startEdit(g)}
                                className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 transition text-sm font-bold"
                              >
                                Sửa
                              </button>
                              <button
                                onClick={() => handleDelete(g)}
                                className="px-3 py-2 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-200 hover:bg-red-500 hover:text-white transition text-sm font-black"
                              >
                                Xóa
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={commitEdit}
                                disabled={loading || !editingName.trim()}
                                className="px-3 py-2 rounded-2xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-100 hover:bg-yellow-500 hover:text-slate-900 transition text-sm font-black disabled:opacity-50"
                              >
                                Lưu
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 transition text-sm font-bold"
                              >
                                Hủy
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                {allGifts.length === 0 && (
                  <div className="text-sm text-gray-400 text-center py-10">
                    Chưa có quà nào. Hãy thêm quà bên trên.
                  </div>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-500/80">
              * Lưu ý: Preview AI Studio chặn <b>window.confirm()</b> nên mình đã đổi sang modal xác nhận.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GiftsTab;

