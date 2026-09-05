/* ============================================================================
 * ulysse-core.js — la couche de liaison a Hermes
 * ----------------------------------------------------------------------------
 * Un seul endroit ou vit le cablage : REST, WebSocket JSON-RPC, modele de
 * conversation. Les pages (ulysse.html, session-b.html) n'en sont que des
 * habillages differents. Chaque appel ci-dessous a ete verifie contre le code
 * source Hermes installe — voir AUDIT-ENDPOINTS-REEL.md pour la ligne exacte.
 *
 * Ce que ce fichier ne fait PAS, volontairement :
 *   · il ne detient aucun secret. serve.py pose le jeton de session et la
 *     signature HMAC des webhooks. Un secret dans le navigateur est lisible
 *     par toute extension installee.
 *   · il n'invente aucun endpoint. Ce qui n'existe pas cote Hermes n'est pas
 *     simule : la page l'affiche comme non relie.
 * ========================================================================== */
"use strict";

/* ═══ 0. Configuration ════════════════════════════════════════════════════ */

const RAW_CFG = (typeof window.ULYSSE_CONFIG === "object" && window.ULYSSE_CONFIG) || {};
const CFG = {
  // La page ne parle qu'a serve.py, qui la sert. Son origine est donc
  // toujours la bonne cible : pas de port ecrit en dur a maintenir.
  BASE: (RAW_CFG.DASHBOARD_URL || location.origin).replace(/\/+$/, ""),
  // Modele du mode Discussion. LOI-DU-CERVEAU.md : Ulysse n'impose RIEN.
  // Vide par defaut = heritage du modele de la session vivante Hermes
  // (conv.info.model). Rempli = override explicite de l'utilisateur, affiche
  // comme tel dans « Le cerveau ». On ne durcit plus aucun modele.
  PROXY_MODEL: RAW_CFG.PROXY_MODEL || "",
  // Le repli quand `ulysse-config.js` ne dit rien. Il valait 800, comme le
  // fichier de config — donc une installation neuve heritait d'un plafond trop
  // bas pour ce que l'ecran promet. Les deux sont montes a 4000 le 2026-08-12 :
  // un defaut de produit et un reglage d'installation qui se contredisent, ce
  // sont deux verites pour une seule chose.
  PROXY_MAX_TOKENS: RAW_CFG.PROXY_MAX_TOKENS || 4000,
  SESSION_CWD: RAW_CFG.SESSION_CWD || "",
  SESSION_MODEL: RAW_CFG.SESSION_MODEL || "",
  START_PATH: RAW_CFG.START_PATH || "",
  STUDIO_LOG_MAX: RAW_CFG.STUDIO_LOG_MAX || 300,
  // Est-ce le premier lancement ? La page ne peut pas le savoir seule :
  // c'est serve.py qui l'ajoute a ce fichier au moment de le servir, depuis
  // un marqueur qui vit hors du dossier publie. Faux par defaut — ne jamais
  // montrer l'ecran d'accueil parce qu'on n'a pas su.
  PREMIER: RAW_CFG.PREMIER === true
};

/* ═══ 1. Couche REST ══════════════════════════════════════════════════════ */

class ApiError extends Error {
  constructor(message, status, network){
    super(message);
    this.status = status || 0;
    this.network = !!network;
  }
}

/* Toutes les reponses ne sont pas du JSON : un 204 n'a pas de corps, une
   erreur de proxy est du texte. On lit en texte puis on tente le JSON —
   sinon un SyntaxError s'echappe hors ApiError et l'appelant reste en
   chargement pour toujours. */
