/* ============================================================================
   meta-proxy.js — Proxy protégé vers la Meta Model API (fonction Netlify)
   ----------------------------------------------------------------------------
   Pourquoi un proxy ? La clé API ne doit JAMAIS être visible dans le
   JavaScript du navigateur. Cette fonction tourne côté serveur Netlify :
   elle reçoit { path, body } depuis l'app, ajoute la clé depuis la variable
   d'environnement META_MODEL_API_KEY, et relaie vers https://api.meta.ai.

   Protections (durcies le 20 oct 2026, avant le mode live du hackathon) :
   1. ORIGINE — seuls les appels venant de l'app (astro-code-ar.netlify.app
      et localhost en dev) passent. Un script externe (curl, autre site)
      est rejeté en 403.
   2. LIMITE DE DÉBIT — 30 appels / heure par adresse IP (429 au-delà).
      En mémoire par instance Netlify : simple mais suffisant pour la démo.
   3. PLAFOND QUOTIDIEN — compteur de coût estimé ; au-delà de
      MAX_DAILY_SPEND_USD (défaut 5 $), le proxy refuse en 503.
      En mémoire par instance : un garde-fou, pas un audit comptable.
   4. SABLAGE DES REQUÊTES — corps max 50 Ko ; max_tokens clampé à 500 ;
      seuls les chemins ALLOWED_PATHS passent.

   Configuration Netlify (une seule fois) :
     Site settings → Environment variables → ajouter
META_MODEL_API_KEY=<redacted>
       (optionnel) ALLOWED_ORIGINS=https://astro-code-ar.netlify.app
       (optionnel) MAX_DAILY_SPEND_USD=5

   L'app appelle : POST /.netlify/functions/meta-proxy
   avec { "path": "/v1/chat/completions", "body": { ... } }
   ========================================================================== */

const ALLOWED_PATHS = [
  '/v1/chat/completions',
  '/v1/images/generations',
  '/v1/images/edits',
  '/v1/models',
  '/v1/responses', // v1.9.26 — SAM 3.1 (segmentation par prompt texte)
  '/v1/asr/transcribe', // v1.9.59 — Voice Transcribe (essayage vocal)
];

// Estimations de coût par appel (ordre de grandeur, suffisantes pour le plafond).
const COST_ESTIMATE = {
  '/v1/chat/completions': 0.02,
  '/v1/images/generations': 0.01, // Muse Image
  '/v1/images/edits': 0.01,
  '/v1/models': 0.0,
  '/v1/responses': 0.0025, // SAM 3.1 : 2,50 $ / 1000 images
  '/v1/asr/transcribe': 0.001, // Voice Transcribe : 0,18 $ / heure d'audio
};

const MAX_BODY_BYTES = 50 * 1024; // 50 Ko (chat, générations)
// v1.9.15 — MEMORY : l'édition d'image envoie la photo capturée en
// base64 (JSON `images[].image_url`), ~0,5-1 Mo. Plafond relevé pour
// ce seul chemin ; les autres gardent 50 Ko.
const MAX_BODY_BYTES_EDITS = 8 * 1024 * 1024; // 8 Mo
// v1.9.26 — SAM : la frame caméra (512 px, JPEG base64) voyage dans le
// corps JSON de /v1/responses (~100 Ko). Plafond dédié de 2 Mo.
const MAX_BODY_BYTES_RESPONSES = 2 * 1024 * 1024; // 2 Mo
// v1.9.59 — Transcription : 5 s de WAV 16 kHz mono en base64 (~220 Ko).
const MAX_BODY_BYTES_ASR = 1024 * 1024; // 1 Mo
const MAX_TOKENS_CLAMP = 500; // aucun appel ne demande plus de 500 tokens
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 heure
const RATE_LIMIT_MAX = 90; // v1.9.59 — relevé de 30 : une session d'essayage ≈ 15 appels (12 SAM + voix + génération)

// Compteurs en mémoire (par instance de fonction — voir commentaire d'en-tête).
const ipHits = new Map(); // ip -> { count, windowStart }
let dailySpend = 0;
let dailyWindowStart = Date.now();

function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  // Origines de production. Le vrai site est astro-code-5.netlify.app
  // (confirmé le 26 oct 2026 — capture Netlify d'Hamza, publié le 21 oct).
  // astro-code-ar / astro-code-scan sont d'anciens déploiements, gardés
  // au cas où. La variable d'environnement ALLOWED_ORIGINS peut verrouiller.
  for (const o of ['https://astro-code-5.netlify.app', 'https://astro-code-ar.netlify.app', 'https://astro-code-scan.netlify.app']) {
    if (!list.includes(o)) list.push(o);
  }
  // Dev local toujours autorisé.
  if (!list.includes('http://localhost:8888')) list.push('http://localhost:8888');
  return list;
}

function originAllowed(event) {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';
  const referer = headers.referer || headers.Referer || '';
  const allowed = getAllowedOrigins();
  return allowed.some((o) => origin === o || origin.startsWith(o + '/') ||
                             referer === o || referer.startsWith(o + '/'));
}

