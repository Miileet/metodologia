/* =========================================================
   lib/store.js — Capa de datos (archivo JSON)
   Usuarios, horarios, turnos y bloqueos + helpers de
   contraseñas y generación de franjas disponibles.
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cloud = require('./cloud');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DB_KEY = 'clinica:db';           // clave de la base en Upstash (modo nube)

const DEMO_PASSWORD = 'demo1234';      // 8 caracteres, letra + número
const MAX_DAYS = 60;                   // horizonte de búsqueda de franjas
const SLOT_MINUTES = 30;               // duración de cada franja

let db = null;
let dirty = false;                     // hay datos sin escribir en la nube
let writing = false;                   // hay una escritura en curso en la nube
let writePromise = Promise.resolve();  // promesa de la escritura en curso
let fileWarned = false;                // ya se avisó que no se puede escribir

/* ---------------- utilidades ---------------- */
const uid = () => crypto.randomUUID();

const pad = (n) => String(n).padStart(2, '0');
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && toISODate(d) === s;
}

function isValidTime(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');
}

/* ---------------- contraseñas ---------------- */
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  try {
    const hash = crypto.scryptSync(String(password), user.salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
  } catch {
    return false;
  }
}

/* ---------------- seed (datos de prueba) ---------------- */
function makeUser(o) {
  const { salt, hash } = hashPassword(o.password || DEMO_PASSWORD);
  const user = {
    id: o.id || uid(),
    role: o.role,
    nombre: o.nombre,
    apellido: o.apellido,
    email: o.email.toLowerCase().trim(),
    dni: String(o.dni),
    telefono: o.telefono || '',
    canal: o.canal || 'whatsapp',
    salt,
    hash,
    failed: 0,
    locked: false,
    createdAt: new Date().toISOString()
  };
  if (o.role === 'medico') {
    user.especialidad = o.especialidad;
    user.matricula = o.matricula;
  }
  return user;
}

function buildSeed() {
  const especialidades = [
    'Clínica Médica',
    'Pediatría',
    'Cardiología',
    'Traumatología',
    'Dermatología'
  ];

  const users = [
    // Paciente de prueba
    makeUser({
      id: 'pac-laura', role: 'paciente',
      nombre: 'Laura', apellido: 'Pérez',
      email: 'laura@mail.com', dni: '30123456',
      telefono: '11 5555-1234', canal: 'whatsapp'
    }),
    makeUser({
      id: 'pac-marco', role: 'paciente',
      nombre: 'Marco', apellido: 'Díaz',
      email: 'marco@mail.com', dni: '28456789',
      telefono: '11 4444-9876', canal: 'mail'
    }),
    // Médicos
    makeUser({
      id: 'med-carlos', role: 'medico',
      nombre: 'Carlos', apellido: 'Gómez',
      email: 'carlos.gomez@clinica.com', dni: '18234567',
      telefono: '11 3333-1111', canal: 'mail',
      especialidad: 'Clínica Médica', matricula: 'MN-10234'
    }),
    makeUser({
      id: 'med-marina', role: 'medico',
      nombre: 'Marina', apellido: 'Ríos',
      email: 'marina.rios@clinica.com', dni: '20987654',
      telefono: '11 3333-2222', canal: 'mail',
      especialidad: 'Pediatría', matricula: 'MN-10871'
    }),
    makeUser({
      id: 'med-julian', role: 'medico',
      nombre: 'Julián', apellido: 'Ferreyra',
      email: 'julian.ferreyra@clinica.com', dni: '19876123',
      telefono: '11 3333-3333', canal: 'mail',
      especialidad: 'Cardiología', matricula: 'MN-11456'
    }),
    makeUser({
      id: 'med-sofia', role: 'medico',
      nombre: 'Sofía', apellido: 'Bianchi',
      email: 'sofia.bianchi@clinica.com', dni: '22345987',
      telefono: '11 3333-4444', canal: 'mail',
      especialidad: 'Traumatología', matricula: 'MN-11902'
    }),
    // Recepcionista
    makeUser({
      id: 'rec-ana', role: 'recepcionista',
      nombre: 'Ana', apellido: 'Suárez',
      email: 'ana@clinica.com', dni: '27111222',
      telefono: '11 2222-0000', canal: 'llamada'
    })
  ];

  // dia: 0 = domingo … 6 = sábado
  const horarios = [
    { id: uid(), medicoId: 'med-carlos', dia: 1, desde: '08:00', hasta: '12:00' },
    { id: uid(), medicoId: 'med-carlos', dia: 2, desde: '08:00', hasta: '12:00' },
    { id: uid(), medicoId: 'med-carlos', dia: 4, desde: '08:00', hasta: '12:00' },
    { id: uid(), medicoId: 'med-carlos', dia: 3, desde: '14:00', hasta: '18:00' },
    { id: uid(), medicoId: 'med-marina', dia: 1, desde: '09:00', hasta: '13:00' },
    { id: uid(), medicoId: 'med-marina', dia: 3, desde: '09:00', hasta: '13:00' },
    { id: uid(), medicoId: 'med-marina', dia: 5, desde: '09:00', hasta: '13:00' },
    { id: uid(), medicoId: 'med-julian', dia: 2, desde: '15:00', hasta: '19:00' },
    { id: uid(), medicoId: 'med-julian', dia: 4, desde: '15:00', hasta: '19:00' },
    { id: uid(), medicoId: 'med-sofia', dia: 3, desde: '10:00', hasta: '14:00' },
    { id: uid(), medicoId: 'med-sofia', dia: 5, desde: '10:00', hasta: '14:00' }
  ];

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    especialidades,
    users,
    horarios,
    bloqueos: [],   // { id, medicoId, fecha, motivo }
    turnos: []      // { id, pacienteId, medicoId, fecha, hora, estado, prioridad, motivo, ... }
  };
}

