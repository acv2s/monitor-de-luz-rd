'use client';

import { useEffect, useState } from 'react';

type Tema = 'light' | 'dark' | 'system';

/** Tema de la app y salir. Viven en Mi cuenta: la pantalla principal queda limpia. */
export function Ajustes() {
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
    { id: 'light', txt: 'Claro' }, { id: 'dark', txt: 'Oscuro' }, { id: 'system', txt: 'Automático' },
  ];
  return (
    <section className="v-card anim">
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
