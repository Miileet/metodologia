/* =========================================================
   npm start — APP FUNCIONAL (login + gestión de turnos)
   Express + JSON. Puerto 3000.
   ========================================================= */
'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./lib/store');
const cloud = require('./lib/cloud');

store.load();

const app = express();
const PORT = process.env.PORT || 3000;
const EN_VERCEL = !!process.env.VERCEL;

app.use(express.json());

/* ================== modo nube (Vercel) ==================
   Con las variables de Upstash, cada petición carga la base
   desde la nube y, antes de responder, espera a que se
   guarden los datos y la sesión. En local no se usa. */
let pendingAuth = Promise.resolve(); // escrituras de sesión pendientes

app.use('/api', async (req, res, next) => {
  if (!cloud.enabled) return next();
  try {
    await store.loadCloud();
  } catch (err) {
    console.error('[cloud] No se pudo cargar la base:', err.message);
    return res
      .status(500)
      .json({ error: 'No se pudo conectar con la base de datos. Probá de nuevo en unos segundos.' });
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    Promise.all([store.flush(), pendingAuth])
      .catch(() => {})
      .then(() => originalJson(body));
    return res;
  };
  next();
});

/* ================== archivos estáticos ==================
   En Vercel los archivos de public/ los sirve el CDN (la app
   queda en /app/); este static es sólo un respaldo. En local,
   npm start sirve la app en la raíz. */
if (EN_VERCEL) {
  app.use(express.static(path.join(__dirname, 'public')));
} else {
  app.use(express.static(path.join(__dirname, 'public', 'app')));
}

/* ================== sesiones (cookie sid) ==================
   En local viven en memoria; en Vercel se guardan en Upstash
   para sobrevivir entre peticiones e instancias. */
const sessions = new Map(); // token -> userId (solo local)

