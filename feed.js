/* =====================================================================
   Astro Code — LE FIL (Feed), v1.9.56.
   Idée d'Hamza (29 oct) : les Memories deviennent un réseau social.
   Pas de photo de profil : l'identité de celui qui poste = LE BADGE
   DE SON SIGNE. On publie depuis My Memories (bouton « Post to Feed »
   + une petite légende), on fait défiler les posts, on like (♡).
   Version démo : les posts de l'utilisateur vivent en localStorage,
   plus 3 posts d'exemple d'autres porteurs (images générées par
   Muse Image, même recette que les Memories). Le vrai réseau
   (comptes, amis, flux public) viendra avec le backend.
   ===================================================================== */
(function () {
  'use strict';

  var POSTS_KEY = 'astrocode_feed_v1';
  var LIKES_KEY = 'astrocode_feed_likes_v1';
  var SIGN_EN = {
    belier: 'Aries', taureau: 'Taurus', gemeaux: 'Gemini', cancer: 'Cancer',
    lion: 'Leo', vierge: 'Virgo', balance: 'Libra', scorpion: 'Scorpio',
    sagittaire: 'Sagittarius', capricorne: 'Capricorn', verseau: 'Aquarius',
    poissons: 'Pisces',
    fusion: 'Fusion · Pisces × Leo'
  };

  /* Posts du fil — v1.9.57 : les images sont les VRAIES Memories
     fournies par Hamza (29 oct), pas des générations d'appoint. Leurs
     horaires sont relatifs (toujours frais à la démo) ; seuls les
     likes de l'utilisateur sont persistés. */
  var SEEDS = [
    { id: 'seed-pisces-1', pseudo: 'Yanis', sign: 'poissons', img: 'assets/feed/post-pisces-1.webp',
      caption: 'Montreal, my koi and me.', likes: 52, hoursAgo: 1 },
    { id: 'seed-leo', pseudo: 'Nora', sign: 'lion', img: 'assets/feed/post-leo.webp',
      caption: 'Born to be seen. My Leo finally woke up ✦', likes: 38, hoursAgo: 3 },
    { id: 'seed-pisces-2', pseudo: 'Rayan', sign: 'poissons', img: 'assets/feed/post-pisces-2.webp',
      caption: 'Scanned on rue Masson — the fish never left my side.', likes: 27, hoursAgo: 8 },
    { id: 'seed-pisces-3', pseudo: 'Sofiane', sign: 'poissons', img: 'assets/feed/post-pisces-3.webp',
      caption: 'Pisces season is every season.', likes: 19, hoursAgo: 26 }
  ];
  var MEM_KEY = 'astrocode_memories_v1';

  /* v1.9.57 — un post d'utilisateur ne COPIE plus l'image du souvenir
     (la v1.9.56 saturait le stockage local et le post échouait en
     silence) : il garde la RÉFÉRENCE du souvenir (son horodatage) et
     l'image est relue dans les Memories à l'affichage. Post ≈ 200
     octets, publication infaillible. Si le souvenir a été supprimé,
     le médaillon du signe prend le relais. */
  function memoryImg(ref, sign) {
    try {
      var mems = JSON.parse(localStorage.getItem(MEM_KEY) || '[]');
      for (var i = 0; i < mems.length; i++) {
        if (mems[i].at === ref) return mems[i].img;
      }
    } catch (e) { /* stockage illisible : repli médaillon */ }
    return 'assets/signs/' + sign + '.webp';
  }

  function loadPosts() {
    try { return JSON.parse(localStorage.getItem(POSTS_KEY) || '[]'); } catch (e) { return []; }
  }
  function savePosts(p) {
    try { localStorage.setItem(POSTS_KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
  }
  function loadLikes() {
    try { return JSON.parse(localStorage.getItem(LIKES_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveLikes(l) {
    try { localStorage.setItem(LIKES_KEY, JSON.stringify(l)); } catch (e) { /* silencieux */ }
  }

  function relTime(ts) {
    var s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 90) return 'Just now';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    var d = Math.round(h / 24);
    if (d < 2) return 'Yesterday';
    return d + ' d ago';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function allPosts() {
    var now = Date.now();
    var mine = loadPosts().map(function (p) {
      return { id: p.id, pseudo: 'You', sign: p.sign, img: p.img || memoryImg(p.ref, p.sign),
               caption: p.caption || '', likes: p.likes || 0, at: p.at, mine: true };
    });
    var seeds = SEEDS.map(function (s) {
      return { id: s.id, pseudo: s.pseudo, sign: s.sign, img: s.img,
               caption: s.caption, likes: s.likes, at: now - s.hoursAgo * 3600000, mine: false };
    });
    return mine.concat(seeds).sort(function (a, b) { return b.at - a.at; });
  }

  function render() {
    var list = document.getElementById('feed-list');
    if (!list) return;
    var liked = loadLikes();
    var posts = allPosts();
    if (!posts.length) {
      list.innerHTML = '<p class="feed-empty">No posts yet — share a Memory and start the feed.</p>';
      return;
    }
    list.innerHTML = posts.map(function (p) {
      var isLiked = liked.indexOf(p.id) >= 0;
      var count = p.likes + (isLiked ? 1 : 0);
      return '<article class="feed-card glass' + (window.ASTRO_FEED_FRESH === p.id ? ' fresh' : '') + '">' +
        '<div class="feed-head">' +
          '<img class="feed-avatar" src="' + (p.sign === 'fusion' ? 'assets/fusion/poissons-lion.webp' : 'assets/signs/' + p.sign + '.webp') + '" alt="' + esc(SIGN_EN[p.sign] || '') + '">' +
          '<div class="feed-who"><div class="feed-name">' + esc(p.pseudo) + '</div>' +
          '<div class="feed-sub">' + esc(SIGN_EN[p.sign] || '') + (p.mine ? ' · your post' : ' · wearer') + '</div></div>' +
          '<div class="feed-time">' + relTime(p.at) + '</div>' +
        '</div>' +
        '<img class="feed-img" src="' + p.img + '" alt="">' +
        (p.caption ? '<p class="feed-cap">' + esc(p.caption) + '</p>' : '') +
        '<div class="feed-actions">' +
          '<button type="button" class="like-btn' + (isLiked ? ' liked' : '') + '" data-like="' + p.id + '">' +
          '<span class="like-heart">' + (isLiked ? '♥' : '♡') + '</span>' +
          '<span class="like-count">' + count + '</span></button>' +
          '<span class="feed-born">✦ Born from a real scan</span>' +
        '</div>' +
      '</article>';
    }).join('');
    // Le halo « frais » ne joue qu'à l'arrivée dans le fil, pas aux
    // re-rendus suivants (likes, retours sur l'écran).
    window.ASTRO_FEED_FRESH = null;
  }

  function toggleLike(id) {
    var liked = loadLikes();
    var i = liked.indexOf(id);
    if (i >= 0) liked.splice(i, 1); else liked.push(id);
    saveLikes(liked);
  }

  /* Publication depuis My Memories (v1.9.57) : le post garde la
     RÉFÉRENCE du souvenir (post.ref = son horodatage), jamais une
     copie de l'image — la publication ne peut plus saturer le
     stockage. Retourne l'id du post si la persistance est vérifiée,
     null sinon. Le post fraîchement publié est marqué pour briller
     une fois en tête du fil (ASTRO_FEED_FRESH). */
  function addPost(post) {
    var posts = loadPosts();
    var entry = {
      id: 'u' + Date.now(),
      ref: post.ref || null,
      img: post.img || null,
      sign: post.sign || 'poissons',
      caption: String(post.caption || '').slice(0, 140),
      at: Date.now(),
      likes: 0
    };
    posts.unshift(entry);
    if (posts.length > 30) posts.length = 30;
    if (!savePosts(posts)) return null;
    var ok = loadPosts().some(function (p) { return p.id === entry.id; });
    if (!ok) return null;
    window.ASTRO_FEED_FRESH = entry.id;
    return entry.id;
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('[data-like]') : null;
    if (!b) return;
    toggleLike(b.getAttribute('data-like'));
    render();
  });

  window.FEED = { render: render, addPost: addPost };
})();
