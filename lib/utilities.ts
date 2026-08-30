/** Distribuidoras eléctricas de República Dominicana. */
export interface Distribuidora {
  id: string;
  nombre: string;
  /** Base de la Oficina Virtual. */
  base: string;
  /** true cuando el lector está probado contra esa oficina virtual. */
  soportada: boolean;
  nota?: string;
}

export const DISTRIBUIDORAS: Distribuidora[] = [
  { id: 'edenorte', nombre: 'Edenorte', base: 'https://oficinavirtual.edenorte.com.do', soportada: true },
  {
    id: 'edesur', nombre: 'Edesur', base: 'https://oficinavirtual.edesur.com.do', soportada: false,
    nota: 'Su oficina virtual usa otro formato; el lector todavía no está probado ahí.',
  },
  {
    id: 'edeeste', nombre: 'EdeEste', base: 'https://oficinavirtual.edeeste.com.do', soportada: false,
    nota: 'Su oficina virtual usa otro formato; el lector todavía no está probado ahí.',
  },
];

export function distribuidora(id: string): Distribuidora {
  return DISTRIBUIDORAS.find((d) => d.id === id) ?? DISTRIBUIDORAS[0];
}
