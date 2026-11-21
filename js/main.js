/* App Clínica de Barrio — interacciones del sitio */

// --- Menú móvil ---
const toggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

if (toggle && navLinks) {
  toggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '✕' : '☰';
  });
  navLinks.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      navLinks.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '☰';
    }
  });
}

// --- Enlace activo según la página actual ---
const currentPage = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-links a').forEach((a) => {
  if (a.getAttribute('href') === currentPage) a.classList.add('active');
});

// --- Reveal on scroll ---
const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('visible'));
}

// --- Zoom de diagramas (modal) ---
const modal = document.getElementById('zoomModal');
const modalImg = document.getElementById('zoomImg');

function openZoom(src) {
  if (!modal || !modalImg) return;
  modalImg.src = src;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeZoom() {
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

document.querySelectorAll('[data-zoom]').forEach((el) => {
  el.addEventListener('click', () => openZoom(el.getAttribute('data-zoom')));
});
if (modal) {
  modal.addEventListener('click', closeZoom);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeZoom();
  });
}

// --- Año del pie de página ---
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());