async function api(path, opts){
  opts = opts || {};
  let res;
  try {
    res = await fetch(CFG.BASE + path, {
      method: opts.method || "GET",
      headers: Object.assign({}, opts.headers || {},
        opts.body ? { "Content-Type": "application/json" } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store"
    });
  } catch (e){
    throw new ApiError("connexion impossible : " + e.message, 0, true);
  }

  const text = res.status === 204 ? "" : await res.text().catch(() => "");
  let data = null, parsed = false;
  if (text){
    try { data = JSON.parse(text); parsed = true; } catch (e){ /* pas du JSON */ }
  }
  if (res.status === 401) throw new ApiError("Unauthorized", 401);
  if (!res.ok){
    const detail = parsed && data ? (data.detail || data.message || data.error || "")
                                  : String(text).slice(0, 200);
    throw new ApiError("HTTP " + res.status + (detail ? " — " + detail : ""), res.status);
  }
  if (!text) return null;
  return parsed ? data : { raw: text };
}

/* Une panne, dite en mots dont on peut faire quelque chose.

   ⚠ SEPT PANNEAUX ÉCRIVAIENT « Lecture impossible : HTTP 502 — Bad Gateway ».
   C'est vrai, et c'est un mur poli : la personne apprend que ça a raté et rien
   d'autre. Un message d'échec doit dire trois choses — QUE ça a raté, POURQUOI
   en mots utiles, et QUOI FAIRE. Un message qui s'arrête au deuxième n'a fait
   que la moitié du chemin.

   Constaté le 2026-08-12 en éprouvant les chemins dégradés — aucun de ces
   messages n'avait jamais été mis en scène.

   Le code technique reste, entre parenthèses : quand kuchu me montrera une
   capture, c'est lui qui me dira où chercher. */
function pannePhrase(e){
  const s = e && e.status;
  const brut = (e && e.message) || "erreur inconnue";
  if (s === 0 || (e && e.offline)){
    return "Le serveur d'Ulysse ne répond pas. Relancez lancer_ulysse.bat, "
      + "puis rechargez cette page. (" + brut + ")";
  }
  if (s === 401 || s === 403){
    return "Hermès a refusé la demande — le jeton de session n'est plus valable. "
      + "Fermez les fenêtres Ulysse-* et relancez lancer_ulysse.bat : il en "
      + "fabrique un neuf à chaque démarrage. (" + brut + ")";
  }
  if (s === 404){
    return "Hermès ne connaît pas cette adresse. Votre version d'Hermès est "
      + "peut-être plus ancienne que cet écran. (" + brut + ")";
  }
  if (s === 502 || s === 503 || s === 504){
    return "Hermès ne répond pas. Vérifiez la fenêtre « Ulysse-Dashboard », ou "
      + "relancez lancer_ulysse.bat. (" + brut + ")";
  }
  return brut;
}

/* --- Les appels REST reellement disponibles -------------------------------
   Chaque methode nomme sa source. Ce qui n'y figure pas n'existe pas. */
const REST = {
  // web_server.py:3023 — {version, gateway_running, gateway_state, …}
  status: () => api("/api/status"),
  // web_routers/sessions.py:50 — limit borne a 100, order ∈ {created,recent}
  sessions: (limit, order) =>
    api("/api/sessions?limit=" + Math.min(Math.max(limit || 20, 1), 100)
        + "&order=" + (order === "recent" ? "recent" : "created")),
  // sessions.py:598 — {session_id, messages, pagination}
  messages: (id, limit) =>
    api("/api/sessions/" + encodeURIComponent(id) + "/messages?limit="
        + Math.min(limit || 50, 500)),
  // sessions.py:633 — DELETE, IDEMPOTENT : une session deja absente renvoie
  // {ok:true, already_absent:true} plutot qu'un 404. Le contrat de DELETE est
  // « assure-toi que ce n'est plus la », pas « supprime exactement une fois ».
  deleteSession: (id) =>
    api("/api/sessions/" + encodeURIComponent(id), { method: "DELETE" }),
  // sessions.py:661 — PATCH {title?, archived?, pinned?}. Les trois champs
  // sont optionnels, mais en envoyer zero est un 400 : le backend refuse une
  // mise a jour vide plutot que de faire semblant.
  patchSession: (id, champs) =>
    api("/api/sessions/" + encodeURIComponent(id), { method: "PATCH", body: champs }),
  // web_server.py:2354 — {path, parent, entries}
  files: (path) => api("/api/files" + (path ? "?path=" + encodeURIComponent(path) : "")),
  // web_server.py:2386 — {name, path, size, mime_type, data_url}
  readFile: (path) => api("/api/files/read?path=" + encodeURIComponent(path)),
  // web_server.py:12820 — {active, providers, builtin_files}
  memory: () => api("/api/memory"),
  // web_server.py:2627 — {text, byteSize, binary, truncated, path, …}
  readText: (path) => api("/api/fs/read-text?path=" + encodeURIComponent(path)),

  /* ── Ecrire dans la memoire ───────────────────────────────────────────
     PAS `/api/fs/write-text` en direct : ces trois routes sont LOCALES a
     serve.py, et c'est la tout leur objet. Hermes ecrit proprement mais ne
     garde AUCUNE copie ; serve.py met la version d'avant de cote AVANT de
     laisser passer, et si la copie echoue l'ecriture n'a pas lieu.

     Passer par `/api/fs/write-text` depuis la page contournerait la copie
     datee — et l'ecran promettrait alors un retour en arriere qui n'existe
     pas. C'est exactement ce que la passe de design interdit. */
  ecrireMemoire: (path, content) =>
    api("/ulysse/ecrire", { method: "POST", body: { path: path, content: content } }),
  versionsDe: (path) => api("/ulysse/versions?path=" + encodeURIComponent(path)),

  /* La corbeille. Trois appels, et PAS DE QUATRIEME : il n'existe aucune
     route pour vider. Ulysse deplace et remet ; effacer pour de bon reste un
     geste que la personne fait elle-meme, hors d'ici. Voir le bloc
     `DOSSIER_CORBEILLE` de serve.py — Hermes, lui, n'a aucune corbeille :
     ses suppressions sont immediates et sans retour. */
  corbeille: () => api("/ulysse/corbeille"),
  corbeilleJeter: (path) =>
    api("/ulysse/corbeille/jeter", { method: "POST", body: { path: path } }),
  corbeilleRestaurer: (id) =>
    api("/ulysse/corbeille/restaurer", { method: "POST", body: { id: id } }),
  /* ⚠ LE SEUL APPEL D'ULYSSE QUI DETRUISE. Ajoute le 2026-08-22 a la demande
     de kuchu, qui revient sur l'arbitrage du matin (« Ulysse n'efface
     jamais »). Rien ne rattrape ce qui part par la : Hermes n'a pas de
     corbeille systeme, et il n'y en a plus derriere celle-ci. C'est pourquoi
     l'ecran demande une confirmation NOMMEE avant de l'appeler. */
  corbeilleVider: (id) =>
    api("/ulysse/corbeille/vider", { method: "POST",
      body: id ? { id: id } : { tout: true } }),
  restaurerVersion: (path, nom) =>
    api("/ulysse/restaurer", { method: "POST", body: { path: path, nom: nom } }),

  /* Ouvre une VRAIE console Hermes, hors d'Ulysse. Aucun parametre : la
     commande est ecrite en dur dans serve.py. C'est le seul endroit ou la
     page fait lancer un processus sur la machine — et la fenetre qui s'ouvre
     est visible, ce qui est la moitie de ce qui rend le geste acceptable. */
  ouvrirConsole: () => api("/ulysse/console", { method: "POST" }),
  // web_routers/skills.py:395 — une LISTE, pas un objet
  skills: () => api("/api/skills"),
  // web_server.py:12486 — {enabled, base_url, subscriptions:[{name,…}]}
  webhooks: () => api("/api/webhooks"),
  // Declenchement : serve.py signe en HMAC-SHA256 V2 puis relaie au gateway.
  // Le gateway refuse toute requete non signee (webhook.py:653).
  fireWebhook: (name, payload) =>
    api("/webhooks/" + encodeURIComponent(name), {
      method: "POST",
      body: Object.assign({ source: "ulysse", declenche_le: new Date().toISOString() }, payload || {})
    }),
  // web_routers/cron.py — automatisations
  cronJobs: () => api("/api/cron/jobs"),
  /* ── Creer une automatisation ─────────────────────────────────────────
     `POST /api/cron/jobs` EXISTE (web_routers/cron.py:67) et Ulysse ne s'en
     servait pas : l'ecran renvoyait a `hermes cron add`, c'est-a-dire hors du
     produit. Lu dans la source, puis eprouve en vrai avant d'ecrire un seul
     bouton (creation, relecture, suppression).

     Le corps est `CronJobCreate` (web_models.py:361) : `schedule` est le SEUL
     champ obligatoire, `prompt` vaut "" par defaut, `deliver` vaut "local".
     Mais le serveur refuse (400) un travail d'agent sans rien a faire —
     « agent cron jobs require a prompt, skill, or script »
     (web_server.py:11621). L'ecran demande donc un texte, et le dit. */
  creerCron: (corps) => api("/api/cron/jobs", { method: "POST", body: corps }),
  /* Une automatisation qu'on peut poser sans pouvoir la retirer est un piege.
     `DELETE` existe (cron.py:120) et rend `{ok:true}` — verifie en direct. */
  supprimerCron: (id) =>
    api("/api/cron/jobs/" + encodeURIComponent(id), { method: "DELETE" }),
  /* ── Modifier une automatisation ──────────────────────────────────────
     `PUT /api/cron/jobs/{id}` (cron.py:100). Le corps est `{updates: {...}}`
     — un dictionnaire de champs a changer, pas le travail entier : ce qu'on
     n'envoie pas reste tel quel.

     `schedule` s'y envoie en CHAINE BRUTE : `update_job` la reparse avec le
     meme `parse_schedule` que la creation (cron/jobs.py:1838). La traduction
     de l'ecran sert donc aux deux, sans seconde version.
     Seul `id` est refuse (`_IMMUTABLE_JOB_FIELDS`, jobs.py:378) : c'est un
     composant de chemin sur le disque.

     ⚠ L'ENVELOPPE `{updates}` N'EST PAS UNE FORMALITE. Envoyer les champs a
     nu — `body: updates` — ne rend PAS d'erreur : le serveur repond 200 et ne
     change rien. L'ecran dirait « enregistre », l'automatisation continuerait
     a l'ancien horaire, et personne ne le saurait avant qu'elle se declenche
     au mauvais moment. Verifie en posant la mutation : `banc_ecrans.js` vire
     au rouge sur trois lignes, et aucune ne vient d'un message d'erreur. */
  modifierCron: (id, updates) =>
    api("/api/cron/jobs/" + encodeURIComponent(id),
        { method: "PUT", body: { updates: updates } }),
  /* Ou livrer. On ne code PAS la liste en dur : le backend la derive des
     plateformes configurees, et rend `home_target_set:false` pour celles
     qu'il faut encore brancher — pour que l'ecran le DISE au lieu de les
     cacher (cron.py:74). Ici : « local » et « telegram ». */
  cronCibles: () => api("/api/cron/delivery-targets"),
  /* ── Les modeles tout prets (« blueprints ») ───────────────────────────
     `GET /api/cron/blueprints` (cron.py:184) rend `{blueprints:[...]}`. Quatorze
     modeles, chacun avec son formulaire DECRIT PAR LE BACKEND : `fields[]`
     porte le nom, le type (`time`, `enum`, `text`, `weekdays`), l'etiquette,
     la valeur par defaut et les options. L'ecran dessine ce qu'on lui decrit ;
     il ne connait aucun modele par avance, donc il n'en rate aucun le jour ou
     Hermes en ajoute.

     ⚠ LA CLE S'APPELLE `key`, PAS `id`. Verifie sur la vraie reponse. La
     confondre ne casse rien a l'affichage — le titre vient d'ailleurs — et
     fait juste poser `undefined` au moment d'instancier.

     ⚠ LES OPTIONS DE `deliver` SONT REECRITES PAR LE BACKEND a partir des
     plateformes reellement branchees (cron.py:199). Les recopier ici
     proposerait un jour Telegram a quelqu'un qui ne l'a pas. */
  cronModeles: () => api("/api/cron/blueprints"),
  /* `POST /api/cron/blueprints/instantiate` (cron.py:218) : `{blueprint, values}`.
     Hermes remplit le gabarit d'horaire et le texte, puis cree la tache.

     ⚠ IL REFUSE LES NOMS DE CHAMPS QU'IL NE CONNAIT PAS (422, `unknown slot`) —
     volontairement : un `tiem=07:15` mal tape ne doit pas creer en silence une
     tache a l'heure par defaut. L'ecran n'envoie donc QUE les champs decrits
     par `fields`, jamais un de plus.
     Un 422 porte son motif en clair dans `detail` (« invalid time 'x' — use
     HH:MM ») : c'est ce texte qu'on montre, mot pour mot. */
  poserModele: (cle, valeurs) => api("/api/cron/blueprints/instantiate", {
    method: "POST",
    body: { blueprint: cle, values: valeurs || {} }
  }),
  pauseCron: (id) => api("/api/cron/jobs/" + encodeURIComponent(id) + "/pause", { method: "POST" }),
  resumeCron: (id) => api("/api/cron/jobs/" + encodeURIComponent(id) + "/resume", { method: "POST" }),
  triggerCron: (id) => api("/api/cron/jobs/" + encodeURIComponent(id) + "/trigger", { method: "POST" }),
  /* web_server.py:4308 — {data_url, mime_type?} -> {ok, transcript, provider}.
     Le corps DOIT etre une data-URL en base64 dont le type commence par
     `audio/` (ou `video/webm`), sous 25 Mo — au-dela c'est un 413.

     Un transcript VIDE n'est pas une erreur : le backend le renvoie avec
     ok:true quand il n'a entendu que du silence (web_server.py:4390). C'est
     le seul cas ou une reponse reussie ne rapporte rien, et l'interface doit
     le dire autrement qu'en echec. */
  transcribe: (dataUrl, mime) => api("/api/audio/transcribe", {
    method: "POST",
    body: { data_url: dataUrl, mime_type: mime || "" }
  }),
  // web_server.py — configuration et modeles
  config: () => api("/api/config"),
  /* Reecrit `command_allowlist` — la liste ou vit chaque « Autoriser
     toujours ». C'est ce qui rend revocable une promesse que l'ecran affiche
     depuis la passe Accord : « Vous pourrez revenir sur toujours dans
     Reglages · Securite et accords. »

     ⚠ ON N'ENVOIE QUE CETTE CLE, ET C'EST SUR. `PUT /api/config` fusionne en
     profondeur et `_deep_merge` remplace toute valeur qui n'est pas un
     dictionnaire — donc une liste entiere (mesure, AUDIT-ENDPOINTS-REEL.md
     §5 bis). Renvoyer la config complete « pour ne rien perdre » aurait ete
     l'inverse d'une precaution : le moindre champ mal relu serait reecrit
     par-dessus celui d'Hermes. Une cle, une liste, rien d'autre.

     ⚠ LE CORPS S'ENVELOPPE DANS `config`. Envoye a plat, le vrai serveur rend
     un 422 : `{"loc":["body","config"],"msg":"Field required"}`. Constate en
     direct le 2026-08-23 — l'audit avait note la route et la fusion, pas la
     forme du corps, et le faux du banc acceptait tout. Enieme fois qu'un faux
     qui ne ment pas comme le vrai ne prouve rien : le banc etait au vert. */
  autorisationsPermanentes: (liste) =>
    api("/api/config", { method: "PUT",
      body: { config: { command_allowlist: liste } } }),
  modelOptions: () => api("/api/model/options"),
  // Change le modele de la session Hermes vivante (scope main = profil) :
  // c'est exactement ce que fait /model dans Hermes. Cowork suit.
  modelSet: (provider, model) =>
    api("/api/model/set", { method: "POST",
      body: { scope: "main", provider: provider, model: model } }),
  // Ecrit l'override local (ulysse-config.js) pour le mode Discussion ou la
  // session Cowork. value vide = vider l'override (heritage du profil).
  setLocalModel: (key, value) =>
    api("/ulysse/set-model", { method: "POST", body: { key: key, value: value } }),
  // web_server.py:14275 — {daily, by_model, by_task, totals, period_days,
  // skills, tools}. Les cles internes de `totals` varient selon la version :
  // on les affiche telles quelles plutot que d'en supposer une.
  usage: (days) => api("/api/analytics/usage?days=" + (days || 30)),
  /* `pureChat` — l'appel a /proxy/chat — a ete retire le 2026-08-12 avec le
     mode pur. C'etait le seul endroit du produit qui parlait au modele SANS
     passer par l'agent : pas de session, pas d'outils, pas de lieu de travail.
     Il servait un mode qui, faute de pouvoir lire ou ecrire un fichier, ne
     servait a rien. Voir PASSE-DESIGN-UN-SEUL-FIL.md §6.
     serve.py garde sa route /proxy/chat : elle est utile pour sonder le proxy
     a la main, et la retirer serait une autre decision que celle-ci. */
};

/* ═══ 2. Couche WebSocket — JSON-RPC delimite par newline ═════════════════
   tui_gateway/ws.py:10 : « newline-delimited JSON-RPC in both directions ».
   Enveloppe d'evenement (server.py:1566) :
     {"jsonrpc":"2.0","method":"event",
      "params":{"type":…,"session_id":…,"payload":{…}}}
   Codes de fermeture : 4401 = auth refusee, 4403 = origine/surface refusee.
   ─────────────────────────────────────────────────────────────────────── */

function wsUrl(){
  const u = new URL(CFG.BASE, location.href);
  return (u.protocol === "https:" ? "wss:" : "ws:") + "//" + u.host + "/api/ws";
}

class HermesLink {
  constructor(){
    this.ws = null;
    this.state = "idle";        // idle | connecting | open | closed | denied
    this.reason = "";
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.stateListeners = new Set();
    this.retries = 0;
    // Le lien revenu, l'absence n'est plus vraie : on pourra la redire.
    this.absenceDite = false;
    this.retryTimer = null;
    this.giveUp = false;
  }

  onEvent(fn){ this.listeners.add(fn); }
  onState(fn){ this.stateListeners.add(fn); }

  _setState(s, reason){
    this.state = s;
    this.reason = reason || "";
    this.stateListeners.forEach((fn) => { try { fn(s, this.reason); } catch (e){ console.error(e); } });
  }

  connect(){
    if (this.state === "open" || this.state === "connecting") return;
    if (this.retryTimer){ clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.giveUp = false;
    this._open();
  }

  _open(){
    let ws;
    this._setState("connecting");
    try { ws = new WebSocket(wsUrl()); }
    catch (e){ this._setState("closed", e.message); this._scheduleRetry(); return; }
    this.ws = ws;

    // Le lien est utilisable des l'ouverture de la socket. Conditionner
    // « open » a la reception de gateway.ready liait tout Cowork a un
    // evenement precis : rate ou emis trop tot, plus rien ne partait.
    ws.onopen = () => { this.retries = 0; this.absenceDite = false; this._setState("open"); };

    ws.onmessage = (ev) => {
      // Une trame peut porter plusieurs objets JSON : on decoupe toujours.
      String(ev.data).split("\n").forEach((line) => {
        const s = line.trim();
        if (!s) return;
        let msg;
        try { msg = JSON.parse(s); } catch (e){ console.warn("trame WS illisible", s); return; }
        this._dispatch(msg);
      });
    };

    ws.onerror = () => { /* onclose suit toujours */ };

    ws.onclose = (ev) => {
      this.ws = null;
      this.pending.forEach((p) => { clearTimeout(p.timer); p.reject(new Error("WebSocket ferme")); });
      this.pending.clear();

      if (ev.code === 4401){
        this.giveUp = true;
        this._setState("denied", "jeton refuse (4401)");
        return;
      }
      if (ev.code === 4403){
        this.giveUp = true;
        // Deux causes possibles cote Hermes, et la premiere est de loin la
        // plus frequente : _ws_request_is_allowed() rejette l'Origin ou le
        // Host du handshake (web_server.py:14690).
        this._setState("denied", "handshake refuse : origine ou hote (4403)");
        return;
      }
      this._setState("closed", "code " + ev.code);
      this._scheduleRetry();
    };
  }

  /* ⚠ TROIS ESSAIS RATÉS, ET CE N'EST PLUS UNE COUPURE : C'EST UNE ABSENCE.
     Éprouvé le 2026-08-12 en fermant le dashboard Hermès pendant qu'Ulysse
     tournait. Le message de coupure disait « Ulysse se rebranche tout seul,
     renvoyez votre message » — vrai le matin, quand le lien était retombé seul
     et que les trois backends répondaient. Faux ici : le dashboard est MORT,
     il ne reviendra jamais, et renvoyer donnait une erreur brute.
     Corriger un mensonge par un autre n'est pas corriger. La page sait
     pourtant faire la différence : elle réessaie, et elle compte. Après trois
     échecs — environ sept secondes — le lien n'est pas lent, il est absent, et
     ça se dit. Une seule fois : répéter toutes les 30 s serait du bruit. */
  _scheduleRetry(){
    if (this.giveUp) return;
    const delays = [1000, 2000, 4000, 8000, 15000, 30000];
    const d = delays[Math.min(this.retries, delays.length - 1)];
    this.retries++;
    if (this.retries === 3 && !this.absenceDite){
      this.absenceDite = true;
      coreHooks.onSystem("Le lien ne revient pas : la fenêtre « Ulysse-Dashboard » "
        + "est probablement fermée. Relancez lancer_ulysse.bat, puis rechargez "
        + "cette page. Le fil reste affiché.");
      coreHooks.onChange();
    }
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this._open(); }, d);
  }

  _dispatch(msg){
    if (msg.id !== undefined && msg.id !== null && this.pending.has(msg.id)){
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error((msg.error.code || "") + " " + (msg.error.message || "erreur RPC")));
      else p.resolve(msg.result || {});
      return;
    }
    if (msg.method === "event" && msg.params){
      this.listeners.forEach((fn) => {
        try { fn(msg.params.type, msg.params); } catch (e){ console.error(e); }
      });
    }
  }

  rpc(method, params, timeout){
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN){
        reject(new Error("WebSocket non connecte"));
        return;
      }
      const id = this.nextId++;
      const t = timeout === 0 ? null : setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("delai depasse sur " + method));
      }, timeout || 60000);
      this.pending.set(id, { resolve: resolve, reject: reject, timer: t });
      try {
        this.ws.send(JSON.stringify({ jsonrpc: "2.0", id: id, method: method, params: params || {} }) + "\n");
      } catch (e){
        this.pending.delete(id);
        if (t) clearTimeout(t);
        reject(e);
      }
    });
  }

  ready(timeout){
    if (this.state === "open") return Promise.resolve();
    if (this.state === "denied") return Promise.reject(new Error(this.reason));
    this.connect();
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        this.stateListeners.delete(watch);
        reject(new Error("le WebSocket ne repond pas"));
      }, timeout || 15000);
      const watch = (s, reason) => {
        if (s === "open"){ clearTimeout(to); this.stateListeners.delete(watch); resolve(); }
        else if (s === "denied"){ clearTimeout(to); this.stateListeners.delete(watch); reject(new Error(reason)); }
      };
      this.stateListeners.add(watch);
    });
  }
}