function trackAuth(promise) {
  pendingAuth = pendingAuth.then(() => promise).catch((err) => {
    console.error('[auth] No se pudo guardar la sesión:', err.message);
  });
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

function setSession(res, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  if (cloud.enabled) trackAuth(cloud.set(`sid:${token}`, userId, 86400));
  else sessions.set(token, userId);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
  return token;
}

function clearSession(res, token) {
  if (token) {
    if (cloud.enabled) trackAuth(cloud.del(`sid:${token}`));
    else sessions.delete(token);
  }
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

async function sessionUser(token) {
  if (!token) return null;
  const userId = cloud.enabled ? await cloud.get(`sid:${token}`) : sessions.get(token);
  return userId ? store.findUserById(userId) : null;
}

async function auth(req, res, next) {
  try {
    const token = readCookie(req, 'sid');
    const user = await sessionUser(token);
    if (!user) return res.status(401).json({ error: 'Tenés que iniciar sesión para continuar.' });
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tenés permisos para realizar esta acción.' });
    }
    next();
  };
}

/* ================== validaciones ================== */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

function validatePassword(p) {
  const v = String(p || '');
  if (v.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[a-zA-ZáéíóúñÑ]/.test(v)) return 'La contraseña debe incluir al menos una letra.';
  if (!/\d/.test(v)) return 'La contraseña debe incluir al menos un número.';
  return null;
}

function validatePersona(body, { requirePassword = true } = {}) {
  const errors = {};
  const nombre = String(body.nombre || '').trim();
  const apellido = String(body.apellido || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const dni = String(body.dni || '').trim();
  const telefono = String(body.telefono || '').trim();
  const canal = String(body.canal || '');

  if (nombre.length < 2) errors.nombre = 'Ingresá el nombre (mínimo 2 caracteres).';
  if (apellido.length < 2) errors.apellido = 'Ingresá el apellido (mínimo 2 caracteres).';
  if (!EMAIL_RE.test(email)) errors.email = 'Ingresá un correo electrónico válido.';
  if (!/^\d{7,8}$/.test(dni)) errors.dni = 'El DNI debe tener 7 u 8 dígitos (sin puntos).';
  if (telefono && !/^[\d\s()+-]{8,20}$/.test(telefono)) {
    errors.telefono = 'Ingresá un teléfono válido (mínimo 8 dígitos).';
  }
  if (!['whatsapp', 'mail', 'llamada', 'mensaje'].includes(canal)) {
    errors.canal = 'Elegí un medio de notificación.';
  }
  if (requirePassword) {
    const pwErr = validatePassword(body.password);
    if (pwErr) errors.password = pwErr;
    else if (body.password !== body.password2) errors.password2 = 'Las contraseñas no coinciden.';
  }
  return errors;
}

/* ================== auth ================== */

// Registro de paciente (autoregistro)
app.post('/api/auth/registro', (req, res) => {
  const errors = validatePersona(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Revisá los campos marcados.', fields: errors });
  }

  const email = String(req.body.email).trim().toLowerCase();
  const dni = String(req.body.dni).trim();

  if (store.findUserByEmail(email)) {
    return res.status(409).json({
      error: 'Ese correo ya está registrado. ¿Ya tenés cuenta?',
      fields: { email: 'El correo ya está en uso.' }
    });
  }
  const dniEnUso = store.getDb().users.find((u) => u.dni === dni);
  if (dniEnUso) {
    return res.status(409).json({
      error: 'Ese DNI ya está registrado.',
      fields: { dni: 'El documento ya tiene una cuenta activa.' }
    });
  }

  const user = store.makeUser({
    role: 'paciente',
    nombre: String(req.body.nombre).trim(),
    apellido: String(req.body.apellido).trim(),
    email,
    dni,
    telefono: String(req.body.telefono || '').trim(),
    canal: req.body.canal,
    password: req.body.password
  });

  store.getDb().users.push(user);
  store.save();
  setSession(res, user.id);
  res.status(201).json({ user: store.publicUser(user), redirect: 'dashboard.html' });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!EMAIL_RE.test(email) || !password) {
    return res.status(400).json({
      error: 'Ingresá tu correo y tu contraseña.',
      fields: {
        ...(EMAIL_RE.test(email) ? {} : { email: 'Correo electrónico inválido.' }),
        ...(password ? {} : { password: 'Ingresá tu contraseña.' })
      }
    });
  }

  const user = store.findUserByEmail(email);

  if (user && user.locked) {
    return res.status(423).json({
      error: 'Cuenta bloqueada tras 5 intentos fallidos. Contactá a la recepción para restablecer tu contraseña (o ejecutá npm run seed).'
    });
  }

  if (!user || !store.verifyPassword(password, user)) {
    if (user) {
      user.failed = (user.failed || 0) + 1;
      if (user.failed >= 5) {
        user.locked = true;
        store.save();
        return res.status(423).json({
          error: 'Cuenta bloqueada tras 5 intentos fallidos. Contactá a la recepción para restablecer tu contraseña.'
        });
      }
      store.save();
      const quedan = 5 - user.failed;
      return res.status(401).json({
        error: `Correo o contraseña incorrectos. Te quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'}.`
      });
    }
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }

  user.failed = 0;
  store.save();
  setSession(res, user.id);
  res.json({ user: store.publicUser(user), redirect: 'dashboard.html' });
});

app.post('/api/auth/logout', (req, res) => {
  clearSession(res, readCookie(req, 'sid'));
  res.json({ ok: true });
});

// Devuelve el usuario o null (sin sesión). No es un error: evita ruido en consola.
app.get('/api/auth/me', async (req, res) => {
  try {
    const user = await sessionUser(readCookie(req, 'sid'));
    res.json({ user: user ? store.publicUser(user) : null });
  } catch (err) {
    console.error('[auth] No se pudo verificar la sesión:', err.message);
    res.status(500).json({ error: 'No se pudo verificar la sesión.' });
  }
});

/* ================== catálogo ================== */
app.get('/api/catalogo', (req, res) => {
  const db = store.getDb();
  const medicos = db.users
    .filter((u) => u.role === 'medico')
    .map((m) => ({
      id: m.id,
      nombre: `${m.nombre} ${m.apellido}`,
      especialidad: m.especialidad,
      matricula: m.matricula
    }));
  res.json({ especialidades: db.especialidades, medicos });
});

/* ================== turnos ================== */

// Franjas disponibles (búsqueda)
app.get('/api/turnos/disponibles', auth, (req, res) => {
  const { especialidad, medicoId, desde, hasta } = req.query;
  if (desde && !store.isValidDate(desde)) {
    return res.status(400).json({ error: 'Fecha de inicio inválida.' });
  }
  if (hasta && !store.isValidDate(hasta)) {
    return res.status(400).json({ error: 'Fecha de fin inválida.' });
  }
  const slots = store.generateSlots({
    medicoId: medicoId || null,
    especialidad: especialidad || null,
    desde: desde || null,
    hasta: hasta || null
  });
  res.json({ slots, maxDias: store.MAX_DAYS });
});

// Reservar turno (validación de disponibilidad en tiempo real)
app.post('/api/turnos', auth, (req, res) => {
  const { medicoId, fecha, hora } = req.body;

  if (!store.findUserById(medicoId) || store.findUserById(medicoId).role !== 'medico') {
    return res.status(400).json({ error: 'Médico inválido.' });
  }
  if (!store.isValidDate(fecha)) return res.status(400).json({ error: 'Fecha inválida.' });
  if (!store.isValidTime(hora)) return res.status(400).json({ error: 'Hora inválida.' });

  const slot = store
    .generateSlots({ medicoId, desde: fecha, hasta: fecha })
    .find((s) => s.fecha === fecha && s.hora === hora);

  if (!slot) {
    return res.status(409).json({
      error: 'Esa franja horaria ya no está disponible. Elegí otro turno.'
    });
  }

  const turno = {
    id: store.uid(),
    pacienteId: req.user.id,
    medicoId,
    especialidad: slot.especialidad,
    fecha,
    hora,
    estado: 'reservado',
    prioridad: 'normal',
    motivo: null,
    createdAt: new Date().toISOString(),
    confirmadoAt: null,
    canceladoAt: null
  };

  store.getDb().turnos.push(turno);
  store.save();
  res.status(201).json({ turno: store.turnoView(turno) });
});

// Mis turnos (paciente)
app.get('/api/turnos/mios', auth, requireRole('paciente'), (req, res) => {
  store.refreshEstados();
  const turnos = store
    .getDb()
    .turnos
    .filter((t) => t.pacienteId === req.user.id)
    .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora))
    .map((t) => store.turnoView(t));
  res.json({ turnos });
});

