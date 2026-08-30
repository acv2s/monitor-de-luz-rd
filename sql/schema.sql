-- Esquema de la base de datos (se crea automáticamente en la primera corrida,
-- este archivo es solo de referencia / para ejecutarlo a mano en Neon o Supabase).

-- Una fila por corrida diaria del scraper (snapshot de la página Teleconsumo)
CREATE TABLE IF NOT EXISTS teleconsumo_snapshots (
  id                 BIGSERIAL PRIMARY KEY,
  nic                TEXT NOT NULL,
  captured_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_ultima_factura DATE,
  datos_hasta        DATE,
  fecha_lectura      DATE,
  lectura_activa_kwh NUMERIC(12,3),
  consumo_hasta_fecha_kwh INTEGER,
  proyeccion_kwh     INTEGER,
  dia_mayor_consumo  DATE,
  valor_mayor_kwh    INTEGER,
  titular            TEXT,
  tarifa             TEXT,
  medidor            TEXT,
  raw                JSONB
);
CREATE INDEX IF NOT EXISTS idx_snap_nic_date ON teleconsumo_snapshots (nic, captured_at DESC);

-- Consumo diario (kWh) — una fila por día, se actualiza (upsert) en cada corrida
CREATE TABLE IF NOT EXISTS daily_consumption (
  nic        TEXT NOT NULL,
  day        DATE NOT NULL,
  kwh        NUMERIC(8,2) NOT NULL,
  cycle_start DATE,          -- fecha de la última factura (inicio del ciclo de facturación)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (nic, day)
);

