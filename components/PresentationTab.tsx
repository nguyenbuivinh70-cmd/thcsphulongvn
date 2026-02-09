
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppConfig, TickerData, DriveImage } from '../types';
import { parseYouTubeId } from '../utils/youtube';
import { fetchData, listImages } from '../services/api';

interface PresentationTabProps {
  config: AppConfig;
}

interface BackgroundAsset {
  url: string;
  type: string;
}

/** 🌸 Component hiển thị nội dung chữ với hiệu ứng Cross-fade mượt mà */
const SmoothTickerContent: React.FC<{ text: string }> = ({ text }) => {
  const [nodes, setNodes] = useState<{ id: number; content: string; active: boolean }[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const id = nextId.current++;
    setNodes(prev => {
      const oldNodes = prev.map(n => ({ ...n, active: false }));
      return [...oldNodes, { id, content: text, active: true }].slice(-2);
    });
  }, [text]);

  return (
    <div className="relative inline-flex items-center h-full">
      {nodes.map(node => (
        <span
          key={node.id}
          className={`px-10 whitespace-nowrap transition-opacity duration-1000 ease-in-out ${
            node.active ? 'opacity-100 static' : 'opacity-0 absolute inset-0 pointer-events-none'
          }`}
        >
          {node.content}
        </span>
      ))}
    </div>
  );
};

/** 🌸 Optimized Flower Component */
const FlowerEffect: React.FC<{ density: number; color: string; centerColor: string }> = ({ density, color, centerColor }) => {
  const petals = useMemo(() => {
    return Array.from({ length: density }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      duration: `${Math.random() * 12 + 8}s`,
      delay: `${-Math.random() * 20}s`,
      size: `${Math.random() * 20 + 15}px`,
      sway: `${Math.random() * 150 - 75}px`
    }));
  }, [density]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30" style={{ contain: 'strict' }}>
      {petals.map(p => (
        <div
          key={p.id}
          className="absolute top-[-40px] will-change-transform"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animation: `flower-fall ${p.duration} linear ${p.delay} infinite`,
            '--sway': p.sway
          } as any}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.2))' }}>
             {[0, 72, 144, 216, 288].map(angle => (
                <ellipse key={angle} cx="50" cy="32" rx="18" ry="24" fill={color} transform={`rotate(${angle} 50 50)`} />
             ))}
             <circle cx="50" cy="50" r="12" fill={centerColor} />
          </svg>
        </div>
      ))}
    </div>
  );
};