function getTurnoPropio(req, res) {
  const turno = store.getDb().turnos.find((t) => t.id === req.params.id);
  if (!turno) {
    res.status(404).json({ error: 'El turno no existe.' });
    return null;
  }
  if (turno.pacienteId !== req.user.id && req.user.role !== 'recepcionista') {
    res.status(403).json({ error: 'No podés modificar ese turno.' });
    return null;
  }
  return turno;
}

// Confirmar turno (paciente)
app.post('/api/turnos/:id/confirmar', auth, requireRole('paciente', 'recepcionista'), (req, res) => {
  const turno = getTurnoPropio(req, res);
  if (!turno) return;

  if (!['reservado', 'confirmado'].includes(turno.estado)) {
    return res.status(409).json({ error: `No se puede confirmar un turno ${turno.estado}.` });
  }
  const inicio = new Date(`${turno.fecha}T${turno.hora}:00`);
  if (inicio < new Date()) {
    return res.status(409).json({ error: 'El turno ya comenzó.' });
  }

  turno.estado = 'confirmado';
  turno.confirmadoAt = new Date().toISOString();
  turno.motivo = null;
  store.save();
  res.json({ turno: store.turnoView(turno) });
});

// Cancelar turno (paciente / recepcionista)
app.post('/api/turnos/:id/cancelar', auth, requireRole('paciente', 'recepcionista'), (req, res) => {
  const turno = getTurnoPropio(req, res);
  if (!turno) return;

  if (['cancelado', 'ausente', 'atendido'].includes(turno.estado)) {
    return res.status(409).json({ error: `El turno ya estaba ${turno.estado}.` });
  }

  turno.estado = 'cancelado';
  turno.motivo = String(req.body?.motivo || 'Cancelado por el paciente');
  turno.canceladoAt = new Date().toISOString();
  store.save();
  res.json({ turno: store.turnoView(turno) });
});

