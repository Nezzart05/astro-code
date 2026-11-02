/* ============================================================================
   META-AI.JS — Adaptateur unique "Meta AI" pour Astro Code
   ----------------------------------------------------------------------------
   MODE ACTUEL : 'mock' (simulation locale, aucune clé requise).
   Pour passer en live demain matin : META_AI.mode = 'live'
   puis renseigner META_AI.config.apiKey (voir README.md).

   Les 5 fonctions exposées :
     1. generateSignCharacter(sign)      -> { imageUrl, alt }
     2. generateHoroscope(sign, profile) -> { text, tone }
     3. narrate(text)                    -> Promise (joue l'audio)
     4. generateIcebreaker(signA, signB) -> { text }
     5. moderateBio(text)                -> { ok, reason }

   Chaque fonction contient un bloc "META API : brancher ici" qui décrit
   EXACTEMENT l'appel à faire demain sur la vraie Meta Model API.
   ============================================================================ */

const SIGNS = [
  { id: 'belier', name: 'Aries', glyph: '♈', dates: 'Mar 21 – Apr 19', element: 'feu', factory: "CHARGE FIRST. THINK LATER." },
  { id: 'taureau', name: 'Taurus', glyph: '♉', dates: 'Apr 20 – May 20', element: 'terre', factory: "SOLID. UNSHAKEABLE." },
  { id: 'gemeaux', name: 'Gemini', glyph: '♊', dates: 'May 21 – Jun 20', element: 'air', factory: "TWO FACES. A THOUSAND IDEAS." },
  { id: 'cancer', name: 'Cancer', glyph: '♋', dates: 'Jun 21 – Jul 22', element: 'eau', factory: "SOFT OUTSIDE. ARMOR INSIDE." },
  { id: 'lion', name: 'Leo', glyph: '♌', dates: 'Jul 23 – Aug 22', element: 'feu', factory: "BORN TO BE SEEN." },
  { id: 'vierge', name: 'Virgo', glyph: '♍', dates: 'Aug 23 – Sep 22', element: 'terre', factory: "DETAIL IS A WEAPON." },
  { id: 'balance', name: 'Libra', glyph: '♎', dates: 'Sep 23 – Oct 22', element: 'air', factory: "BALANCE IS A SPORT." },
  { id: 'scorpion', name: 'Scorpio', glyph: '♏', dates: 'Oct 23 – Nov 21', element: 'eau', factory: "STRIKE ONCE. AIM TRUE." },
  { id: 'sagittaire', name: 'Sagittarius', glyph: '♐', dates: 'Nov 22 – Dec 21', element: 'feu', factory: "THE HORIZON OR NOTHING." },
  { id: 'capricorne', name: 'Capricorn', glyph: '♑', dates: 'Dec 22 – Jan 19', element: 'terre', factory: "SLOW. SURE. UNSTOPPABLE." },
  { id: 'verseau', name: 'Aquarius', glyph: '♒', dates: 'Jan 20 – Feb 18', element: 'air', factory: "THE FUTURE WON'T WAIT FOR ME." },
  { id: 'poissons', name: 'Pisces', glyph: '♓', dates: 'Feb 19 – Mar 20', element: 'eau', factory: "YOU DON'T RUN FROM WHAT YOU FEEL — YOU FACE IT." },
];

const ELEMENTS = {
  feu:   { label: 'Fire',   tone: 'direct, intense, almost a challenge thrown', color: '#ff4a2d', color2: '#ffb03a' },
  terre: { label: 'Earth', tone: 'grounded, steady, nothing to prove',    color: '#8a6b3f', color2: '#d9b36a' },
  air:   { label: 'Air',   tone: 'light, quick, turned toward others',     color: '#7fd4ff', color2: '#e8f7ff' },
  eau:   { label: 'Water',   tone: 'introspective, speaks to feelings',         color: '#2d7fff', color2: '#7fe7ff' },
};

