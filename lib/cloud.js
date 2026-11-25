/* =========================================================
   lib/cloud.js — Cliente mínimo de Upstash Redis por HTTP.
   Se activa solo si existen las variables de entorno
   UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN (Vercel).
   Sin esas variables el proyecto sigue funcionando en local
   con el archivo data/db.json (modo archivo).
   ========================================================= */
'use strict';

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const enabled = Boolean(REST_URL && REST_TOKEN);

/* Ejecuta un comando Redis vía la REST API de Upstash.
   Ej: command(['SET', 'clave', 'valor', 'EX', 60]) */
async function command(args) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${REST_TOKEN}`
    },
    body: JSON.stringify(args)
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }

  if (!res.ok || data.error) {
    throw new Error(data.error || `Upstash respondió HTTP ${res.status}`);
  }
  return data.result;
}

const get = (key) => command(['GET', key]);

const set = (key, value, ttlSeconds) =>
  ttlSeconds
    ? command(['SET', key, value, 'EX', ttlSeconds])
    : command(['SET', key, value]);

const del = (key) => command(['DEL', key]);

module.exports = { enabled, get, set, del };