const link = new HermesLink();

/* ═══ 3. Modele de conversation — alimente UNIQUEMENT par les evenements ══
   Aucune donnee fictive : ce que le Plan et l'Historique affichent vient du
   flux, ou n'est pas affiche. C'est la regle STU-1 de endpoints-ulysse.md.
   ─────────────────────────────────────────────────────────────────────── */

const conv = {
  sessionId: null,   // session vivante (session.create)
  storedId: null,    // identifiant persiste (stored_session_id)
  info: null,        // dernier session.info
  status: null,      // derniere status.update
  running: false,
  lastEventAt: null, // horodatage du dernier evenement du gateway reçu pendant
                      // ce tour — sert a mesurer un silence, jamais a montrer
                      // un chrono brut (voir armTurnWatchdog).
  approval: null,
  turns: [],
  /* ⚠ VRAIE, MAIS PAS ENTIÈRE. `resumeSession` reconstruit le texte des tours
     (voir plus bas), mais `session.resume` ne rend le contenu structuré
     d'AUCUN outil — pour `todo`, il rend « planning 6 task(s) », jamais la
     liste {id, content, status} que `lireTodo()` sait lire. Impossible donc de
     reconstruire le graphe du Plan après une reprise, MÊME quand le texte du
     tour dit noir sur blanc que l'agent l'a posé.
     Ce drapeau distingue « aucun outil n'a été utilisé » (silence honnête) de
     « des outils ont été utilisés mais on ne peut plus les montrer » (silence
     qui mentirait). Il retombe au premier événement live — un nouveau tour
     REND la vraie reconstruction possible, la mise en garde n'a plus lieu
     d'être. */
  resumed: false
};
const studioLog = [];
let turnSeq = 0;