// Reprogramar turno (paciente)
app.post('/api/turnos/:id/reprogramar', auth, requireRole('paciente'), (req, res) => {
  const turno = getTurnoPropio(req, res);
  if (!turno) return;

  if (!['reservado', 'confirmado'].includes(turno.estado)) {
    return res.status(409).json({ error: `No se puede reprogramar un turno ${turno.estado}.` });
  }

  const { fecha, hora } = req.body;
  if (!store.isValidDate(fecha)) return res.status(400).json({ error: 'Fecha inválida.' });
  if (!store.isValidTime(hora)) return res.status(400).json({ error: 'Hora inválida.' });

  const libre = store
    .generateSlots({ medicoId: turno.medicoId, desde: fecha, hasta: fecha })
    .some((s) => s.fecha === fecha && s.hora === hora);

  if (!libre) {
    return res.status(409).json({ error: 'Esa franja ya no está disponible. Elegí otra.' });
  }

  turno.fecha = fecha;
  turno.hora = hora;
  turno.estado = 'reservado';
  turno.motivo = null;
  turno.reprogramadoAt = new Date().toISOString();
  store.save();
  res.json({ turno: store.turnoView(turno) });
});

// Nuevas franjas para reprogramar (del mismo médico)
app.get('/api/turnos/:id/franjas', auth, requireRole('paciente'), (req, res) => {
  const turno = store.getDb().turnos.find((t) => t.id === req.params.id && t.pacienteId === req.user.id);
  if (!turno) return res.status(404).json({ error: 'El turno no existe.' });

  const slots = store
    .generateSlots({ medicoId: turno.medicoId, desde: req.query.desde })
    .filter((s) => !(s.fecha === turno.fecha && s.hora === turno.hora));
  res.json({ slots });
});

/* ================== agenda (médico / recepcionista) ================== */
app.get('/api/agenda', auth, requireRole('medico', 'recepcionista'), (req, res) => {
  store.refreshEstados();
  const db = store.getDb();
  let turnos = db.turnos.slice();

  if (req.user.role === 'medico') {
    turnos = turnos.filter((t) => t.medicoId === req.user.id);
  } else if (req.query.medicoId) {
    turnos = turnos.filter((t) => t.medicoId === req.query.medicoId);
  }
  if (req.query.fecha) {
    if (!store.isValidDate(req.query.fecha)) {
      return res.status(400).json({ error: 'Fecha inválida.' });
    }
    turnos = turnos.filter((t) => t.fecha === req.query.fecha);
  }
  if (req.query.especialidad) {
    turnos = turnos.filter((t) => t.especialidad === req.query.especialidad);
  }
  if (req.query.estado) {
    turnos = turnos.filter((t) => t.estado === req.query.estado);
  }

  turnos.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  // Conteo de estados sobre los turnos filtrados (coincide con lo que se muestra)
  const conteo = turnos.reduce((acc, t) => {
    acc[t.estado] = (acc[t.estado] || 0) + 1;
    return acc;
  }, {});

  res.json({
    turnos: turnos.map((t) => store.turnoView(t, { conPaciente: true })),
    total: turnos.length,
    conteo,
    rol: req.user.role
  });
});