-- Facturas descargadas del Historial de Facturación
CREATE TABLE IF NOT EXISTS invoices (
  id               TEXT PRIMARY KEY,       -- id del PDF en la oficina virtual (ej. 1234567097)
  nic              TEXT NOT NULL,
  numero_factura   TEXT,
  fecha_emision    DATE,
  periodo_inicio   DATE,
  periodo_fin      DATE,
  dias_facturados  INTEGER,
  lectura_anterior NUMERIC(12,3),
  lectura_actual   NUMERIC(12,3),
  consumo_kwh      INTEGER,
  cargo_fijo       NUMERIC(12,2),
  precio_kwh       NUMERIC(10,4),
  energia_rd       NUMERIC(12,2),
  importe_sin_subsidio NUMERIC(12,2),
  subsidio_rd      NUMERIC(12,2),
  facturado_rd     NUMERIC(12,2),
  balance_pendiente NUMERIC(12,2),
  total_a_pagar    NUMERIC(12,2),
  pague_antes_de   DATE,
  tarifa           TEXT,
  tramos           JSONB,                 -- tramos de la tarifa [{kwh, precio, importe}]
  parsed_ok        BOOLEAN NOT NULL DEFAULT false,
  parse_error      TEXT,
  pdf              BYTEA,
  raw_text         TEXT,
  analysis         TEXT,                  -- explicación generada del comportamiento del mes
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consumo mensual (kWh). Fuente: 'invoice' (factura parseada) o 'pdf_history'
-- (la tabla "Histórico de consumos" que trae cada factura, ~13 meses hacia atrás)
CREATE TABLE IF NOT EXISTS monthly_consumption (
  nic     TEXT NOT NULL,
  month   DATE NOT NULL,                 -- primer día del mes de facturación
  kwh     INTEGER NOT NULL,
  source  TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (nic, month)
);

-- Alertas enviadas (para no repetir la misma alarma en el mismo ciclo)
CREATE TABLE IF NOT EXISTS alerts (
  id          BIGSERIAL PRIMARY KEY,
  nic         TEXT NOT NULL,
  rule        TEXT NOT NULL,
  dedupe_key  TEXT NOT NULL UNIQUE,
  level       TEXT NOT NULL,             -- info | warning | critical
  message     TEXT NOT NULL,
  sent        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bitácora de corridas
CREATE TABLE IF NOT EXISTS runs (
  id          BIGSERIAL PRIMARY KEY,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  ok          BOOLEAN,
  summary     TEXT,
  error       TEXT
);

-- migración suave para bases ya creadas
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tramos JSONB;

-- Destinatarios de Telegram (gestionados desde el panel /config de la app)
CREATE TABLE IF NOT EXISTS telegram_recipients (
  chat_id    TEXT PRIMARY KEY,
  name       TEXT,
  authorized BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuración editable desde el panel (/config)
CREATE TABLE IF NOT EXISTS settings (
  clave      TEXT PRIMARY KEY,
  valor      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alertas descartadas desde el panel (no se borran, solo se ocultan)
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS dismissed BOOLEAN NOT NULL DEFAULT false;

-- Usuarios de la app (el dueño entra con la contraseña maestra del hosting)
CREATE TABLE IF NOT EXISTS users (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  nombre      TEXT,
  pass_hash   TEXT NOT NULL,          -- PBKDF2, nunca la contraseña en claro
  aprobado    BOOLEAN NOT NULL DEFAULT false,
  admin       BOOLEAN NOT NULL DEFAULT false,
  -- servicios de pago que el dueño le cede a esta persona
  puede_asistente BOOLEAN NOT NULL DEFAULT false,
  puede_voz       BOOLEAN NOT NULL DEFAULT false,
  telegram_chat_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login  TIMESTAMPTZ
);

-- Enlaces de invitación: el dueño decide qué trae cada uno
CREATE TABLE IF NOT EXISTS invites (
  code        TEXT PRIMARY KEY,
  nota        TEXT,
  da_asistente BOOLEAN NOT NULL DEFAULT false,
  da_voz       BOOLEAN NOT NULL DEFAULT false,
  auto_aprobar BOOLEAN NOT NULL DEFAULT true,
  usos_max    INTEGER NOT NULL DEFAULT 1,
  usos        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vigencia de los enlaces de invitación
ALTER TABLE invites ADD COLUMN IF NOT EXISTS expira_at TIMESTAMPTZ;

-- ===== Contratos eléctricos =====
-- Cada persona tiene su propio contrato (sus credenciales de la oficina
-- virtual y su meta). Un contrato puede compartirse con otras cuentas.
CREATE TABLE IF NOT EXISTS contracts (
  id            BIGSERIAL PRIMARY KEY,
  nombre        TEXT,
  utility       TEXT NOT NULL DEFAULT 'edenorte',
  email         TEXT,
  password      TEXT,
  nic           TEXT,
  goal_mode     TEXT NOT NULL DEFAULT 'dinero',
  budget_rd     NUMERIC(12,2),
  kwh_threshold INTEGER NOT NULL DEFAULT 700,
  owner_id      BIGINT,                 -- users.id; NULL = del dueño maestro
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quién puede ver cada contrato (además de su dueño)
CREATE TABLE IF NOT EXISTS contract_members (
  contract_id BIGINT NOT NULL,
  user_id     BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_id, user_id)
);

-- Los datos ya guardados pertenecen a un contrato
ALTER TABLE teleconsumo_snapshots ADD COLUMN IF NOT EXISTS contract_id BIGINT;
ALTER TABLE daily_consumption     ADD COLUMN IF NOT EXISTS contract_id BIGINT;
ALTER TABLE invoices              ADD COLUMN IF NOT EXISTS contract_id BIGINT;
ALTER TABLE monthly_consumption   ADD COLUMN IF NOT EXISTS contract_id BIGINT;
ALTER TABLE alerts                ADD COLUMN IF NOT EXISTS contract_id BIGINT;
ALTER TABLE runs                  ADD COLUMN IF NOT EXISTS contract_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_daily_contract ON daily_consumption (contract_id, day);
CREATE INDEX IF NOT EXISTS idx_snap_contract  ON teleconsumo_snapshots (contract_id, captured_at DESC);

-- Un enlace de invitación puede compartir un contrato existente
ALTER TABLE invites ADD COLUMN IF NOT EXISTS contrato_compartido BIGINT;

-- Cada chat de Telegram queda ligado a una cuenta y a su contrato
ALTER TABLE telegram_recipients ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE telegram_recipients ADD COLUMN IF NOT EXISTS contract_id BIGINT;
-- Código corto que cada persona manda al bot para vincular su chat
ALTER TABLE users ADD COLUMN IF NOT EXISTS tg_code TEXT;

-- ===== Restablecer contraseña =====
-- No hay servidor de correo: el dueño genera un enlace y se lo pasa a la
-- persona por donde quiera (WhatsApp, Telegram, en persona).
CREATE TABLE IF NOT EXISTS password_resets (
  token      TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  expira_at  TIMESTAMPTZ NOT NULL,
  usado_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets (user_id);
-- Marca de que la persona pidió ayuda para entrar
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_pedido_at TIMESTAMPTZ;

-- ===== Comprobación del acceso a la oficina virtual =====
-- Deja constancia del último intento de login para poder mostrar en el panel
-- si las credenciales sirven, sin tener que correr la lectura completa.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS verificado_at    TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS verificado_ok    BOOLEAN;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS verificado_error TEXT;

-- ===== Sondas de publicación =====
-- Anotan a qué hora se vio por primera vez cada "datos disponibles hasta".
-- Con eso se estima a qué hora publica la distribuidora y se puede correr el
-- monitor justo después, en vez de a una hora inventada.
CREATE TABLE IF NOT EXISTS portal_probes (
  id          BIGSERIAL PRIMARY KEY,
  contract_id BIGINT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  datos_hasta DATE
);
CREATE INDEX IF NOT EXISTS idx_probes_contract ON portal_probes (contract_id, at DESC);

-- ===== Límite de consultas manuales al portal =====
-- Cada "comprobar" o "sincronizar ahora" cuenta. La corrida programada no.
CREATE TABLE IF NOT EXISTS manual_calls (
  id          BIGSERIAL PRIMARY KEY,
  user_key    TEXT NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manual_calls ON manual_calls (user_key, at DESC);
