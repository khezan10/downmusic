'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, Music, Settings, Loader2, Check, AlertCircle, X, ChevronDown, Search, Trash2, Heart, Menu, X as CloseIcon } from 'lucide-react';
import { designTokens } from '@/lib/design-tokens';
import './page.css';

interface DownloadItem {
  quality: string;
  format: string;
  url: string;
}

interface ResolveResult {
  title: string;
  thumbnail: string;
  duration: number;
  author: string;
  downloads: DownloadItem[];
  audio?: { title: string; url: string };
  upstream: string;
  platform: string;
  note?: string;
  youtubeMusicUrl?: string;
  spotifyUrl?: string;
}

interface RecentDownload {
  platform: string;
  ipMasked: string;
  title: string;
  thumbnail: string;
  duration: number;
  author: string;
  upstream: string;
  createdAt: string;
}

interface UpstreamStatus {
  id: string;
  role: 'primary' | 'fallback';
  name: string;
  host: string;
  scope: string[];
  status: 'online' | 'offline';
  latency: number;
  serving: number;
  servingPct: number;
}

const STAGGER_DELAYS = [0, 100, 160, 220, 280, 340, 400, 460];

export default function DownMusic() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [resolveResult, setResolveResult] = useState<ResolveResult | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [recentDownloads, setRecentDownloads] = useState<RecentDownload[]>([]);
  const [upstreams, setUpstreams] = useState<UpstreamStatus[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'downloads' | 'monitor'>('downloads');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchRecent();
    fetchMonitor();
    const interval = setInterval(() => {
      fetchRecent();
      fetchMonitor();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const showNotification = (msg: string) => {
    setNotifications(prev => [...prev, msg]);
    setTimeout(() => setNotifications(prev => prev.slice(1)), 5000);
  };

  const fetchRecent = async () => {
    try {
      const res = await fetch('/api/recent?limit=10');
      const data = await res.json();
      if (data.success) setRecentDownloads(data.downloads);
    } catch (e) { console.error(e); }
  };

  const fetchMonitor = async () => {
    try {
      const res = await fetch('/api/monitor');
      const data = await res.json();
      if (data.success) setUpstreams(data.upstreams);
    } catch (e) { console.error(e); }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setIsLoading(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results);
        setSelectedResult(data.results[0] || null);
      } else {
        showNotification(data.error || 'Search failed');
      }
    } catch (e) {
      showNotification('Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async (url: string) => {
    setIsResolving(true);
    try {
      const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.success) {
        setResolveResult(data);
        showNotification(`Resolved via ${data.upstream}`);
      } else {
        showNotification(data.error || 'Resolve failed');
      }
    } catch (e) {
      showNotification('Resolve failed');
    } finally {
      setIsResolving(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'spotify': return <Music className="w-4 h-4" />;
      case 'youtube': case 'youtube-music': return <Music className="w-4 h-4" />;
      case 'tiktok': return <Heart className="w-4 h-4" />;
      default: return <Music className="w-4 h-4" />;
    }
  };

  const handleDownload = (item: DownloadItem) => {
    window.open(`/api/download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(resolveResult?.title || 'download')}.${item.format}`, '_blank');
    showNotification(`Downloading ${item.quality} ${item.format.toUpperCase()}`);
  };

  const handleAudioDownload = async () => {
    if (resolveResult?.audio) {
      window.open(`/api/download?url=${encodeURIComponent(resolveResult.audio.url)}&filename=${encodeURIComponent(resolveResult.audio.title)}.mp3`, '_blank');
      showNotification('Downloading audio MP3');
    } else if (resolveResult?.title && resolveResult?.author) {
      // Client-side extraction fallback
      showNotification('Starting client-side extraction...');
      try {
        const { extractAndDownload } = await import('@/lib/audio-extractor');
        const result = await extractAndDownload(
          resolveResult.title,
          resolveResult.author,
          (status) => showNotification(status)
        );
        if (!result.success) {
          showNotification(result.error || 'Download failed');
        }
      } catch (e) {
        showNotification('Client-side extraction failed');
      }
    }
  };

  return (
    <div className="min-h-screen bg-primary text-on-primary font-mono" style={{ 
      backgroundColor: designTokens.colors.primary,
      color: designTokens.colors['on-primary'],
      fontFamily: designTokens.typography['body-md'].fontFamily,
    }}>
      

      {/* Mobile Menu Button */}
      <button 
        className="fixed top-4 right-4 z-40 p-2 md:hidden"
        onClick={() => setShowMobileMenu(!showMobileMenu)}
        style={{ background: designTokens.colors.line, border: '1px solid #262626', borderRadius: '8px' }}
      >
        {showMobileMenu ? <CloseIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile Sidebar */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-30 md:hidden" style={{ background: 'rgba(6,7,5,0.95)', backdropFilter: 'blur(8px)' }}>
          <div className="flex flex-col h-full p-6" style={{ background: designTokens.colors.primary }}>
            <button onClick={() => setShowMobileMenu(false)} className="self-end mb-8 p-2" style={{ background: designTokens.colors.line, border: '1px solid #262626', borderRadius: '8px' }}>
              <CloseIcon className="w-6 h-6" />
            </button>
            <nav className="flex flex-col gap-4">
              <button onClick={() => { setActiveTab('downloads'); setShowMobileMenu(false); }} className={`text-left py-3 px-4 border-b ${activeTab === 'downloads' ? 'text-tertiary' : 'text-neutral'}`} style={{ borderColor: designTokens.colors.line, fontFamily: designTokens.typography['label-caps'].fontFamily, fontSize: designTokens.typography['label-caps'].fontSize }}>
                Recent Downloads
              </button>
              <button onClick={() => { setActiveTab('monitor'); setShowMobileMenu(false); }} className={`text-left py-3 px-4 border-b ${activeTab === 'monitor' ? 'text-tertiary' : 'text-neutral'}`} style={{ borderColor: designTokens.colors.line, fontFamily: designTokens.typography['label-caps'].fontFamily, fontSize: designTokens.typography['label-caps'].fontSize }}>
                Backend Monitor
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-12 md:py-20" style={{ paddingTop: designTokens.spacing.section, paddingBottom: designTokens.spacing.section }}>
        {/* Hero Section */}
        <section className="mb-16 md:mb-24" style={{ marginBottom: designTokens.spacing.section }}>
          <div className="reveal stagger-0">
            <h1 className="char-hover" style={{ 
              fontFamily: designTokens.typography.display.fontFamily,
              fontSize: designTokens.typography.display.fontSize,
              fontWeight: designTokens.typography.display.fontWeight,
              lineHeight: designTokens.typography.display.lineHeight,
              letterSpacing: designTokens.typography.display.letterSpacing,
            }}>
              <span>D</span><span>O</span><span>W</span><span>N</span><span>M</span><span>U</span><span>S</span><span>I</span><span>C</span>
            </h1>
          </div>
          <div className="reveal stagger-1 mt-4" style={{ marginTop: designTokens.spacing.md }}>
            <p className="typewriter" style={{ 
              fontFamily: designTokens.typography['body-lg'].fontFamily,
              fontSize: designTokens.typography['body-lg'].fontSize,
              color: designTokens.colors.tertiary,
              maxWidth: 'fit-content',
            }}>
              download your playlist spotif*ck anything anywhere anytime
            </p>
          </div>
          <div className="reveal stagger-2 mt-6 flex flex-wrap gap-2" style={{ marginTop: designTokens.spacing.lg }}>
            <span className="px-3 py-1 text-xs" style={{ 
              fontFamily: designTokens.typography['label-caps'].fontFamily,
              fontSize: designTokens.typography['label-caps'].fontSize,
              backgroundColor: designTokens.colors['lime-faint'],
              border: `1px solid ${designTokens.colors.line}`,
              borderRadius: designTokens.rounded.full,
              color: designTokens.colors.tertiary,
            }}>Open Source</span>
            <span className="px-3 py-1 text-xs" style={{ 
              fontFamily: designTokens.typography['label-caps'].fontFamily,
              fontSize: designTokens.typography['label-caps'].fontSize,
              backgroundColor: designTokens.colors['lime-faint'],
              border: `1px solid ${designTokens.colors.line}`,
              borderRadius: designTokens.rounded.full,
              color: designTokens.colors.neutral,
            }}>No Account Needed</span>
            <span className="px-3 py-1 text-xs" style={{ 
              fontFamily: designTokens.typography['label-caps'].fontFamily,
              fontSize: designTokens.typography['label-caps'].fontSize,
              backgroundColor: designTokens.colors['lime-faint'],
              border: `1px solid ${designTokens.colors.line}`,
              borderRadius: designTokens.rounded.full,
              color: designTokens.colors.neutral,
            }}>Full Metadata</span>
            <span className="px-3 py-1 text-xs" style={{ 
              fontFamily: designTokens.typography['label-caps'].fontFamily,
              fontSize: designTokens.typography['label-caps'].fontSize,
              backgroundColor: designTokens.colors['lime-faint'],
              border: `1px solid ${designTokens.colors.line}`,
              borderRadius: designTokens.rounded.full,
              color: designTokens.colors.neutral,
            }}>Album Art & Lyrics</span>
            <span className="px-3 py-1 text-xs" style={{ 
              fontFamily: designTokens.typography['label-caps'].fontFamily,
              fontSize: designTokens.typography['label-caps'].fontSize,
              backgroundColor: designTokens.colors['lime-faint'],
              border: `1px solid ${designTokens.colors.line}`,
              borderRadius: designTokens.rounded.full,
              color: designTokens.colors.neutral,
            }}>M3U Export</span>
          </div>
        </section>

        {/* Search Section */}
        <section className="reveal stagger-3 mb-12" style={{ marginBottom: designTokens.spacing.section }}>
          <form onSubmit={handleSearch} className="relative">
            <div className="relative" style={{ backgroundColor: designTokens.colors.surface, border: `1px solid ${designTokens.colors.line}`, borderRadius: designTokens.rounded.lg }}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: designTokens.colors.neutral }} />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Paste Spotify URL, YouTube link, or search query..."
                className="w-full pl-12 pr-12 py-4 text-base bg-transparent outline-none placeholder-neutral"
                style={{ 
                  fontFamily: designTokens.typography['body-md'].fontFamily,
                  fontSize: designTokens.typography['body-md'].fontSize,
                  color: designTokens.colors['on-primary'],
                }}
                disabled={isLoading}
              />
              {isLoading ? (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin" style={{ color: designTokens.colors.tertiary }} />
              ) : (
                <button
                  type="submit"
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-4 py-2"
                  style={{
                    fontFamily: designTokens.typography['label-caps'].fontFamily,
                    fontSize: designTokens.typography['label-caps'].fontSize,
                    backgroundColor: designTokens.colors.tertiary,
                    color: designTokens.colors['on-tertiary'],
                    borderRadius: designTokens.rounded.md,
                    border: 'none',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading || !query.trim() ? 0.5 : 1,
                  }}
                  disabled={isLoading || !query.trim()}
                >
                  RESOLVE
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Search Results */}
        {searchResults.length > 0 && !resolveResult && (
          <section className="reveal stagger-4 mb-12" style={{ marginBottom: designTokens.spacing.section }}>
            <h2 className="mb-4" style={{
              fontFamily: designTokens.typography.title.fontFamily,
              fontSize: designTokens.typography.title.fontSize,
              fontWeight: designTokens.typography.title.fontWeight,
              color: designTokens.colors.tertiary,
            }}>SEARCH RESULTS</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {searchResults.map((result, i) => (
                <button
                  key={result.videoId}
                  onClick={() => { setSelectedResult(result); handleResolve(result.url); }}
                  className={`relative p-4 text-left transition-all ${selectedResult?.videoId === result.videoId ? 'ring-2' : ''}`}
                  style={{
                    backgroundColor: designTokens.colors.surface,
                    border: `1px solid ${selectedResult?.videoId === result.videoId ? designTokens.colors.tertiary : designTokens.colors.line}`,
                    borderRadius: designTokens.rounded.lg,
                    color: designTokens.colors['on-primary'],
                    fontFamily: designTokens.typography['body-md'].fontFamily,
                    transitionDelay: `${STAGGER_DELAYS[i % STAGGER_DELAYS.length]}ms`,
                  }}
                >
                  <div className="flex gap-3">
                    <img 
                      src={result.thumbnail} 
                      alt="" 
                      className="w-16 h-16 object-cover flex-shrink-0"
                      style={{ borderRadius: designTokens.rounded.md }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium" style={{ fontFamily: designTokens.typography['body-md'].fontFamily }}>{result.title}</p>
                      <p className="truncate text-sm mt-1" style={{ color: designTokens.colors.neutral, fontFamily: designTokens.typography.metadata.fontFamily }}>{result.artist}</p>
                      <p className="text-xs mt-2" style={{ color: designTokens.colors.neutral, fontFamily: designTokens.typography.metadata.fontFamily }}>{formatDuration(result.duration)} • {result.isSpotify ? 'Spotify → YT Music' : 'YouTube Music'}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Resolve Result / Download Options */}
        {resolveResult && (
          <section className="reveal stagger-5 mb-12" style={{ marginBottom: designTokens.spacing.section }}>
            <div style={{ backgroundColor: designTokens.colors.surface, border: `1px solid ${designTokens.colors.line}`, borderRadius: designTokens.rounded.xl, padding: designTokens.spacing.xl }}>
              <div className="flex flex-col md:flex-row gap-6 mb-6">
                <img 
                  src={resolveResult.thumbnail} 
                  alt="" 
                  className="w-32 h-32 md:w-40 md:h-40 object-cover flex-shrink-0"
                  style={{ borderRadius: designTokens.rounded.lg }}
                />
                <div className="flex-1">
                  <h3 style={{
                    fontFamily: designTokens.typography.title.fontFamily,
                    fontSize: designTokens.typography.title.fontSize,
                    fontWeight: designTokens.typography.title.fontWeight,
                    color: designTokens.colors['on-primary'],
                  }}>{resolveResult.title}</h3>
                  <p className="mt-2" style={{ color: designTokens.colors.neutral, fontFamily: designTokens.typography['body-md'].fontFamily }}>{resolveResult.author}</p>
                  <div className="flex flex-wrap gap-4 mt-4 text-sm" style={{ fontFamily: designTokens.typography.metadata.fontFamily }}>
                    <span style={{ color: designTokens.colors.tertiary }}>{formatDuration(resolveResult.duration)}</span>
                    <span style={{ color: designTokens.colors.neutral }}>via {resolveResult.upstream}</span>
                    <span style={{ color: designTokens.colors.neutral }}>{resolveResult.platform}</span>
                  </div>
                </div>
              </div>
              
              <div className="border-t pt-6" style={{ borderColor: designTokens.colors.line }}>
                {resolveResult.downloads.length > 0 ? (
                  <>
                    <h4 className="mb-4" style={{
                      fontFamily: designTokens.typography['label-caps'].fontFamily,
                      fontSize: designTokens.typography['label-caps'].fontSize,
                      color: designTokens.colors.tertiary,
                    }}>AVAILABLE DOWNLOADS</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      {resolveResult.downloads.map((item, i) => (
                        <button
                          key={`${item.quality}-${item.format}`}
                          onClick={() => handleDownload(item)}
                          className="flex items-center justify-between p-4 transition-all"
                          style={{
                            backgroundColor: designTokens.colors.primary,
                            border: `1px solid ${designTokens.colors.line}`,
                            borderRadius: designTokens.rounded.lg,
                            color: designTokens.colors['on-primary'],
                            fontFamily: designTokens.typography['body-md'].fontFamily,
                            transitionDelay: `${STAGGER_DELAYS[i % STAGGER_DELAYS.length]}ms`,
                          }}
                        >
                          <span>{item.quality} • {item.format.toUpperCase()}</span>
                          <Download className="w-5 h-5" style={{ color: designTokens.colors.tertiary }} />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="mb-3" style={{
                      fontFamily: designTokens.typography['label-caps'].fontFamily,
                      fontSize: designTokens.typography['label-caps'].fontSize,
                      color: designTokens.colors.tertiary,
                    }}>NO AUDIO SOURCE CONFIGURED</h4>
                    <p className="mb-4" style={{
                      color: designTokens.colors.neutral,
                      fontFamily: designTokens.typography['body-md'].fontFamily,
                      fontSize: '0.85rem',
                      lineHeight: 1.7,
                    }}>
                      {resolveResult.note ?? 'This deployment resolves track metadata only.'}
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {resolveResult.youtubeMusicUrl && (
                        <a
                          href={resolveResult.youtubeMusicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4"
                          style={{
                            backgroundColor: designTokens.colors['lime-faint'],
                            border: `1px solid ${designTokens.colors.tertiary}`,
                            borderRadius: designTokens.rounded.lg,
                            color: designTokens.colors.tertiary,
                            fontFamily: designTokens.typography['body-md'].fontFamily,
                            textDecoration: 'none',
                          }}
                        >
                          <span>Open in YouTube Music</span>
                          <Music className="w-5 h-5" />
                        </a>
                      )}
                      {resolveResult.spotifyUrl && (
                        <a
                          href={resolveResult.spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4"
                          style={{
                            backgroundColor: designTokens.colors.primary,
                            border: `1px solid ${designTokens.colors.line}`,
                            borderRadius: designTokens.rounded.lg,
                            color: designTokens.colors['on-primary'],
                            fontFamily: designTokens.typography['body-md'].fontFamily,
                            textDecoration: 'none',
                          }}
                        >
                          <span>Open in Spotify</span>
                          <Music className="w-5 h-5" style={{ color: designTokens.colors.tertiary }} />
                        </a>
                      )}
                    </div>
                  </>
                )}
                
                {resolveResult.audio && (
                  <div className="border-t pt-6 mt-6" style={{ borderColor: designTokens.colors.line }}>
                    <h4 className="mb-4" style={{
                      fontFamily: designTokens.typography['label-caps'].fontFamily,
                      fontSize: designTokens.typography['label-caps'].fontSize,
                      color: designTokens.colors.tertiary,
                    }}>AUDIO ONLY</h4>
                    <button
                      onClick={handleAudioDownload}
                      className="flex items-center justify-between p-4 w-full"
                      style={{
                        backgroundColor: designTokens.colors['lime-faint'],
                        border: `1px solid ${designTokens.colors.tertiary}`,
                        borderRadius: designTokens.rounded.lg,
                        color: designTokens.colors.tertiary,
                        fontFamily: designTokens.typography['body-md'].fontFamily,
                      }}
                    >
                      <span>{resolveResult.audio.title} • MP3</span>
                      <Music className="w-5 h-5" />
                    </button>
                  </div>
                )}

                <button
                  onClick={() => { setResolveResult(null); setSelectedResult(null); }}
                  className="mt-6 w-full py-3 text-center"
                  style={{
                    fontFamily: designTokens.typography['label-caps'].fontFamily,
                    fontSize: designTokens.typography['label-caps'].fontSize,
                    color: designTokens.colors.neutral,
                    background: 'transparent',
                    border: `1px dashed ${designTokens.colors.line}`,
                    borderRadius: designTokens.rounded.md,
                    cursor: 'pointer',
                  }}
                >
                  NEW SEARCH
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Activity Log & Backend Monitor Tabs */}
        <section className="reveal stagger-6" style={{ 
          backgroundColor: designTokens.colors.surface, 
          border: `1px solid ${designTokens.colors.line}`, 
          borderRadius: designTokens.rounded.xl,
          overflow: 'hidden',
        }}>
          {/* Desktop Tabs */}
          <div className="hidden md:flex border-b" style={{ borderColor: designTokens.colors.line }}>
            <button
              onClick={() => setActiveTab('downloads')}
              className={`flex-1 py-3 px-4 text-center transition-colors ${activeTab === 'downloads' ? 'bg-primary' : ''}`}
              style={{
                fontFamily: designTokens.typography['label-caps'].fontFamily,
                fontSize: designTokens.typography['label-caps'].fontSize,
                color: activeTab === 'downloads' ? designTokens.colors.tertiary : designTokens.colors.neutral,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              RECENT DOWNLOADS
            </button>
            <button
              onClick={() => setActiveTab('monitor')}
              className={`flex-1 py-3 px-4 text-center transition-colors ${activeTab === 'monitor' ? 'bg-primary' : ''}`}
              style={{
                fontFamily: designTokens.typography['label-caps'].fontFamily,
                fontSize: designTokens.typography['label-caps'].fontSize,
                color: activeTab === 'monitor' ? designTokens.colors.tertiary : designTokens.colors.neutral,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              BACKEND MONITOR
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-4 md:p-6 max-h-[500px] overflow-y-auto">
            {activeTab === 'downloads' ? (
              <div>
                {recentDownloads.length === 0 ? (
                  <div className="text-center py-12" style={{ color: designTokens.colors.neutral }}>
                    <Download className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p style={{ fontFamily: designTokens.typography['body-md'].fontFamily }}>No downloads yet. Be the first!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentDownloads.map((dl, i) => (
                      <div
                        key={`${dl.createdAt}-${i}`}
                        className="flex items-center gap-3 p-3 transition-all"
                        style={{
                          backgroundColor: designTokens.colors.primary,
                          border: `1px solid ${designTokens.colors.line}`,
                          borderRadius: designTokens.rounded.lg,
                          transitionDelay: `${STAGGER_DELAYS[i % STAGGER_DELAYS.length]}ms`,
                        }}
                      >
                        <img 
                          src={dl.thumbnail} 
                          alt="" 
                          className="w-12 h-12 object-cover flex-shrink-0"
                          style={{ borderRadius: designTokens.rounded.md }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium" style={{ fontFamily: designTokens.typography['body-md'].fontFamily }}>{dl.title}</p>
                          <p className="truncate text-xs" style={{ color: designTokens.colors.neutral, fontFamily: designTokens.typography.metadata.fontFamily }}>{dl.author}</p>
                        </div>
                        <div className="text-right hidden sm:block">
                          <p className="text-xs" style={{ color: designTokens.colors.tertiary, fontFamily: designTokens.typography['label-caps'].fontFamily }}>{dl.upstream}</p>
                          <p className="text-xs" style={{ color: designTokens.colors.neutral, fontFamily: designTokens.typography.metadata.fontFamily }}>{dl.ipMasked}</p>
                        </div>
                        <span className="px-2 py-1 text-xs" style={{
                          fontFamily: designTokens.typography['label-caps'].fontFamily,
                          backgroundColor: designTokens.colors['lime-faint'],
                          border: `1px solid ${designTokens.colors.line}`,
                          borderRadius: designTokens.rounded.full,
                          color: designTokens.colors.neutral,
                        }}>{dl.platform}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                {upstreams.length === 0 ? (
                  <div className="text-center py-12" style={{ color: designTokens.colors.neutral }}>
                    <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: designTokens.colors.tertiary }} />
                    <p style={{ fontFamily: designTokens.typography['body-md'].fontFamily }}>Probing upstream resolvers...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upstreams.map((up, i) => (
                      <div
                        key={up.id}
                        className="flex items-center justify-between p-3 transition-all"
                        style={{
                          backgroundColor: designTokens.colors.primary,
                          border: `1px solid ${designTokens.colors.line}`,
                          borderRadius: designTokens.rounded.lg,
                          transitionDelay: `${STAGGER_DELAYS[i % STAGGER_DELAYS.length]}ms`,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ 
                              backgroundColor: up.status === 'online' ? '#22C55E' : '#EF4444',
                              boxShadow: up.status === 'online' ? '0 0 8px #22C55E' : '0 0 8px #EF4444',
                            }}
                          />
                          <div>
                            <p className="font-medium" style={{ fontFamily: designTokens.typography['body-md'].fontFamily }}>{up.name}</p>
                            <p className="text-xs" style={{ color: designTokens.colors.neutral, fontFamily: designTokens.typography.metadata.fontFamily }}>{up.host}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm" style={{ fontFamily: designTokens.typography.metadata.fontFamily }}>
                          <span className={`flex items-center gap-1 ${up.status === 'online' ? '' : ''}`} style={{ color: up.status === 'online' ? '#22C55E' : '#EF4444' }}>
                            {up.status === 'online' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {up.status.toUpperCase()}
                          </span>
                          <span style={{ color: designTokens.colors.neutral }}>{up.latency}ms</span>
                          <span style={{ color: designTokens.colors.tertiary }}>{up.servingPct}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="reveal stagger-7 mt-12 text-center" style={{ marginTop: designTokens.spacing.section, color: designTokens.colors.neutral }}>
          <p style={{ fontFamily: designTokens.typography.metadata.fontFamily, fontSize: designTokens.typography.metadata.fontSize }}>
            DownMusic v1.0.0 • Open Source • 
            <a href="https://github.com/khezan10/downmusic" target="_blank" rel="noopener noreferrer" className="underline hover:text-tertiary transition-colors">GitHub</a>
            • Built with Next.js + Vercel
          </p>
        </footer>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b" style={{ borderColor: designTokens.colors.line }}>
              <div className="flex items-center justify-between">
                <h2 style={{
                  fontFamily: designTokens.typography.title.fontFamily,
                  fontSize: designTokens.typography.title.fontSize,
                  color: designTokens.colors.tertiary,
                }}>SETTINGS</h2>
                <button onClick={() => setShowSettings(false)} className="p-1" style={{ background: designTokens.colors.line, border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                  <X className="w-5 h-5" style={{ color: designTokens.colors.neutral }} />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block mb-3" style={{ fontFamily: designTokens.typography['label-caps'].fontFamily, fontSize: designTokens.typography['label-caps'].fontSize, color: designTokens.colors.tertiary }}>
                  RESOLUTION CHAIN
                </label>
                <div className="space-y-2" style={{ fontFamily: designTokens.typography.metadata.fontFamily, fontSize: designTokens.typography.metadata.fontSize, color: designTokens.colors.neutral }}>
                  <p>Metadata — Spotify oEmbed → Deezer (rank match) → iTunes</p>
                  <p>Audio match — YouTube Music search</p>
                  <p>Download — {upstreams.length > 0 ? 'served only when an audio resolver is configured' : 'checking…'}</p>
                </div>
              </div>
              <div className="pt-4 border-t" style={{ borderColor: designTokens.colors.line }}>
                <p style={{ fontFamily: designTokens.typography.metadata.fontFamily, fontSize: designTokens.typography.metadata.fontSize, color: designTokens.colors.neutral }}>
                  No API keys are required for metadata. A file download needs AUDIO_RESOLVER_URL, because every free Spotify converter blocks server IPs.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="region" aria-live="polite">
        {notifications.map((msg, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 py-3 min-w-[280px] max-w-sm animate-slide-in"
            style={{
              backgroundColor: designTokens.colors.surface,
              border: `1px solid ${designTokens.colors.line}`,
              borderRadius: designTokens.rounded.lg,
              color: designTokens.colors['on-primary'],
              fontFamily: designTokens.typography['body-md'].fontFamily,
              fontSize: designTokens.typography['body-md'].fontSize,
              boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            }}
          >
            <Check className="w-5 h-5 flex-shrink-0" style={{ color: designTokens.colors.tertiary }} />
            <span>{msg}</span>
          </div>
        ))}
      </div>

      
    </div>
  );
}
