/**
 * Navegación lateral en PC. En pantallas angostas se oculta y queda la barra
 * de iconos de arriba. Administración solo aparece para el admin.
 */
export function SideNav({ actual, admin = false }: { actual: 'panel' | 'cuenta' | 'config'; admin?: boolean }) {
  const ico = (d: React.ReactNode) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  );
  return (
    <nav className="side-nav" aria-label="Principal">
      <a className="sn-logo" href="/">
        <b>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 16a8 8 0 0 1 16 0" /><path d="M12 16l4.5-5.5" stroke="#A3D94A" />
          </svg>
        </b>
        Monitor de Luz
      </a>
      <div className="sn-links">
        <a href="/" aria-current={actual === 'panel' ? 'page' : undefined}>
          {ico(<path d="M4 10.5L12 4l8 6.5V20h-5v-5h-6v5H4z" />)}Inicio
        </a>
        <a href="/#historial">
          {ico(<path d="M13 2L4 14h7l-1 8 9-12h-7z" />)}Consumo
        </a>
        <a href="/#facturas">
          {ico(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6" /><path d="M9 12h6" /></>)}Facturas
        </a>
        <a href="/mi-cuenta" aria-current={actual === 'cuenta' ? 'page' : undefined}>
          {ico(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>)}Mi luz y alertas
        </a>
        {admin && (
          <a href="/config" aria-current={actual === 'config' ? 'page' : undefined}>
            {ico(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>)}Administración
          </a>
        )}
      </div>
    </nav>
  );
}
