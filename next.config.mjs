/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist debe cargarse como módulo externo de Node (no lo empaqueta webpack)
  serverExternalPackages: ['pdfjs-dist', 'postgres'],
  // el worker de pdfjs se carga con import() dinámico y el trazado de Vercel no
  // lo detecta: hay que incluirlo a mano o la función falla con "Cannot find module"
  outputFileTracingIncludes: {
    '/api/cron/daily': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    ],
  },
};

export default nextConfig;