/* ---------------- persistencia ---------------- */
function load() {
  if (db) return db;
  if (cloud.enabled) return db; // en la nube se carga con loadCloud()
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return db;
    }
  } catch (err) {
    console.error('[store] No se pudo leer data/db.json, se regenera el seed:', err.message);
  }
  db = buildSeed();
  save();
  return db;
}

/* Carga la base completa desde Upstash. Se llama al inicio de
   cada petición para no pisar cambios de otra instancia. */
async function loadCloud() {
  const raw = await cloud.get(DB_KEY);
  if (raw) {
    db = JSON.parse(raw);
    return db;
  }
  db = buildSeed();
  save(); // deja el seed guardado en la nube
  return db;
}

function save() {
  if (!db) return;

  if (cloud.enabled) {
    // Escritura diferida y serializada: si algo cambia mientras
    // se escribe, se vuelve a escribir al terminar.
    dirty = true;
    if (!writing) {
      writing = true;
      writePromise = (async () => {
        while (dirty) {
          dirty = false;
          try {
            await cloud.set(DB_KEY, JSON.stringify(db));
          } catch (err) {
            dirty = false;
            console.error('[store] No se pudo guardar en la nube:', err.message);
            break;
          }
        }
        writing = false;
      })();
    }
    return;
  }

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    // En Vercel (sin Upstash) el filesystem es de solo lectura:
    // los datos no persisten entre invocaciones, pero el pedido
    // no debe cortarse. Con variables de Upstash no se llega acá.
    if (!fileWarned) {
      fileWarned = true;
      console.error('[store] No se pudo escribir data/db.json:', err.message);
    }
  }
}

/* Espera a que terminen las escrituras pendientes de la nube. */
async function flush() {
  if (!cloud.enabled) return;
  await writePromise;
}

function reset() {
  db = buildSeed();
  save();
  return db;
}

const getDb = () => db || load();

/* ---------------- consultas ---------------- */
function findUserById(id) {
  return getDb().users.find((u) => u.id === id) || null;
}

function findUserByEmail(email) {
  const e = String(email || '').toLowerCase().trim();
  return getDb().users.find((u) => u.email === e) || null;
}

function publicUser(u) {
  if (!u) return null;
  const { salt, hash, failed, locked, ...rest } = u;
  return { ...rest, locked: !!locked };
}

/* ---------------- turnos ---------------- */
function refreshEstados() {
  const data = getDb();
  const now = new Date();
  let dirty = false;
  for (const t of data.turnos) {
    if (t.estado === 'reservado' || t.estado === 'confirmado') {
      const fin = new Date(`${t.fecha}T${t.hora}:00`);
      fin.setMinutes(fin.getMinutes() + 30);
      if (now > fin) {
        t.estado = 'ausente';
        t.motivo = 'No se presentó (pasados 30 minutos del turno)';
        dirty = true;
      }
    }
  }
  if (dirty) save();
}