function newTurn(role, text){
  const t = { key: ++turnSeq, role: role, text: text || "", tools: [], reasoning: "",
              sawDelta: false, state: role === "assistant" ? "streaming" : "done", ts: Date.now() };
  conv.turns.push(t);
  return t;
}

/* ⚠ POURQUOI LA MARQUE « INTERROMPU » NE PEUT PAS SE TROMPER — et pourquoi la
   précaution que j'avais écrite était du code mort.
   J'avais ajouté un `_laverInterruption()` appelé sur `message.delta` et
   `tool.start`, pour lever la marque si le tour finissait par répondre. Le
   garde correspondant est tombé du premier coup, et il avait raison : la
   boucle ci-dessous s'ARRÊTE au premier tour utilisateur en remontant. Une
   fois la correction envoyée, le tour d'avant n'est plus atteignable — tout
   ce qui arrive ensuite, même la fin de sa réponse à lui, entre dans un tour
   NEUF. La marque est donc définitive parce que le bloc l'est.
   La précaution ne protégeait de rien et affirmait le contraire : retirée.
   Un commentaire qui promet ce que le code ne fait pas est le défaut qu'on a
   passé la journée à réparer. */
function currentAssistantTurn(){
  for (let i = conv.turns.length - 1; i >= 0; i--){
    const t = conv.turns[i];
    if (t.role === "assistant") return t.state === "streaming" ? t : newTurn("assistant");
    if (t.role === "user") break;
  }
  return newTurn("assistant");
}

function findTool(toolId){
  for (let i = conv.turns.length - 1; i >= 0; i--){
    const tools = conv.turns[i].tools;
    for (let j = tools.length - 1; j >= 0; j--) if (tools[j].id === toolId) return tools[j];
  }
  return null;
}

/* Chien de garde : `running` masque le composer. Sans lui, un tour qui se
   termine sans message.complete (agent tue, evenement perdu) laisse la
   saisie bloquee pour de bon, sans erreur ni explication. */
const TURN_SILENCE_MS = 180000;
let turnWatchdog = null;
/* `refusDeMode(payload)` rend la PHRASE du refus, ou "" pour laisser passer.
   Elle est branchee par ulysse-app.js, qui seul connait le mode : le noyau
   parle le protocole, il ne connait pas les ecrans. */
const coreHooks = { onChange: () => {}, onSystem: () => {}, onChanged: () => {},
                    refusDeMode: () => "" };

function armTurnWatchdog(){
  clearTimeout(turnWatchdog);
  if (!conv.running){ conv.lastEventAt = null; return; }
  conv.lastEventAt = Date.now();
  turnWatchdog = setTimeout(() => {
    if (!conv.running) return;
    conv.running = false;
    conv.status = null;
    coreHooks.onSystem("Aucun evenement depuis 3 minutes : la saisie est rendue. "
      + "Si l'agent travaille encore, sa reponse s'affichera a son arrivee.");
    coreHooks.onChange();
  }, TURN_SILENCE_MS);
}

/* --- Reducteur : un evenement du gateway -> etat de la conversation -------
   Tous les noms d'evenements ci-dessous existent dans tui_gateway/*.py.
   Les cles de payload aussi (tool_id, name, context, args_text, inline_diff).
   -------------------------------------------------------------------------- */
