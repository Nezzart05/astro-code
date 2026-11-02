# Astro Code — Édition Meta AI

**Un réseau social qui te fait lever les yeux de ton écran.**
12 t-shirts, 12 signes du zodiaque. Tu scannes le signe d'un t-shirt, la créature prend vie en réalité augmentée autour du porteur. Tu collectionnes les signes des gens que tu **rencontres** — pas ceux que tu suis. *Not followed. Met.*

- Site live : https://astro-code-5.netlify.app
- Build actuel : **v1.9.92** (voir le marqueur en tête de `index.html` et le nom de cache dans `sw.js`)
- Projet présenté au hackathon Meta AI Developers (26 oct – 4 nov 2026), piste Indie.

---

## Comment ça marche

1. **Link Hoodie** — le QR de l'étiquette ouvre l'app ; le code unique sous vernis à gratter (étiquette de lavage) lie UN t-shirt à UN compte (téléphone + pseudo, passeport local `ASTRO-XXXX-SIGNE`).
2. **Scan** — la caméra reconnaît le dessin du t-shirt (MindAR) et la révélation joue autour du porteur : vidéo de fond ancrée derrière la personne détourée, créature en orbite devant, voix du signe, horoscope.
3. **La Rencontre** — l'image Duo (les deux signes dans une seule photo) est la 3e cible du fichier compilé : quand elle est suivie, la vidéo de fusion joue centrée sur elle, avec priorité sur les scans solo.
4. **My Collection** — un scan validé (cible suivie 2 s + spectacle en cours) fait voler le médaillon du signe dans la collection. 12/12 débloque **Write your imprint** (bio publiée au scan, modération IA).
5. **My Memories** — pendant le scan, « ✦ Keep a Memory » transforme la photo du moment : visage et mains réels, tout le reste illustré, la créature coloriée en orbite. Les souvenirs se publient dans le **Feed**.
6. **Find Wearers Around Me** — carte des porteurs proches (zones chaudes anonymes par défaut).
7. **Try a Hoodie Live** — essayage en direct pour les gens sans t-shirt : Decart habille la personne en temps réel, la voix pilote l'essayage.
8. **My Constellation** — le jeu : tu nages parmi les créatures des signes rencontrés.

Menu du bas : **Feed · Around me · My Collection · My Memories**. Le bouton sandwich (haut-gauche de l'accueil) ouvre le tiroir : Link Hoodie (point orange tant que le hoodie n'est pas lié), Feed (point orange permanent), puis toutes les portes.

---

## Le scan (AR)

- **MindAR 1.2.5** (CDN, three.js r132) suit les dessins ; `ar-tracking.js` lisse la pose (lerp position + slerp rotation, snap sur les sauts) et annonce chaque signe via les événements `astrocode:target-found` / `astrocode:target-lost`, plus les rectangles écran par signe.
- **`targets.mind`** (racine) = les 3 cibles compilées, DANS L'ORDRE : **0 Poissons, 1 Lion, 2 Duo**. Un seul fichier : la Rencontre exige les deux signes suivis en même temps (maxTrack: 2) et la fenêtre de décision d'ar-tracking.js (voir « LA RENCONTRE » dans le code).
  Pour recompiler : outil officiel https://hiukim.github.io/mind-ar-js-doc/tools/compile — téléverser les images sources dans cet ordre exact. Deux fichiers `.mind` ne se fusionnent jamais : toujours recompiler les sources ensemble.
