/* =========================================================
   js/auth.js — Login + Registro con validaciones
   ========================================================= */
'use strict';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

/* ---------- API helper ---------- */
async function api(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const err = new Error(data.error || 'Ocurrió un error inesperado.');
    err.fields = data.fields || null;
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- Toasts ---------- */
function toast(msg, type = 'ok') {
  const zone = $('#toastZone');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'ok' ? '✅' : '⚠️'}</span><span>${msg}</span>`;
  zone.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 3400);
  setTimeout(() => el.remove(), 3900);
}

/* ---------- Mostrar/ocultar errores ---------- */
function clearErrors(form) {
  $$('.field', form).forEach((f) => f.classList.remove('invalid'));
  $$('.field-error', form).forEach((s) => { s.textContent = ''; });
  const alertBox = $('#formAlert');
  alertBox.hidden = true;
  alertBox.textContent = '';
}

/* Busca el campo del formulario a partir de la clave que devuelve el servidor
   (p.ej. "dni" → #regDni / #pDni / #loginEmail → "email"). */
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
    const field = input.closest('.field');
    if (field) field.classList.add('invalid');
    const err = form.querySelector(`.field-error[data-for="${input.id}"]`);
    if (err) err.textContent = msg;
  });
  if (general) {
    const alertBox = $('#formAlert');
    alertBox.textContent = general;
    alertBox.hidden = false;
  }
  const firstInvalid = form.querySelector('.field.invalid input, .field.invalid select');
  if (firstInvalid) firstInvalid.focus();
}

/* ---------- Validaciones del lado del cliente ---------- */
function validateLogin(form) {
  const fields = {};
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  if (!EMAIL_RE.test(email)) fields.loginEmail = 'Ingresá un correo electrónico válido.';
  if (!password) fields.loginPassword = 'Ingresá tu contraseña.';
  return fields;
}

function passwordChecks(password, confirmacion) {
  return {
    len: password.length >= 8,
    letter: /[a-zA-ZáéíóúñÑ]/.test(password),
    number: /\d/.test(password),
    match: password.length > 0 && password === confirmacion
  };
}

function validateRegistro(form) {
  const fields = {};
  const nombre = $('#regNombre').value.trim();
  const apellido = $('#regApellido').value.trim();
  const email = $('#regEmail').value.trim();
  const dni = $('#regDni').value.trim();
  const telefono = $('#regTelefono').value.trim();
  const canal = $('#regCanal').value;
  const password = $('#regPassword').value;
  const password2 = $('#regPassword2').value;

  if (nombre.length < 2) fields.regNombre = 'Ingresá tu nombre (mínimo 2 caracteres).';
  if (apellido.length < 2) fields.regApellido = 'Ingresá tu apellido (mínimo 2 caracteres).';
  if (!EMAIL_RE.test(email)) fields.regEmail = 'Ingresá un correo electrónico válido.';
  if (!/^\d{7,8}$/.test(dni)) fields.regDni = 'El DNI debe tener 7 u 8 dígitos, sin puntos.';
  if (!telefono) fields.regTelefono = 'Ingresá un teléfono de contacto.';
  else if (!/^[\d\s()+-]{8,20}$/.test(telefono)) fields.regTelefono = 'Teléfono inválido (mínimo 8 dígitos).';
  if (!canal) fields.regCanal = 'Elegí cómo querés que te notifiquemos.';

  const checks = passwordChecks(password, password2);
  if (!checks.len) fields.regPassword = 'Usá al menos 8 caracteres.';
  else if (!checks.letter) fields.regPassword = 'Agregá al menos una letra.';
  else if (!checks.number) fields.regPassword = 'Agregá al menos un número.';
  else if (!checks.match) fields.regPassword2 = 'Las contraseñas no coinciden.';

  return fields;
}

/* ---------- Pestañas ---------- */
const tabLogin = $('#tabLogin');
const tabRegistro = $('#tabRegistro');
const loginForm = $('#loginForm');
const registroForm = $('#registroForm');

function showTab(which) {
  const isLogin = which === 'login';
  tabLogin.classList.toggle('active', isLogin);
  tabRegistro.classList.toggle('active', !isLogin);
  tabLogin.setAttribute('aria-selected', String(isLogin));
  tabRegistro.setAttribute('aria-selected', String(!isLogin));
  loginForm.hidden = !isLogin;
  registroForm.hidden = isLogin;
  clearErrors(loginForm);
  clearErrors(registroForm);
}

tabLogin.addEventListener('click', () => showTab('login'));
tabRegistro.addEventListener('click', () => showTab('registro'));

/* ---------- Mostrar / ocultar contraseña ---------- */
$$('.pw-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const ver = input.type === 'password';
    input.type = ver ? 'text' : 'password';
    btn.textContent = ver ? '🙈' : '👁';
  });
});

/* ---------- Fuerza de la contraseña ---------- */
const pwInput = $('#regPassword');
const pwStrength = $('#pwStrength');
const pwBarFill = $('#pwBarFill');
const pwStrengthText = $('#pwStrengthText');

function updateStrength() {
  const pw = pwInput.value;
  const confirmacion = $('#regPassword2').value;
  const checks = passwordChecks(pw, confirmacion);

  $$('#pwRules li').forEach((li) => {
    li.classList.toggle('ok', !!checks[li.dataset.rule]);
  });

  if (!pw) { pwStrength.hidden = true; return; }
  pwStrength.hidden = false;

  const score = [checks.len, checks.letter, checks.number, checks.match].filter(Boolean).length;
  const levels = [
    { pct: 25, color: '#f87171', label: 'Muy débil' },
    { pct: 50, color: '#fbbf24', label: 'Débil' },
    { pct: 75, color: '#60a5fa', label: 'Aceptable' },
    { pct: 100, color: '#34d399', label: 'Fuerte' }
  ];
  const level = levels[Math.max(0, score - 1)];
  pwBarFill.style.width = level.pct + '%';
  pwBarFill.style.background = level.color;
  pwStrengthText.textContent = level.label;
}

['#regPassword', '#regPassword2'].forEach((sel) => {
  $(sel).addEventListener('input', updateStrength);
});

/* ---------- Validación en tiempo real (al salir del campo) ---------- */
$$('#loginForm input').forEach((i) => i.addEventListener('blur', () => showErrorsIfAny(loginForm, validateLogin)));
$$('#registroForm input, #registroForm select').forEach((i) =>
  i.addEventListener('blur', () => showErrorsIfAny(registroForm, validateRegistro))
);

function showErrorsIfAny(form, validator) {
  if (form.hidden) return;
  const fields = validator(form);
  if (Object.keys(fields).length) showErrors(form, fields);
  else clearErrors(form);
}

/* ---------- Enviar LOGIN ---------- */
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fields = validateLogin(loginForm);
  if (Object.keys(fields).length) return showErrors(loginForm, fields);

  const btn = $('#loginBtn');
  btn.disabled = true;
  btn.textContent = 'Ingresando…';
  clearErrors(loginForm);

  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: { email: $('#loginEmail').value.trim(), password: $('#loginPassword').value }
    });
    toast(`¡Hola, ${data.user.nombre}! Redirigiendo…`);
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
  } catch (err) {
    const fields = err.fields || {};
    if (!Object.keys(fields).length && err.status === 400) {
      // errores de formato
      if (!EMAIL_RE.test($('#loginEmail').value.trim())) fields.loginEmail = 'Correo electrónico inválido.';
      if (!$('#loginPassword').value) fields.loginPassword = 'Ingresá tu contraseña.';
    }
    showErrors(loginForm, fields, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar →';
  }
});

/* ---------- Enviar REGISTRO ---------- */
registroForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fields = validateRegistro(registroForm);
  if (Object.keys(fields).length) return showErrors(registroForm, fields);

  const btn = $('#regBtn');
  btn.disabled = true;
  btn.textContent = 'Creando cuenta…';
  clearErrors(registroForm);

  try {
    await api('/api/auth/registro', {
      method: 'POST',
      body: {
        nombre: $('#regNombre').value.trim(),
        apellido: $('#regApellido').value.trim(),
        email: $('#regEmail').value.trim(),
        dni: $('#regDni').value.trim(),
        telefono: $('#regTelefono').value.trim(),
        canal: $('#regCanal').value,
        password: $('#regPassword').value,
        password2: $('#regPassword2').value
      }
    });
    toast('Cuenta creada correctamente. ¡Bienvenido!');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);
  } catch (err) {
    showErrors(registroForm, err.fields || {}, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear cuenta →';
  }
});

/* ---------- Auto-completar demo ---------- */
$('#autofillBtn').addEventListener('click', () => {
  $('#loginEmail').value = 'laura@mail.com';
  $('#loginPassword').value = 'demo1234';
  showErrors(loginForm, {});
  toast('Datos de prueba completados. Presioná "Ingresar".');
});

/* ---------- Si ya hay sesión, ir al dashboard ---------- */
(async () => {
  try {
    const data = await api('/api/auth/me');
    if (data.user) window.location.replace('dashboard.html');
  } catch {
    /* sin conexión: quedarse en el login */
  }
})();

// --- Link al sitio según el entorno ---
// Local: npm run dev → http://localhost:8090 · Vercel: raíz del dominio
(function () {
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const url = local ? 'http://localhost:8090' : '/';
  document.querySelectorAll('[data-site-link]').forEach((a) => { a.href = url; });
})();