link.onEvent((type, params) => {
  const pl = params.payload || {};
  studioLog.push({ t: new Date(), type: type, sid: params.session_id || "", payload: pl });
  if (studioLog.length > CFG.STUDIO_LOG_MAX) studioLog.splice(0, studioLog.length - CFG.STUDIO_LOG_MAX);
  armTurnWatchdog();

  switch (type){
    case "message.start":
      // Un vrai tour live commence : la reconstruction redevient possible,
      // la mise en garde de la reprise n'a plus lieu d'être.
      conv.resumed = false;
      newTurn("assistant");
      break;

    case "message.delta": {
      const t = currentAssistantTurn();
      t.text += pl.text || "";
      t.sawDelta = true;
      break;
    }

    case "reasoning.delta":
    case "thinking.delta": {
      const t = currentAssistantTurn();
      t.reasoning += pl.text || "";
      break;
    }

    // Un aperçu de raisonnement livré d'un bloc (server.py:5498), et non
    // token par token. Même destination que les deltas : c'est la même
    // matière, elle arrive juste autrement.
    case "reasoning.available": {
      const t = currentAssistantTurn();
      if (pl.text && t.reasoning.indexOf(pl.text) < 0) t.reasoning += pl.text;
      break;
    }

    case "message.complete": {
      const t = currentAssistantTurn();
      if (!t.sawDelta && pl.text) t.text = pl.text;   // les deltas ont deja peint
      t.state = pl.status === "error" ? "error" : "done";
      conv.running = false;
      conv.status = null;
      conv.approval = null;
      clearTimeout(turnWatchdog);
      break;
    }

    /* Le fichier qu'un outil vient de toucher — DEDUIT DE CE QU'IL A FAIT,
       pas de ce que l'agent a pense a ecrire.

       C'etait la reserve du §5 de PASSE-DESIGN-FICHIERS.md, et elle est levee
       en lisant Hermes :
       · `tool.complete` porte **`args`, le dict complet, TOUJOURS**
         (server.py:5423) — ce n'est pas conditionne au mode verbeux ;
       · la cle est **`path`** pour `read_file`, `write_file` et `patch` : ce
         n'est pas une supposition, c'est la table d'Hermes lui-meme
         (agent/display.py:443, `primary_args`).
       En face, `tool.start.context` est un APERCU tronque a 80 caracteres et
       `args_text` n'arrive qu'en mode verbeux : ni l'un ni l'autre ne sert a
       designer un fichier.

       LISTE FERMEE, et volontairement. « path » ne veut pas dire la meme chose
       pour tous les outils ; on ne nomme que ceux dont Hermes dit qu'il s'agit
       du fichier principal. Un outil de plus se rajoute ici, en connaissance
       de cause — jamais en devinant. */
    case "tool.start": {
      const t = currentAssistantTurn();
      t.tools.push({ id: pl.tool_id, name: pl.name || "outil", context: pl.context || "",
                     args: pl.args_text || "", state: "running", t0: Date.now(), result: "" });
      break;
    }

    case "tool.complete": {
      const chemin = cheminDeLOutil(pl.name, pl.args);
      const tool = findTool(pl.tool_id);
      /* ⚠ UN RESULTAT PEUT ETRE UN OBJET, et « ▸ resultat » affichait alors
         « [object Object] » — un depliant qui ne deplie rien. Vu le
         2026-08-12 sur l'outil `todo`, contre le vrai Hermes. On rend l'objet
         lisible plutot que de le laisser se degrader en une seule ligne. */
      const brutRes = pl.inline_diff || pl.result;
      const texteRes = brutRes && typeof brutRes === "object"
        ? JSON.stringify(brutRes, null, 2) : brutRes;
      if (tool){
        tool.state = "done";
        tool.ms = Date.now() - tool.t0;
        tool.result = texteRes || tool.result || "";
        tool.path = chemin;
        if (pl.name) tool.name = pl.name;
      } else {
        const t = currentAssistantTurn();
        t.tools.push({ id: pl.tool_id, name: pl.name || "outil", context: "", state: "done",
                       t0: Date.now(), ms: 0, path: chemin,
                       result: texteRes || "" });
      }
      /* ⚠ LE PLAN ARRIVE PAR ICI, ET PAR NULLE PART AILLEURS.
         Hermes n'emet AUCUN evenement de plan — les 60 `_emit(...)` du serveur
         ont ete releves, il n'y en a pas. Mais l'outil `todo`
         (tools/todo_tool.py) tient une liste ordonnee, une par session, et
         CHAQUE APPEL RENVOIE LA LISTE COMPLETE : {id, content, status}.
         C'est un signal lisible, pas une devinette — et on ne devine JAMAIS
         un plan dans le texte : compter des puces ferait apparaitre le bouton
         sur une reponse qui enumere trois restaurants.
         Voir PASSE-DESIGN-UN-SEUL-FIL.md §4. */
      if (String(pl.name || "").toLowerCase() === "todo"){
        // On lit le BRUT, pas le texte : l'objet porte la structure, la chaine
        // ne porte que son apparence.
        const etapes = lireTodo(brutRes || pl.result || "");
        if (etapes) currentAssistantTurn().plan = etapes;
      }
      break;
    }

    case "status.update":
      conv.status = { kind: pl.kind || "", text: pl.text || "" };
      break;

    case "session.info":
      conv.info = pl;
      break;

    /* ⚠ LA PORTE QUI APPLIQUE LE MODE — ET QUI NE COUTE PAS UN TOKEN.
       En mode Plan, ecrire et executer sont refuses ICI, avant meme
       d'afficher la question. C'est un refus STRUCTUREL : la ligne de cadre
       envoyee dans le tour dit a l'agent de ne rien modifier, mais si le
       modele l'oublie, la porte tient quand meme. Une garantie qui repose sur
       la bonne volonte du modele n'est pas une garantie.

       Rien n'est envoye au moteur pour ca : `respondApproval("deny")` est un
       appel local a la gateway, pas un tour de modele.
       Voir PASSE-DESIGN-UN-SEUL-FIL.md §3. */
    case "approval.request": {
      const refus = coreHooks.refusDeMode && coreHooks.refusDeMode(pl);
      if (refus){
        conv.approval = null;
        const t = newTurn("system", refus);
        t.state = "done";
        t.refusMode = true;
        respondApproval("deny").catch(() => {});
        break;
      }
      conv.approval = pl;
      break;
    }

    case "error": {
      const t = newTurn("error", pl.message || "erreur inconnue");
      t.state = "error";
      conv.running = false;
      conv.approval = null;
      clearTimeout(turnWatchdog);
      break;
    }

    // Le backend annonce lui-meme ce qui a bouge — c'est ce que veut dire
    // `change_events: true` dans le payload de gateway.ready. Les listes
    // n'ont donc pas a etre sondees : elles se rafraichissent quand elles
    // changent, et pas toutes les N secondes pour rien.
    case "sessions.changed":
      coreHooks.onChanged("sessions");
      break;
    case "cron.changed":
      coreHooks.onChanged("cron");
      break;
    case "platforms.changed":
      coreHooks.onChanged("platforms");
      break;

    default:
      break;   // les autres evenements alimentent le journal du Studio
  }
  coreHooks.onChange();
});

link.onState((s) => {
  if (s === "closed" || s === "denied"){
    conv.running = false;
    conv.approval = null;
    clearTimeout(turnWatchdog);
    // La session vivante appartient a la connexion : le gateway la detruit a
    // la fermeture du WebSocket. Garder son identifiant faisait envoyer les
    // prompts suivants a une session morte, silencieusement.
    /* ⚠ CE MESSAGE PROMETTAIT CE QU'IL NE POUVAIT PAS TENIR. Il disait « le
       prochain message en ouvrira une nouvelle » — mais le lien VIENT d'être
       coupé : le prochain message n'ouvrira rien du tout, il tombera sur
       l'erreur de `submitPrompt`. Deux messages qui se contredisent à une
       minute d'intervalle, et c'est le premier qu'on lit.
       Il ne promet donc plus qu'une chose vraie : la session est perdue.

       ⚠ ET IL NE RENVOIE PLUS VERS LA DISCUSSION. Il disait « ou passez en
       Discussion : elle n'a pas besoin de ce lien » — c'etait vrai tant que
       le mode pur existait. Il a ete retire le 2026-08-12 : les deux modes
       passent par ce lien, et l'issue proposee etait devenue une impasse.
       Le banc ne l'a pas vu — il verifie qu'un message dit QUOI FAIRE, pas
       que ce qu'il dit soit encore vrai. Trouve en relisant. */
    /* ⚠ ET IL ENVOYAIT RELANCER LE .BAT POUR RIEN. Il disait « Relancez
       lancer_ulysse.bat, puis renvoyez votre message ». Mesure du 2026-08-12,
       au moment meme d'une coupure vue en jouant un scenario : les trois
       backends repondaient (8080, 9123, 8645), `link.state` etait DEJA revenu
       a « open » — `_scheduleRetry()` reconnecte tout seul — et le message
       suivant est parti sans rien relancer. Le conseil etait donc faux, et
       cher : relancer le .bat tue des backends vivants et `serve.py` refuse
       un port pris.
       Ce qui reste vrai, et c'est tout ce qu'on dit : la session est perdue,
       et Ulysse se rebranche seul. */
    /* ⚠ ET CE MESSAGE A ETE CORRIGE DEUX FOIS DANS LA MEME JOURNEE.
       Il disait d'abord « relancez lancer_ulysse.bat » alors que tout tournait.
       Il a ensuite dit « Ulysse se rebranche TOUT SEUL » — vrai ce matin-la,
       faux le soir : en fermant le dashboard on a vu que le lien ne revenait
       jamais, et renvoyer donnait une erreur brute.
       Corriger un mensonge par un autre n'est pas corriger. Il n'affirme donc
       plus l'issue : il dit ce qu'Ulysse FAIT. Si le lien ne revient pas,
       `_scheduleRetry` le dira lui-meme, apres trois essais — parce qu'a ce
       moment-la on le SAIT, au lieu de le supposer. */
    if (conv.sessionId){
      coreHooks.onSystem("Lien interrompu : la session en cours est perdue. "
        + "Ulysse essaie de se rebrancher — si le lien revient, renvoyez votre "
        + "message. Le fil reste affiche.");
    }
    conv.sessionId = null;
    conv.info = null;
    conv.status = null;
  }
  coreHooks.onChange();
});