- **Le spectacle** est peint par `reveal-2d.js` (canvas 2D, **ne pas modifier à la légère** — c'est la révélation validée sur le terrain) : caméra → vidéo de fond alpha du signe → personne détourée (MediaPipe Selfie Segmentation) → vidéo avant en orbite. Vidéos dans `assets/reveal/` (WebM VP9 alpha).
- **La fusion** (`fusion.js`) écoute `astrocode:fusion-start` : en mode « target » (image duo suivie), la vidéo `assets/fusion/poissons-lion.webm` joue centrée sur l'image ; image de repli `poissons-lion.webp` si la vidéo échoue. Son : `assets/audio/fusion-sting.mp3` (7 s, fondu intégré).
- Au scan validé : jingle `assets/audio/wonderful-sting.mp3`, voix du signe (`assets/audio/voice-<signe>-en.mp3`), horoscope Meta AI.

Sur l'écran de scan, seuls deux boutons : **✦ KEEP A MEMORY** (gauche) et **● REC** (droite), au-dessus du menu du bas qui reste visible.

---

## Meta AI (via le proxy Netlify)

Le navigateur n'appelle jamais l'API Meta directement : tout passe par `netlify/functions/meta-proxy.js` (clé lue côté serveur dans `META_MODEL_API_KEY`, liste blanche de modèles, plafond d'appels par IP).

| Modèle | Service rendu |
| --- | --- |
| Muse Wonder | Horoscopes personnalisés |
| Muse Spark | Icebreakers de rencontre, modération de l'empreinte |
| Muse Image | Souvenirs « Keep a Memory » et personnages des signes |
| SAM 3.1 | Masques (image et vidéo) pour les souvenirs |
| Muse Voice Transcribe | Voix du direct dans l'essayage |

Règle maison : **pas de technologie décorative** — chaque modèle branché rend un service réel au produit.

## Essayage Decart

`tryon.js` charge le SDK Decart via esm.sh, **version figée : `@decartai/sdk@0.2.14`**. La clé Decart ne transite jamais dans le code public : `netlify/functions/decart-token.js` émet un jeton éphémère depuis le secret serveur `DECART_API_KEY`.

---

## Structure

| Fichier / dossier | Rôle |
| --- | --- |
| `index.html` | L'app entière : écrans, styles, navigation |
| `app.js` | Navigation, collection, passeport, empreinte, tiroir |
| `ar-tracking.js` | Suivi MindAR + anti-jitter + rectangles écran |
| `reveal-2d.js` | Le spectacle du scan (canvas 2D) |
| `fusion.js` | La Rencontre : vidéo de fusion sur l'image duo |
| `memory.js` | Keep a Memory (photo transformée par Muse Image) |
| `record-share.js` | ● REC : enregistrement et partage du scan |
| `feed.js` | Le Feed (souvenirs publiés) |
| `map.js` | Find Wearers Around Me (Leaflet) |
| `game.js` | My Constellation (three.js ; slot optionnel `assets/models/<signe>.glb`, créature procédurale si absent) |
| `tryon.js` | Try a Hoodie Live (Decart + voix Meta) |
| `sam-mask.js` + `assets/sam/` | Masques SAM côté client |
| `meta-ai.js` | Client des modèles Meta via le proxy |
| `sw.js` | Service worker PWA : code en network-first, médias en cache-first. **Le nom de cache change à chaque livraison** — c'est ce qui force les téléphones à prendre le nouveau code |
| `targets.mind` | Les 3 cibles compilées (Poissons, Lion, Duo) |
| `netlify/functions/` | `meta-proxy.js` (API Meta) et `decart-token.js` (jeton Decart) |
| `assets/` | `reveal/` vidéos du spectacle · `fusion/` vidéo + image de fusion · `signs/` médaillons · `elements/poissons2/` doodles · `hoodies/` photos porteurs · `audio/` voix, jingle, fusion · `intro.mp4` vidéo d'ouverture |

Données locales (appareil de l'utilisateur) : collection `astrocode_meta_collection_v1`, souvenirs `astrocode_memories_v1`, passeport `astrocode_passport_v1`.

## Déploiement

Glisser-déposer le dossier complet sur Netlify (site `astro-code-5`). Avant de livrer un zip :

1. Vérifier que `targets.mind` est à la racine du zip.
2. Bumper le marqueur de build dans `index.html` ET le nom de cache dans `sw.js`.
3. Après déploiement, **fermer complètement l'app** sur le téléphone avant de retester (un onglet ouvert garde l'ancien code).

## Historique récent

### v1.9.104 (2 novembre) — POKE devient WAVE

Choix d'Hamza : « Poke » est le mot de Facebook — pas de conflit, pas
d'emprunt. La fonction est renommée **WAVE** (le salut de la main, le
geste qu'on fait dans la rue pour dire « je suis là, je suis
ouvert ») : bouton « 👋 WAVE — I'M OPEN TO A SCAN », « Leo waved
back », section `LE WAVE` dans map.js, clé `astrocode_wave_v1`. La
mécanique de la v1.9.103 est inchangée. Bancs : wave (ex-poke) 11/11,
Rencontre, brise-glace, quotidien — les quatre verts.

### v1.9.103 (2 novembre) — LE POKE : le consentement sur la carte

Idée d'Hamza du matin même (« le poke, mais dans la rue ») : sur
Around Me, chaque porteur **déclaré ouvert** aux rencontres porte un
**point vert** pulsant sur le radar (Lion et Sagittaire ouverts,
Scorpion non — la règle de vie privée est écrite dans le code ET sous
la carte dans l'app : « Nobody is ever shown open by default »). Le
bouton vert **« POKE — I'M OPEN TO A SCAN »** ouvre TON état pour
30 minutes (persisté, anneau vert autour de toi au centre) ; ~5 s
après, le porteur ouvert le plus proche **te poke en retour** avec sa
fiche (« Go say hi, then scan » + ouvrir le scanner). Toucher un
porteur ouvert dit son état dans sa fiche. Section `LE POKE`
commentée dans map.js — un juré qui lit le code la trouve, avec la
règle de consentement. **Aucun serveur** : état local + porteurs de
la carte ; le backend multi-utilisateur reste l'étape post-hackathon.
Bonus : le bouton « Open the scanner » de la carte était MORT
(sélecteur inexistant) — réparé via `window.ASTRO_SHOW` (app.js).
**Bancs : poke 11/11 nouveau, Rencontre, brise-glace, quotidien —
les quatre verts.**

### v1.9.102 (2 novembre) — le cercle de la fiche ne reste plus vide

Sur sa capture de l'ancienne version, le cercle en haut de la fiche
Poissons était VIDE. Décision d'Hamza : « on va pas mettre l'icône ou
le badge, on va mettre une photo récoltée des Memories ». Fait —
priorité d'image du cercle (`#reveal-img`, `object-fit: cover` ajouté) :
1) le **Memory le plus récent du signe** (sa vraie photo transformée),
2) l'**illustration fournie par Hamza** (`assets/card-poissons.webp` =
son illustration Memory Poissons ; `assets/card-lion.webp` = extraite
par recadrage de SA capture du Memory Lion du 29 oct, vérifiée
visuellement), 3) l'œuvre du signe. Le personnage IA généré
(Muse Image) ne remplace que le cas 3 et n'est pas commandé quand une
photo est là (économie d'appels). **Bancs : quotidien 8/8** (dont les
deux cas photo), Rencontre tout passe, brise-glace 7/7.

