# ⚡ Monitor de Luz

Vigila tu factura eléctrica en República Dominicana **antes** de que llegue: lee tu consumo diario desde la Oficina Virtual de tu distribuidora, lo convierte a pesos, te proyecta cuánto vas a pagar y te avisa por Telegram cuando la cosa va camino a dispararse.

Es **gratis y de uso libre** (licencia MIT). Cada quien lo instala con **sus propias cuentas**: tu base de datos, tu bot, tus claves. Nada pasa por servidores de terceros ni del autor.

> ⚠️ **Aviso importante**: este proyecto lee la Oficina Virtual de la distribuidora tal como la ve un cliente con su usuario y su contraseña. No usa ninguna API oficial. Si la distribuidora cambia su página o decide bloquear este tipo de acceso, puede dejar de funcionar en cualquier momento. Úsalo con tu propia cuenta y con moderación: la app limita a **3 consultas manuales por persona al día** justamente para no abusar del portal (la actualización automática es una vez al día).

## Qué hace

- 📅 **Consumo diario** del ciclo actual, con la proyección del mes.
- 💵 **Todo en pesos**: define tu meta como "quiero pagar menos de RD$ X" y la app calcula el límite en kWh con el precio real de tus facturas.
- 🧾 **Lee tus facturas en PDF** solas: kWh, montos, subsidio, vencimiento y el histórico de 13 meses que trae cada una.
- 📊 **Dashboard** con gráficas del ciclo, del mes y del histórico.
- 🔔 **Avisos por Telegram**: proyección que se pasa, aviso temprano al 80 %, día con consumo alarmante, factura nueva, resumen diario.
- 🤖 **Asistente opcional** (Claude, ChatGPT o Gemini, con tu propia clave): pregúntale "¿cómo voy?" o "¿por qué subió la factura?" y responde con tus datos reales.
- 🎙️ **Notas de voz opcionales**: mándale un audio al bot y te responde (transcripción con Groq, gratis; voz con ElevenLabs u OpenAI).
- 👥 **Multi-usuario**: invita a familiares con un enlace; cada quien pone su propia cuenta de luz y ve solo lo suyo. También puedes compartir tu cuenta en solo-lectura (p. ej. con tu pareja).

**Distribuidoras**: Edenorte está probada. Edesur y EdeEste están marcadas "en preparación" — la estructura está lista, faltan los lectores de sus portales (¡se aceptan contribuciones!).

## Qué necesitas (todo tiene capa gratis)