// Marcar turno como urgente (médico)
app.post('/api/turnos/:id/urgente', auth, requireRole('medico'), (req, res) => {
  const turno = store.getDb().turnos.find((t) => t.id === req.params.id && t.medicoId === req.user.id);
  if (!turno) return res.status(404).json({ error: 'El turno no existe.' });
  if (['cancelado', 'ausente'].includes(turno.estado)) {
    return res.status(409).json({ error: `No se puede marcar urgente un turno ${turno.estado}.` });
  }

  turno.prioridad = turno.prioridad === 'urgente' ? 'normal' : 'urgente';
  store.save();
  res.json({ turno: store.turnoView(turno, { conPaciente: true }) });
});

/* ================== horarios del médico ================== */
app.get('/api/medico/horarios', auth, requireRole('medico'), (req, res) => {
  const horarios = store
    .getDb()
    .horarios
    .filter((h) => h.medicoId === req.user.id)
    .sort((a, b) => a.dia - b.dia || a.desde.localeCompare(b.desde));
  const bloqueos = store
    .getDb()
    .bloqueos
    .filter((b) => b.medicoId === req.user.id);
  res.json({ horarios, bloqueos });
});

app.post('/api/medico/horarios', auth, requireRole('medico'), (req, res) => {
  const { dia, desde, hasta } = req.body;
  const diaNum = Number(dia);

  if (!Number.isInteger(diaNum) || diaNum < 0 || diaNum > 6) {
    return res.status(400).json({ error: 'Elegí un día de la semana.', fields: { dia: 'Día inválido.' } });
  }
  if (!store.isValidTime(desde) || !store.isValidTime(hasta)) {
    return res.status(400).json({ error: 'Horarios inválidos.', fields: { desde: 'Usá el formato HH:MM.' } });
  }
  if (desde >= hasta) {
    return res.status(400).json({
      error: 'El horario de fin debe ser posterior al de inicio.',
      fields: { hasta: 'Debe ser mayor que la hora de inicio.' }
    });
  }

  const repetido = store.getDb().horarios.some(
    (h) => h.medicoId === req.user.id && h.dia === diaNum && h.desde === desde && h.hasta === hasta
  );
  if (repetido) return res.status(409).json({ error: 'Ese horario ya está cargado.' });

  const horario = { id: store.uid(), medicoId: req.user.id, dia: diaNum, desde, hasta };
  store.getDb().horarios.push(horario);
  store.save();
  res.status(201).json({ horario });
});

app.delete('/api/medico/horarios/:id', auth, requireRole('medico'), (req, res) => {
  const db = store.getDb();
  const idx = db.horarios.findIndex((h) => h.id === req.params.id && h.medicoId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'El horario no existe.' });
  db.horarios.splice(idx, 1);
  store.save();
  res.json({ ok: true });
});

// Cancelar un día completo (bloquea franjas y cancela turnos del día)
app.post('/api/medico/cancelar-dia', auth, requireRole('medico'), (req, res) => {
  const { fecha } = req.body;
  if (!store.isValidDate(fecha)) return res.status(400).json({ error: 'Fecha inválida.' });
  if (fecha < store.toISODate(new Date())) {
    return res.status(400).json({ error: 'No se pueden cancelar días pasados.' });
  }

  const db = store.getDb();
  if (!db.bloqueos.some((b) => b.medicoId === req.user.id && b.fecha === fecha)) {
    db.bloqueos.push({ id: store.uid(), medicoId: req.user.id, fecha, motivo: 'Cancelación de horario' });
  }

  let afectados = 0;
  const ahora = new Date().toISOString();
  for (const t of db.turnos) {
    if (t.medicoId === req.user.id && t.fecha === fecha && ['reservado', 'confirmado'].includes(t.estado)) {
      t.estado = 'cancelado';
      t.motivo = 'Cancelación de horario del médico';
      t.canceladoAt = ahora;
      afectados += 1;
    }
  }
  store.save();
  res.json({ ok: true, turnosCancelados: afectados });
});