### v1.9.101 (2 novembre) — L'HOROSCOPE DU JOUR (texte)

Le film promet « Your horoscope. Every day. » (chapitre 2:28) — l'app ne
tenait pas encore cette promesse : l'horoscope de la fiche signe était
régénéré à chaque ouverture, sans date. **Construit** (choix d'Hamza :
« on branche d'abord, on voit avec le texte ») : sur la fiche d'un signe
collecté (My Collection → carte du signe), l'horoscope devient celui
**du jour** — libellé « ☀️ TODAY — <date> », Wonder appelé une seule
fois par signe et par date, texte gardé dans le téléphone
(`astrocode_daily_horo_v1`), nouveau demain. **Banc dédié : 6/6**
(affichage, libellé, 1 seul appel, cache écrit, réouverture servie par
le cache). La LECTURE du texte du jour par une belle voix viendra plus
tard via **fal.ai** (abonnement d'Hamza — décision du 2 nov ; pas
ElevenLabs) ; le bouton voix garde l'accueil humain du signe. Priorité
d'Hamza, rappelée ce matin : les CINQ modèles Meta doivent réellement
travailler (les 25 points d'outillage) — Wonder ✓ (horoscope du jour),
Spark ✓ (brise-glace rencontre + modération empreinte), Muse Image ✓
(MEMORY), SAM 3.1 ✓ (masques MEMORY), Voice Transcribe ✓ (commandes
vocales de l'essayage — verdict terrain de la chaîne vocale encore à
confirmer par un test de 30 s dans Try-On).

### v1.9.100 (2 novembre) — la fenêtre de décision passe à 500 ms

Verdict terrain d'Hamza sur la v1.9.99 : le scan pur fonctionne, mais le
solo met « une seconde, une seconde et demie » à réagir (reconnaissance
~0,3 s + fenêtre de 1000 ms) — « pour un jury, il dit que c'est mauvais ».
`DUO_WINDOW_MS` : 1000 → **500**. La fusion n'est pas touchée : elle part
immédiatement au verrouillage du second signe (deux porteurs côte à côte
se verrouillent à quelques centaines de ms l'un de l'autre), et un second
signe tardif bascule toujours le solo en cours vers la fusion. Bancs
repoussés sur le build final : Rencontre tout passe, brise-glace 7/7.

### v1.9.99 (2 novembre) — LE SCAN PUR : la cible duo supprimée

**La peur d'Hamza, nommée** : « la plupart du temps, quand je scanne juste un
Poissons, ça me sort la fusion — devant le jury, ça me fait flipper. » Le
mécanisme : l'ancienne cible n° 2 (la photo duo compilée dans targets.mind)
contient le dessin Poissons EN ENTIER — un scan solo de Poissons tenu pouvait
la verrouiller (la confirmation de 0,9 s de la v1.9.94 ne protégeait que des
faux positifs brefs). **Sa solution, mot pour mot** : « on fait le .mind juste
du Poissons et du Lion, on fait pas un troisième, et avec le code on dit que
quand il y a les deux on fait un duo, quand il y en a un séparément on joue
celui qui est scanné. » C'est construit : nouveau `targets.mind` **à 2 cibles**
(0 Poissons, 1 Lion, recompilé le 2 nov via l'outil officiel ;
`target-src/targets-2cibles-v1999.mind`, 1 111 802 octets contre 1 668 869) ;
`wireDuo`, `duoSeen/duoActive/duoTimer` et l'ancre 2 **supprimés** d'ar-tracking.js ;
la fin de fusion ne dépend plus que des deux signes. Conséquence assumée :
l'affiche duo ne déclenche la fusion que si les deux dessins y sont reconnus
séparément — la voie des deux hoodies réels, celle du jury, est la seule et la
propre. **Bancs** : Rencontre 20/20 dont le NOUVEAU scénario E « solo Poissons
tenu 3,5 s → solo, AUCUNE fusion » et « exactement 2 ancres » ; brise-glace
7/7 sur le même build. fusion.js intact (son `targetMode` ne s'activera plus,
branche morte inoffensive). Sauvegarde : `astro-code-backups/astro-code-meta-v1.9.98-avant-purification-2026-11-02`.


- **v1.9.98 (1er nov)** — **la phrase brise-glace revient** (décision d'Hamza ; elle n'existait plus que dans le panneau « Simulate an encounter » supprimé en v1.9.92, la fonction `generateIcebreaker` n'avait plus d'appelant). Règle : quand le signe scanné n'est pas celui du porteur (passeport), le scan est une rencontre — Muse Spark génère la phrase entre les deux signes et elle s'écrit dans le spectacle à la place de l'horoscope ; son propre signe garde l'horoscope Wonder ; échec Spark → repli horoscope. Vérifié au banc Chromium (scan Lion → brise-glace Poissons×Lion, scan Poissons → horoscope ; banc Rencontre v1.9.97 toujours vert).

- **v1.9.97 (1er nov)** — **la Rencontre refaite selon la spec d'Hamza** (échec terrain du scan duo : sur la photo duo, Poissons gagnait et lançait son solo, la fusion ne partait jamais). Retour au fichier combiné `targets.mind` (la « chasse » à fichiers séparés de la v1.9.95 est abandonnée : elle empêchait tout suivi simultané). Nouvelle **fenêtre de décision** (`CFG.DUO_WINDOW_MS = 1000`) : un premier signe attend 1 s avant son solo ; si le second signe ou la cible duo apparaît entre-temps → **fusion**, sans révélation solo. Pendant la fusion, les solos sont ignorés et elle ne s'arrête que lorsque plus rien n'est suivi depuis ~700 ms ; un solo déjà en cours bascule vers la fusion si le second signe apparaît. Logs console `[Duo] …`. **Vérifié par un banc Chromium à MindAR simulé (20 contrôles : solo Poissons, solo Lion, image duo, persistance de la fusion, bascule règle 5, cible duo, fenêtre annulée).** reveal-2d.js, fusion.js et la collection : inchangés.

- **v1.9.96 (1er nov)** — **bug d'affichage corrigé : les écrans hors de `#app` (Feed, Collection, Memories, carte, jeu…) étaient petits et décentrés** (capture d'Hamza : le Feed à ~64 %, poussé à droite). Cause : `body` était en `display:flex` (ligne) — l'écran actif se plaçait À CÔTÉ de `#app` au lieu de le remplacer. Correctif : body en flux normal, `#app` centré par marges, les écrans directs de body prennent la même colonne de 480 px (+ dégagement du menu du bas), et app.js pose `body.sub-screen` pour masquer `#app` (100dvh vides) pendant qu'un de ces écrans est actif. Vérifié en Chromium headless avant/après (géométrie + captures).
- **v1.9.95 (1er nov)** — retour aux **fichiers `.mind` séparés** (compilations fournies par Hamza : poissons, lion, duo — un fichier = une image). Le scan « chasse » : il essaie le fichier du signe du porteur, puis l'autre signe, puis le duo, par fenêtres de 3,2 s, et se verrouille dès qu'une cible est trouvée (reprise 4 s après une perte). Motivations : le fichier combiné permettait au t-shirt Poissons de matcher la cible duo (fausse fusion) et ralentissait la reconnaissance. La confirmation duo de 0,9 s (v1.9.94) est conservée.
- **v1.9.94 (1er nov)** — Mode Cartoon (v1.9.93) **retiré entièrement** sur verdict terrain d'Hamza (bouton, module, jeton Decart revenu aux seuls modèles d'essayage). Deux correctifs scan : le texte de récolte (« Pisces ✦ collected ») disparaît désormais après **2 s** quoi qu'il arrive (avant, il restait affiché si le vol du badge était interrompu) ; l'ancre Duo exige **0,9 s de suivi continu** avant de déclencher la fusion (la photo duo contient le dessin Poissons — un t-shirt Poissons de près pouvait la matcher par erreur et « révéler une fusion »).
- **v1.9.92 (1er nov)** — nettoyage du code mort : anciennes révélations retirées (vidéo côte-à-côte SBS, banc 3D koï/gummy, Lottie), prototype stylize-live, mode duo séparé dormant (`targets-fusion.mind` — la Rencontre vit dans `targets.mind`, cible n° 2), panneau « Simulate an encounter » (Imprint et Reset conservés sur l'écran), archives vidéo. Decart figé en 0.2.14. Comportement inchangé pour tout ce qui fonctionne.
- **v1.9.90/91** — menu sandwich (Link Hoodie + Feed dans le tiroir, points orange).
- **v1.9.88** — panneau Memory épuré (Post to Feed / Share, icônes Download et Close en haut).
- **v1.9.84** — un seul `targets.mind` à 3 cibles ; la Rencontre par l'image duo, priorité sur les solos.
