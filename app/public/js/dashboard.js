/* =========================================================
   js/dashboard.js — Lógica de la app por roles
   Paciente · Médico · Recepcionista
   ========================================================= */
'use strict';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const CANALES = { whatsapp: 'WhatsApp', mail: 'Correo', llamada: 'Llamada', mensaje: 'SMS' };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- API ---------------- */
async function api(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) {
    window.location.href = 'index.html';
    throw new Error('Sesión expirada.');
  }
  let data = {};
  try { data = await res.json(); } catch { /* vacío */ }
  if (!res.ok) {
    const err = new Error(data.error || 'Ocurrió un error inesperado.');
    err.fields = data.fields || null;
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------------- Toasts ---------------- */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'ok' ? '✅' : '⚠️'}</span><span>${msg}</span>`;
  $('#toastZone').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 3400);
  setTimeout(() => el.remove(), 3900);
}

/* ---------------- Modal (devuelve promesa) ---------------- */
const backdrop = $('#modalBackdrop');
let modalResolve = null;

function openModal({ title, body, okText = 'Confirmar', danger = false }) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  const ok = $('#modalOk');
  ok.textContent = okText;
  ok.className = danger ? 'btn btn-danger' : 'btn btn-primary';
  backdrop.classList.add('open');
  return new Promise((resolve) => { modalResolve = resolve; });
}
function closeModal(result = false) {
  backdrop.classList.remove('open');
  if (modalResolve) { modalResolve(result); modalResolve = null; }
}
$('#modalCancel').addEventListener('click', () => closeModal(false));
$('#modalOk').addEventListener('click', () => {
  const sel = $('#modalBody select');
  closeModal(sel ? { slot: sel.value } : true);
});
backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && backdrop.classList.contains('open')) closeModal(false); });

/* ---------------- helpers de UI ---------------- */
const hoyISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function fechaCorta(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { dia: d, mes: MESES[m - 1], diaSem: DIAS[new Date(y, m - 1, d).getDay()].slice(0, 3) };
}

function turnoCard(t, acciones = '') {
  const f = fechaCorta(t.fecha);
  const cancelada = ['cancelado', 'ausente'].includes(t.estado);
  return `
    <article class="turno ${t.prioridad === 'urgente' ? 'urgente' : ''} ${cancelada ? 'cancelada' : ''}" data-id="${t.id}">
      <div class="fecha">
        <b>${f.dia}</b>
        <small>${f.mes}</small>
        <small>${f.diaSem}</small>
      </div>
      <div class="info">
        <h4>
          ${esc(t.medicoNombre)}
          <span class="estado estado-${t.estado}">${t.estado}</span>
          ${t.prioridad === 'urgente' ? '<span class="estado prio-urgente">urgente</span>' : ''}
        </h4>
        <p>
          ${t.hora} hs · ${esc(t.especialidad || '')}
          ${t.pacienteNombre ? '· Paciente: <b style="color:var(--text)">' + esc(t.pacienteNombre) + '</b>' : ''}
          ${t.motivo ? '· ' + esc(t.motivo) : ''}
        </p>
      </div>
      ${acciones ? `<div class="actions">${acciones}</div>` : ''}
    </article>`;
}

function statsHTML(items) {
  return items.map((s) => `<div class="stat"><b>${s.n}</b><span>${s.label}</span></div>`).join('');
}

function clearErrors(form) {
  $$('.field', form).forEach((f) => f.classList.remove('invalid'));
  $$('.field-error', form).forEach((s) => { s.textContent = ''; });
}

/* Busca el campo del formulario a partir de la clave del servidor
   (p.ej. "dni" → #pDni, "email" → #pEmail). */
function findInput(form, key) {
  const k = String(key).toLowerCase();
  const els = [...form.querySelectorAll('input, select, textarea')];
  return (
    els.find((e) => (e.id || '').toLowerCase() === k) ||
    els.find((e) => (e.name || '').toLowerCase() === k) ||
    els.find((e) => (e.id || '').toLowerCase().endsWith(k))
  );
}

function showErrors(form, fields = {}, general = null) {
  clearErrors(form);
  Object.entries(fields).forEach(([key, msg]) => {
    const input = findInput(form, key);
    if (!input) return;
    input.closest('.field')?.classList.add('invalid');
    const err = form.querySelector(`.field-error[data-for="${input.id}"]`);
    if (err) err.textContent = msg;
  });
  const alertBox = form.querySelector('.alert');
  if (alertBox) {
    alertBox.hidden = !general;
    alertBox.textContent = general || '';
  }
}

/* =========================================================
   ARRANQUE
   ========================================================= */
let ME = null;
let CATALOGO = { especialidades: [], medicos: [] };

const NAV = {
  paciente: [
    ['reservar', '📅 Reservar turno'],
    ['mis-turnos', '✅ Mis turnos'],
    ['perfil', '👤 Mi perfil']
  ],
  medico: [
    ['agenda-medica', '🩺 Mi agenda'],
    ['horarios', '⏰ Mis horarios'],
    ['perfil', '👤 Mi perfil']
  ],
  recepcionista: [
    ['agenda-general', '🗂️ Agenda general'],
    ['registrar', '➕ Registrar paciente'],
    ['perfil', '👤 Mi perfil']
  ]
};

(async function init() {
  try {
    const { user } = await api('/api/auth/me');
    if (!user) { window.location.href = 'index.html'; return; }
    ME = user;
  } catch {
    return; // api() redirige al login ante un 401
  }

  // Usuario en la barra
  $('#userName').textContent = `${ME.nombre} ${ME.apellido}`;
  $('#userMail').textContent = ME.email;
  const roleChip = $('#userRole');
  roleChip.textContent = ME.role;
  roleChip.classList.add(`chip-${ME.role}`);

  // Menú por rol
  const nav = $('#mainNav');
  nav.innerHTML = NAV[ME.role]
    .map(([id, label], i) => `<li><button data-view="${id}" class="${i === 0 ? 'active' : ''}">${label}</button></li>`)
    .join('');
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (btn) showView(btn.dataset.view);
  });

  // Logout
  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ya salió */ }
    window.location.href = 'index.html';
  });

  // Listeners de las vistas: se enganchan de inmediato (no dependen del catálogo)
  if (ME.role === 'paciente') initReservar();
  if (ME.role === 'medico') initMedico();
  if (ME.role === 'recepcionista') initRecepcionista();

  // Catálogo: llena los selectores de médicos y especialidades
  CATALOGO = await api('/api/catalogo');
  if (ME.role === 'paciente') pintarMedicos();
  if (ME.role === 'recepcionista') pintarMedicosAgenda();

  // Vista inicial
  showView(NAV[ME.role][0][0]);
  renderPerfil();
})();

function showView(id) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${id}`));
  $$('#mainNav button').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const loaders = {
    'reservar': () => {},
    'mis-turnos': loadMisTurnos,
    'agenda-medica': loadAgendaMedica,
    'horarios': loadHorarios,
    'registrar': loadPacientes,
    'agenda-general': loadAgendaGeneral,
    'perfil': renderPerfil
  };
  if (loaders[id]) loaders[id]();
}

