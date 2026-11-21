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
├── seed.js                                      ← npm run seed
├── data/db.json                                 ← usuarios, horarios y turnos (se crea solo)
└── app/public/                                  ← login y dashboard de la app
    ├── index.html      (login + registro)
    ├── dashboard.html  (vistas por rol)
    ├── css/app.css
    └── js/auth.js · js/dashboard.js
```

## 📌 Notas

- **Datos**: archivo JSON (`data/db.json`). Si querés volver al estado inicial: `npm run seed`.
- **Contraseñas**: hasheadas con `scrypt` + salt (nunca se guardan en texto plano).
- **Sesión**: cookie `sid` HttpOnly, válida 24 h.
- **Bloqueo de cuenta**: tras 5 intentos fallidos de contraseña la cuenta queda bloqueada
  (tal como plantea el TP). Para desbloquear: `npm run seed`.
- **Horizonte de turnos**: hasta 60 días en el futuro, franjas de 30 minutos.
