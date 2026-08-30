// Fragmentos de texto (con posición) tal como los devuelve pdf.js para la factura 1234567097
// (capturados de la factura real; solo datos relevantes del cliente de prueba).
import type { PdfTextItem } from '../../lib/parsers';

const L = (y: number, ...pairs: (string | number)[]): PdfTextItem[] => {
  const out: PdfTextItem[] = [];
  for (let i = 0; i < pairs.length; i += 2) out.push({ x: pairs[i] as number, y, s: String(pairs[i + 1]) });
  return out;
};

export const INVOICE_ITEMS: PdfTextItem[] = [
  ...L(693, 400, 'CONTRATO :', 492, '1234567'),
  ...L(678, 392, 'No. Factura..................:', 486, '202600000001'),
  ...L(672, 52, 'Oficina..........................:', 147, '2137- OFICINA EJEMPLO'),
  ...L(666, 392, 'Ref. Pago......................:', 486, '1234567097'),
  ...L(663, 53, 'TITULAR DE PAGO............:', 159, 'PEREZ EJEMPLO, JUAN ANTONIO'),
  ...L(657, 393, 'SUMINISTRO No.......:', 486, '9000001'),
  ...L(651, 54, 'FECHA EMISION..........:', 148, '15/08/2026'),
  ...L(585, 392, 'Medidor........................:', 486, '11223344'),
  ...L(492, 382, 'Voltaje................:', 453, 'Baja 120/240 Doble Monofásica'),
  ...L(477, 382, 'TARIFA..............:', 453, 'BTS-1'),
  ...L(456, 54, 'TIPO DE', 106, 'NO DE', 144, 'LECTURA', 194, 'LECTURA', 242, 'MULTIPLO', 285, 'CONSUMO'),
  ...L(453, 349, 'DETALLE IMPORTES FACTURADOS'),
  ...L(450, 52, 'LECTURA', 98, 'CONTADOR', 143, 'ANTERIOR', 196, 'ACTUAL'),
  ...L(435, 344, 'No. De Días Facturados :'),
  ...L(432, 445, '15/07/2026 - 15/08/2026 = 31 dias'),
  ...L(429, 138, '2026/07/15', 187, '2026/08/15'),
  ...L(417, 48, 'Activa B.T.', 94, '11223344', 159, '42,769', 208, '43,568', 258, '1.00', 297, '799kWh'),
  ...L(414, 337, 'Cargo Fijo'),
  ...L(405, 337, '31 dias, RD$', 378, '126.81', 493, 'RD$', 546, '126.81'),
  ...L(396, 337, 'Energía'),
  ...L(384, 337, '799 kWh X RD$14.04', 493, 'RD$', 538, '11,217.96'),
  ...L(300, 136, 'HISTORICO DE CONSUMOS'),
  ...L(285, 49, 'Mes', 75, 'Csmo', 98, 'Pot.', 122, 'kWh'),
  ...L(276, 43, 'Ago 2025', 77, '517', 98, '00.000', 126, '799 -'),
  ...L(270, 43, 'Sep', 77, '722', 98, '00.000'),
  ...L(261, 43, 'Oct', 77, '547', 98, '00.000'),
  ...L(258, 126, '599 -'),
  ...L(255, 43, 'Nov', 77, '528', 98, '00.000'),
  ...L(249, 43, 'Dic', 77, '448', 98, '00.000'),
  ...L(243, 43, 'Ene', 77, '468', 98, '00.000', 126, '400 -'),
  ...L(237, 43, 'Feb', 77, '495', 98, '00.000'),
  ...L(228, 43, 'Mar', 77, '427', 98, '00.000'),
  ...L(225, 126, '200 -', 337, 'IMPORTE SIN SUBSIDIO EN RD$', 493, 'RD$', 538, '13,258.51'),
  ...L(222, 43, 'Abr', 77, '498', 98, '00.000'),
  ...L(219, 337, 'IMPORTE SUBSIDIADO EN RD$', 493, 'RD$', 539, '-1,913.74'),
  ...L(216, 43, 'May', 77, '528', 98, '00.000'),
  ...L(213, 132, '0'),
  ...L(210, 43, 'Jun', 77, '610', 98, '00.000', 140, 'Ago', 158, 'Sep', 172, 'Oct', 185, 'Nov', 200, 'Dic', 214, 'Ene', 227, 'Feb', 242, 'Mar', 257, 'Abr', 269, 'May', 284, 'Jun', 299, 'Jul', 313, 'Ago', 340, 'FACTURADO MES AGO', 510, 'RD$11,344.77'),
  ...L(207, 140, '2025', 313, '2026'),
  ...L(201, 43, 'Jul', 77, '652', 98, '00.000'),
  ...L(198, 226, 'Mes'),
  ...L(195, 43, 'Ago 2026', 77, '799', 98, '00.000'),
  ...L(192, 342, 'PAGUE ANTES DE', 507, '14/09/2026'),
  ...L(171, 49, 'NOTIFICACIONES', 345, 'FACTURAS PENDIENTES AL 15/08/2026............:0'),
  ...L(162, 51, 'Si al momento de recibir esta factura usted ha realizado el pago pendiente, favor', 344, 'BALANCE PENDIENTE.........:', 529, 'RD$7,039.97'),
  ...L(153, 49, 'de no considerar el mismo.'),
  ...L(150, 344, 'PAGO ANTICIPADO.........:', 540, 'RD$0.00'),
  ...L(141, 344, 'VALOR TOTAL A PAGAR...:', 520, 'RD$18,384.74'),
];