/* =========================================================
   PACIENTE · Reservar turno
   ========================================================= */
function initReservar() {
  const selEsp = $('#fEspecialidad');
  const selMed = $('#fMedico');
  const selFecha = $('#fFecha');

  selEsp.addEventListener('change', pintarMedicos);

  selFecha.min = hoyISO();
  selFecha.max = (() => {
    const d = new Date(Date.now() + 60 * 864e5);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();

  $('#btnBuscar').addEventListener('click', buscarTurnos);
}

function pintarMedicos() {
  const selEsp = $('#fEspecialidad');
  const selMed = $('#fMedico');

  if (selEsp.options.length === 1) {
    CATALOGO.especialidades.forEach((e) => {
      selEsp.insertAdjacentHTML('beforeend', `<option value="${esc(e)}">${esc(e)}</option>`);
    });
  }

  const esp = selEsp.value;
  const meds = CATALOGO.medicos.filter((m) => !esp || m.especialidad === esp);
  selMed.innerHTML = '<option value="">Todos</option>' +
    meds.map((m) => `<option value="${m.id}">${esc(m.nombre)} · ${esc(m.especialidad)}</option>`).join('');
}

async function buscarTurnos() {
  const cont = $('#slotResults');
  const esp = $('#fEspecialidad').value;
  const med = $('#fMedico').value;
  const fecha = $('#fFecha').value;

  if (fecha && fecha < hoyISO()) {
    toast('No se pueden reservar turnos en fechas pasadas.', 'err');
    return;
  }

  $('#btnBuscar').disabled = true;
  $('#btnBuscar').textContent = 'Buscando…';

  try {
    const hasta = fecha || (() => {
      const d = new Date(Date.now() + 14 * 864e5);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    })();

    const params = new URLSearchParams();
    if (esp) params.set('especialidad', esp);
    if (med) params.set('medicoId', med);
    params.set('desde', fecha || hoyISO());
    params.set('hasta', fecha || hasta);

    const { slots } = await api('/api/turnos/disponibles?' + params.toString());

    if (!slots.length) {
      cont.innerHTML = `<div class="empty"><span class="big">😕</span>
        No hay franjas disponibles con esos filtros. Probá con otra fecha, médico o especialidad.</div>`;
      return;
    }

    // agrupar por médico + fecha
    const grupos = {};
    slots.forEach((s) => {
      const key = `${s.medicoId}|${s.fecha}`;
      (grupos[key] = grupos[key] || { medico: s.medicoNombre, esp: s.especialidad, fecha: s.fecha, items: [] })
        .items.push(s);
    });

    cont.innerHTML = Object.values(grupos)
      .map((g) => {
        const f = fechaCorta(g.fecha);
        return `
        <div class="slots-group">
          <h4>
            ${esc(g.medico)}
            <small>${esc(g.esp)} · ${DIAS[new Date(g.fecha + 'T00:00:00').getDay()]} ${f.dia} ${f.mes}</small>
          </h4>
          <div class="slots">
            ${g.items
              .map(
                (s) => `<button class="slot" data-med="${s.medicoId}" data-fecha="${s.fecha}"
                          data-hora="${s.hora}" data-med-nombre="${esc(s.medicoNombre)}"
                          data-esp="${esc(s.especialidad)}">${s.hora}</button>`
              )
              .join('')}
          </div>
        </div>`;
      })
      .join('');

    cont.querySelectorAll('.slot').forEach((btn) => {
      btn.addEventListener('click', () => reservar(btn));
    });

    toast(`${slots.length} franjas disponibles.`);
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    $('#btnBuscar').disabled = false;
    $('#btnBuscar').textContent = 'Buscar turnos';
  }
}

async function reservar(btn) {
  const { med, fecha, hora, medNombre, esp } = btn.dataset;
  const f = fechaCorta(fecha);

  const ok = await openModal({
    title: 'Confirmar reserva',
    body: `
      <p>Revisá los datos del turno antes de confirmar:</p>
      <div class="summary">
        <span><b>Médico:</b> ${esc(medNombre)}</span>
        <span><b>Especialidad:</b> ${esc(esp)}</span>
        <span><b>Fecha:</b> ${DIAS[new Date(fecha + 'T00:00:00').getDay()]} ${f.dia} ${f.mes}</span>
        <span><b>Horario:</b> ${hora} hs</span>
      </div>
      <p style="font-size:.85rem">Se te avisará <b style="color:var(--text)">48 horas antes</b> para que confirmes la asistencia.</p>`,
    okText: 'Confirmar turno'
  });
  if (!ok) return;

  try {
    await api('/api/turnos', { method: 'POST', body: { medicoId: med, fecha, hora } });
    toast('¡Turno reservado con éxito!');
    showView('mis-turnos');
  } catch (err) {
    toast(err.message, 'err');
    buscarTurnos(); // recargar disponibilidad
  }
}

/* =========================================================
   PACIENTE · Mis turnos
   ========================================================= */
async function loadMisTurnos() {
  const cont = $('#misTurnosList');
  cont.innerHTML = '<div class="empty">Cargando…</div>';

  try {
    const { turnos } = await api('/api/turnos/mios');
    const ahora = new Date();
    const futuros = turnos.filter((t) => ['reservado', 'confirmado'].includes(t.estado) && new Date(`${t.fecha}T${t.hora}`) > ahora);
    const confirmados = turnos.filter((t) => t.estado === 'confirmado');
    const cancelados = turnos.filter((t) => t.estado === 'cancelado');

    $('#misTurnosStats').innerHTML = statsHTML([
      { n: futuros.length, label: 'Turnos próximos' },
      { n: confirmados.length, label: 'Confirmados' },
      { n: cancelados.length, label: 'Cancelados' },
      { n: turnos.length, label: 'Historial total' }
    ]);

    if (!turnos.length) {
      cont.innerHTML = `<div class="empty"><span class="big">📅</span>
        Todavía no tenés turnos. <b>Reservá tu primero</b> desde el menú.</div>`;
      return;
    }

    cont.innerHTML = turnos.map((t) => turnoCard(t, accionesPara(t))).join('');

    cont.querySelectorAll('button[data-acc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const { acc, id } = btn.dataset;
        const turno = turnos.find((x) => x.id === id);
        if (acc === 'confirmar') confirmarTurno(turno);
        if (acc === 'cancelar') cancelarTurno(turno);
        if (acc === 'reprogramar') reprogramarTurno(turno);
      });
    });
  } catch (err) {
    cont.innerHTML = `<div class="empty">⚠️ ${esc(err.message)}</div>`;
  }
}

