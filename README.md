# 🏥 App Clínica de Barrio

Trabajo práctico de **Metodología de Sistemas I** · UTN Avellaneda · 2do Cuatrimestre 2026 · Grupo 5

Este repositorio tiene **dos aplicaciones**:

| Comando | Qué levanta | Puerto |
|---|---|---|
| `npm run dev` | **Sitio de exposición del TP** (7 páginas: objetivos, historias, casos de uso, requerimientos, alcance, diagramas y pruebas) | http://localhost:8090 |
| `npm start` | **App funcional**: login con validaciones + gestión de turnos por roles | http://localhost:3000 |
| `npm run seed` | Regenera la base de datos con los usuarios de prueba | — |

## Requisitos

- Node.js 18 o superior
- `npm install` (una única vez, instala Express)

## 🚀 Puesta en marcha

```bash
npm install

npm run dev      # sitio del TP    → http://localhost:8090
npm start        # app con login   → http://localhost:3000
```

## ☁️ Deploy en Vercel (online)

En producción el **sitio de exposición queda en la raíz** del dominio y la
**app en `/app/`**. Los datos (usuarios y turnos) y las sesiones se guardan en
**Upstash Redis** (plan gratis) mediante dos variables de entorno:

| Variable | Valor |
|---|---|
| `UPSTASH_REDIS_REST_URL` | HTTPS REST URL de la base Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | Token estándar de la base |

```bash
npm i -g vercel     # instalar la CLI de Vercel
vercel login        # autoriza en el navegador
vercel link         # crea/vincula el proyecto
```

1. **Crear la base gratis** (una de las dos opciones):
   - Dashboard de Vercel → **Storage → Upstash Redis → Create** (plan Free):
     las variables de entorno se inyectan solas; o
   - [console.upstash.com](https://console.upstash.com) → *Create Database* →
     copiar la URL y el token, y cargarlos en la terminal:
     ```bash
     vercel env add UPSTASH_REDIS_REST_URL production
     vercel env add UPSTASH_REDIS_REST_TOKEN production
     ```
2. **Probar localmente** con el entorno real de Vercel: `npx vercel dev`
3. **Publicar**: `npx vercel --prod`

> Sin esas variables el proyecto sigue funcionando en local con `data/db.json`
> (modo archivo), que es el comportamiento de `npm start` / `npm run dev`.

## 🔑 Usuarios de prueba

Todos usan la contraseña **`demo1234`**.

| Rol | Email |
|---|---|
| Paciente | `laura@mail.com` |
| Paciente | `marco@mail.com` |
| Médico (Clínica Médica) | `carlos.gomez@clinica.com` |
| Médico (Pediatría) | `marina.rios@clinica.com` |
| Médico (Cardiología) | `julian.ferreyra@clinica.com` |
| Médico (Traumatología) | `sofia.bianchi@clinica.com` |
| Recepcionista | `ana@clinica.com` |

## 👤 Qué puede hacer cada rol

**Paciente**
- Autoregistro con validaciones (email, DNI, teléfono, canal de notificación, contraseña)
- Reservar turno: especialidad → médico → fecha → franja, con **validación de disponibilidad en tiempo real** (no se permiten reservas duplicadas)
- Ver, **confirmar** (48 hs antes), **reprogramar** y **cancelar** sus turnos

**Médico**
- Ver su agenda con filtros por fecha y estado
- **Marcar turnos como urgentes**
- Cargar y eliminar sus **horarios de atención** (con validaciones)
- **Cancelar un día completo**: bloquea las franjas y cancela los turnos afectados (dispara el seguimiento de la recepción)

**Recepcionista**
- **Registrar pacientes** desde el mostrador (valida duplicados de email y DNI)
- Buscar pacientes por nombre, DNI o correo
- Ver la **agenda general** de todos los médicos con filtros y cancelar turnos

## 🗂️ Estructura

```
├── index.html, historias.html, casos-uso.html, requerimientos.html,
│   alcance.html, diagramas.html, pruebas.html   ← sitio de exposición (npm run dev)
├── css/styles.css  ·  js/main.js  ·  assets/    ← recursos del sitio
├── dev-server.js                                ← servidor estático (sin dependencias)
├── server.js                                    ← API + app con login (npm start)
├── lib/store.js                                 ← datos, contraseñas y generación de franjas
├── lib/cloud.js                                 ← cliente Upstash (modo Vercel)
├── vercel.json · .vercelignore                  ← configuración del deploy en Vercel
├── seed.js                                      ← npm run seed
├── data/db.json                                 ← usuarios, horarios y turnos (se crea solo)
└── app/public/                                  ← login y dashboard de la app
    ├── index.html      (login + registro)
    ├── dashboard.html  (vistas por rol)
    ├── css/app.css
    └── js/auth.js · js/dashboard.js
```

## 📌 Notas

- **Datos**: en local, archivo JSON (`data/db.json`); en Vercel, Upstash Redis.
  Si querés volver al estado inicial en local: `npm run seed`.
- **Contraseñas**: hasheadas con `scrypt` + salt (nunca se guardan en texto plano).
- **Sesión**: cookie `sid` HttpOnly, válida 24 h.
- **Bloqueo de cuenta**: tras 5 intentos fallidos de contraseña la cuenta queda bloqueada
  (tal como plantea el TP). Para desbloquear: `npm run seed`.
- **Horizonte de turnos**: hasta 60 días en el futuro, franjas de 30 minutos.
