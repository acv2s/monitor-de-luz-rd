import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Monitor de Luz',
  description: 'Controla tu factura de luz: consumo diario, facturas y avisos antes de que se dispare',
};

// Aplica el tema guardado antes del primer pintado (evita el parpadeo)
const THEME_INIT = `try{var t=localStorage.getItem('edn-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