const FireworksEffect: React.FC<{ density: number }> = ({ density }) => {
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; color: string }[]>([]);
  useEffect(() => {
    const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#f472b6', '#ffffff', '#fb923c'];
    const timer = setInterval(() => {
      const newBurst = {
        id: Date.now() + Math.random(),
        x: 15 + Math.random() * 70,
        y: 10 + Math.random() * 40,
        color: colors[Math.floor(Math.random() * colors.length)]
      };
      setBursts(prev => [...prev.slice(-density * 2), newBurst]);
    }, 3000 / (density / 5));
    return () => clearInterval(timer);
  }, [density]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30" style={{ contain: 'strict' }}>
      {bursts.map(b => (
        <div key={b.id} className="absolute" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
          {[...Array(24)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full animate-firework-cluster will-change-transform"
              style={{
                backgroundColor: b.color,
                '--angle': `${i * 15}deg`,
                '--dist': `${120 + Math.random() * 80}px`,
                boxShadow: `0 0 15px ${b.color}`
              } as any}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

const BackgroundRenderer: React.FC<{ asset: BackgroundAsset | null }> = ({ asset }) => {
  if (!asset?.url) return null;
  if (asset.type === 'video') {
    return (
      <video
        src={asset.url}
        autoPlay
        muted
        loop
        playsInline
        className="w-full h-full object-cover"
      />
    );
  }
  return <img src={asset.url} className="w-full h-full object-cover" alt="Background" />;
};

const PresentationTab: React.FC<PresentationTabProps> = ({ config }) => {
  const [tickerData, setTickerData] = useState<TickerData | null>(null);
  const [isYoutubeFailed, setIsYoutubeFailed] = useState(false);
  const [folderImages, setFolderImages] = useState<DriveImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showTotalOverlay, setShowTotalOverlay] = useState(false);
  
  const [bgLayerA, setBgLayerA] = useState<BackgroundAsset | null>(null);
  const [bgLayerB, setBgLayerB] = useState<BackgroundAsset | null>(null);
  const [isLayerBActive, setIsLayerBActive] = useState(false);
  
  const overlayTimeoutRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);

  const parseMoney = (val: any): number => {
    if (typeof val === 'number') return val;
    const s = String(val || '').trim();
    if (!s) return 0;
    return Number(s.replace(/[^\d]/g, '')) || 0;
  };

  const totalMoney = useMemo(() => {
    if (!tickerData?.rows) return 0;
    return tickerData.rows.reduce((sum, r) => sum + parseMoney(r.money), 0);
  }, [tickerData]);

  const youtubeId = useMemo(() => {
    if (config.bgType !== 'youtube') return null;
    return parseYouTubeId(String((config as any).bgYoutubeEmbed || config.bgYoutube || '').trim());
  }, [config.bgType, (config as any).bgYoutubeEmbed, config.bgYoutube]);

  const activeAssetUrl = useMemo(() => {
    if (config.bgType === 'youtube') return null;
    if (config.bgType === 'video') return config.bgVideo;
    if (config.bgType === 'folder' && folderImages.length > 0) return folderImages[currentImageIndex]?.url;
    return config.bgImage || (config as any).bgValue;
  }, [config.bgType, config.bgVideo, config.bgImage, (config as any).bgValue, folderImages, currentImageIndex]);

  useEffect(() => {
    if (!activeAssetUrl) return;
    const nextAsset: BackgroundAsset = { url: activeAssetUrl, type: config.bgType === 'video' ? 'video' : 'image' };
    if (isLayerBActive) {
      if (bgLayerB?.url !== nextAsset.url) { setBgLayerA(nextAsset); setIsLayerBActive(false); }
    } else {
      if (bgLayerA?.url !== nextAsset.url) { setBgLayerB(nextAsset); setIsLayerBActive(true); }
    }
  }, [activeAssetUrl, config.bgType]);

  /** ⚡ TỰ ĐỘNG CẬP NHẬT TỐC ĐỘ DỰA TRÊN NỘI DUNG */
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const updateDuration = () => {
      const width = el.scrollWidth / 2; // Chia đôi vì chúng ta nhân đôi nội dung
      if (width <= 0) return;
      const duration = width / Math.max(1, config.speed);
      el.style.setProperty('--ticker-duration', `${duration}s`);
    };

    const observer = new ResizeObserver(updateDuration);
    observer.observe(el);
    updateDuration();

    return () => observer.disconnect();
  }, [tickerData?.tickerText, config.speed]);

  /** ✅ TIMER TỔNG TIỀN */
  useEffect(() => {
    const intervalSec = Number(config.totalShowInterval) || 300;
    const durationSec = Number(config.totalShowDuration) || 15;
    if (durationSec >= intervalSec || intervalSec <= 0 || durationSec <= 0) return;
    const triggerOverlay = () => {
      setShowTotalOverlay(true);
      if (overlayTimeoutRef.current) window.clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = window.setTimeout(() => { setShowTotalOverlay(false); overlayTimeoutRef.current = null; }, durationSec * 1000);
    };
    const intervalId = window.setInterval(triggerOverlay, intervalSec * 1000);
    const initialDelay = window.setTimeout(triggerOverlay, 5000);
    return () => { window.clearInterval(intervalId); window.clearTimeout(initialDelay); if (overlayTimeoutRef.current) window.clearTimeout(overlayTimeoutRef.current); };
  }, [config.totalShowInterval, config.totalShowDuration]);

  /** YouTube Logic */
  useEffect(() => {
    if (config.bgType !== 'youtube' || !youtubeId) return;
    const initPlayer = () => {
      const YT = (window as any).YT;
      if (!YT?.Player || !youtubeId) return;
      if (ytPlayerRef.current) { try { ytPlayerRef.current.destroy(); } catch(e){} }
      ytPlayerRef.current = new YT.Player('yt-player-container', {
        videoId: youtubeId,
        playerVars: { autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: youtubeId, modestbranding: 1, rel: 0, playsinline: 1 },
        events: { 'onReady': (e:any) => e.target.playVideo(), 'onError': () => setIsYoutubeFailed(true) }
      });
    };
    if (!(window as any).YT) {
      const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag); (window as any).onYouTubeIframeAPIReady = initPlayer;
    } else initPlayer();
    return () => { if (ytPlayerRef.current?.destroy) ytPlayerRef.current.destroy(); };
  }, [config.bgType, youtubeId]);

  const refreshData = async () => {
    try { const data = await fetchData(); setTickerData(data); } catch (err) { console.error('Data fetch error:', err); }
  };

  useEffect(() => {
    refreshData();
    if (config.refreshSec > 0) {
      const interval = window.setInterval(refreshData, config.refreshSec * 1000);
      return () => window.clearInterval(interval);
    }
  }, [config.refreshSec]);

  useEffect(() => {
    if (config.bgType !== 'folder' || !config.bgFolderId) return;
    listImages(config.bgFolderId).then(setFolderImages);
  }, [config.bgType, config.bgFolderId]);

  useEffect(() => {
    if (config.bgType !== 'folder' || folderImages.length <= 1) return;
    const interval = window.setInterval(() => setCurrentImageIndex(p => (p + 1) % folderImages.length), config.bgRotateSec * 1000);
    return () => window.clearInterval(interval);
  }, [config.bgType, folderImages.length, config.bgRotateSec]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col items-center justify-center">
      
      {/* 🎞️ DUAL LAYER BACKGROUND */}
      <div className="absolute inset-0 z-0 bg-black" style={{ contain: 'strict' }}>
        <div className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${!isLayerBActive && config.bgType !== 'youtube' ? 'opacity-100' : 'opacity-0'}`}>
          <BackgroundRenderer asset={bgLayerA} />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${isLayerBActive && config.bgType !== 'youtube' ? 'opacity-100' : 'opacity-0'}`}>
          <BackgroundRenderer asset={bgLayerB} />
        </div>
        {config.bgType === 'youtube' && youtubeId && (
          <div className={`w-full h-full transition-opacity duration-1000 ${!isYoutubeFailed ? 'opacity-100 scale-110' : 'opacity-0'}`}>
            <div id="yt-player-container" className="w-full h-full pointer-events-none" />
          </div>
        )}
      </div>

      {/* Visual Effects Layer */}
      {config.effectMai && <FlowerEffect density={config.effectMaiDensity || 20} color="#FACC15" centerColor="#854d0e" />}
      {config.effectPeach && <FlowerEffect density={config.effectPeachDensity || 20} color="#f472b6" centerColor="#9d174d" />}
      {config.effectPhaoHoa && <FireworksEffect density={config.effectPhaoHoaDensity || 5} />}
      {config.effectSparkles && (
        <div className="absolute inset-0 pointer-events-none z-30" style={{ contain: 'strict' }}>
          {[...Array(30)].map((_, i) => <div key={i} className="absolute w-1 h-1 bg-white rounded-full animate-sparkle will-change-transform" style={{ left: `${Math.random()*100}%`, top: `${Math.random()*100}%`, animationDelay: `${Math.random()*5}s`, boxShadow: '0 0 4px #fff' }} />)}
        </div>
      )}

      {/* ✅ TỔNG TIỀN OVERLAY */}
      {showTotalOverlay && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/10 animate-in fade-in zoom-in duration-500 select-none px-4" onDoubleClick={() => setShowTotalOverlay(false)}>
          <div className="relative bg-[#D0021B] p-[1.8vw] md:p-[1.5vw] rounded-[3vw] border-[0.45vw] border-[#FACC15] shadow-[0_0_6vw_rgba(208,2,27,0.5)] text-center transform border-double max-w-[95vw] md:max-w-[50vw] lg:max-w-[36vw]">
            <div className="absolute top-1.5 left-1.5 w-[2.25vw] h-[2.25vw] border-t-[0.3vw] border-l-[0.3vw] border-[#FACC15] rounded-tl-[1.2vw]"></div>
            <div className="absolute top-1.5 right-1.5 w-[2.25vw] h-[2.25vw] border-t-[0.3vw] border-r-[0.3vw] border-[#FACC15] rounded-tr-[1.2vw]"></div>
            <div className="absolute bottom-1.5 left-1.5 w-[2.25vw] h-[2.25vw] border-b-[0.3vw] border-l-[0.3vw] border-[#FACC15] rounded-bl-[1.2vw]"></div>
            <div className="absolute bottom-1.5 right-1.5 w-[2.25vw] h-[2.25vw] border-b-[0.3vw] border-r-[0.3vw] border-[#FACC15] rounded-br-[1.2vw]"></div>
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-[5.2vw] h-[5.2vw] min-w-[54px] min-h-[54px] mb-[1.2vw] bg-[#FACC15] rounded-full flex items-center justify-center shadow-[0_0_2.2vw_rgba(250,204,21,0.5)] border-[0.3vw] border-[#D0021B]">
                 <svg viewBox="0 0 100 100" className="w-[3.3vw] h-[3.3vw] min-w-[36px] min-h-[36px] fill-[#D0021B]"><circle cx="50" cy="50" r="10" fill="#a16207" />{[0, 72, 144, 216, 288].map(angle => (<ellipse key={angle} cx="50" cy="32" rx="18" ry="24" transform={`rotate(${angle} 50 50)`} />))}</svg>
              </div>
              <h3 className="text-[1.5vw] md:text-[1.2vw] font-black text-[#FACC15] uppercase tracking-[0.2em] mb-[0.9vw] drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]">TỔNG SỐ TIỀN HIỆN TẠI</h3>
              <div className="bg-black/20 py-[1.2vw] px-[3vw] rounded-[2vw] border border-white/5 mb-[1.2vw] shadow-inner w-full">
                <div className="text-[clamp(2.2rem,4.5vw,7.5rem)] font-black text-white tracking-tighter drop-shadow-[0_0.3vw_0.6vw_rgba(0,0,0,0.6)] flex items-baseline justify-center gap-[1.2vw]">{totalMoney.toLocaleString('vi-VN')}<span className="text-[1.8vw] text-[#FACC15] font-bold">VNĐ</span></div>
              </div>
              <div className="bg-white/5 backdrop-blur-md p-[1.2vw] rounded-[1.5vw] border border-white/10 shadow-lg max-w-[95%]">
                <p className="text-[1.2vw] md:text-[1.05vw] font-bold text-yellow-100 italic leading-tight">"Kính chúc quý Mạnh Thường Quân Vạn Sự Như Ý!<br/>Trân trọng cảm ơn quý vị."</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ FIX LỖI TICKER BAR TREO BẰNG CSS VARIABLES */}
      <div 
        className="absolute z-40 w-full flex items-center overflow-hidden" 
        style={{ 
          height: `${config.barHeight}px`, 
          backgroundColor: config.barColor, 
          [config.position === 'middle' ? 'top' : config.position]: 0, 
          ...(config.position === 'middle' && { top: '50%', transform: 'translateY(-50%)' }),
          contain: 'layout paint'
        }}
      >
        <div 
          ref={contentRef} 
          className={`whitespace-nowrap flex items-center h-full will-change-transform ticker-anim-${config.direction}`}
          style={{ 
            fontSize: `${config.fontSize}px`, 
            color: config.textColor, 
            fontWeight: 800, 
            textShadow: '0 4px 12px rgba(0,0,0,0.4)',
            backfaceVisibility: 'hidden'
          }}
        >
          {tickerData?.tickerText ? (
            <>
              <SmoothTickerContent text={tickerData.tickerText} />
              <SmoothTickerContent text={tickerData.tickerText} />
            </>
          ) : (
            <span className="px-10 opacity-40 italic font-normal">Đang kết nối dữ liệu...</span>
          )}
        </div>
      </div>

      <style>{`
        /* Chống treo: Luôn ưu tiên transform3d để GPU xử lý */
        .ticker-anim-rtl {
          animation: ticker-rtl-fixed var(--ticker-duration, 30s) linear infinite;
        }
        .ticker-anim-ltr {
          animation: ticker-ltr-fixed var(--ticker-duration, 30s) linear infinite;
        }

        @keyframes ticker-rtl-fixed {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes ticker-ltr-fixed {
          from { transform: translate3d(-50%, 0, 0); }
          to { transform: translate3d(0, 0, 0); }
        }

        @keyframes flower-fall {
          0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
          10% { opacity: 0.9; }
          90% { opacity: 0.9; }
          100% { transform: translate3d(var(--sway), 110vh, 0) rotate(720deg); opacity: 0; }
        }
        @keyframes firework-cluster {
          0% { transform: rotate(var(--angle)) translate3d(0, 0, 0) scale(1); opacity: 1; }
          70% { opacity: 1; }
          100% { transform: rotate(var(--angle)) translate3d(0, var(--dist), 0) scale(0.2); opacity: 0; }
        }
        .animate-firework-cluster { animation: firework-cluster 1.2s cubic-bezier(0.1, 0.5, 0.1, 1) forwards; }
        @keyframes sparkle { 0%, 100% { transform: translate3d(0,0,0) scale(0); opacity: 0; } 50% { transform: translate3d(0,0,0) scale(1.5); opacity: 1; } }
        .animate-sparkle { animation: sparkle 3s ease-in-out infinite; }
        .will-change-transform { will-change: transform; }
      `}</style>
    </div>
  );
};

export default PresentationTab;
