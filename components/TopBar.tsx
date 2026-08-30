'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Theme = 'light' | 'dark' | 'system';

const ICONS = {
  gear: <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03z" /></g>,
  refresh: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" /><path d="M20.5 4.5V10H15" /></g>,
  sun: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" /></g>,
  moon: <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  auto: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8.4" /><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none" /></g>,
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg viewBox="0 0 24 24" aria-hidden>{ICONS[name]}</svg>;
}

/** Barra de acciones: configuración, recargar datos y selector de tema. */
export function TopBar({ status }: { status: { ok: boolean; when: string } | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const saved = (localStorage.getItem('edn-theme') as Theme) || 'system';
    setTheme(saved);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    try { localStorage.setItem('edn-theme', next); } catch { /* ignorar */ }
    const root = document.documentElement;
    if (next === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', next);
  }

  const opciones: { id: Theme; icon: keyof typeof ICONS; title: string }[] = [
    { id: 'light', icon: 'sun', title: 'Claro' },
    { id: 'dark', icon: 'moon', title: 'Oscuro' },
    { id: 'system', icon: 'auto', title: 'Según el sistema' },
  ];

  return (
    <div className="actions">
      {status && (
        <span className={`run-chip ${status.ok ? 'ok' : 'bad'}`} title={`Última corrida: ${status.when}`}>
          <i /><span className="rc-text">{status.ok ? 'Al día' : 'Con error'}</span>
        </span>
      )}
      <div className="seg">
        {opciones.map((o) => (
          <button
            key={o.id}
            className={`icon-btn ${theme === o.id ? 'on' : ''}`}
            onClick={() => apply(o.id)}
            title={o.title}
            aria-label={o.title}
            aria-pressed={theme === o.id}
          >
            <Icon name={o.icon} />
          </button>
        ))}
      </div>
      <button
        className={`icon-btn solo ${pending ? 'spin' : ''}`}
        onClick={() => startTransition(() => router.refresh())}
        title="Recargar datos"
        aria-label="Recargar datos"
      >
        <Icon name="refresh" />
      </button>
      <a className="icon-btn solo" href="/mi-cuenta" title="Mi cuenta de luz" aria-label="Mi cuenta de luz">
        <svg viewBox="0 0 24 24" aria-hidden><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" /></svg>
      </a>
      <a className="icon-btn solo" href="/config" title="Configuración" aria-label="Configuración">
        <Icon name="gear" />
      </a>
      <form method="post" action="/api/auth">
        <input type="hidden" name="accion" value="salir" />
        <button className="icon-btn solo" type="submit" title="Salir" aria-label="Salir">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2M19 12H9m10 0-3-3m3 3-3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </form>
    </div>
  );
}