function accionesPara(t) {
  const pasado = new Date(`${t.fecha}T${t.hora}`) < new Date();
  if (['cancelado', 'ausente', 'atendido'].includes(t.estado)) return '';
  if (pasado) return '';
  const botones = [];
  if (t.estado === 'reservado') {
    botones.push(`<button class="btn btn-success btn-sm" data-acc="confirmar" data-id="${t.id}">✓ Confirmar</button>`);
  }
  botones.push(`<button class="btn btn-ghost btn-sm" data-acc="reprogramar" data-id="${t.id}">↻ Reprogramar</button>`);
  botones.push(`<button class="btn btn-danger btn-sm" data-acc="cancelar" data-id="${t.id}">✕ Cancelar</button>`);
  return botones.join('');
}

async function confirmarTurno(t) {
  try {
    await api(`/api/turnos/${t.id}/confirmar`, { method: 'POST' });
    toast('Turno confirmado. ¡Nos vemos pronto!');
    loadMisTurnos();
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function cancelarTurno(t) {
  const f = fechaCorta(t.fecha);
  const ok = await openModal({
    title: 'Cancelar turno',
    danger: true,
    okText: 'Sí, cancelar',
    body: `<p>Vas a cancelar este turno:</p>
      <div class="summary">
        <span><b>${esc(t.medicoNombre)}</b> · ${esc(t.especialidad || '')}</span>
        <span>${DIAS[new Date(t.fecha + 'T00:00:00').getDay()]} ${f.dia} ${f.mes} · ${t.hora} hs</span>
      </div>
      <p style="font-size:.85rem">La franja quedará libre para otro paciente.</p>`
  });
  if (!ok) return;

  try {
    await api(`/api/turnos/${t.id}/cancelar`, { method: 'POST', body: { motivo: 'Cancelado por el paciente' } });
    toast('Turno cancelado.');
    loadMisTurnos();
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function reprogramarTurno(t) {
  let slots = [];
  try {
    const desde = hoyISO();
    ({ slots } = await api(`/api/turnos/${t.id}/franjas?desde=${desde}`));
  } catch (err) {
    return toast(err.message, 'err');
  }

  if (!slots.length) {
    return toast('No hay franjas disponibles con ese médico por ahora.', 'err');
  }

  const opciones = slots
    .slice(0, 60)
    .map((s) => {
      const f = fechaCorta(s.fecha);
      return `<option value="${s.fecha}|${s.hora}">${DIAS[new Date(s.fecha + 'T00:00:00').getDay()]} ${f.dia} ${f.mes} · ${s.hora} hs</option>`;
    })
    .join('');

  const ok = await openModal({
    title: 'Reprogramar turno',
    okText: 'Reprogramar',
    body: `<p>Elegí la nueva fecha y horario con <b style="color:var(--text)">${esc(t.medicoNombre)}</b>:</p>
      <div class="field" style="margin-top:.8rem">
        <label for="nuevaFranja">Nueva franja</label>
        <select id="nuevaFranja">${opciones}</select>
      </div>
      <p style="font-size:.85rem">El horario actual quedará libre para otro paciente.</p>`
  });
  if (!ok) return;

  const [fecha, hora] = ok.slot.split('|');
  try {
    await api(`/api/turnos/${t.id}/reprogramar`, { method: 'POST', body: { fecha, hora } });
    toast('Turno reprogramado correctamente.');
    loadMisTurnos();
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* =========================================================
   MÉDICO · Agenda y horarios
   ========================================================= */
function initMedico() {
  $('#mFecha').value = hoyISO();
  $('#btnAgendaMedico').addEventListener('click', loadAgendaMedica);
  $('#mEstado').addEventListener('change', loadAgendaMedica);
  $('#mFecha').addEventListener('change', loadAgendaMedica);
  $('#btnAddHorario').addEventListener('click', addHorario);
  $('#btnCancelarDia').addEventListener('click', cancelarDia);
}

async function loadAgendaMedica() {
  const cont = $('#agendaMedicaList');
  cont.innerHTML = '<div class="empty">Cargando…</div>';

  try {
    const params = new URLSearchParams();
    const fecha = $('#mFecha').value;
    const estado = $('#mEstado').value;
    if (fecha) params.set('fecha', fecha);
    if (estado) params.set('estado', estado);

    const { turnos, conteo } = await api('/api/agenda?' + params.toString());

    $('#agendaMedicaStats').innerHTML = statsHTML([
      { n: turnos.length, label: 'En la vista' },
      { n: conteo.confirmado || 0, label: 'Confirmados' },
      { n: conteo.reservado || 0, label: 'Reservados' },
      { n: conteo.cancelado || 0, label: 'Cancelados' }
    ]);

    if (!turnos.length) {
      cont.innerHTML = `<div class="empty"><span class="big">🩺</span>No hay turnos con esos filtros.</div>`;
      return;
    }

    cont.innerHTML = turnos.map((t) => turnoCard(t, accionesMedico(t))).join('');

    cont.querySelectorAll('button[data-acc="urgente"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const { turno } = await api(`/api/turnos/${btn.dataset.id}/urgente`, { method: 'POST' });
          toast(turno.prioridad === 'urgente' ? 'Turno marcado como URGENTE.' : 'Prioridad urgente quitada.');
          loadAgendaMedica();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });
  } catch (err) {
    cont.innerHTML = `<div class="empty">⚠️ ${esc(err.message)}</div>`;
  }
}

function accionesMedico(t) {
  if (['cancelado', 'ausente'].includes(t.estado)) return '';
  return `<button class="btn ${t.prioridad === 'urgente' ? 'btn-danger' : 'btn-ghost'} btn-sm"
            data-acc="urgente" data-id="${t.id}">
            ${t.prioridad === 'urgente' ? '⚡ Quitar urgencia' : '⚡ Marcar urgente'}
          </button>`;
}

async function cancelarDia() {
  const fecha = $('#mFecha').value || hoyISO();
  const f = fechaCorta(fecha);

  const ok = await openModal({
    title: 'Cancelar todo el día',
    danger: true,
    okText: 'Cancelar el día',
    body: `<p>Vas a bloquear todas las franjas de <b style="color:var(--text)">
      ${DIAS[new Date(fecha + 'T00:00:00').getDay()]} ${f.dia} ${f.mes}</b>.</p>
      <div class="summary">
        <span>· Se bloquea la reserva de nuevos turnos en esa fecha</span>
        <span>· Los turnos existentes se cancelan y se notifica a los pacientes</span>
      </div>
      <p style="font-size:.85rem">La recepción verá la lista de pacientes afectados para contactarlos.</p>`
  });
  if (!ok) return;

  try {
    const data = await api('/api/medico/cancelar-dia', { method: 'POST', body: { fecha } });
    toast(`Día cancelado. ${data.turnosCancelados} turno(s) afectado(s).`);
    loadAgendaMedica();
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function loadHorarios() {
  const cont = $('#horarioList');
  try {
    const { horarios, bloqueos } = await api('/api/medico/horarios');
    if (!horarios.length) {
      cont.innerHTML = '<div class="empty">Todavía no cargaste horarios de atención.</div>';
      return;
    }
    cont.innerHTML = horarios
      .map(
        (h) => `
        <div class="horario">
          <span><b>${DIAS[h.dia]}</b> · ${h.desde} a ${h.hasta} hs</span>
          <button class="btn btn-danger btn-sm" data-del="${h.id}">Eliminar</button>
        </div>`
      )
      .join('') +
      (bloqueos.length
        ? `<p class="mini-note" style="text-align:left;margin-top:.8rem">
             🚫 Días bloqueados: ${bloqueos.map((b) => b.fecha).join(', ')}
           </p>`
        : '');

    cont.querySelectorAll('button[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api('/api/medico/horarios/' + btn.dataset.del, { method: 'DELETE' });
          toast('Horario eliminado.');
          loadHorarios();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });
  } catch (err) {
    cont.innerHTML = `<div class="empty">⚠️ ${esc(err.message)}</div>`;
  }
}

async function addHorario(e) {
  e.preventDefault();
  const alertBox = $('#horarioAlert');
  alertBox.hidden = true;

  const dia = Number($('#hDia').value);
  const desde = $('#hDesde').value;
  const hasta = $('#hHasta').value;

  if (!desde || !hasta) {
    alertBox.textContent = 'Completá ambos horarios.';
    alertBox.hidden = false;
    return;
  }
  if (desde >= hasta) {
    alertBox.textContent = 'El horario de fin debe ser posterior al de inicio.';
    alertBox.hidden = false;
    return;
  }

  try {
    await api('/api/medico/horarios', { method: 'POST', body: { dia, desde, hasta } });
    toast(`Horario agregado: ${DIAS[dia]} de ${desde} a ${hasta}.`);
    loadHorarios();
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.hidden = false;
  }
}

/* =========================================================
   RECEPCIONISTA · Registrar pacientes y agenda
   ========================================================= */
function initRecepcionista() {
  $('#gFecha').addEventListener('change', loadAgendaGeneral);
  $('#gEstado').addEventListener('change', loadAgendaGeneral);
  $('#gMedico').addEventListener('change', loadAgendaGeneral);
  $('#btnAgendaGeneral').addEventListener('click', loadAgendaGeneral);
  $('#btnBuscarPacientes').addEventListener('click', loadPacientes);
  $('#pBuscar').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadPacientes(); });
  $('#pacienteForm').addEventListener('submit', registrarPaciente);
}

function pintarMedicosAgenda() {
  const selMed = $('#gMedico');
  if (selMed.options.length > 1) return;
  CATALOGO.medicos.forEach((m) => {
    selMed.insertAdjacentHTML('beforeend', `<option value="${m.id}">${esc(m.nombre)} · ${esc(m.especialidad)}</option>`);
  });
}

function validatePaciente() {
  const fields = {};
  const nombre = $('#pNombre').value.trim();
  const apellido = $('#pApellido').value.trim();
  const email = $('#pEmail').value.trim();
  const dni = $('#pDni').value.trim();
  const telefono = $('#pTelefono').value.trim();
  const canal = $('#pCanal').value;
  const pw = $('#pPassword').value;
  const pw2 = $('#pPassword2').value;

  if (nombre.length < 2) fields.pNombre = 'Ingresá el nombre.';
  if (apellido.length < 2) fields.pApellido = 'Ingresá el apellido.';
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) fields.pEmail = 'Correo electrónico inválido.';
  if (!/^\d{7,8}$/.test(dni)) fields.pDni = 'DNI: 7 u 8 dígitos, sin puntos.';
  if (!/^[\d\s()+-]{8,20}$/.test(telefono)) fields.pTelefono = 'Teléfono inválido (mínimo 8 dígitos).';
  if (!canal) fields.pCanal = 'Elegí un medio de notificación.';
  if (pw.length < 8) fields.pPassword = 'Mínimo 8 caracteres.';
  else if (!/[a-zA-Z]/.test(pw)) fields.pPassword = 'Debe incluir una letra.';
  else if (!/\d/.test(pw)) fields.pPassword = 'Debe incluir un número.';
  else if (pw !== pw2) fields.pPassword2 = 'Las contraseñas no coinciden.';

  return fields;
}

async function registrarPaciente(e) {
  e.preventDefault();
  const form = $('#pacienteForm');
  const fields = validatePaciente();
  if (Object.keys(fields).length) return showErrors(form, fields);

  const btn = $('#btnPaciente');
  btn.disabled = true;
  btn.textContent = 'Registrando…';

  try {
    const { paciente } = await api('/api/pacientes', {
      method: 'POST',
      body: {
        nombre: $('#pNombre').value.trim(),
        apellido: $('#pApellido').value.trim(),
        email: $('#pEmail').value.trim(),
        dni: $('#pDni').value.trim(),
        telefono: $('#pTelefono').value.trim(),
        canal: $('#pCanal').value,
        password: $('#pPassword').value,
        password2: $('#pPassword2').value
      }
    });
    toast(`Paciente ${paciente.nombre} ${paciente.apellido} registrado.`);
    form.reset();
    clearErrors(form);
    loadPacientes();
  } catch (err) {
    showErrors(form, err.fields || {}, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Registrar paciente';
  }
}

async function loadPacientes() {
  const body = $('#pacientesBody');
  try {
    const q = $('#pBuscar').value.trim();
    const { pacientes } = await api('/api/pacientes' + (q ? '?q=' + encodeURIComponent(q) : ''));
    $('#pacientesCount').textContent = `· ${pacientes.length} en total`;

    body.innerHTML = pacientes.length
      ? pacientes
          .map(
            (p) => `
          <tr>
            <td><strong>${esc(p.nombre)} ${esc(p.apellido)}</strong></td>
            <td>${esc(p.dni)}</td>
            <td>${esc(p.email)}<br><small>${esc(p.telefono || '—')}</small></td>
            <td>${CANALES[p.canal] || esc(p.canal)}</td>
          </tr>`
          )
          .join('')
      : '<tr><td colspan="4">No se encontraron pacientes.</td></tr>';
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function loadAgendaGeneral() {
  const body = $('#agendaGeneralBody');
  const empty = $('#agendaGeneralEmpty');
  body.innerHTML = '<tr><td colspan="7">Cargando…</td></tr>';
  empty.innerHTML = '';

  try {
    const params = new URLSearchParams();
    const fecha = $('#gFecha').value;
    const med = $('#gMedico').value;
    const estado = $('#gEstado').value;
    if (fecha) params.set('fecha', fecha);
    if (med) params.set('medicoId', med);
    if (estado) params.set('estado', estado);

    const { turnos, conteo, total } = await api('/api/agenda?' + params.toString());

    $('#agendaGeneralStats').innerHTML = statsHTML([
      { n: total, label: 'Turnos en la vista' },
      { n: conteo.reservado || 0, label: 'Reservados' },
      { n: conteo.confirmado || 0, label: 'Confirmados' },
      { n: conteo.cancelado || 0, label: 'Cancelados' },
      { n: conteo.ausente || 0, label: 'Ausentes' }
    ]);

    if (!turnos.length) {
      body.innerHTML = '';
      empty.innerHTML = `<div class="empty"><span class="big">🗂️</span>No hay turnos con esos filtros.</div>`;
      return;
    }

    body.innerHTML = turnos
      .map((t) => {
        const f = fechaCorta(t.fecha);
        const cancelable = !['cancelado', 'ausente', 'atendido'].includes(t.estado);
        return `
          <tr>
            <td>${f.dia} ${f.mes} <small>(${f.diaSem})</small></td>
            <td><strong>${t.hora}</strong></td>
            <td><strong>${esc(t.pacienteNombre)}</strong><br><small>${esc(t.pacienteTelefono || '')}</small></td>
            <td>${esc(t.medicoNombre)}</td>
            <td>${esc(t.especialidad || '')}</td>
            <td><span class="estado estado-${t.estado}">${t.estado}</span></td>
            <td>
              ${t.prioridad === 'urgente' ? '<span class="estado prio-urgente">urgente</span>' : '<small>normal</small>'}
              ${cancelable ? `<br><button class="btn btn-danger btn-sm" data-cancel="${t.id}" style="margin-top:.35rem">Cancelar</button>` : ''}
            </td>
          </tr>`;
      })
      .join('');

    body.querySelectorAll('button[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await openModal({
          title: 'Cancelar turno',
          danger: true,
          okText: 'Sí, cancelar',
          body: `<p>Se cancelará el turno y quedará registrada la acción. El paciente afectado pasa a la lista de seguimiento.</p>`
        });
        if (!ok) return;
        try {
          await api(`/api/turnos/${btn.dataset.cancel}/cancelar`, {
            method: 'POST',
            body: { motivo: 'Cancelado por recepción' }
          });
          toast('Turno cancelado.');
          loadAgendaGeneral();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7">⚠️ ${esc(err.message)}</td></tr>`;
  }
}

/* =========================================================
   PERFIL
   ========================================================= */
function renderPerfil() {
  if (!ME) return;
  const items = [
    ['Nombre', `${ME.nombre} ${ME.apellido}`],
    ['Correo electrónico', ME.email],
    ['DNI', ME.dni],
    ['Teléfono', ME.telefono || '—'],
    ['Notificaciones por', CANALES[ME.canal] || ME.canal],
    ['Perfil', ME.role]
  ];
  if (ME.role === 'medico') {
    items.push(['Especialidad', ME.especialidad], ['Matrícula', ME.matricula]);
  }
  $('#perfilKv').innerHTML = items
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`)
    .join('');
}