/* ═══ 4. Actions ═════════════════════════════════════════════════════════ */

/* session.create — methods_session.py:14.
   Params reconnus : cwd, model, cols, title, source, profile, messages…
   Retour : {session_id, stored_session_id, message_count, messages, info}. */
async function ensureSession(extra){
  await link.ready();
  if (conv.sessionId) return conv.sessionId;

  /* Profil « ulysse » (demande Raf le 2026-09-05) : le chat Ulysse est une
     ENTITÉ VIERGE — ni les sessions, ni la mémoire vive de l'Hermès Discord/CLI.
     Il vit dans son propre Hermes Home (~/.hermes/profiles/ulysse) : ses
     sessions y sont isolées, sa mémoire commence à zéro. L'identité de Raf
     (SOUL/USER/MEMORY) et les skills y ont été copiées à la main. */
  const params = Object.assign({ cols: 100, source: "ulysse", profile: "ulysse" }, extra || {});
  if (CFG.SESSION_CWD && !params.cwd) params.cwd = CFG.SESSION_CWD;
  if (CFG.SESSION_MODEL && !params.model) params.model = CFG.SESSION_MODEL;

  const res = await link.rpc("session.create", params, 60000);
  if (!res || !res.session_id){
    throw new Error("session.create n'a pas renvoye de session_id");
  }
  conv.sessionId = res.session_id;
  conv.storedId = res.stored_session_id || null;
  if (res.info) conv.info = res.info;
  return conv.sessionId;
}

/* prompt.submit — methods_prompt.py:67, params {session_id, text}.
   La reponse peut n'arriver qu'a la fin du tour : on ne bloque pas dessus,
   l'affichage vit des evenements. */
/* ⚠ DEUX TEXTES, ET UN SEUL SE LIT. `sent` part au moteur, `shown` se peint
   dans le fil. Le preambule de role connaissait deja cette couture ; la ligne
   de mode et les references « @file: » ne la connaissaient pas — les
   appelants les collaient DANS `text`, donc dans les deux. Resultat mesure en
   jouant un scenario le 2026-08-12 : chaque tour affichait une deuxieme bulle
   « Vous » disant « [Mode Plan : ...] », que personne n'avait ecrite, et un
   fichier joint apparaissait en clair « @file:.hermes/desktop-attachments/… ».
   `opts.suffix` est le meme droit que `opts.preamble`, de l'autre cote : ca
   part, ca ne s'affiche pas. C'est ce que le commentaire de `onSend`
   promettait deja — il promettait a faux. */
async function submitPrompt(text, opts){
  opts = opts || {};
  const shown = text;
  const sent = (opts.preamble ? opts.preamble + "\n\n" : "") + text
             + (opts.suffix || "");

  /* ⚠ ON NE FAIT PAS ATTENDRE POUR UNE RÉPONSE QU'ON CONNAÎT DÉJÀ.
     Le lien coupé, `ensureSession` appelait quand même `link.ready()`, qui
     attend 15 secondes avant d'abandonner. Pendant ces 15 secondes l'écran
     disait « l'agent travaille… » — pour un agent qui ne recevrait jamais
     rien. La page SAVAIT pourtant : `link.state` valait « closed », et la
     barre d'état l'affichait déjà.
     Constaté en éprouvant les chemins dégradés, le 2026-08-12.

     ⚠ L'ISSUE « passez en Discussion » A ETE RETIREE le meme jour, quand le
     mode pur a disparu : les deux modes passent par ce lien. Une issue qui
     n'ouvre plus est pire qu'une absence d'issue — on la prend, et on se
     retrouve devant la meme porte. */
  if (link.state === "closed" || link.state === "denied"){
    const mort = newTurn("user", shown);
    if (opts.jointes && opts.jointes.length) mort.jointes = opts.jointes;
    mort.state = "done";
    const err = newTurn("error",
      "Le lien avec l'agent est coupé" + (link.reason ? " (" + link.reason + ")" : "")
      + " — votre message n'est pas parti. Ulysse réessaie de se rebrancher : "
      + "renvoyez-le dans un instant. S'il ne revient pas, relancez "
      + "lancer_ulysse.bat. Le fil reste affiché.");
    err.state = "error";
    conv.running = false;
    coreHooks.onChange();
    return;
  }

  /* ═══ LE TOUR QU'ON COUPE EN CORRIGEANT ═══════════════════════════════════
     Vu en jouant un scénario le 2026-08-12 : on corrige sa demande pendant que
     l'agent travaille, il repart sur la correction — et le premier bloc
     « Ulysse » reste vide POUR TOUJOURS, sans un mot. En relisant le fil le
     lendemain, on voit Ulysse ne rien répondre et on ne sait pas pourquoi.

     Tranché par kuchu : le marquer TOUT DE SUITE, pas à la fermeture du tour.
     Attendre voulait dire attendre le chien de garde — trois minutes d'un bloc
     muet, ce qui est précisément le défaut qu'on répare.

     ⚠ ET ELLE NE PEUT PAS ACCUSER À TORT — mais pas pour la raison que je
     croyais. J'avais écrit un mécanisme pour LEVER la marque si le tour
     finissait par répondre. Le garde correspondant est tombé du premier coup :
     `currentAssistantTurn()` s'arrête au premier tour utilisateur en
     remontant, donc dès que la correction est envoyée, le tour d'avant n'est
     plus atteignable — la suite de sa réponse, s'il en produit une, entre dans
     un tour NEUF. Le bloc marqué restera vide quoi qu'il arrive.
     La marque est donc exacte par construction, et la précaution était du
     code mort qui prétendait le contraire. Retirée. */
  for (let i = conv.turns.length - 1; i >= 0; i--){
    const p = conv.turns[i];
    if (p.role === "user") break;
    if (p.role === "assistant" && p.state === "streaming"
        && !p.text && !(p.tools && p.tools.length)){
      p.interrompu = true;
      break;
    }
  }
  const t = newTurn("user", shown);
  if (opts.preambleLabel) t.preamble = opts.preambleLabel;
  /* Ce qu'on a joint se voit dans SA bulle, en puces — comme avant l'envoi.
     Une image collee ne laissait AUCUNE trace dans le fil (mesure : zero
     <img>, zero nom) : on ne pouvait plus dire, en relisant, quelle image on
     avait envoyee. */
  if (opts.jointes && opts.jointes.length) t.jointes = opts.jointes;
  t.state = "done";
  conv.running = true;
  conv.status = { kind: "", text: "connexion a l'agent…" };
  coreHooks.onChange();

  try {
    const sid = await ensureSession(opts.session);
    conv.status = { kind: "", text: "l'agent travaille…" };
    armTurnWatchdog();
    link.rpc("prompt.submit", { session_id: sid, text: sent }, 0)
      .catch((e) => {
        conv.running = false;
        /* Le message partait en brut : « prompt.submit : WebSocket ferme ».
           C'est le nom de la methode et le texte de l'exception — la personne
           n'en fait rien. Le tour est deja affiche dans le fil, donc elle voit
           un message qui semble parti et qui ne l'est pas : il faut le dire
           franchement, et dire quoi faire. */
        coreHooks.onSystem("Votre message n'est pas parti : le lien avec "
          + "l'agent s'est coupé en route. Ulysse se rebranche seul — "
          + "renvoyez-le dans un instant ; s'il ne revient pas, relancez "
          + "lancer_ulysse.bat. (" + e.message + ")");
        coreHooks.onChange();
      });
  } catch (e){
    /* ⚠ « Impossible d'ouvrir la session : le WebSocket ne repond pas » — vrai,
       et c'est un mur poli. C'est le nom d'une brique et le texte d'une
       exception : la personne apprend que ca a rate, et rien d'autre. Le
       fichier a deja sa regle pour ca, `pannePhrase` : dire QUE ca a rate,
       POURQUOI en mots utiles, et QUOI FAIRE. Elle ne servait pas ici.
       Vu en fermant le dashboard Hermes pendant qu'Ulysse tournait. */
    conv.running = false;
    const err = newTurn("error",
      "Votre message n'est pas parti : Ulysse n'a pas pu ouvrir de session "
      + "aupres d'Hermes. La fenetre « Ulysse-Dashboard » est probablement "
      + "fermee — relancez lancer_ulysse.bat, puis rechargez cette page. ("
      + e.message + ")");
    err.state = "error";
  }
  coreHooks.onChange();
}