function turnoView(t, { conPaciente = false } = {}) {
  const med = findUserById(t.medicoId);
  const view = {
    ...t,
    medicoNombre: med ? `${med.nombre} ${med.apellido}` : '—',
    medicoEspecialidad: med ? med.especialidad : '—'
  };
  if (conPaciente) {
    const pac = findUserById(t.pacienteId);
    view.pacienteNombre = pac ? `${pac.nombre} ${pac.apellido}` : '—';
    view.pacienteEmail = pac ? pac.email : '';
    view.pacienteTelefono = pac ? pac.telefono : '';
    view.pacienteDni = pac ? pac.dni : '';
    view.pacienteCanal = pac ? pac.canal : '';
  }
  return view;
}

function isSlotFree(medicoId, fecha, hora) {
  return !getDb().turnos.some(
    (t) =>
      t.medicoId === medicoId &&
      t.fecha === fecha &&
      t.hora === hora &&
      t.estado !== 'cancelado'
  );
}

function isBlocked(medicoId, fecha, hora) {
  const bloqueo = getDb().bloqueos.find((b) => b.medicoId === medicoId && b.fecha === fecha);
  if (!bloqueo) return false;
  if (!hora) return true;
  // si el bloqueo guarda rango, validar la hora; si no, todo el día está bloqueado
  if (bloqueo.desde && bloqueo.hasta) return hora >= bloqueo.desde && hora < bloqueo.hasta;
  return true;
}

/* ---------------- generación de franjas ---------------- */
function generateSlots({ medicoId = null, especialidad = null, desde = null, hasta = null } = {}) {
  const data = getDb();
  const hoy = toISODate(new Date());

  let fechaDesde = isValidDate(desde) ? desde : hoy;
  if (fechaDesde < hoy) fechaDesde = hoy;

  let fechaHasta = isValidDate(hasta) ? hasta : toISODate(new Date(Date.now() + 13 * 864e5));
  const limite = toISODate(new Date(Date.now() + MAX_DAYS * 864e5));
  if (fechaHasta > limite) fechaHasta = limite;
  if (fechaHasta < fechaDesde) fechaHasta = fechaDesde;

  let medicos = data.users.filter((u) => u.role === 'medico');
  if (medicoId) medicos = medicos.filter((m) => m.id === medicoId);
  if (especialidad) medicos = medicos.filter((m) => m.especialidad === especialidad);

  const margen = new Date(Date.now() + 30 * 60 * 1000); // 30 min de anticipación
  const slots = [];

  const start = new Date(fechaDesde + 'T00:00:00');
  const end = new Date(fechaHasta + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const fecha = toISODate(d);
    const dia = d.getDay();

    for (const med of medicos) {
      const hs = data.horarios.filter((h) => h.medicoId === med.id && h.dia === dia);
      if (!hs.length) continue;
      if (isBlocked(med.id, fecha)) continue;

      for (const h of hs) {
        const [h1, m1] = h.desde.split(':').map(Number);
        const [h2, m2] = h.hasta.split(':').map(Number);
        const totalIni = h1 * 60 + m1;
        const totalFin = h2 * 60 + m2;

        for (let t = totalIni; t + SLOT_MINUTES <= totalFin; t += SLOT_MINUTES) {
          const hora = `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
          const slotDate = new Date(`${fecha}T${hora}:00`);
          if (slotDate < margen) continue;
          if (!isSlotFree(med.id, fecha, hora)) continue;

          slots.push({
            medicoId: med.id,
            medicoNombre: `${med.nombre} ${med.apellido}`,
            especialidad: med.especialidad,
            fecha,
            hora
          });
        }
      }
    }
  }

  slots.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  return slots;
}

module.exports = {
  DEMO_PASSWORD,
  MAX_DAYS,
  load,
  loadCloud,
  flush,
  save,
  reset,
  getDb,
  uid,
  hashPassword,
  verifyPassword,
  makeUser,
  findUserById,
  findUserByEmail,
  publicUser,
  refreshEstados,
  turnoView,
  isSlotFree,
  isBlocked,
  generateSlots,
  isValidDate,
  isValidTime,
  toISODate,
  pad
};
