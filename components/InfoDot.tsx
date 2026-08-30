'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Puntito de información en la esquina de una tarjeta: el detalle no ocupa
 * espacio hasta que se pide (simplicidad, no minimalismo).
 */
export function InfoDot({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <span className="info" ref={box}>
      <button className="info-dot" onClick={() => setOpen((v) => !v)} aria-label="Más información" aria-expanded={open}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 10.8v5.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="7.8" r="1.15" fill="currentColor" />
        </svg>
      </button>
      {open && <span className="info-pop" role="tooltip">{children}</span>}
    </span>
  );
}