/* ================== recepcionista ================== */
app.post('/api/pacientes', auth, requireRole('recepcionista'), (req, res) => {
  const errors = validatePersona(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Revisá los campos marcados.', fields: errors });
  }

  const email = String(req.body.email).trim().toLowerCase();
  const dni = String(req.body.dni).trim();

  if (store.findUserByEmail(email)) {
    return res.status(409).json({ error: 'Ese correo ya está registrado.', fields: { email: 'El correo ya está en uso.' } });
  }
  if (store.getDb().users.some((u) => u.dni === dni)) {
    return res.status(409).json({ error: 'Ese DNI ya está registrado.', fields: { dni: 'El documento ya tiene una cuenta.' } });
  }

  const user = store.makeUser({
    role: 'paciente',
    nombre: String(req.body.nombre).trim(),
    apellido: String(req.body.apellido).trim(),
    email,
    dni,
    telefono: String(req.body.telefono || '').trim(),
    canal: req.body.canal,
    password: req.body.password
  });

  store.getDb().users.push(user);
  store.save();
  res.status(201).json({ paciente: store.publicUser(user) });
});

app.get('/api/pacientes', auth, requireRole('recepcionista'), (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  let pacientes = store.getDb().users.filter((u) => u.role === 'paciente');
  if (q) {
    pacientes = pacientes.filter(
      (u) =>
        u.dni.includes(q) ||
        u.email.includes(q) ||
        `${u.nombre} ${u.apellido}`.toLowerCase().includes(q)
    );
  }
  res.json({ pacientes: pacientes.map(store.publicUser) });
});

/* ================== error 404 (API) ================== */
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado.' });
});

/* ================== error 500 (API) ================== */
app.use((err, req, res, next) => {
  console.error('[server] Error:', err);
  res.status(500).json({ error: 'Error interno del servidor. Probá de nuevo en unos segundos.' });
});

/* En Vercel, server.js se importa como módulo y Express corre
   como Function; el listen solo ocurre con npm start en local. */
module.exports = app;

/* ================== arranque ================== */
if (require.main === module) {
  const server = app.listen(PORT, () => {
    const db = store.getDb();
    console.log('');
    console.log('  ┌─────────────────────────────────────────────────┐');
    console.log('  │  🏥 APP CLÍNICA DE BARRIO (npm start)           │');
    console.log('  │  http://localhost:' + PORT + '                      │');
    console.log('  └─────────────────────────────────────────────────┘');
    console.log('  Usuarios de prueba (contraseña: ' + store.DEMO_PASSWORD + '):');
    for (const u of db.users) {
      const extra = u.role === 'medico' ? ` · ${u.especialidad}` : '';
      console.log(`    · ${u.email}  [${u.role}]${extra}`);
    }
    console.log('');
    console.log('  Sitio de exposición: npm run dev  →  puerto 8090');
    console.log('  Reiniciar datos:     npm run seed');
    console.log('');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log('');
      console.log('  ✗ El puerto ' + PORT + ' ya está en uso.');
      console.log('    ¿Ya tenés un "npm start" corriendo en otra terminal?');
      console.log('');
      console.log('    Opción 1 — cerrá esa terminal (Ctrl+C) y volvé a ejecutar npm start.');
      console.log('    Opción 2 — levantalo en otro puerto:');
      console.log('        PowerShell:  $env:PORT=3001; npm start');
      console.log('        CMD:        set PORT=3001 && npm start');
      console.log('');
      console.log('    Para ver qué proceso lo usa:');
      console.log('        netstat -ano | findstr :' + PORT);
      console.log('        taskkill /PID <pid> /F /T');
      console.log('');
      process.exit(1);
    }
    console.error('[server] Error inesperado al arrancar:', err.message);
    process.exit(1);
  });
}