function clientIp(event) {
  const headers = event.headers || {};
  return (
    headers['x-nf-client-connection-ip'] ||
    (headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    event.requestContext?.identity?.sourceIp ||
    'unknown'
  );
}

function rateLimited(ip) {
  const now = Date.now();
  const rec = ipHits.get(ip);
  if (!rec || now - rec.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT_MAX;
}

function budgetExceeded(cost) {
  const now = Date.now();
  if (now - dailyWindowStart > 24 * 60 * 60 * 1000) {
    dailySpend = 0;
    dailyWindowStart = now;
  }
  const cap = parseFloat(process.env.MAX_DAILY_SPEND_USD || '5', 10) || 5;
  if (dailySpend + cost > cap) return true;
  dailySpend += cost;
  return false;
}

function corsHeaders(origin) {
  return origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      }
    : {};
}

exports.handler = async (event) => {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Méthode non autorisée.' };
  }

  // 1. Origine : seul le site Astro Code (et localhost en dev) appelle.
  if (!originAllowed(event)) {
    return { statusCode: 403, body: 'Origine non autorisée.' };
  }

  // 2. Limite de débit par IP.
  const ip = clientIp(event);
  if (rateLimited(ip)) {
    return {
      statusCode: 429,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: 'Trop de requêtes — réessaie dans une heure.' }),
    };
  }

  const apiKey = process.env.META_MODEL_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders(origin),
      body: JSON.stringify({
        error: 'META_MODEL_API_KEY non configurée sur Netlify (Site settings → Environment variables).',
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: 'Corps JSON invalide.' };
  }

  const { path } = payload;

  // Sablage des tailles, par chemin (voir MAX_BODY_BYTES_EDITS plus haut).
  const bodyCap = path === '/v1/images/edits' ? MAX_BODY_BYTES_EDITS
    : path === '/v1/responses' ? MAX_BODY_BYTES_RESPONSES
    : path === '/v1/asr/transcribe' ? MAX_BODY_BYTES_ASR
    : MAX_BODY_BYTES;
  if ((event.body || '').length > bodyCap) {
    return { statusCode: 413, body: 'Corps de requête trop volumineux.' };
  }
  let body = payload.body || {};
  if (!ALLOWED_PATHS.includes(path)) {
    return { statusCode: 403, body: 'Chemin API non autorisé.' };
  }

  // 3. Sablage : clamp max_tokens pour borner le coût d'un appel chat.
  if (path === '/v1/chat/completions' && typeof body === 'object' && body !== null) {
    // v1.9.26 — Muse Wonder RAISONNE avant de répondre et ses jetons de
    // raisonnement comptent dans max_tokens : le plafond historique de
    // 500 le ferait répondre VIDE (vérifié en réel le 27/10). Plafond
    // relevé pour Wonder seul (3000 jetons ~ 0,06 $ max par appel,
    // toujours sous le plafond quotidien et la limite de débit).
    const clamp = (typeof body.model === 'string' && body.model.indexOf('muse-wonder') === 0)
      ? 3000 : MAX_TOKENS_CLAMP;
    if (typeof body.max_tokens !== 'number' || body.max_tokens > clamp) {
      body = { ...body, max_tokens: clamp };
    }
  }

  // 4. Plafond quotidien (garde-fou par instance).
  const cost = COST_ESTIMATE[path] || 0.02;
  if (budgetExceeded(cost)) {
    return {
      statusCode: 503,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: 'Plafond quotidien du proxy atteint — réessaie demain.' }),
    };
  }

  try {
    // v1.9.59 — Transcription : l'API attend un corps MULTIPART (une part
    // « request » JSON + une part « audio »), pas du JSON. L'app envoie
    // l'audio en base64 dans le corps JSON habituel ; on reconstruit le
    // multipart ici. (Structure confirmée par les erreurs du service le
    // 30/10 ; le champ audioEncoding vaut « WAV » — l'app envoie du WAV.)
    if (path === '/v1/asr/transcribe') {
      const form = new FormData();
      form.append('request', new Blob([JSON.stringify({
        mode: 'PUSH_TO_TALK',
        model: 'muse-voice-transcribe-1.0',
        audioEncoding: 'WAV',
      })], { type: 'application/json' }));
      const audioBuf = Buffer.from(String(body.audio_b64 || ''), 'base64');
      form.append('audio', new Blob([audioBuf], { type: 'audio/wav' }), body.filename || 'voice.wav');
      const resp = await fetch('https://api.meta.ai' + path, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey },
        body: form,
      });
      const text = await resp.text();
      return {
        statusCode: resp.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        body: text,
      };
    }
    const resp = await fetch('https://api.meta.ai' + path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    return {
      statusCode: resp.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      body: text,
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: 'Échec de la liaison avec api.meta.ai.' }),
    };
  }
};