/* Relancer SANS interrompre — `session.steer` (tui_gateway/methods_session.py),
   sonde en reel le 20/08/2026 : le texte se glisse dans le prochain resultat
   d'outil, `conv.running` ne bouge pas, aucun nouveau tour n'est force cote
   Hermes. La croix (`interruptTurn`) reste le SEUL geste qui coupe le tour —
   celui-ci n'agit que tant qu'un tour tourne deja.
   ⚠ C'EST UN SIGNAL AU MIEUX, PAS UN ORDRE. La sonde a montre que le modele
   ne l'acquitte pas forcement dans sa reponse : le texte arrive comme un
   RESULTAT D'OUTIL, pas comme un message direct — l'agent peut le lire comme
   du contexte plutot que comme une instruction a satisfaire tout de suite. */
async function steerTurn(text){
  if (!conv.sessionId || !conv.running) return false;
  try {
    const r = await link.rpc("session.steer", { session_id: conv.sessionId, text: text }, 15000);
    return !!(r && (r.status === "queued" || r.status === "steered"));
  } catch (e){
    coreHooks.onSystem("La relance n'est pas partie : " + e.message);
    return false;
  }
}

async function interruptTurn(){
  if (!conv.sessionId) return;
  try { await link.rpc("session.interrupt", { session_id: conv.sessionId }, 15000); }
  catch (e){ coreHooks.onSystem("Interruption : " + e.message); }
  conv.running = false;
  coreHooks.onChange();
}

/* Lire la liste `todo` d'un resultat d'outil. Le contenu arrive en texte : on
   y cherche le JSON, parce que le format exact du resultat n'est pas garanti
   et qu'un jour il portera peut-etre une phrase autour.

   ⚠ ON NE RETIENT QUE CE QUI A LA BONNE FORME. Un objet sans `content` ou
   sans `status` n'est pas une etape — mieux vaut ne pas afficher de plan que
   d'en afficher un faux, parce qu'on VALIDE ce plan-la en appuyant. */
function lireTodo(brut){
  /* ⚠ LE RESULTAT N'EST PAS UNE CHAINE. Ecrite en supposant du texte, cette
     fonction faisait `String(brut)` sur un OBJET et lisait « [object Object] »
     — donc aucun plan, jamais. Trouve le 2026-08-12 en jouant un scenario
     reel contre le vrai Hermes : l'agent avait bien appele `todo`, et l'encart
     restait vide. Le banc ne pouvait pas le voir, son faux envoyait du JSON en
     texte. Un faux qui ne parle pas comme le vrai n'eprouve rien. */
  let liste = null;
  if (Array.isArray(brut)) liste = brut;
  else if (brut && typeof brut === "object"){
    for (const k of ["todos", "items", "list", "result", "value"]){
      if (Array.isArray(brut[k])){ liste = brut[k]; break; }
    }
  } else {
    const s = String(brut || "");
    const d = s.indexOf("["), f = s.lastIndexOf("]");
    if (d < 0 || f <= d) return null;
    try { liste = JSON.parse(s.slice(d, f + 1)); } catch (e){ return null; }
  }
  if (!Array.isArray(liste) || !liste.length) return null;
  const etapes = liste
    .filter((it) => it && typeof it === "object" && it.content)
    .map((it) => ({ contenu: String(it.content),
                    etat: String(it.status || "pending").toLowerCase() }));
  return etapes.length ? etapes : null;
}

/* approval.respond — methods_prompt.py:949, params {session_id, choice, all?}.
   Le protocole ne porte AUCUN identifiant de demande : tools/approval.py:2506
   resout la file de la session en FIFO. Inventer un request_id serait
   inventer une API qui n'existe pas. */
function respondApproval(choice, all){
  return link.rpc("approval.respond",
    { session_id: conv.sessionId, choice: choice, all: !!all }, 20000);
}

/* session.resume — methods_session.py:306. Prend l'identifiant PERSISTE
   (celui de GET /api/sessions) et renvoie un NOUVEAU session_id vivant.

   ⚠ LA MÉMOIRE RÉELLE TIENT. LE FIL, LUI, ÉTAIT MUET. Éprouvé le 2026-08-12 en
   fermant l'onglet pour de vrai (pas juste la coupure du lien), en rouvrant, et
   en reprenant depuis l'historique (alors « Travaux ») : demander à l'agent de rappeler un secret donné
   AVANT la fermeture a fonctionné — le contexte serveur est intact. Mais le
   fil affichait l'ACCUEIL par-dessus trois bulles vides : `contentToText(m.content)`
   lisait un champ `content` qui n'existe PAS dans la réponse réelle
   d'Hermès — chaque message porte `text` directement, jamais `content`.
   `paintThread()` traite alors `conv.turns.length === 0` comme vrai (le texte
   est vide sur les trois tours) et affiche l'accueil au-dessus de bulles
   fantômes.

   ⚠ ET UN RÔLE INCONNU PRODUISAIT UNE BULLE VIDE, PAS UN OUBLI HONNÊTE.
   Un message d'appel d'outil (`role: "tool"`, `{name, context}`, sans texte)
   tombait dans la branche `else → "system"` et créait un tour "system" sans
   contenu — une marque muette dans le fil, sans rien pour l'expliquer. Le
   reconstruire fidèlement (le rattacher au tour assistant qui l'a lancé,
   comme `tool.start` le fait en direct) demanderait de rejouer l'appariement
   complet ; l'ignorer, lui, ne ment pas. Un fil qui omet un détail qu'il ne
   sait pas reconstruire est honnête ; un fil qui affiche une marque vide à sa
   place ne l'est pas. */
async function resumeSession(storedId){
  await link.ready();
  const res = await link.rpc("session.resume", { session_id: storedId, cols: 100 }, 90000);
  if (!res || !res.session_id) throw new Error("session.resume n'a pas renvoye de session_id");
  conv.sessionId = res.session_id;
  conv.storedId = res.session_key || storedId;
  conv.info = res.info || null;
  conv.turns = [];
  conv.resumed = true;
  (res.messages || []).forEach((m) => {
    if (m.role !== "user" && m.role !== "assistant") return;
    const t = newTurn(m.role, typeof m.text === "string" ? m.text : contentToText(m.content));
    t.state = "done";
  });
  conv.running = !!res.running;
  coreHooks.onChange();
  return res;
}

// Les outils dont l'argument `path` designe LE fichier de l'appel. Source :
// `primary_args` dans agent/display.py:443, cote Hermes.
const OUTILS_A_FICHIER = { read_file: 1, write_file: 1, patch: 1 };

function cheminDeLOutil(nom, args){
  if (!OUTILS_A_FICHIER[nom] || !args || typeof args !== "object") return "";
  const p = args.path;
  if (typeof p !== "string" || !p) return "";
  // L'agent ecrit souvent un chemin RELATIF a son dossier de travail
  // (« web/CONTRAT-INTERFACE.md »). `/api/files/read` veut un chemin qu'il
  // sache resoudre : on prefixe avec le cwd de la session EN COURS.
  if (/^([a-zA-Z]:[\\/]|[\\/]|\\\\)/.test(p)) return p;
  const base = (conv.info && conv.info.cwd) || "";
  return base ? base.replace(/[\\/]+$/, "") + "/" + p : p;
}

