'use client';

import { useEffect, useState } from 'react';

type Tema = 'light' | 'dark' | 'system';

/** Tema de la app y salir. Viven en Mi cuenta: la pantalla principal queda limpia. */
export function Ajustes({ compacto = false }: { compacto?: boolean }) {
  const [tema, setTema] = useState<Tema>('system');
  useEffect(() => {
    try { setTema((localStorage.getItem('edn-theme') as Tema) || 'system'); } catch { /* sin almacenamiento */ }
  }, []);
  function aplicar(t: Tema) {
    setTema(t);
    try { localStorage.setItem('edn-theme', t); } catch { /* sin almacenamiento */ }
    const root = document.documentElement;
    if (t === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
  }
  const ops: { id: Tema; txt: string }[] = [
    { id: 'light', txt: 'Claro' }, { id: 'dark', txt: 'Oscuro' }, { id: 'system', txt: 'Auto' },
  ];
  if (compacto) {
    // Versión del pie de la barra lateral: tema en una fila y salir debajo.
    return (
      <div className="sn-ajustes">
        <span className="sn-ajustes-t">Apariencia</span>
        <div className="tema-seg" role="radiogroup" aria-label="Tema">
          {ops.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={tema === o.id} className={tema === o.id ? 'on' : ''} onClick={() => aplicar(o.id)}>
              {o.txt}
            </button>
          ))}
        </div>
        <form method="post" action="/api/auth">
          <input type="hidden" name="accion" value="salir" />
          <button className="sn-salir" type="submit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2" /><path d="M19 12H9m10 0-3-3m3 3-3 3" /></svg>
            Cerrar sesión
          </button>
        </form>
      </div>
    );
  }
  return (
    <section className="v-card anim solo-movil">
      <h2>Apariencia</h2>
      <div className="tema-seg" role="radiogroup" aria-label="Tema">
        {ops.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={tema === o.id} className={tema === o.id ? 'on' : ''} onClick={() => aplicar(o.id)}>
            {o.txt}
          </button>
        ))}
      </div>
      <form method="post" action="/api/auth">
        <input type="hidden" name="accion" value="salir" />
        <button className="btn-salir" type="submit">Cerrar sesión</button>
      </form>
    </section>
  );
}
