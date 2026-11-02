// Astro Code — jeton Decart éphémère (v1.9.65).
//
// La VRAIE clé Decart vit dans l'environnement Netlify
// (DECART_API_KEY, réglée une fois par Hamza dans le tableau de bord
// Netlify) et ne quitte jamais le serveur. Cette fonction l'échange
// contre un jeton client de courte vie, limité aux modèles
// d'essayage et à des sessions de 150 s maximum, puis le donne au
// navigateur. Ni le code, ni le dépôt public, ni l'utilisateur ne
// voient la clé. Recette officielle Decart (client tokens).

exports.handler = async function () {
  const KEY = process.env.DECART_API_KEY;
  if (!KEY) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'DECART_API_KEY is not configured on the server yet.' }),
    };
  }
  try {
    const r = await fetch('https://api.decart.ai/v1/client/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': KEY },
      body: JSON.stringify({
        allowedModels: ['lucy-vton-latest', 'lucy-latest'],
        expiresIn: 300,
        constraints: { realtime: { maxSessionDuration: 150 } },
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.apiKey) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Decart refused the token request.', detail: data }),
      };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: data.apiKey }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: String((e && e.message) || e) }),
    };
  }
};
