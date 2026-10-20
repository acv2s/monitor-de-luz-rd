/**
 * Navegación de la app. En PC es una barra lateral; en móvil, una barra de
 * pestañas abajo, como una aplicación. Las mismas secciones en las dos, y
 * Administración solo para el admin.
 */
type Actual = 'panel' | 'cuenta' | 'config';

const ICONOS = {
  ciclo: <path d="M4 10.5L12 4l8 6.5V20h-5v-5h-6v5H4z" />,
  historial: <><path d="M5 20V11" /><path d="M12 20V5" /><path d="M19 20v-6" /></>,
  facturas: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6" /><path d="M9 12h6" /></>,
  cuenta: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  admin: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>,
};

function Icono({ n }: { n: keyof typeof ICONOS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[n]}
    </svg>
  );
}

export function SideNav({ actual, admin = false }: { actual: Actual; admin?: boolean }) {
  const items: { href: string; n: keyof typeof ICONOS; txt: string; corto: string; on: boolean }[] = [
    { href: '/', n: 'ciclo', txt: 'Ciclo actual', corto: 'Ciclo', on: actual === 'panel' },
    { href: '/#historial', n: 'historial', txt: 'Historial', corto: 'Historial', on: false },
    { href: '/#facturas', n: 'facturas', txt: 'Facturas', corto: 'Facturas', on: false },
    { href: '/mi-cuenta', n: 'cuenta', txt: 'Mi cuenta', corto: 'Cuenta', on: actual === 'cuenta' },
    ...(admin ? [{ href: '/config', n: 'admin' as const, txt: 'Administración', corto: 'Admin', on: actual === 'config' }] : []),
  ];
  return (
    <>
      <nav className="side-nav" aria-label="Principal">
        <a className="sn-logo" href="/">
          <b>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 16a8 8 0 0 1 16 0" /><path d="M12 16l4.5-5.5" stroke="#22C55E" />
            </svg>
          </b>
          Monitor de Luz
        </a>
        <div className="sn-links">
          {items.map((it) => (
            <a key={it.href} href={it.href} aria-current={it.on ? 'page' : undefined}>
              <Icono n={it.n} />{it.txt}
            </a>
          ))}
        </div>
      </nav>
      <nav className="tab-bar" aria-label="Principal" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) => (
          <a key={it.href} href={it.href} aria-current={it.on ? 'page' : undefined}>
            <Icono n={it.n} /><span>{it.corto}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
