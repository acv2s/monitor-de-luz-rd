/**
 * Íconos de trazo (1.9) del sistema visual. Los títulos de las tarjetas
 * usaban emojis, que se ven distinto en cada teléfono y no van con el diseño
 * plano: aquí cada emoji viejo apunta a su ícono equivalente.
 */
const TRAZOS: Record<string, React.ReactNode> = {
  meta: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  rayo: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  campana: <><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  robot: <><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4" /><circle cx="9.5" cy="13.5" r="1" /><circle cx="14.5" cy="13.5" r="1" /></>,
  micro: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></>,
  caja: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5" /><path d="M12 12v9" /></>,
  personas: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18.5 14.5A6.5 6.5 0 0 1 21.5 20" /></>,
  cohete: <><path d="M5 19c0-3 1-5 3-5s3 1 3 3-2 3-6 2z" /><path d="M9 14c0-5 3-9 11-11-2 8-6 11-11 11z" /><circle cx="15" cy="9" r="1.5" /></>,
  aviso: <><path d="M12 3 2 20h20z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>,
  correo: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  manos: <><path d="M8 12l3 3 5-5" /><circle cx="12" cy="12" r="9" /></>,
  basura: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  llave: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9" /><path d="M16 7l3 3" /></>,
  candado: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
};

const POR_EMOJI: Record<string, keyof typeof TRAZOS> = {
  '🎯': 'meta', '⚡': 'rayo', '🔔': 'campana', '💬': 'chat', '🤖': 'robot', '🎙️': 'micro',
  '📦': 'caja', '👥': 'personas', '🚀': 'cohete', '⚠️': 'aviso', '📬': 'correo', '🤝': 'manos',
  '🗑️': 'basura', '🔑': 'llave', '🔒': 'candado',
};

export function Icono({ e, solo = false }: { e: string; solo?: boolean }) {
  const t = TRAZOS[POR_EMOJI[e] ?? 'rayo'];
  const svg = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t}</svg>
  );
  return solo ? svg : <span className="g-ico">{svg}</span>;
}