const META_AI = {
  mode: 'live', // 'live' depuis le 27 oct (crédits actifs, proxy éprouvé) — chaque fonction a un repli local si l'API échoue

  config: {
    // IMPORTANT : la clé API ne doit JAMAIS être dans ce fichier (visible par
    // tous dans le navigateur). En mode live, les appels passent par le proxy
    // Netlify `netlify/functions/meta-proxy.js`, qui lit la clé depuis la
    // variable d'environnement META_MODEL_API_KEY côté serveur.
    apiProxy: '/.netlify/functions/meta-proxy',
    baseUrl: 'https://api.meta.ai/v1', // référence (les appels passent par le proxy)
    textModel: 'muse-spark-1.3',       // vérifié le 15/10 via GET /v1/models
    brainModel: 'muse-wonder-1.0',      // v1.9.25 — le modèle FRONTIER de Meta (raisonnement, mémoire active) : moments profonds (horoscope). Testé en réel le 27/10 : qualité excellente, ~8 s, exige max_tokens >= 2000 (les jetons de raisonnement comptent).
    fastModel: 'muse-spark-1.3',        // moments rapides (icebreaker, modération) : ~1-2 s
    imageModel: 'muse-image-1.0',       // vérifié le 15/10 via GET /v1/models
    // NOTE : Meta ne propose pas de TTS dans la Model API (que du
    // speech-to-text). narrate() reste donc sur la synthèse vocale du
    // navigateur (gratuite) — voir §3.
  },

  // Appel générique via le proxy (clé injectée côté serveur).
  async callApi(path, body, timeoutMs) {
    const ctrl = timeoutMs ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetch(this.config.apiProxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, body }),
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`API Meta (${res.status}) : ${txt.slice(0, 200)}`);
      }
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  /* ------------------------------------------------------------------ */
  /* chatText — le routeur de cerveaux (v1.9.25)                          */
  /* deep=true  -> Muse Wonder (frontier, ~8 s, max_tokens genereux)    */
  /* deep=false -> Muse Spark (rapide, ~1-2 s)                           */
  /* En cas d'echec du modele vise, repli automatique sur Spark, puis     */
  /* l'appelant retombe sur ses gabarits locaux : RIEN ne casse jamais.   */
  /* ------------------------------------------------------------------ */
  async chatText({ messages, maxTokens = 300, deep = false, temperature = 0.9 }) {
    const attempts = deep
      ? [{ model: this.config.brainModel, max: Math.max(maxTokens, 2000), timeout: 35000 },
         { model: this.config.fastModel, max: maxTokens, timeout: 15000 }]
      : [{ model: this.config.fastModel, max: maxTokens, timeout: 15000 }];
    let lastErr = null;
    for (const a of attempts) {
      try {
        const data = await this.callApi('/v1/chat/completions', {
          model: a.model,
          messages,
          temperature,
          max_tokens: a.max,
        }, a.timeout);
        const text = data.choices && data.choices[0] && data.choices[0].message.content;
        if (text && text.trim()) return text.trim();
        lastErr = new Error('Empty response from ' + a.model);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Chat failed');
  },

  /* ------------------------------------------------------------------ */
  /* 1. generateSignCharacter(sign) — visuel AR du personnage du signe   */
  /* ------------------------------------------------------------------ */
  async generateSignCharacter(sign) {
    if (this.mode === 'live') {
      const el = ELEMENTS[sign.element];
      const data = await this.callApi('/v1/images/generations', {
        model: this.config.imageModel,
        prompt:
          `Streetwear AR creature embodying the zodiac sign ${sign.name} ` +
          `(${el.label}), ${el.tone}. Glowing, centered, transparent ` +
          `background, bold graphic style, cosmic red and black palette`,
        size: '1024x1024',
        n: 1,
      });
      const item = data.data && data.data[0];
      const imageUrl = item && (item.url || (item.b64_json && 'data:image/png;base64,' + item.b64_json));
      if (!imageUrl) throw new Error('Unexpected image response from the Meta API.');
      return { imageUrl, alt: `Character ${sign.name}` };
    }
    // MOCK : médaillon SVG déterministe par signe (couleurs de l'élément)
    const el = ELEMENTS[sign.element];
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">` +
      `<defs><radialGradient id="g" cx="50%" cy="42%" r="65%">` +
      `<stop offset="0%" stop-color="${el.color2}"/><stop offset="55%" stop-color="${el.color}"/>` +
      `<stop offset="100%" stop-color="#0a0a12"/></radialGradient></defs>` +
      `<circle cx="100" cy="100" r="94" fill="url(#g)" stroke="#ff2a2a" stroke-width="3"/>` +
      `<circle cx="100" cy="100" r="78" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.35"/>` +
      `<text x="100" y="128" text-anchor="middle" font-size="84" fill="#fff">${sign.glyph}</text>` +
      `<text x="100" y="168" text-anchor="middle" font-size="13" fill="#fff" ` +
      `font-family="Arial Narrow, sans-serif" letter-spacing="3">${sign.name.toUpperCase()}</text>` +
      `</svg>`;
    await new Promise(r => setTimeout(r, 600)); // latence simulée
    return {
      imageUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
      alt: `Character ${sign.name}`,
    };
  },

  /* ------------------------------------------------------------------ */
  /* 2. generateHoroscope(sign, profile) — horoscope personnalisé        */
  /* ------------------------------------------------------------------ */
  async generateHoroscope(sign, profile = {}) {
    if (this.mode === 'live') {
      try {
        const text = await this.chatText({
          deep: true, // Muse Wonder : l'horoscope est LE moment premium
          maxTokens: 220,
          temperature: 0.9,
          messages: [
            {
              role: 'system',
              content:
                "You are the Astro Code streetwear oracle. Tone: " +
                ELEMENTS[sign.element].tone + '. Max 3 sentences, in English, ' +
                'direct, no bland generalities.',
            },
            {
              role: 'user',
              content:
                `Sign: ${sign.name} (${sign.dates}). ` +
                `Profil: ${JSON.stringify(profile)}. ` +
                `Write today's horoscope.`,
            },
          ],
        });
        return { text, tone: ELEMENTS[sign.element].tone };
      } catch (e) { /* repli gabarits ci-dessous */ }
    }
    // MOCK : gabarits par élément, ton streetwear, en français
    const T = {
      feu: [
        `${sign.name}, no negotiating today: you charge ahead, the rest follows. Someone will test your patience — answer with an action, not words.`,
        `High energy for ${sign.name}. That plan you've been pushing back since Monday? It happens today. Not tomorrow.`,
      ],
      terre: [
        `${sign.name}, stay grounded: while everyone else scrambles, your steadiness pays off. One detail only you noticed is about to change everything.`,
        `A building day for ${sign.name}. Lay one stone, just one, but cut it well. The rest will follow.`,
      ],
      air: [
        `${sign.name}, your network is your power today: one message, one encounter, and a door opens. Stay light, stay quick.`,
        `${sign.name} picks up everything today. Listen for the weak signals — the good idea arrives disguised as small talk.`,
      ],
      eau: [
        `${sign.name}, trust what you feel before what you see. An emotion you're hiding deserves to be said — to the right person.`,
        `A deep day for ${sign.name}. What you feel is data, not noise. Act on it.`,
      ],
    };
    const pool = T[sign.element];
    await new Promise(r => setTimeout(r, 700));
    return {
      text: pool[Math.floor(Math.random() * pool.length)],
      tone: ELEMENTS[sign.element].tone,
    };
  },

  /* ------------------------------------------------------------------ */
  /* 3. narrate(text, signId) — la VOIX DU SIGNE (humaine, v1.9.14)      */
  /* ------------------------------------------------------------------
     Demande d'Hamza (27 oct) : la voix robotique du navigateur est
     « vraiment horrible ». On la supprime DÉFINITIVEMENT : chaque signe
     a maintenant un fichier voix humaine (généré une fois, voix douce)
     qui accueille le porteur dans SA constellation — traits de
     caractère, mot du jour, ton journal intime. Le paramètre text est
     conservé pour compatibilité des appels mais n'est plus lu par une
     synthèse : si le signe n'a pas de fichier, on se tait (le texte
     reste affiché à l'écran).                                        */
  async narrate(text, signId) {
    const SIGN_VOICE_FILES = {
      belier: 'assets/audio/voice-aries-en.mp3',
      taureau: 'assets/audio/voice-taurus-en.mp3',
      gemeaux: 'assets/audio/voice-gemini-en.mp3',
      cancer: 'assets/audio/voice-cancer-en.mp3',
      lion: 'assets/audio/voice-leo-en.mp3',
      vierge: 'assets/audio/voice-virgo-en.mp3',
      balance: 'assets/audio/voice-libra-en.mp3',
      scorpion: 'assets/audio/voice-scorpio-en.mp3',
      sagittaire: 'assets/audio/voice-sagittarius-en.mp3',
      capricorne: 'assets/audio/voice-capricorn-en.mp3',
      verseau: 'assets/audio/voice-aquarius-en.mp3',
      poissons: 'assets/audio/voice-pisces-en.mp3',
    };
    const src = signId && SIGN_VOICE_FILES[signId];
    if (!src) return false;
    try {
      if (this._voiceEl) { this._voiceEl.pause(); this._voiceEl = null; }
      const a = new Audio(src);
      this._voiceEl = a;
      a.volume = 0.95;
      await a.play();
      return new Promise((resolve) => {
        a.onended = () => resolve(true);
        a.onerror = () => resolve(false);
        setTimeout(() => resolve(true), 90000); // garde-fou
      });
    } catch (e) { return false; }
  },

  /* ------------------------------------------------------------------ */
  /* 4. generateIcebreaker(signA, signB) — phrase de rencontre           */
  /* ------------------------------------------------------------------ */
  async generateIcebreaker(signA, signB) {
    if (this.mode === 'live') {
      try {
        // Spark (rapide) : deux personnes se font face, pas le temps d'attendre Wonder.
        const text = await this.chatText({
          deep: false,
          maxTokens: 120,
          temperature: 1.0,
          messages: [
            {
              role: 'system',
              content:
                'You host encounters between Astro Code collectors. ' +
                'One single fun icebreaker line, in English, that makes ' +
                'both people want to talk. No heavy clichés.',
            },
            {
              role: 'user',
              content:
                `${signA.name} (${ELEMENTS[signA.element].tone}) croise ` +
                `${signB.name} (${ELEMENTS[signB.element].tone}). Suggest the icebreaker.`,
            },
          ],
        });
        return { text };
      } catch (e) { /* repli gabarits ci-dessous */ }
    }
    // MOCK : gabarits croisant les deux signes
    const pool = [
      `A ${signA.name} and a ${signB.name} in the same room: one charges, the other feels — who scans whom first?`,
      `${signA.name} × ${signB.name}: two signs, two worlds. Trade your traits — you'll leave with a story to tell.`,
      `The constellation grows: ${signA.name} meets ${signB.name}. That's exactly how you complete the 12.`,
      `${signB.name}, the ${signA.name} across from you is hunting the same sign as you. Team up for this weekend's hunt.`,
    ];
    await new Promise(r => setTimeout(r, 600));
    return { text: pool[Math.floor(Math.random() * pool.length)] };
  },

  /* ------------------------------------------------------------------ */
  /* 5. moderateBio(text) — modération de l'empreinte                    */
  /* ------------------------------------------------------------------ */
  // Filtre local : 1re passe rapide et gratuite, utilisée en mock
  // ET en live (avant l'appel API).
  localModerate(text) {
    const t = (text || '').trim();
    if (!t) return { ok: false, reason: 'Bio vide.' };
    if (t.length > 140) return { ok: false, reason: 'Too long (140 characters max).' };
    const banned = [
      'con', 'connard', 'connasse', 'salope', 'salaud', 'pute', 'enculé', 'encule',
      'nique', 'fdp', 'pd', 'tapette', 'nègre', 'bougnoule', 'youpin',
      'kill', 'tuer', 'suicide', 'drogue', 'cocaïne', 'héroïne',
    ];
    const low = ' ' + t.toLowerCase().replace(/[.,!?:;()]/g, ' ') + ' ';
    for (const w of banned) {
      if (low.includes(' ' + w + ' ') || low.includes(' ' + w + 's ')) {
        return { ok: false, reason: 'Content rejected by moderation.' };
      }
    }
    if (/(https?:\/\/|www\.|\.com|\.fr|\.net)/i.test(t)) {
      return { ok: false, reason: 'No links or advertising.' };
    }
    if (/(\+?\d[\d\s.\-]{7,}\d)/.test(t) || /[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) {
      return { ok: false, reason: 'No personal contact details.' };
    }
    return { ok: true, reason: null };
  },

  async moderateBio(text) {
    if (this.mode === 'live') {
      // 1re passe locale (rapide, gratuite) avant l'appel réseau.
      const local = this.localModerate(text);
      if (!local.ok) return local;
      let raw = null;
      try {
        raw = await this.chatText({
          deep: false,
          maxTokens: 120,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'You are the Astro Code moderator. Answer ONLY in JSON: ' +
                '{"ok": true|false, "reason": "short reason in English or null"}. ' +
                'Reject: insults, hate, explicit sexual content, personal ' +
                'contact details (phone, email, address), advertising, spam.',
            },
            { role: 'user', content: `Proposed bio: """${text}"""` },
          ],
        });
      } catch (e) {
        // API injoignable : le filtre local a deja valide, on s'y fie.
        return local;
      }
      try {
        const parsed = JSON.parse(raw);
        return { ok: !!parsed.ok, reason: parsed.reason || null };
      } catch (e) {
        // Si le modèle ne renvoie pas du JSON propre, on reste prudent.
        return { ok: false, reason: 'Verification failed, please retry.' };
      }
    }
    // MOCK : filtre local uniquement.
    await new Promise(r => setTimeout(r, 500));
    return this.localModerate(text);
  },
};

// Exposition globale (fichier chargé via <script> classique)
window.META_AI = META_AI;
window.SIGNS = SIGNS;
window.ELEMENTS = ELEMENTS;
