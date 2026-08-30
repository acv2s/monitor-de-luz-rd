'use client';

import { useState } from 'react';

/** Muestra el enlace completo y lo copia de un toque. */
export function EnlaceCopiable({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.getElementById(`u-${url}`) as HTMLInputElement | null;
      el?.select();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }
  return (
    <div className="copia">
      <input id={`u-${url}`} className="copia-url" value={url} readOnly onFocus={(e) => e.target.select()} />
      <button type="button" className={`copia-btn ${copiado ? 'ok' : ''}`} onClick={copiar}>
        {copiado ? '¡Copiado!' : 'Copiar'}
      </button>
    </div>
  );
}