| Servicio | Para qué | Costo |
|---|---|---|
| [Vercel](https://vercel.com) | Corre la app y el cron diario | Gratis |
| [Neon](https://neon.tech) | Base de datos Postgres | Gratis |
| [@BotFather](https://t.me/BotFather) en Telegram | Tu bot de avisos | Gratis |
| Clave de IA (opcional) | El asistente de preguntas libres | Gemini tiene capa gratis; Claude y OpenAI son de pago |
| [Groq](https://console.groq.com) (opcional) | Transcribir notas de voz | Gratis |

Y, claro, tu **usuario y contraseña de la Oficina Virtual** de tu distribuidora (los mismos con los que entras a ver tu factura).

## Instalación paso a paso

### 1. Sube el código a tu GitHub

Haz un **fork** de este repositorio (botón "Fork" arriba a la derecha), o clónalo y súbelo a un repo tuyo.

### 2. Crea la base de datos (Neon)

1. Entra a [neon.tech](https://neon.tech) y crea un proyecto (gratis).
2. Copia la **connection string** (empieza con `postgres://...`). Las tablas se crean solas en la primera corrida — no tienes que ejecutar ningún SQL.

### 3. Despliega en Vercel

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importa tu repo.
2. Antes de darle a Deploy, agrega estas **variables de entorno** (las únicas obligatorias):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | La connection string de Neon |
   | `DASHBOARD_PASSWORD` | Una contraseña larga que inventes: es tu llave de administrador |
   | `CRON_SECRET` | Otra cadena larga y aleatoria (protege el cron y el webhook del bot) |

3. Deploy. Al terminar tendrás tu URL, tipo `https://tu-proyecto.vercel.app`.
4. (Opcional) agrega la variable `APP_URL` con esa URL, para que los enlaces del bot apunten bien.

### 4. Configura todo lo demás DENTRO de la app

Entra a `https://tu-proyecto.vercel.app`, pon tu `DASHBOARD_PASSWORD` (deja el correo vacío) y sigue el asistente de bienvenida:

- Tu **meta** (pagar menos de RD$ X, o no pasar de X kWh).
- Tu **distribuidora** y las credenciales de tu Oficina Virtual.
- El **bot de Telegram** (abajo cómo crearlo).

Todo lo demás — claves de IA, voz, umbrales de aviso — se cambia después en **Configuración**, sin volver a tocar Vercel ni redesplegar.

### 5. Crea tu bot de Telegram

1. En Telegram, escríbele a **@BotFather** → `/newbot` → ponle nombre. Te da un **token**.
2. Pega el token en **Configuración → Telegram** dentro de la app.
3. La misma pantalla te da el enlace para registrar el **webhook** (un clic).
4. Ve a **Mi cuenta**, copia tu **código de enlace** y mándaselo al bot. Listo: te responde a ti, con tu factura.

### 6. Primera lectura

En **Mi cuenta** dale a **"Comprobar y traer mis datos"**. Verifica que tus credenciales sirven y baja tu consumo y tus facturas (tarda hasta un minuto). De ahí en adelante el cron de Vercel lo actualiza solo una vez al día — puedes ajustar la hora en `vercel.json` (va en UTC; RD es UTC−4).

### 7. Invita a tu gente (opcional)

En **Configuración → Personas** creas enlaces de invitación. Cada invitado crea su cuenta, pone las credenciales de **su** oficina virtual y ve solo lo suyo — tú nunca ves su consumo ni su contraseña, ni ellos lo tuyo.

## ¿Te trancaste? Pídele ayuda a una IA

Copia este mensaje en ChatGPT, Claude o Gemini, junto con el error que te salió:

> Estoy instalando "Monitor de Luz", una app Next.js 15 de código abierto que se despliega en Vercel con base de datos Postgres en Neon. Lee el consumo eléctrico de la Oficina Virtual de una distribuidora dominicana y manda avisos por un bot de Telegram. Ya hice [describe hasta dónde llegaste] y me sale este error: [pega el error]. ¿Qué reviso?

Con eso cualquier asistente tiene el contexto para guiarte.

## Preguntas frecuentes

**¿Mis datos van a algún lado?** No. Todo vive en TU base de datos de Neon y TU proyecto de Vercel. El código no manda nada a nadie más (el asistente de IA, si lo activas, manda tus datos de consumo al proveedor que tú elijas, con tu clave).

**¿Es seguro poner mi contraseña de la Oficina Virtual?** Se guarda en tu base de datos y solo se usa para leer tus páginas de consumo. Aún así: es tu decisión y tu infraestructura. No uses la instalación de un desconocido.

**¿Por qué los últimos 2 días salen vacíos?** La distribuidora publica el consumo con ~2 días de atraso. Es normal; la app y el bot lo saben y no lo alarman.

**¿Funciona con Edesur o EdeEste?** Todavía no: solo Edenorte está verificada. Si sabes leer HTML y quieres ayudar, los lectores viven en `lib/` y el patrón está en `lib/edenorte.ts`.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # llena al menos DATABASE_URL y DASHBOARD_PASSWORD
npm run dev                  # http://localhost:3000
npm test                     # corre las pruebas
```

## Licencia

MIT — úsalo, modifícalo y compártelo libremente. Sin garantía de ningún tipo: es un proyecto comunitario que depende de una página ajena que puede cambiar sin aviso. Ver [LICENSE](LICENSE).