/* Joindre un fichier. Le navigateur n'a PAS de chemin que le gateway puisse
   ouvrir : le fichier n'existe que sur le disque du client. Il envoie donc les
   octets, et le gateway materialise. Mais les images et les autres fichiers ne
   passent pas par la meme porte, et les trois portes n'ont pas le meme contrat.

   · `file.attach` (methods_prompt.py:640) — accepte `data_url`, garde le
     fichier comme un ARTEFACT LISIBLE et renvoie `ref_text` (« @file:… »),
     la reference que les outils de l'agent savent lire.
   · `image.attach` (methods_prompt.py:410) — veut un `path` **que le gateway
     voit sur son propre disque**. Il ne regarde jamais `data_url`.
   · `image.attach_bytes` (methods_prompt.py:453) — prend `content_base64`,
     ecrit les octets dans le dossier d'images du gateway et les met dans
     `session["attached_images"]`. Sa docstring decrit exactement notre cas :
     *« a web dashboard running on a DIFFERENT machine than the gateway can't
     hand us a local path »*.

   ⚠ CE CODE APPELAIT `image.attach` AVEC UN `data_url`. Le gateway repondait
   **`4016 image not found: <nom>`** — pour une image collee comme pour une
   image passee par le « + », et depuis toujours. Le banc d'essai ne pouvait
   pas le voir : son faux Hermes acceptait n'importe quel appel. Constate en
   direct le 2026-08-11, contre le vrai gateway.

   ⚠ UNE IMAGE NE RENVOIE PAS DE REFERENCE, et c'est normal : elle ne se lit
   pas, elle se REGARDE. Elle est mise en file sur la session et part avec le
   prochain tour, ou `agent/image_routing.py` decide de la donner en pixels ou
   de la faire decrire. Il ne faut donc RIEN ajouter au message — `refsJointes()`
   ecarte les pieces sans `ref`, ce qui est le comportement voulu. */
async function attacherFichier(file){
  const sid = await ensureSession();
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("lecture du fichier impossible"));
    r.readAsDataURL(file);
  });
  const image = (file.type || "").indexOf("image/") === 0;
  const res = image
    ? await link.rpc("image.attach_bytes",
        { session_id: sid, content_base64: dataUrl, filename: file.name }, 120000)
    : await link.rpc("file.attach",
        { session_id: sid, path: file.name, data_url: dataUrl, name: file.name }, 120000);
  return {
    // ⚠ POUR UNE IMAGE, ON GARDE LE NOM D'ORIGINE. `image.attach_bytes` rend
    // le nom qu'il a ECRIT dans son dossier — « upload_20260811_194446_1.png »,
    // constate en direct. C'est un nom interne au gateway : la personne a
    // choisi « photo-vacances.png » et ne reconnaitrait pas le sien.
    // Pour `file.attach` c'est l'inverse : son `name` est celui du fichier
    // range dans l'espace de la session, donc celui que « @file: » designe.
    name: (image ? file.name : (res && res.name)) || file.name,
    ref: (res && res.ref_text) || "",
    image: image,
    size: file.size
  };
}

/* Joindre un fichier de L'ÉTABLI (glisser-déposer) — pas du « + ». La
   différence tient en un mot : `path`. L'Établi lit déjà le disque QUE le
   gateway voit — c'est le même — donc pas besoin d'envoyer les octets comme
   `attacherFichier()` le fait pour un fichier venu du système du navigateur.
   `image.attach` / `file.attach` prennent un `path` seul pour exactement ce
   cas (méthodes_prompt.py, tui_gateway) : c'est la voie courte, pas un
   deuxième mécanisme. */
async function attacherCheminEtabli(path, name, image){
  const sid = await ensureSession();
  const res = image
    ? await link.rpc("image.attach", { session_id: sid, path: path }, 120000)
    : await link.rpc("file.attach", { session_id: sid, path: path, name: name }, 120000);
  return {
    name: (image ? name : (res && res.name)) || name,
    ref: (res && res.ref_text) || "",
    image: image
  };
}

function resetSession(){
  conv.sessionId = null;
  conv.storedId = null;
  conv.info = null;
  conv.status = null;
  conv.running = false;
  conv.approval = null;
  conv.turns = [];
  conv.resumed = false;
  studioLog.length = 0;
  clearTimeout(turnWatchdog);
  coreHooks.onChange();
}

/* ═══ 5. Utilitaires de format ═══════════════════════════════════════════ */

function contentToText(c){
  if (typeof c === "string") return c;
  if (Array.isArray(c)){
    return c.map((p) => (typeof p === "string" ? p : (p && (p.text || p.content)) || "")).join("");
  }
  if (c && typeof c === "object") return c.text || c.content || "";
  return "";
}

function shorten(s, n){
  s = String(s === null || s === undefined ? "" : s);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmtBytes(n){
  if (n === null || n === undefined) return "—";
  if (n < 1024) return n + " o";
  if (n < 1048576) return (n / 1024).toFixed(1) + " Ko";
  if (n < 1073741824) return (n / 1048576).toFixed(1) + " Mo";
  return (n / 1073741824).toFixed(2) + " Go";
}

/* Hermes date de deux facons selon l'endpoint : un nombre (epoch en s ou en
   ms) ou une chaine ISO. On accepte les deux plutot que d'afficher un tiret. */
function fmtWhen(ts){
  if (ts === null || ts === undefined || ts === "") return "—";
  let d;
  if (typeof ts === "string"){
    const n = Number(ts);
    d = Number.isFinite(n) && ts.trim() !== "" ? new Date(n > 1e12 ? n : n * 1000) : new Date(ts);
  } else {
    d = new Date(ts > 1e12 ? ts : ts * 1000);
  }
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/* La meme date, en forme COURTE — pour une liste ou l'on compare des lignes,
   pas pour un champ ou l'on lit une date. Aujourd'hui : l'heure seule, la
   seule chose qui distingue deux conversations du jour. Cette annee : le
   jour et le mois. Au-dela : l'annee sur deux chiffres.
   Ce n'est pas un raccourci d'affichage gratuit : « 22/08/2026 09:07 » tenait
   110px de large fixe dans une liste de 250, et c'est le TITRE qui payait.
   La date complete reste servie par `fmtWhen`, en infobulle. */
function fmtQuandCourt(ts){
  const plein = fmtWhen(ts);
  if (plein === "—") return plein;
  let d;
  if (typeof ts === "string"){
    const n = Number(ts);
    d = Number.isFinite(n) && ts.trim() !== "" ? new Date(n > 1e12 ? n : n * 1000) : new Date(ts);
  } else {
    d = new Date(ts > 1e12 ? ts : ts * 1000);
  }
  const now = new Date();
  const memeJour = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (memeJour){
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  const p2 = (n) => String(n).padStart(2, "0");
  const jourMois = p2(d.getDate()) + "/" + p2(d.getMonth() + 1);
  return d.getFullYear() === now.getFullYear()
    ? jourMois
    : jourMois + "/" + String(d.getFullYear()).slice(-2);
}

function fmtDur(ms){
  if (!ms && ms !== 0) return "";
  return ms < 1000 ? Math.round(ms) + " ms" : (ms / 1000).toFixed(1) + " s";
}

/* Une data URL n'est pas forcement en base64 : sans « ;base64 » avant la
   virgule, la charge est en percent-encoding et atob() la casse. */
function decodeDataUrlText(dataUrl){
  const i = String(dataUrl || "").indexOf(",");
  if (i < 0) return null;
  const meta = dataUrl.slice(0, i), payload = dataUrl.slice(i + 1);
  try {
    if (!/;base64$/i.test(meta)) return decodeURIComponent(payload);
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e){ return null; }
}

/* Le backend renvoie le fichier ENTIER en base64 (+33 %). Au-dela de cette
   taille l'onglet se fige : on refuse l'apercu plutot que de le tenter. */
const PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

if (typeof module === "object" && module.exports){
  module.exports = { CFG, api, REST, HermesLink, link, conv, studioLog,
                     ensureSession, submitPrompt, interruptTurn, steerTurn, respondApproval,
                     resumeSession, resetSession, coreHooks, newTurn,
                     contentToText, shorten, fmtBytes, fmtWhen, fmtDur,
                     decodeDataUrlText, PREVIEW_MAX_BYTES, ApiError };
}
