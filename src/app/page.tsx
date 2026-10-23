'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleResolve = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: query }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <main style={{
      minHeight: '100vh',
      backgroundColor: '#0A0B08',
      color: '#B4FF2B',
      fontFamily: '"Space Mono", monospace',
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <h1 style={{
        fontSize: '3rem',
        marginBottom: '0.5rem',
        letterSpacing: '0.1em',
        color: '#B4FF2B',
      }}>
        DOWNMUSIC
      </h1>
      
      <p style={{
        color: '#A8A8A8',
        marginBottom: '2rem',
        textAlign: 'center',
      }}>
        download your playlist spotif*ck anything anywhere anytime
      </p>

      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '2rem',
        width: '100%',
        maxWidth: '600px',
      }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Paste Spotify URL..."
          style={{
            flex: 1,
            padding: '1rem',
            backgroundColor: '#060705',
            border: '1px solid #262626',
            borderRadius: '8px',
            color: '#F5F5F5',
            fontFamily: 'inherit',
            fontSize: '1rem',
            outline: 'none',
          }}
        />
        <button
          onClick={handleResolve}
          disabled={loading}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#B4FF2B',
            color: '#0A0B08',
            border: 'none',
            borderRadius: '8px',
            fontFamily: 'inherit',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'LOADING...' : 'RESOLVE'}
        </button>
      </div>

      {result && (
        <div style={{
          backgroundColor: '#060705',
          border: '1px solid #262626',
          borderRadius: '12px',
          padding: '1.5rem',
          width: '100%',
          maxWidth: '600px',
        }}>
          {result.thumbnail && (
            <img 
              src={result.thumbnail} 
              alt={result.title}
              style={{
                width: '100%',
                maxWidth: '300px',
                borderRadius: '8px',
                marginBottom: '1rem',
              }}
            />
          )}
          <h2 style={{ color: '#B4FF2B', marginBottom: '0.5rem' }}>
            {result.title}
          </h2>
          <p style={{ color: '#A8A8A8', marginBottom: '0.5rem' }}>
            {result.author}
          </p>
          {result.duration && (
            <p style={{ color: '#A8A8A8', fontSize: '0.875rem' }}>
              Duration: {Math.floor(result.duration / 60)}:{(result.duration % 60).toString().padStart(2, '0')}
            </p>
          )}
          {result.youtubeMusicUrl && (
            <a 
              href={result.youtubeMusicUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: '1rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: '#B4FF2B',
                color: '#0A0B08',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              Open in YouTube Music
            </a>
          )}
        </div>
      )}

      <footer style={{
        marginTop: '4rem',
        color: '#A8A8A8',
        fontSize: '0.875rem',
      }}>
        <a href="/api/monitor" style={{ color: '#B4FF2B' }}>API Status</a>
        {' • '}
        <a href="/api/recent" style={{ color: '#B4FF2B' }}>Recent</a>
        {' • '}
        <a href="https://github.com/khezan10/downmusic" target="_blank" rel="noopener noreferrer" style={{ color: '#B4FF2B' }}>
          GitHub
        </a>
      </footer>
    </main>
  );
}
