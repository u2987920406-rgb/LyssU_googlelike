/* ============================================================================
 * test_page.js — la page se monte-t-elle vraiment ?
 * ----------------------------------------------------------------------------
 * Les tests Python verifient le cablage (page -> serve.py -> Hermes). Ils ne
 * disent rien de ce qui se passe DANS la page : un identifiant mal orthographie,
 * une icone absente, un panneau qui n'existe pas — rien de tout cela n'apparait
 * cote reseau, et la page se contente d'etre blanche.
 *
 * Ici on monte ulysse.html dans un DOM reel (jsdom), avec un faux `fetch` et un
 * faux `WebSocket`, et on verifie que chaque panneau s'affiche pour de bon.
 *
 *     node test_page.js
 * ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const DIR = __dirname;
const results = [];
const errors = [];

function check(claim, ok, detail){
  results.push([claim, !!ok, detail || ""]);
  console.log("  " + (ok ? "[ok]   " : "[ECHEC]") + " " + claim
    + (!ok && detail ? "  — " + detail : ""));
}

/* --- Les reponses du faux Hermes, dans les formes REELLES ---------------- */
const FIXTURES = {
  "/api/status": { version: "0.20.0", gateway_running: true, hermes_home: "D:/FauxHermesHome", gateway_state: "running",
                   gateway_platforms: { webhook: {} }, active_sessions: 1, auth_required: true },
  "/api/sessions": { sessions: [
      { id: "s1", title: "Site vitrine", message_count: 12, cwd: "C:/Projets/poterie",
        source: "ulysse", last_active: Date.now() / 1000 - 600, is_active: false },
      { id: "s2", title: "Factures", message_count: 4, cwd: "C:/Docs/compta",
        source: "cli", last_active: Date.now() / 1000 - 60, is_active: true }],
    total: 2, limit: 50, offset: 0 },
  /* ⚠ SANS `?path=`, `/api/files` NE REND PAS « la racine ». Vérifié contre
     le vrai Hermès le 2026-08-09 : il rend le DOSSIER PERSONNEL, avec son
     chemin absolu et son parent (`path: "C:/Users/<vous>"`, `parent:
     "C:/Users"`). Ce fixture affirmait `path: ""` et `parent: null` — une
     forme que le backend n'envoie jamais.
     Le choix de dossier s'y trompait : il aurait dit « choisissez un
     dossier » alors qu'on en regardait un. Un faux qui ne ment pas comme le
     vrai ne prouve rien — c'est la quatrième fois ici. */
  "/api/files": { path: "D:/faux-home", parent: "D:/", entries: [
      { name: "Projets", path: "D:/faux-home/Projets", is_directory: true },
      { name: "notes.md", path: "D:/faux-home/notes.md", is_directory: false,
        size: 84, mime_type: "text/markdown" },
      { name: "gros.bin", path: "D:/faux-home/gros.bin", is_directory: false,
        size: 210 * 1024 * 1024 }] },
  /* ⚠ PAS de reponse unique ici : `/api/files/read` est SERVI PAR CHEMIN, plus
     bas dans fakeFetch, sur le faux disque `DISQUE_LU`. Un fixture constant
     rendait « notes.md » pour n'importe quel chemin — y compris un chemin qui
     n'existe pas. La carte d'un fichier ABSENT s'affichait donc comme un
     fichier present, et rien ici ne pouvait le voir.
     Le vrai (web_server.py:2385) leve 404 « File not found ». On fait pareil :
     un faux qui ne ment pas comme le vrai ne prouve rien. */
  /* ⚠ `builtin_files` est un OBJET nom -> octets, pas une liste d'objets.
     Ce fixture affirmait `[{name, path, exists}]` : une forme que le backend
     n'envoie jamais. Le code appelait `.filter` dessus et levait
     « files.filter is not a function » contre le vrai Hermes — sans qu'aucune
     de ces vérifications ne le voie. Un faux qui ne ment pas comme le vrai ne
     prouve rien. Forme constatée le 2026-08-09 : {"memory": 2263, "user": 1380}. */
  "/api/memory": { active: "builtin", providers: [],
                   builtin_files: { memory: 2263, user: 1380, projet: 0 } },
  // Une LISTE, pas un objet. Et chaque competence porte sa `provenance` —
  // le vrai /api/skills le fait (verifie en direct : « agent », « personnel »,
  // « projet:… »), et c'est elle qui range les 99 du Vestiaire.
  "/api/skills": [
      { name: "cadrage", description: "Anime une séance de cadrage.",
        enabled: true, provenance: "personnel" },
      { name: "vieux", description: "Désactivé.", enabled: false,
        provenance: "personnel" },
      { name: "revue", description: "Relit un diff.", enabled: true,
        provenance: "hermes-core" }],
  "/api/webhooks": { enabled: true, base_url: "http://localhost:8644",
    subscriptions: [{ name: "resume-lundi", prompt: "Résume la veille.",
                      enabled: true, secret_set: true, deliver: "log", events: [] }] },
  "/api/analytics/usage": { period_days: 30, totals: { total_tokens: 128400, requests: 92 },
    by_model: [{ model: "hy3", total_tokens: 128400 }], daily: [], by_task: [],
    skills: [], tools: [] },
  "/api/cron/jobs": { jobs: [
      { id: "job_veille", name: "Veille du lundi", schedule: "0 9 * * 1",
        prompt: "Résume.", paused: false },
      { id: "job_bk", name: "Sauvegarde", schedule: "0 2 * * *", prompt: "Vérifie.", paused: true }] }
};

const fetched = [];

// La réponse que le faux proxy rend, et COMMENT elle se termine. Un scénario
// la change pour éprouver la troncature ; le défaut est « stop », une fin
// normale, comme chez le vrai.
const PROXY_FIN = { texte: "Réponse sans outils.", raison: "stop" };

/* Les fichiers de mémoire, tels qu'un disque les rendrait. Le vrai
   `/api/fs/read-text` renvoie le texte ET sa taille ; l'écran d'écriture s'en
   sert pour la ligne d'état ET pour calculer la différence. */
const MEM_DISQUE = {
  "USER.md": "# Profil\n\nCéramiste à Nantes.\nJe tourne, je cuis au gaz.\n",
  "MEMORY.md": "# Ce qu'Ulysse a retenu\n\n- Préfère le tutoiement.\n"
};

/* Le faux disque de `/api/files/read`, indexé PAR CHEMIN. Le vrai rend
   {name, path, size, mime_type, data_url} et lève 404 sur ce qui n'existe
   pas — c'est la seule façon de distinguer un fichier d'une promesse. */
const DISQUE_LU = {
  "D:/faux-home/notes.md": {
    mime: "text/markdown",
    // Six écrans de texte : de quoi prouver que le volet DÉFILE. Un document
    // court ne l'aurait jamais montré, et toutes les passes de design en font
    // six — c'est exactement le cas qui était tronqué sans barre.
    texte: "# Notes\n\n" + "Une ligne de plus, et encore une.\n".repeat(400)
  },
  "D:/faux-home/gros.bin": {
    mime: "application/octet-stream", texte: "x", taille: 210 * 1024 * 1024
  },
  "D:/faux-home/logo.png": {
    mime: "image/png",
    b64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  },
  /* Un CSV comme il en sort vraiment d'un tableur francais : point-virgule,
     accents, et un libelle qui CONTIENT le separateur, entre guillemets. Le
     faux d'avant (« a,b\n1,2 ») passait avec n'importe quel decoupage — donc
     il ne prouvait rien du decoupage. */
  "D:/faux-home/tableau.csv": { mime: "text/csv",
    texte: 'date;libelle;montant\n'
      + '2025-02-03;"Achat regle Carrefour, Ile-de-France";-52,30\n'
      + '2025-02-14;Restaurant "Le Depart";-38,50\n'
      + '2025-02-25;Electricite reglee;-79,90\n' }
};

function lireDuFauxDisque(chemin){
  const f = DISQUE_LU[chemin];
  if (!f) return null;
  const b64 = f.b64 || Buffer.from(f.texte, "utf8").toString("base64");
  return {
    name: chemin.split(/[\\/]/).pop(),
    path: chemin,
    size: f.taille !== undefined ? f.taille : Buffer.byteLength(f.texte || "", "utf8"),
    mime_type: f.mime,
    data_url: "data:" + f.mime + ";base64," + b64
  };
}

function fakeFetch(url, opts){
  const p = String(url).replace(/^https?:\/\/[^/]+/, "");
  const bare = p.split("?")[0];
  fetched.push({ path: p, method: (opts && opts.method) || "GET" });
  let body = FIXTURES[bare];

  if (body === undefined && bare === "/api/files/read"){
    const chemin = decodeURIComponent(p.split("path=")[1] || "");
    body = lireDuFauxDisque(chemin);
    if (!body){
      return Promise.resolve({ ok: false, status: 404,
        text: () => Promise.resolve(JSON.stringify({ detail: "File not found" })) });
    }
  }

  // `/api/fs/read-text?path=…` : 404 si le fichier n'est pas sur le faux
  // disque — c'est ainsi que l'écran distingue une CRÉATION d'une panne.
  if (body === undefined && bare === "/api/fs/read-text"){
    const nom = decodeURIComponent(p.split("path=")[1] || "").split(/[\\/]/).pop();
    const texte = MEM_DISQUE[nom];
    if (texte === undefined){
      return Promise.resolve({ ok: false, status: 404,
        text: () => Promise.resolve(JSON.stringify({ detail: "Not Found" })) });
    }
    body = { text: texte, byteSize: texte.length, binary: false, truncated: false };
  }
  if (body === undefined && bare === "/ulysse/versions"){
    body = { versions: [{ nom: "USER.md.2026-08-09-101500", quand: "2026-08-09-101500",
                          octets: 40, horodatage: 1786000000 }] };
  }
  if (body === undefined && (bare === "/ulysse/ecrire" || bare === "/ulysse/restaurer")){
    body = { ok: true, version_gardee: "USER.md.2026-08-09-120000",
             creation: false, versions: 2 };
  }
  /* ⚠ LE FAUX DOIT POUVOIR DIRE « J'AI ÉTÉ COUPÉ ». Le vrai `/proxy/chat` rend
     un `finish_reason` par choix — « stop » quand le modèle a fini, « length »
     quand il a heurté `max_tokens`. Le fixture n'en portait aucun, donc la
     troncature était intestable : c'est ainsi qu'un plafond de 800 tokens a pu
     couper les réponses pendant tout le projet sans que rien ne le dise.
     `PROXY_FIN` laisse un scénario choisir la fin. */
  if (body === undefined && bare === "/proxy/chat"){
    body = { choices: [{ message: { role: "assistant", content: PROXY_FIN.texte },
                         finish_reason: PROXY_FIN.raison }] };
  }
  if (body === undefined && bare.startsWith("/webhooks/")){
    body = { status: "queued" };
  }
  if (body === undefined){
    return Promise.resolve({ ok: false, status: 404,
      text: () => Promise.resolve(JSON.stringify({ detail: "Not Found" })) });
  }
  return Promise.resolve({ ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify(body)) });
}

/* Un WebSocket qui ne se connecte pas tout de suite : la page doit rester
   utilisable pendant ce temps, pas attendre pour peindre. */
class FakeWS {
  constructor(url){
    this.url = url;
    this.readyState = 0;
    this.envoye = [];
    // `FakeWS.last` designe LE GATEWAY : c'est par lui que les tests du fil
    // rejouent les reponses de tui_gateway. Le PTY du Terminal est un socket
    // a part, et l'ecraser ici enverrait les trames JSON-RPC dans le terminal.
    if (/\/api\/pty$/.test(url)) FakeWS.dernierPty = this;
    else FakeWS.last = this;
    FakeWS.urls.push(url);
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen();
    }, 5);
  }
  /* Deux sockets vivent dans cette page : le gateway (JSON-RPC, une trame par
     ligne) et le PTY du Terminal (des octets bruts, dont des sequences
     d'echappement). Les melanger ferait lire du JSON dans un `\x1b[RESIZE`.
     `FakeWS.sent` reste donc le seau du GATEWAY ; chaque socket garde en plus
     son propre journal. */
  send(frame){
    this.envoye.push(frame);
    if (/\/api\/ws$/.test(this.url)) FakeWS.sent.push(frame);
  }
  close(){ this.readyState = 3; if (this.onclose) this.onclose({ code: 1000 }); }
  /* Pousse une trame serveur, exactement comme tui_gateway l'ecrit. */
  push(obj){ if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) + "\n" }); }
}
FakeWS.urls = []; FakeWS.sent = []; FakeWS.OPEN = 1;

/* Un faux micro. `getUserMedia` et `MediaRecorder` n'existent pas dans jsdom,
   et un vrai micro n'a rien a faire dans une suite de tests. On rejoue leur
   contrat : demarrer, produire un morceau, s'arreter, et couper les pistes —
   c'est cette derniere qui eteint la pastille d'enregistrement du navigateur. */
class FakeRecorder {
  constructor(stream, opts){
    this.stream = stream;
    this.mimeType = (opts && opts.mimeType) || "audio/webm";
    this.state = "inactive";
    FakeRecorder.last = this;
  }
  static isTypeSupported(t){ return t === "audio/webm"; }
  start(){ this.state = "recording"; }
  stop(){
    this.state = "inactive";
    if (this.ondataavailable) this.ondataavailable({ data: FakeRecorder.morceau });
    if (this.onstop) this.onstop();
  }
}
FakeRecorder.pistesCoupees = 0;

/* Un faux xterm.js. Le vrai peint dans un canvas que jsdom n'a pas, et il est
   EMPRUNTE a l'installation d'Hermes : jsdom ne va pas chercher un <script
   src> distant, donc `window.Terminal` n'existe pas ici. On rejoue le contrat
   exact que la page utilise — open, loadAddon, onData, write, focus, options —
   et rien de plus : ce qu'on teste, c'est notre cablage, pas leur rendu. */
class FakeTerminal {
  constructor(opts){
    this.options = opts || {};
    this.cols = 80; this.rows = 24;
    this.ecrit = []; this.hote = null; this.donnees = null; this.focus_ = 0;
    this.repeints = 0;
    FakeTerminal.last = this; FakeTerminal.crees++;
  }
  open(hote){ this.hote = hote; }
  loadAddon(a){ this.addon = a; }
  onData(fn){ this.donnees = fn; }
  write(s){ this.ecrit.push(s); }
  focus(){ this.focus_++; }
  /* xterm.js ne redessine pas de lui-même quand son conteneur change de
     taille en pixels : sans `refresh`, le contenu reste dans le tampon,
     invisible. On compte les repeints pour pouvoir l'exiger. */
  refresh(){ this.repeints++; }
  /* Tout ce qui a ete peint, mis bout a bout — pratique pour chercher une
     phrase sans se soucier du decoupage des ecritures. */
  tout(){ return this.ecrit.join(""); }
}
FakeTerminal.crees = 0;

class FakeFit {
  fit(){ FakeFit.ajustements++; }
}
FakeFit.ajustements = 0;

async function main(){
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
  vc.on("error", (m) => errors.push("console.error: " + m));

  // Les scripts sont INLINES dans la page et executes par jsdom comme de vrais
  // <script>. C'est important : des `win.eval()` successifs ne partagent PAS
  // leur portee lexicale (un `const` declare dans l'un est invisible depuis le
  // suivant), alors que des balises <script> successives, si. Evaluer fichier
  // par fichier ferait donc echouer un code parfaitement valide en navigateur.
  /* ⚠ LA LISTE EST LUE DANS LA PAGE, PLUS ECRITE A LA MAIN.
     Elle a été « ulysse-config, icons, view, core, app » pendant tout le
     projet. Le 2026-08-11, `ulysse-artifact.js` a été ajouté à `ulysse.html`
     — et il n'est jamais entré ici. Toute la suite tournait donc contre une
     page AMPUTÉE de ce fichier : ses fonctions n'existaient pas, ses défauts
     étaient hors d'atteinte, et les 380 vérifications passaient au vert en
     l'ignorant.

     La boucle vérifiait pourtant que chaque fichier de la liste était bien
     référencé par la page. Elle ne vérifiait JAMAIS l'inverse — que la page
     ne chargeait rien qui ne fût dans la liste. C'est par cette asymétrie
     que le fichier est entré, et c'est elle qu'on referme : l'ordre vient
     maintenant de la page, comme dans le navigateur. */
  let html = fs.readFileSync(path.join(DIR, "ulysse.html"), "utf8");
  const SCRIPTS = Array.from(
    html.matchAll(/<script src="(ulysse-[^"]+\.js)"[^>]*><\/script>/g)).map((m) => m[1]);
  check("les scripts testés sont CEUX que la page charge, dans son ordre",
    SCRIPTS.length >= 5 && SCRIPTS.indexOf("ulysse-artifact.js") >= 0,
    SCRIPTS.join(" → "));
  for (const f of SCRIPTS){
    let code = fs.readFileSync(path.join(DIR, f), "utf8");
    /* `ulysse-config.js` n'est PAS servi tel qu'il est sur le disque :
       serve.py y ajoute le marqueur de premier lancement au moment de le
       servir. Lire le disque, c'est donc tester un fichier que le navigateur
       ne recoit jamais — et c'est exactement ce qui a laisse passer un
       « CFG is not defined » que seule la console du navigateur voyait.
       On reproduit ici l'ajout, avec la meme ligne que serve.py. */
    if (f === "ulysse-config.js"){
      code += "\nwindow.ULYSSE_CONFIG.PREMIER = false;\n";
    }
    const tag = new RegExp('<script src="' + f.replace(/[.]/g, "\\$&") + '"[^>]*></script>');
    if (!tag.test(html)){
      check("« " + f + " » est bien référencé par la page", false, "balise <script> absente");
      throw new Error("ulysse.html ne charge pas " + f);
    }
    check("« " + f + " » est bien référencé par la page", true);
    /* ⚠ UNE FONCTION, PAS UNE CHAINE. Dans le remplacement de `String.replace`,
       « $& », « $' », « $1 » et « $-accent-grave » sont des MOTIFS : ils sont
       remplacés par des morceaux de la page. Un fichier qui contient l'un
       d'eux — ne serait-ce que dans un commentaire, et c'est arrivé le
       2026-08-11 avec « $-accent-grave » dans une phrase — est donc inliné
       CORROMPU. Le script lève alors une SyntaxError, plus rien n'y est
       défini, et l'erreur ne dit rien du fichier d'origine.
       Une fonction de remplacement rend sa valeur telle quelle. */
    html = html.replace(tag, () => "<script>\n" + code + "\n</script>");
  }

  /* La feuille est INLINEE elle aussi. jsdom ne va pas chercher un <link>
     relatif : sans ca, getComputedStyle ne voit que le bloc <style> de la
     page, et toute verification d'apparence est CREUSE — elle passe aussi
     bien avec le defaut qu'avec sa correction. Or deux des six reparations
     sont precisement des conflits de style (`.glegend` qui se pose par-dessus
     l'interrupteur, `.privchip{display:none}` sans `#pDiscuter.incog`). */
  const CSS = fs.readFileSync(path.join(DIR, "ulysse.css"), "utf8");
  const lien = '<link rel="stylesheet" href="ulysse.css">';
  if (html.indexOf(lien) < 0) throw new Error("ulysse.html ne charge plus ulysse.css");
  check("« ulysse.css » est bien référencé par la page", true);

  /* ⚠ `svg()` fait `I[k] || {}` : un nom d'icône inconnu ne lève RIEN, il
     rend un carré vide. Le défaut ne casse pas, il ne se voit qu'à l'œil et
     seulement sur l'écran concerné — j'ai écrit `svg("horloge")` le
     2026-08-09, et l'icône n'existe pas.

     On compare donc tous les noms appelés au registre des icônes. Statique,
     donc sans avoir à ouvrir chaque écran. */
  {
    const icones = fs.readFileSync(path.join(DIR, "ulysse-icons.js"), "utf8");
    const table = icones.slice(icones.indexOf("const I"), icones.indexOf("function svg"));
    const connus = new Set((table.match(/(?:^|[\s{,])([a-zA-Zé]+)\s*:/gm) || [])
      .map((m) => m.replace(/[\s{,:]/g, "")));
    /* ⚠ LA LISTE EST LUE, PLUS ECRITE A LA MAIN. Elle disait
       ["ulysse-app.js", "ulysse-view.js"], et `ulysse-artifact.js` est arrive
       le 2026-08-11 A COTE : il appelait `svg("table")`, une icone qui
       n'existe pas, donc `<path d="undefined"/>` — la carte d'un .csv avait
       une pastille vide. Le garde-fou existait ; le fichier neuf est entre
       par la porte d'a cote.
       Un fichier de plus entre donc tout seul maintenant, comme pour les
       apercus : un compte en dur avait deja laisse passer le onzieme. */
    const sources = fs.readdirSync(DIR)
      .filter((n) => /^ulysse-.*\.js$/.test(n) && n !== "ulysse-icons.js"
                     && n !== "ulysse-config.js")
      .sort();
    check("le balayage des icônes lit TOUS les ulysse-*.js, sans liste écrite",
      sources.indexOf("ulysse-artifact.js") >= 0 && sources.length >= 4,
      sources.join(" "));
    const appeles = new Set();
    for (const f of sources){
      const code = fs.readFileSync(path.join(DIR, f), "utf8");
      for (const m of code.matchAll(/\bsvg\(\s*"([^"]+)"/g)) appeles.add(m[1]);
    }
    const orphelins = [...appeles].filter((n) => !connus.has(n)).sort();
    check("chaque icône appelée existe vraiment dans le registre",
      orphelins.length === 0,
      orphelins.length ? "inconnue(s) : " + orphelins.join(", ")
        : appeles.size + " nom(s) vérifié(s)");
  }

  /* ⚠ LES DIX APERCUS RECOPIENT LA FEUILLE, ils ne la lient pas — il faut
     qu'ils s'ouvrent d'un double-clic, seuls. Autant de copies que de fichiers,
     donc autant d'occasions de diverger EN SILENCE : Cowork retouche la feuille et les
     resynchronise, puis je touche la feuille ici et les dix se figent sur
     l'etat d'avant. Personne ne le voit — un apercu ne casse pas, il ment.

     Cowork a demande, le 2026-08-09 : « dis-le-moi quand tu y touches ». Une
     garantie qui repose sur quelqu'un qui pense a le dire finit par ceder.
     Celle-ci se mesure : la copie est identique OCTET POUR OCTET, donc on la
     compare. Quand ce test tombe, la reparation tient en une commande —
     `python resync_apercus.py`. */
  /* ⚠ On compare le BLOC ENTIER, pas une inclusion. Ecrit d'abord en
     `vu.indexOf(CSS) >= 0`, ce test laissait passer un apercu qui porte la
     feuille PLUS des regles en trop — et c'est la divergence la PLUS
     probable : quelqu'un ajoute une regle dans un apercu pour voir, et elle
     y reste. Le trou s'est montre tout seul : apres avoir resynchronise sur
     une feuille d'essai puis retire l'essai, les dix gardaient la ligne en
     trop et le test les disait a jour.
     `</style>` ne parait jamais dans la feuille : la borne est sure. */
  for (const f of fs.readdirSync(DIR).filter((n) => /^apercu-.*\.html$/.test(n)).sort()){
    const vu = fs.readFileSync(path.join(DIR, f), "utf8");
    const d = vu.indexOf(CSS.slice(0, 200));
    const fin = d < 0 ? -1 : vu.indexOf("</style>", d);
    check("« " + f + " » porte la feuille COURANTE, pas une copie figée",
      d >= 0 && fin >= 0 && vu.slice(d, fin) === CSS,
      d < 0 ? "la feuille n'y est plus reconnaissable"
            : "elle a divergé (" + (fin - d) + " octets contre " + CSS.length
              + ") — `python resync_apercus.py`");
  }

  // Une fonction, pas une chaîne — même piège que pour les scripts ci-dessus.
  html = html.replace(lien, () => "<style>\n" + CSS + "\n</style>");

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://127.0.0.1:8080/ulysse.html",
    virtualConsole: vc,
    beforeParse(win){
      // Injecte AVANT que les scripts ne tournent : la page appelle
      // fetch() et ouvre son WebSocket des son amorcage.
      win.fetch = fakeFetch;
      win.WebSocket = FakeWS;
      FakeRecorder.morceau = new win.Blob(["son"], { type: "audio/webm" });
      win.MediaRecorder = FakeRecorder;
      Object.defineProperty(win.navigator, "mediaDevices", {
        value: { getUserMedia: () => Promise.resolve({
          getTracks: () => [{ stop(){ FakeRecorder.pistesCoupees++; } }]
        }) }, configurable: true
      });
      win.Terminal = FakeTerminal;
      win.FitAddon = { FitAddon: FakeFit };
      win.requestAnimationFrame = (fn) => win.setTimeout(fn, 0);
      Object.defineProperty(win.navigator, "clipboard", {
        value: { writeText: () => Promise.resolve() }, configurable: true
      });
    }
  });
  const win = dom.window;
  check("la page s'amorce sans erreur JavaScript", errors.length === 0,
    errors.slice(0, 2).join(" | "));

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(150);

  console.log("\n--- La premiere intention (l'accueil de Discuter) ---");
  /* On entre par le NOM et la QUESTION. Il n'y a plus deux ecrans : l'accueil
     de Discuter EST l'ecran d'entree — meme mot-marque, meme champ centre,
     meme interrupteur. Ces cinq verifications sont celles du niveau 1,
     REECRITES : ce qu'elles prouvaient reste vrai, sur un autre ecran. */
  check("l'accueil est l'état visible au départ",
    win.document.getElementById("app").classList.contains("on")
    && win.document.getElementById("pDiscuter").classList.contains("accueil"));
  const mark = win.document.querySelector("#pDiscuter .u-marque");
  check("le mot-marque Ulysse est là",
    mark && mark.textContent.trim() === "Ulysse", mark ? mark.textContent : "absent");
  check("il porte le dégradé, et il n'est visible qu'à l'accueil",
    mark && win.getComputedStyle(mark).backgroundImage.indexOf("gradient") >= 0
    && win.getComputedStyle(mark).opacity === "1",
    mark ? win.getComputedStyle(mark).opacity : "");
  check("le composeur est présent et vide",
    !!win.document.getElementById("composer")
    && win.document.getElementById("reply").value === "");
  check("à l'accueil il demande, il ne répond pas",
    win.document.getElementById("reply").getAttribute("placeholder")
      .indexOf("aimeriez faire") >= 0,
    win.document.getElementById("reply").getAttribute("placeholder"));
  check("le titre « Discuter » s'efface : le mot-marque le dit déjà",
    win.getComputedStyle(win.document.querySelector("#pDiscuter .topbar .title"))
      .opacity === "0");
  /* Plan par defaut : on n'ouvre pas quelqu'un sur le mode ou l'agent ecrit
     dans son projet. Le mode ne choisit plus un MOTEUR (c'etait "pur" ou
     "cowork", un detail de transport promu au rang de decision) mais ce que
     l'agent a le droit de MODIFIER. Voir PASSE-DESIGN-UN-SEUL-FIL.md §1. */
  check("Plan est le mode par défaut",
    win.eval("mode") === "plan"
    && win.document.querySelector('#pDiscuter .u-modeseg button.on').dataset.mode === "plan",
    String(win.eval("mode")));
  /* « Quasi invisible » : le segment de 120 px est devenu un mot, et les deux
     positions sont derriere. Un choix qu'on fait deux fois par heure ne
     s'affiche pas en permanence a cote de ce qu'on ecrit. */
  check("...et le mode est une mention, pas un segment permanent",
    !!win.document.getElementById("modeMention")
    && win.document.getElementById("modeMention").textContent === "Plan"
    && win.document.querySelector(".u-modeseg").classList.contains("pop"),
    (win.document.getElementById("modeMention") || {}).textContent);

  console.log("\n--- Le menu ---");
  const railBtns = win.document.querySelectorAll("#railItems .rail-btn");
  check("le menu se construit", railBtns.length > 0, railBtns.length + " boutons");
  // 4 destinations de niveau 2 + la porte des coulisses
  check("les coulisses sont fermées au départ (4 + la porte)",
    railBtns.length === 5, railBtns.length + " boutons");
  check("chaque bouton du menu porte une icône",
    Array.from(railBtns).every((b) => b.querySelector("svg")));

  win.toggleCoulisses({ stopPropagation(){} });
  const opened = win.document.querySelectorAll("#railItems .rail-btn");
  check("les coulisses s'ouvrent sur les 6 autres destinations",
    opened.length === 11, opened.length + " boutons");

  /* ── ON NE PEUT PLUS ÊTRE QUELQUE PART SANS QUE LE MENU LE DISE ─────────
     `nav()` allumait le panneau et redessinait le rail, mais n'ouvrait
     jamais les coulisses : sur une destination de niveau 3 avec la porte
     fermée, AUCUN bouton n'était actif. Quatre chemins réels y menaient,
     dont l'ancre d'URL et « Voir la mémoire » depuis la dette.
     Signalé par Cowork le 2026-08-09.

     On passe PAR LE GESTE : refermer la porte, puis naviguer. */
  win.toggleCoulisses({ stopPropagation(){} });     // on referme
  check("Rail · la porte se referme à la main", !win.eval("coulisses"));
  win.nav("Vestiaire");
  await wait(40);
  check("Rail · entrer derrière la porte l'OUVRE — plus d'écran sans bouton actif",
    win.eval("coulisses")
    && !!win.document.querySelector('#railItems .rail-btn.on[data-nav="Vestiaire"]'),
    win.eval("coulisses") ? "ouverte" : "restée fermée");

  // On peut la refermer à la main : le problème revient, sans être un bug.
  // La porte porte alors la marque des notifications — on n'en dessine pas
  // un deuxième pour dire la même chose.
  win.toggleCoulisses({ stopPropagation(){} });
  await wait(40);
  check("Rail · refermée sur un panneau de derrière, la porte porte la marque",
    !!win.document.querySelector("#doorBtn .raildot")
    && !win.document.querySelector("#railItems .rail-btn.on"),
    win.document.querySelector("#doorBtn .raildot") ? "marquée" : "sans marque");
  win.toggleCoulisses({ stopPropagation(){} });
  await wait(40);
  check("Rail · ...et la marque s'en va dès qu'on ouvre : le bouton actif se voit",
    !win.document.querySelector("#doorBtn .raildot")
    && !!win.document.querySelector('#railItems .rail-btn.on[data-nav="Vestiaire"]'));
  win.nav("Discuter");
  await wait(40);
  check("Rail · sur un panneau de niveau 2, la porte n'est pas marquée",
    !win.document.querySelector("#doorBtn .raildot"));

  /* ⚠ LE PIÈGE DE LA PASTILLE PARTAGÉE. Cowork a choisi `.raildot` pour ne
     pas dessiner un deuxième signe disant la même chose — bonne intention.
     Mais `drawBell()` parcourait TOUS les `.rail-btn` et RETIRAIT les points
     qu'elle ne reconnaissait pas : la pastille de la porte était effacée
     aussitôt posée. La boucle ne gouverne plus que les DESTINATIONS. */
  win.nav("Vestiaire");
  win.toggleCoulisses({ stopPropagation(){} });
  await wait(40);
  win.eval("Notifs.drawBell()");
  check("Rail · la cloche ne reprend PAS la pastille de la porte",
    !!win.document.querySelector("#doorBtn .raildot"),
    win.document.querySelector("#doorBtn .raildot") ? "toujours là" : "effacée");
  win.nav("Discuter");
  await wait(40);

  /* ── UNE PANNE EST UNE NOTIFICATION ────────────────────────────────────
     `NKIND` définit quatre genres et seul `decision` était jamais poussé :
     le vocabulaire existait en entier, le produit en employait un quart.
     Or l'état d'Hermès concerne les DIX panneaux — il n'était lisible que
     dans le bandeau du kebab de Discuter. */
  // Ce bloc pousse une bulle qui NE PART PAS toute seule et remplace l'état
  // mémoire : on met les deux de côté, et on rend tout à la fin.
  win.eval("window.__av = { st: lastStatus, mem: memoireEtat };");
  const avantP = win.eval("Notifs.list.length");
  win.eval("lastStatus = null; majPanne();");
  await wait(40);
  check("Panne · une panne devient une notification, visible de partout",
    win.eval("Notifs.list.length") === avantP + 1
    && win.eval('Notifs.list[0].kind') === "panne",
    win.eval('Notifs.list[0] && Notifs.list[0].kind'));
  check("Panne · ...elle ne part pas toute seule — c'est ce qu'on veut d'une panne",
    win.eval('NKIND.panne.dur') === true);
  check("Panne · ...et le badge de la cloche passe en rouge",
    !!win.document.querySelector("#bellIc .badge.r-panne"));
  // ⚠ Une panne ne s'AUTORISE pas : pas de boutons. `dur` dit qu'elle ne
  //   part pas seule, pas qu'on ait quelque chose à répondre.
  check("Panne · ...sans boutons : une panne ne s'autorise pas",
    !win.document.querySelector("#toasts .nacts"),
    win.document.querySelector("#toasts .nacts") ? "des boutons" : "aucun");

  // Elle ne se répète pas : loadStatus tourne en boucle, et une cloche qui
  // sonne toutes les dix secondes cesse d'être écoutée.
  win.eval("majPanne(); majPanne();");
  await wait(40);
  check("Panne · ...et elle ne sonne qu'une fois, pas à chaque sondage",
    win.eval("Notifs.list.filter(function(n){return n.kind==='panne';}).length") === 1,
    win.eval("Notifs.list.filter(function(n){return n.kind==='panne';}).length") + "");

  /* ── LE PANNEAU DES NOTIFICATIONS ──────────────────────────────────────
     Passe Cowork du 2026-08-10. Les cinq états du tableau « par quel geste »
     sont joués ici PAR LEUR GESTE — on ouvre le panneau, on pousse une panne,
     on laisse le temps passer. Poser `Notifs.list` à la main vérifierait que
     `draw()` sait lire un tableau, pas que l'écran s'atteint. */
  win.eval("Notifs.toggle()");                 // le panneau, panne seule en liste
  await wait(40);
  const nP = win.document.getElementById("npanel");
  check("Notifs · une panne seule va sous « Ce qui ne va pas », pas sous « À décider »",
    !!nP.querySelector(".n-groupe.panne")
    && /Ce qui ne va pas/.test(nP.textContent)
    && !/Votre réponse est attendue/.test(nP.textContent),
    nP.textContent.slice(0, 90));
  check("Notifs · ...et le groupe porte sa couleur dès son titre",
    !!nP.querySelector(".n-groupe.panne .l"));
  // §3 : elle n'a rien à demander, mais quelque chose à dire.
  check("Notifs · ...sans boutons, mais avec ce qu'il y a à faire",
    !nP.querySelector(".nacts") && !!nP.querySelector(".n-quoi")
    && /lancer_ulysse\.bat/.test(nP.querySelector(".n-quoi").textContent),
    nP.querySelector(".n-quoi") ? "conseil présent" : "aucun conseil");
  check("Notifs · ...et ce conseil n'a l'air ni d'un bouton ni d'un lien",
    !nP.querySelector(".n-quoi button") && !nP.querySelector(".u-lien"));

  // ⚠ Le temps. `when` était figé à la création : « à l'instant », pour
  //   toujours. On recule l'horodatage de la bulle — le geste réel étant
  //   d'attendre vingt minutes — puis on REFERME et ROUVRE, parce que la
  //   passe dit que le calcul a lieu à l'ouverture.
  win.eval("Notifs.list[0].t = Date.now() - 20 * 60 * 1000;");
  win.eval("Notifs.toggle(); Notifs.toggle();");
  await wait(40);
  const dep = nP.querySelector(".n-depuis");
  check("Notifs · une panne qui dure dit DEPUIS QUAND, pas « à l'instant »",
    !!dep && /depuis 20 min/.test(dep.textContent), dep ? dep.textContent : "absent");

  // Deux groupes à la fois : une décision arrive pendant que la panne dure.
  win.eval("Notifs.push({ kind:'decision', titre:'Votre accord est demandé',"
    + " txt:'x', obj:'y', panel:'Discuter', oui:'Autoriser une fois', non:'Refuser' });");
  win.eval("Notifs.toggle(); Notifs.toggle();");
  await wait(40);
  const grs = Array.from(nP.querySelectorAll(".n-groupe")).map((g) => g.textContent);
  check("Notifs · une décision pendant une panne : deux groupes",
    grs.length === 2, JSON.stringify(grs));
  // L'ordre n'est pas un détail : ce qui bloque l'agent passe devant.
  check("Notifs · ...et ce qui bloque l'agent passe devant ce qui ne bloque personne",
    /Votre réponse est attendue/.test(grs[0] || "")
    && /Ce qui ne va pas/.test(grs[1] || ""), JSON.stringify(grs));
  check("Notifs · ...la décision garde ses boutons, la panne n'en prend pas",
    nP.querySelectorAll(".nacts").length === 1
    && nP.querySelectorAll(".n-quoi").length === 1,
    nP.querySelectorAll(".nacts").length + " bouton(s), "
    + nP.querySelectorAll(".n-quoi").length + " conseil(s)");

  /* ⚠ Le point du rail se pose par IDENTIFIANT, pas par libellé affiché.
     « Reglages » s'affiche « Réglages », et « Plan » s'affiche « Ce que fait
     l'agent » : la boucle comparait le texte du bouton, donc ces deux
     panneaux-là n'auraient JAMAIS eu leur point, en silence. Trouvé le
     2026-08-10 en donnant enfin une destination à la panne.

     Le geste : ouvrir les coulisses. Un panneau de niveau 3 n'a pas de bouton
     tant que la porte est fermée — il n'y a alors rien à marquer. */
  win.document.getElementById("doorBtn").click();
  await wait(40);
  check("Notifs · le point du rail suit l'identifiant, pas le libellé affiché",
    !!win.document.querySelector('.rail-btn[data-nav="Reglages"] .raildot'),
    win.eval("Notifs.list.map(function(n){return n.panel;}).join(',')"));
  // Et il ne bave pas sur les voisins : un seul panneau est concerné.
  check("Notifs · ...et seuls les panneaux concernés le portent",
    win.document.querySelectorAll('.rail-btn[data-nav] .raildot').length === 2,
    win.document.querySelectorAll('.rail-btn[data-nav] .raildot').length + " point(s)");
  win.document.getElementById("doorBtn").click();
  await wait(40);

  win.eval("Notifs.list = Notifs.list.filter(function(n){return n.kind!=='decision';});");
  win.eval("lastStatus = { version: '0.20.0' }; majPanne();");
  await wait(40);
  check("Panne · quand Hermès revient, la notification s'en va",
    win.eval("Notifs.list.filter(function(n){return n.kind==='panne';}).length") === 0);
  win.eval("Notifs.toggle(); Notifs.toggle();");
  await wait(40);
  check("Notifs · plus rien à signaler : le panneau le dit, et le promet",
    /Rien à signaler/.test(nP.textContent) && /On vous préviendra/.test(nP.textContent),
    nP.textContent.slice(0, 60));
  win.eval("Notifs.close()");

  /* ── LA DETTE N'A PAS À ÊTRE PARTOUT ───────────────────────────────────
     `#dettewrap` vit dans `.stage` : elle s'affichait sur les dix panneaux
     et poussait le contenu de chacun. Dans le Terminal, elle parle d'autre
     chose que ce qu'on est venu faire. */
  win.eval("memoireEtat = { manquants: ['USER.md'] };");
  win.nav("Discuter");
  await wait(40);
  check("Dette · elle reste où on LIT la réponse vague",
    /USER\.md/.test(win.document.getElementById("dettewrap").textContent),
    win.document.getElementById("dettewrap").textContent.slice(0, 40));
  win.nav("Reglages");
  await wait(40);
  check("Dette · ...et où on la RÉPARE",
    /USER\.md/.test(win.document.getElementById("dettewrap").textContent));
  win.nav("Terminal");
  await wait(40);
  check("Dette · mais pas dans le Terminal, où elle parle d'autre chose",
    win.document.getElementById("dettewrap").textContent.trim() === "",
    win.document.getElementById("dettewrap").textContent.slice(0, 40) || "vide");

  // On rend tout : l'état, la mémoire, et la bulle restée à l'écran — une
  // bulle `dur` ne s'efface pas d'elle-même, c'est tout son intérêt.
  win.eval("lastStatus = __av.st; memoireEtat = __av.mem; majPanne();"
    + " document.getElementById('toasts').innerHTML = '';");
  win.nav("Discuter");
  await wait(40);

  console.log("\n--- Chaque panneau s'affiche vraiment ---");
  const PANES = ["Discuter", "Plan", "Travaux", "Livrables", "Projets",
                 "Automatisations", "Vestiaire", "Reglages", "Terminal", "Reperes"];
  for (const id of PANES){
    win.nav(id);
    await wait(60);
    const pane = win.document.getElementById("p" + id);
    const on = pane && pane.classList.contains("on");
    const visibles = win.document.querySelectorAll(".panel.on");
    const body = pane ? pane.textContent.trim() : "";
    check("« " + id + " » s'affiche, seul, avec du contenu",
      on && visibles.length === 1 && body.length > 20,
      on ? (visibles.length + " panneaux visibles, " + body.length + " car.") : "panneau absent");
  }

  console.log("\n--- Un lien inconnu ne laisse pas d'écran vide (C1) ---");
  win.nav("#nimportequoi");
  await wait(40);
  check("une destination inconnue retombe sur Discuter",
    win.document.querySelectorAll(".panel.on").length === 1
    && win.document.getElementById("pDiscuter").classList.contains("on"));
  win.nav("dIsCuTeR");
  check("la casse n'égare pas la navigation",
    win.document.getElementById("pDiscuter").classList.contains("on"));

  console.log("\n--- Les données réelles arrivent à l'écran ---");
  win.nav("Travaux");
  await wait(80);
  let txt = win.document.getElementById("works").textContent;
  check("les sessions s'affichent avec leur titre", txt.includes("Site vitrine"), txt.slice(0, 100));
  check("celle qui tourne est signalée", /en cours/i.test(txt));

  win.nav("Livrables");
  await wait(80);
  txt = win.document.getElementById("livrables").textContent;
  check("les fichiers s'affichent", txt.includes("notes.md"));
  check("les tailles sont lisibles (pas des octets bruts)", /Ko|Mo|o\b/.test(txt));

  win.nav("Automatisations");
  await wait(120);
  txt = win.document.getElementById("autos").textContent;
  check("les tâches planifiées s'affichent", txt.includes("Veille du lundi"));
  const sws = win.document.querySelectorAll("#autos .sw");
  check("chaque tâche porte un interrupteur", sws.length >= 2, sws.length + " trouvés");
  check("la tâche en pause a son interrupteur éteint",
    Array.from(sws).some((x) => !x.classList.contains("on")));
  check("les webhooks s'affichent", txt.includes("resume-lundi"));
  check("aucun secret de webhook n'est affiché", !txt.includes("secret-"));

  win.nav("Vestiaire");
  await wait(80);
  txt = win.document.getElementById("vgrid").textContent + win.document.getElementById("vdet").textContent;
  check("les 6 rôles sont là",
    ["Orchestrateur", "Généraliste", "Raisonnement", "Codage",
     "Appel d'outil", "Garde-fou"].every((r) => txt.includes(r)));

  win.nav("Reglages");
  await wait(80);
  const nav = win.document.querySelectorAll("#setnav button");
  check("les réglages ont leur colonne de sections", nav.length >= 5, nav.length + " sections");
  nav[1].click();                       // « Ce qu'Ulysse sait »
  await wait(90);
  txt = win.document.getElementById("setbody").textContent;
  check("la mémoire s'affiche", txt.includes("SOUL.md"), txt.slice(0, 90));
  nav[5].click();                       // « Dépenses »
  await wait(90);
  txt = win.document.getElementById("setbody").textContent;
  check("les dépenses réelles s'affichent", txt.includes("128") && /jours/.test(txt),
    txt.slice(0, 90));
  nav[nav.length - 1].click();          // « Avancé »
  await wait(90);
  txt = win.document.getElementById("setbody").textContent;
  check("l'état d'Hermès s'affiche", txt.includes("0.20.0"), txt.slice(0, 90));

  win.nav("Reperes");
  await wait(40);
  txt = win.document.getElementById("glossary").textContent;
  check("le glossaire des signes s'affiche", txt.includes("bac à sable"));

  console.log("\n--- Le fil de conversation ---");
  win.nav("Discuter");
  await wait(60);
  check("le WebSocket est ouvert sur la même origine",
    FakeWS.urls.length > 0 && FakeWS.urls[0] === "ws://127.0.0.1:8080/api/ws",
    FakeWS.urls[0]);
  check("aucun jeton ne part dans l'URL du WebSocket (S9)",
    !FakeWS.urls[0].includes("token"), FakeWS.urls[0]);

  /* Un tour complet, joue par le faux serveur, DEPUIS L'ACCUEIL. Les DEUX
     modes ouvrent maintenant une session — c'etait la difference de fond
     entre Chat et Cowork, et elle a disparu avec le chemin pur. */
  win.document.querySelector('#pDiscuter .u-modeseg button[data-mode="build"]').click();
  await wait(30);
  check("changer de mode ne quitte pas l'accueil",
    win.document.getElementById("pDiscuter").classList.contains("accueil"));
  win.document.getElementById("reply").value = "Fais le point";
  win.document.getElementById("composer").dispatchEvent(new win.Event("submit"));
  await wait(120);
  check("le compteur d'attente se rejoue dans le fil",
    !!win.document.querySelector("#pDiscuter .thread-in .wait.inline.on"));

  const sent = FakeWS.sent.map((s) => JSON.parse(s.trim()));
  const create = sent.find((m) => m.method === "session.create");
  check("une session est demandée", !!create, JSON.stringify(sent.map((m) => m.method)));
  FakeWS.last.push({ jsonrpc: "2.0", id: create.id,
    result: { session_id: "live_1", stored_session_id: "st_1", info: { model: "hy3" } } });
  await wait(60);

  check("l'accueil s'efface dès que la session existe",
    !win.document.getElementById("pDiscuter").classList.contains("accueil"));

  /* ⚠ LA LIGNE DE MODE PART DANS LA TRAME, ET IL FAUT LE VERIFIER LA.
     Ecrite plus bas en n'appelant que `ligneDeMode()`, cette verification
     prouvait que la fonction rend la bonne phrase — pas qu'elle atteint le
     moteur. Retirer `+ ligneDeMode()` de `onSend` laissait le banc au vert :
     mutation posee, mutation AVEUGLE. C'est ici qu'il faut regarder, parce
     que c'est ici qu'une session vit et qu'un `prompt.submit` part vraiment.

     Elle voyage dans le TOUR DE L'UTILISATEUR, apres le prefixe : le prefixe
     pese 15 067 tokens et le cache ne tient que s'il ne bouge pas. */
  await wait(60);
  {
    const submit = FakeWS.sent.map((x) => { try { return JSON.parse(x.trim()); }
                                            catch (e){ return {}; } })
      .find((m) => m.method === "prompt.submit"
                   && /Fais le point/.test(String((m.params || {}).text)));
    check("le mode voyage avec le message, dans la trame envoyée",
      !!submit && /\[Mode Build/.test(String(submit.params.text)),
      submit ? String(submit.params.text).slice(-58) : "aucun prompt.submit");
    /* ⚠ ET IL NE SE LIT PAS DANS LE FIL. `onSend` promettait « elle part, elle
       ne s'affiche pas » — et la collait dans `text`, donc dans les deux. Le
       fil montrait une deuxieme bulle « Vous » par tour, disant « [Mode Plan :
       ne modifiez rien sur le disque… ] », que personne n'avait ecrite.
       Le banc ne pouvait pas le voir : il regardait la TRAME, jamais l'ECRAN.
       Trouve en jouant un scenario le 2026-08-12 — huitieme fois. */
    check("...et il ne se lit PAS dans le fil : ça part, ça ne s'affiche pas",
      !/\[Mode (Plan|Build)/.test(win.document.getElementById("thread").textContent),
      win.document.getElementById("thread").textContent.slice(0, 90));
  }

  /* ── OÙ CE FIL TRAVAILLE ────────────────────────────────────────────────
     La barre ne disait rien du dossier. Le fil annonçait « j'ai écrit dans
     ulysse.html » — où ça ? */
  const lieu = () => win.document.getElementById("lieuSlot");
  check("Lieu · tant qu'on ignore le dossier, on le DIT — pas de silence",
    !!lieu().querySelector(".l-lieu.attente")
    && /dossier en attente/.test(lieu().textContent),
    lieu().textContent.trim().slice(0, 40));

  /* ⚠ LA SESSION DIT ELLE-MÊME OÙ ELLE EST, ET DANS QUEL PROJET.
     Relevé sur Hermès en marche le 2026-08-09 : `info` porte `cwd` ET
     `project` — `{id, slug, name, primary_path}`, ou `null` hors de tout
     projet. On ne demande donc rien à `projects.for_cwd` : une session ne
     peut pas se tromper sur elle-même, et cet appel-là, si (voir plus bas).

     Le fixture porte la forme RÉELLE. Un faux qui ne ment pas comme le vrai
     ne prouve rien : ce projet l'a payé trois fois. */
  win.eval('conv.info = Object.assign(conv.info || {}, { cwd: "D:/Atelier",'
    + " project: null }); paintHint();");
  await wait(40);
  check("Lieu · hors de tout projet, le dossier est montré pour ce qu'il est",
    !!lieu().querySelector(".l-lieu.dossier") && /Atelier/.test(lieu().textContent),
    lieu().querySelector(".l-lieu") ? lieu().querySelector(".l-lieu").className : "aucune");

  // ⚠ ON NE DOIT RIEN DEMANDER À `projects.for_cwd` : pour un dossier qu'il
  //   ne trouve pas, il remplace silencieusement la demande par le dossier
  //   courant du serveur et répond sur celui-là (mesuré). La session, elle,
  //   ne peut pas se tromper sur elle-même.
  check("Lieu · ...et « for_cwd » n'est PAS appelé — la session sait déjà",
    !FakeWS.sent.map((s) => JSON.parse(s.trim()))
      .some((m) => m.method === "projects.for_cwd"));

  // Le fil appartient à un projet : la session le dit, la gélule le porte.
  win.eval('conv.info = Object.assign(conv.info || {}, { cwd: "D:/Atelier",'
    + ' project: { id: "p7", slug: "atelier", name: "Atelier de poterie",'
    + ' primary_path: "D:/Atelier" } }); paintHint();');
  await wait(40);
  check("Lieu · le projet vient de la session, pas d'un appel de plus",
    !!lieu().querySelector(".l-lieu.projet")
    && /Atelier de poterie/.test(lieu().textContent),
    lieu().textContent.trim().slice(0, 50));

  // La couleur, elle, n'est pas dans `info` : elle vient de `projects.list`,
  // lu une fois. Une couleur qui manque ne cache rien — le nom est déjà là.
  // ⚠ Le DERNIER, pas le premier : un `projects.list` part déjà au démarrage
  //   (la boucle qui visite les dix panneaux appelle `drawProjets`). Répondre
  //   au premier envoyait la réponse à un appel déjà oublié.
  const dmdCoul = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .filter((m) => m.method === "projects.list").pop();
  check("Lieu · la couleur est demandée à part, et n'empêche rien d'afficher",
    !!dmdCoul, "appels : " + FakeWS.sent.map((s) => JSON.parse(s.trim()).method).join(","));
  FakeWS.last.push({ jsonrpc: "2.0", id: dmdCoul && dmdCoul.id, result: {
    projects: [{ id: "p7", name: "Atelier de poterie", color: "#9334E6", icon: "doc" }],
    active_id: null } });
  await wait(60);
  check("Lieu · ...et quand elle arrive, la pastille la porte",
    /#9334E6/.test(lieu().innerHTML),
    lieu().innerHTML.slice(0, 120));

  /* ⚠ LE CAS QUE PERSONNE N'AVAIT VU, et il ne demande aucun appel :
     `CFG.SESSION_CWD` est le dossier de la PROCHAINE session, `conv.info.cwd`
     celui de la session EN COURS. Cliquer « Travailler ici » pendant qu'un fil
     est ouvert change le premier, pas le second.

     ⚠⚠ CE TEST POSAIT LES DEUX VARIABLES À LA MAIN. Il prouvait donc le
     DESSIN de l'état, pas qu'on puisse y ARRIVER — et on ne pouvait pas :
     « Travailler ici » appelait `resetSession()` d'abord, ce qui vidait le
     fil. kuchu ne voyait jamais la gélule ambre, et il avait raison.

     C'est le piège que cette suite dénonce partout ailleurs — un test qui
     remplace ce qu'il vérifie. On passe donc PAR LE BOUTON. */
  win.eval('CFG.SESSION_CWD = "D:/Autre lieu"; paintHint();');
  await wait(40);
  check("Lieu · deux dossiers à la fois, et la gélule le DIT",
    !!lieu().querySelector(".l-lieu.change")
    && /Atelier/.test(lieu().textContent)
    && /Autre lieu/.test(lieu().textContent),
    lieu().textContent.trim().slice(0, 70));
  const popLieu = win.document.getElementById("lieuPop");
  check("Lieu · ...et le repli montre les DEUX chemins, pas un seul",
    /D:\/Atelier/.test(popLieu.textContent) && /D:\/Autre lieu/.test(popLieu.textContent));
  check("Lieu · ...et dit pourquoi le fil ne déménage pas",
    /ne change pas de dossier en cours de route/.test(popLieu.textContent));

  // « Rester ici » doit AGIR : sans ça, le prochain fil partirait quand même
  // ailleurs, et le bouton n'aurait fait que fermer un repli.
  popLieu.querySelector('[data-lieu="annuler"]').click();
  await wait(40);
  check("Lieu · « Rester ici » ramène vraiment le prochain fil ici",
    win.eval("CFG.SESSION_CWD") === "D:/Atelier"
    && !lieu().querySelector(".l-lieu.change"),
    win.eval("CFG.SESSION_CWD"));

  /* ⚠ CE QUE CE TEST GARDAIT N'EXISTE PLUS, ET C'EST UNE BONNE NOUVELLE.
     Il exigeait qu'AUCUNE gélule de lieu n'apparaisse en mode Chat : ce mode
     n'ouvrait aucune session, `conv.info.cwd` ne venait jamais, et « dossier
     en attente » promettait indéfiniment quelque chose qui n'arrivait pas
     (signalé par kuchu le 2026-08-09, capture à l'appui).

     Le mode Chat a disparu le 2026-08-12. Les deux modes ouvrent une session,
     donc le lieu est réel dans les deux — et il compte AUTANT en Plan : c'est
     le dossier qu'on lit pour bâtir le plan. Ce qu'on garde maintenant, c'est
     l'inverse : que la gélule reste là quand on change de mode. */
  const modeAvant = win.eval("mode");
  win.eval('setMode2("plan");');
  await wait(40);
  check("Lieu · la gélule est là en Plan — on lit le dossier pour planifier",
    !!lieu().querySelector(".l-lieu"),
    lieu().textContent.trim().slice(0, 50) || "vide");
  win.eval('setMode2("build");');
  await wait(40);
  check("Lieu · ...et elle ne bouge pas en passant en Build",
    !!lieu().querySelector(".l-lieu"),
    lieu().textContent.trim().slice(0, 40));
  win.eval('setMode2("' + modeAvant + '");');
  await wait(40);

  /* ── PAR LE BOUTON, POUR DE VRAI ────────────────────────────────────────
     On repart d'un fil ouvert avec des tours, on va dans Projets, on clique
     « Travailler ici » sur un AUTRE dossier, et on revient. Rien n'est posé
     à la main : c'est le chemin qu'emprunte quelqu'un. */
  // Ce bloc malmène la session : on la met de côté et on la rendra intacte,
  // sinon tout ce qui suit vérifierait un fil qu'on vient d'effacer.
  win.eval("window.__sauve = { sid: conv.sessionId, stid: conv.storedId,"
    + " info: conv.info, status: conv.status, running: conv.running,"
    + " approval: conv.approval, turns: conv.turns.slice(), cwd: CFG.SESSION_CWD };");

  win.eval('conv.info = { cwd: "D:/Atelier", project: null };'
    + ' conv.turns.length = 0;'
    + ' conv.turns.push({ role: "user", text: "un tour qui doit survivre" });'
    + ' CFG.SESSION_CWD = "D:/Atelier"; paintHint();');
  await wait(40);

  win.eval('nav("Projets")');
  await wait(60);
  // Les archivés d'abord : sans cette réponse, l'arbre ne part jamais.
  const arch2 = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .filter((m) => m.method === "projects.list").pop();
  FakeWS.last.push({ jsonrpc: "2.0", id: arch2 && arch2.id,
    result: { projects: [], active_id: null } });
  await wait(60);
  const dmd2 = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .filter((m) => m.method === "projects.tree").pop();
  FakeWS.last.push({ jsonrpc: "2.0", id: dmd2 && dmd2.id, result: { projects: [
    { id: "D:/Autre lieu", label: "Autre lieu", path: "D:/Autre lieu", color: null,
      icon: null, isAuto: true, isNoProject: false, sessionCount: 2,
      lastActive: 1786270000, repos: [], previewSessions: [] }
  ], active_id: null, scoped_session_ids: [] } });
  await wait(120);

  const allerLa = win.document.querySelector('#projets [data-cwd="D:/Autre lieu"]');
  check("Lieu · « Travailler ici » existe sur l'autre dossier",
    !!allerLa, allerLa ? allerLa.textContent.trim() : "absent");
  allerLa.click();
  await wait(120);

  // ⚠ LE POINT. Le fil ne doit PAS avoir été jeté au passage.
  check("Lieu · le fil ouvert SURVIT au changement de dossier",
    win.eval("conv.turns.length") === 1
    && win.eval("conv.info && conv.info.cwd") === "D:/Atelier",
    "tours : " + win.eval("conv.turns.length"));
  check("Lieu · ...et la gélule ambre paraît ENFIN, par le bouton",
    !!lieu().querySelector(".l-lieu.change")
    && /Atelier/.test(lieu().textContent)
    && /Autre lieu/.test(lieu().textContent),
    lieu().textContent.trim().slice(0, 70));

  // « Ouvrir un fil là-bas » est le seul endroit où la fermeture est un choix
  // NOMMÉ. C'est là que le fil se perd — et on l'a demandé.
  win.document.getElementById("lieuPop")
    .querySelector('[data-lieu="nouveau"]').click();
  await wait(60);
  check("Lieu · « Ouvrir un fil là-bas » ferme le fil, mais on l'a DIT",
    win.eval("conv.turns.length") === 0,
    "tours : " + win.eval("conv.turns.length"));

  // On rend la session telle qu'on l'a trouvée.
  win.eval("conv.sessionId = __sauve.sid; conv.storedId = __sauve.stid;"
    + " conv.info = __sauve.info; conv.status = __sauve.status;"
    + " conv.running = __sauve.running; conv.approval = __sauve.approval;"
    + " conv.turns.length = 0; __sauve.turns.forEach(function(t){ conv.turns.push(t); });"
    + " CFG.SESSION_CWD = __sauve.cwd; nav('Discuter'); paintThread(); paintHint();");
  await wait(60);
  check("le mot-marque se fond pour laisser la place",
    win.getComputedStyle(win.document.querySelector("#pDiscuter .u-marque"))
      .opacity === "0");
  check("et le champ se met à répondre",
    win.document.getElementById("reply").getAttribute("placeholder")
      .indexOf("pondre") >= 0,
    win.document.getElementById("reply").getAttribute("placeholder"));

  const submit = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .find((m) => m.method === "prompt.submit");
  check("le message est soumis", !!submit);
  check("il est soumis sur la session qui vient d'être créée",
    submit && submit.params.session_id === "live_1", submit && submit.params.session_id);

  const ws = FakeWS.last;
  ws.push({ jsonrpc: "2.0", method: "event", params: { type: "message.start", session_id: "live_1" } });
  ws.push({ jsonrpc: "2.0", method: "event", params: { type: "tool.start", session_id: "live_1",
    payload: { tool_id: "t1", name: "read_file", context: "plan.md" } } });
  ws.push({ jsonrpc: "2.0", method: "event", params: { type: "tool.complete", session_id: "live_1",
    payload: { tool_id: "t1", name: "read_file" } } });
  ws.push({ jsonrpc: "2.0", method: "event", params: { type: "message.delta", session_id: "live_1",
    payload: { text: "Voici le point." } } });
  ws.push({ jsonrpc: "2.0", method: "event", params: { type: "message.complete", session_id: "live_1",
    payload: { status: "ok" } } });
  await wait(80);

  txt = win.document.getElementById("thread").textContent;
  check("le message de l'utilisateur s'affiche", txt.includes("Fais le point"));
  check("la réponse de l'agent s'affiche", txt.includes("Voici le point."));
  check("l'outil utilisé s'affiche", txt.includes("read_file"));
  check("le composer est rendu à la fin du tour",
    win.document.getElementById("snd1").style.display !== "none");

  console.log("\n--- La demande d'accord ---");
  /* La maquette pose une bulle qui NE part pas toute seule pour une DECISION,
     et fait sonner la cloche. C'est exactement ce qu'est une approval.request :
     l'agent est bloque tant qu'on n'a pas repondu. On verifie donc la cloche,
     la bulle et le panneau — pas une boite inline. */
  ws.push({ jsonrpc: "2.0", method: "event", params: { type: "approval.request", session_id: "live_1",
    payload: { command: "write_file(x.md)", reason: "ecrire dans le projet",
               choices: ["once", "session", "always", "deny"] } } });
  await wait(90);

  const badge = win.document.querySelector("#bellIc .badge");
  check("la cloche signale la demande", !!badge, "aucun badge");
  check("le badge est marque decision", badge && badge.classList.contains("dec"));
  check("le menu porte un point sur la fenetre concernee",
    !!win.document.querySelector("#railItems .rail-btn .raildot"));

  const toast = win.document.querySelector("#toasts .toast");
  check("une bulle apparait", !!toast);
  check("la bulle dit ce qui va etre fait",
    toast && toast.textContent.includes("write_file"),
    toast ? toast.textContent.slice(0, 80) : "");
  check("elle propose d'autoriser et de refuser",
    toast && toast.querySelectorAll("button").length === 2);
  // Le libellé était INVERSÉ : quand Hermès proposait une portée large, le
  // bouton portait le mot le plus vague et faisait l'action la plus étroite.
  check("son « oui » dit ce qu'il vaut, et ne promet pas plus",
    toast && /Autoriser une fois/.test(toast.textContent),
    toast ? toast.textContent.slice(0, 90) : "");
  check("elle renvoie au fil pour les portées plus larges",
    toast && /plus largement/.test(toast.textContent));

  /* Le fil porte la décision — c'est là qu'on est, et c'est ce qui bloque
     l'agent. Avant, `conv.approval` était posé par le core et `paintThread()`
     ne le rendait jamais : la seule chose qui le disait était la cloche. */
  const ask = win.document.querySelector("#thread .u-accord .ask");
  check("la demande apparaît DANS le fil", !!ask);
  check("elle dit ce que l'agent s'apprête à faire",
    ask && ask.querySelector(".u-quoi")
    && /write_file/.test(ask.querySelector(".u-quoi").textContent));
  const opts = ask ? ask.querySelectorAll(".opt[data-ch]") : [];
  check("les trois portées proposées par Hermès y sont", opts.length === 3,
    opts.length + " option(s)");
  check("chacune porte ce qu'elle engage, sous son libellé",
    Array.from(opts).every((o) => !!o.querySelector(".sub")));
  check("« toujours » est séparé des deux autres",
    !!(ask && ask.querySelector(".u-sep"))
    && !!(ask && ask.querySelector('.opt.u-fort[data-ch="always"]')));
  check("« refuser » quitte la liste et redevient un bouton",
    !!(ask && ask.querySelector('.dangerlink[data-ch="deny"]')));

  // Une decision ne s'efface pas toute seule : on la retrouve dans le panneau.
  // `Notifs` est un `const` de script : il vit dans la portee lexicale
  // globale, pas sur `window`. On l'atteint donc par eval, comme le ferait
  // la console du navigateur.
  win.eval("Notifs.toggle()");
  await wait(50);
  const np = win.document.getElementById("npanel");
  check("le panneau des notifications s'ouvre", np.classList.contains("on"));
  // Le groupe se nomme par ce qu'il DEMANDE, plus par sa duree (passe Cowork
  // du 2026-08-10). « A decider » disait le contraire de ce qu'il contenait
  // des qu'une panne y entrait.
  check("la demande y figure sous « Votre réponse est attendue »",
    /Votre réponse est attendue/.test(np.textContent)
    && np.textContent.includes("write_file"),
    np.textContent.slice(0, 110));
  const gRep = np.querySelector(".n-groupe:not(.panne)");
  check("...et le groupe porte son compte", gRep && gRep.querySelector(".k")
    && gRep.querySelector(".k").textContent === "1",
    gRep ? gRep.textContent : "aucun groupe");

  FakeWS.sent.length = 0;
  np.querySelector("[data-yes]").click();
  await wait(50);
  const resp = FakeWS.sent.map((x) => JSON.parse(x.trim()))
    .find((m) => m.method === "approval.respond");
  check("la reponse part au serveur", !!resp);
  check("elle porte la session et le choix, sans identifiant invente",
    resp && resp.params.session_id === "live_1" && resp.params.choice === "once"
    && !("request_id" in resp.params), JSON.stringify(resp && resp.params));
  FakeWS.last.push({ jsonrpc: "2.0", id: resp.id, result: { resolved: 1 } });
  await wait(70);
  check("la cloche se tait une fois repondu",
    !win.document.querySelector("#bellIc .badge"));
  const done = win.document.querySelector("#thread .u-accord .ask.done");
  check("le fil garde le choix retenu (.ask.done)", !!done);
  check("il dit lequel", done && /Autoriser cette fois/.test(done.textContent),
    done ? done.textContent.slice(0, 70) : "");

  /* Les deux portées que la bulle ne porte pas se répondent depuis le fil.
     Elles existaient côté protocole depuis toujours — `_choices` était capté
     puis jeté, et `respondApproval` recevait `once` ou `deny` en dur. */
  ws.push({ jsonrpc: "2.0", method: "event", params: { type: "approval.request", session_id: "live_1",
    payload: { command: "rm -rf build", reason: "effacer un dossier",
               choices: ["once", "session", "always", "deny"] } } });
  await wait(90);
  check("une nouvelle demande efface l'état précédent",
    !win.document.querySelector("#thread .u-accord .ask.done"));
  FakeWS.sent.length = 0;
  win.document.querySelector('#thread .opt[data-ch="always"]').click();
  await wait(60);
  const r2 = FakeWS.sent.map((x) => JSON.parse(x.trim()))
    .find((m) => m.method === "approval.respond");
  check("le choix large part vraiment au serveur",
    r2 && r2.params.choice === "always", JSON.stringify(r2 && r2.params));
  check("le fil retient « toujours »",
    /Autoriser toujours/.test(win.document.getElementById("thread").textContent));
  FakeWS.last.push({ jsonrpc: "2.0", id: r2.id, result: { resolved: 1 } });
  await wait(50);

  // Et un refus depuis le fil.
  ws.push({ jsonrpc: "2.0", method: "event", params: { type: "approval.request", session_id: "live_1",
    payload: { command: "git push --force", choices: ["once", "deny"] } } });
  await wait(80);
  check("une demande sans portée large n'affiche qu'une option",
    win.document.querySelectorAll("#thread .opt[data-ch]").length === 1,
    win.document.querySelectorAll("#thread .opt[data-ch]").length + " option(s)");
  FakeWS.sent.length = 0;
  win.document.querySelector('#thread [data-ch="deny"]').click();
  await wait(60);
  const r3 = FakeWS.sent.map((x) => JSON.parse(x.trim()))
    .find((m) => m.method === "approval.respond");
  check("le refus part au serveur", r3 && r3.params.choice === "deny",
    JSON.stringify(r3 && r3.params));
  check("et le fil le dit", /Refusé/.test(win.document.getElementById("thread").textContent));
  /* ⚠ ET LE BANDEAU FLOTTANT TOMBE AVEC. Une demande vit a TROIS endroits : la
     cloche, le fil, et le bandeau. `drop()` ne connaissait que `this.list` — il
     retirait la demande de la cloche et laissait le bandeau a l'ecran, avec ses
     deux boutons, apres un refus donne dans le fil.
     Le clic ne reautorisait rien (`answer` sort si l'entree a disparu) : il ne
     faisait RIEN, sans un mot. Un bouton vivant sur une decision deja prise est
     pire qu'un bouton absent.
     Vu le 2026-08-12, la PREMIERE fois que la porte s'est ouverte pour de vrai.
     Aucun scenario ne pouvait l'atteindre avant : Hermes ne demandait jamais. */
  check("...et le bandeau flottant tombe avec : une décision prise l'est partout",
    !win.document.querySelector("#toasts .toast .nacts"),
    win.document.querySelectorAll("#toasts .toast").length + " bandeau(x) restant(s)");
  FakeWS.last.push({ jsonrpc: "2.0", id: r3.id, result: { resolved: 1 } });
  await wait(50);

  /* ⚠ LA VRAIE FORME DU PAYLOAD, RELEVEE SUR L'INSTALLATION LE 2026-08-12.
     Le faux d'ici envoyait `{tool, command, path}`. Le vrai Hermes, pour une
     commande terminal, envoie :
       {command, pattern_key, pattern_keys, description,
        allow_permanent, allow_session, choices}
     — NI `tool`, NI `path`. C'est ce qui casse `refusDeMode`, qui lit
     `pl.tool || pl.name` et ne trouve rien : en Plan, une commande n'est donc
     PAS refusee d'office, elle est soumise a la personne.
     Dixieme fois qu'un faux qui ne ment pas comme le vrai ne prouve rien. */
  {
    const vrai = { command: 'echo "DROP TABLE clients"', pattern_key: "SQL DROP",
      pattern_keys: ["SQL DROP"], description: "SQL DROP",
      allow_permanent: true, allow_session: true,
      choices: ["once", "session", "always", "deny"] };
    check("le payload d'accord d'Hermès n'a NI tool NI path — le faux en avait",
      !("tool" in vrai) && !("path" in vrai) && !!vrai.command && !!vrai.pattern_key);
    win.eval("conv.approval = null; conv.turns.length = 0;");
    win.eval('setMode2("plan");');
    win.eval("link.listeners.forEach(function(f){ f('approval.request', "
      + JSON.stringify({ type: "approval.request", session_id: "S1", payload: vrai })
      + "); });");
    await wait(40);
    win.eval("paintThread()");
    check("...et en Plan, une COMMANDE est refusée d'office comme une écriture",
      !!win.document.querySelector("#thread .m-refus")
      && win.eval("conv.approval") === null,
      win.eval("conv.approval") ? "la question a été posée" : "refusée");
    win.eval('setMode2("build"); conv.approval = null; conv.turns.length = 0; paintThread();');
  }

  console.log("\n--- Les pieces jointes ---");
  /* Le navigateur n'a pas de chemin serveur : il envoie les octets, le
     gateway materialise le fichier et rend une reference « @file:… ». C'est
     elle qui part avec le message — pas le nom du fichier. */
  const blob = new win.File(["contenu de test"], "note.txt", { type: "text/plain" });
  win.eval("window.__surFichiers = surFichiers");
  const pj = win.__surFichiers([blob]);
  await wait(80);
  const att = FakeWS.sent.map((x) => JSON.parse(x.trim()))
    .find((m) => m.method === "file.attach");
  check("le fichier part par file.attach", !!att, JSON.stringify(FakeWS.sent.slice(-2)));
  if (att) {
    check("il porte la session, le nom et les octets",
      att.params.session_id === "live_1" && att.params.path === "note.txt"
      && String(att.params.data_url || "").startsWith("data:"),
      JSON.stringify(Object.keys(att.params)));
    FakeWS.last.push({ jsonrpc: "2.0", id: att.id,
      result: { attached: true, name: "note.txt", ref_text: "@file:note.txt" } });
  }
  await pj;
  await wait(60);
  check("la piece jointe s'affiche avant l'envoi",
    !!win.document.querySelector("#jointes1 .u-jointe"),
    win.document.getElementById("jointes1").innerHTML.slice(0, 90));

  FakeWS.sent.length = 0;
  win.document.getElementById("reply").value = "Regarde ce fichier";
  win.document.getElementById("composer").dispatchEvent(new win.Event("submit"));
  await wait(80);
  const env = FakeWS.sent.map((x) => JSON.parse(x.trim()))
    .find((m) => m.method === "prompt.submit");
  check("la reference part avec le message",
    env && env.params.text.includes("@file:note.txt"),
    env ? env.params.text : "aucun prompt.submit");
  check("la puce disparait une fois envoyee",
    !win.document.querySelector("#jointes1 .u-jointe"));
  /* ⚠ LA REFERENCE PART, MAIS ELLE NE SE LIT PAS. Le fil affichait la bulle
     « @file:.hermes/desktop-attachments/note-releve.txt » — de la plomberie
     rendue en clair, sous le nom de la personne. Et une image COLLEE, dont la
     reference est consommee de la meme facon, ne laissait rien du tout : zero
     <img>, zero nom, aucune trace de ce qu'on avait envoye.
     Ces deux verifications se tiennent : la reference sort du fil ET la piece
     y reste, en puce. Sans la seconde, retirer la reference ferait disparaitre
     le fichier sans un mot — exactement le defaut qu'on repare. */
  {
    const fil = win.document.getElementById("thread");
    check("...mais la reference ne se lit pas dans le fil",
      !/@file:/.test(fil.textContent), fil.textContent.slice(-90));
    check("...et ce qu'on a joint reste visible, en puce, dans la bulle",
      !!fil.querySelector(".msg.you .u-jointe")
      && /note\.txt/.test(fil.querySelector(".msg.you .u-jointes").textContent),
      fil.querySelector(".msg.you .u-jointes")
        ? fil.querySelector(".msg.you .u-jointes").textContent : "aucune puce");
  }


  console.log("\n--- Le tour qu'on coupe en corrigeant ---");
  /* Vu en jouant un scenario le 2026-08-12 : on corrige sa demande pendant que
     l'agent travaille, il repart sur la correction, et le premier bloc
     « Ulysse » reste vide POUR TOUJOURS. En relisant le fil, on voit Ulysse ne
     rien repondre sans savoir que c'est nous qui l'avons coupe.
     Trancher par kuchu : marquer TOUT DE SUITE, pas a la fermeture du tour. */
  {
    win.eval('conv.turns.length = 0; conv.approval = null; conv.running = false;');
    win.eval('newTurn("user", "Un plan pour 2026").state = "done"; newTurn("assistant");');
    win.eval("conv.running = true; paintThread();");
    win.document.getElementById("reply").value = "Attends, c'est 2025";
    win.document.getElementById("composer").dispatchEvent(new win.Event("submit"));
    await wait(80);
    const fil = win.document.getElementById("thread");
    check("un tour coupé en plein vol est marqué tout de suite, pas au bout de 3 min",
      /Interrompu par votre correction/.test(fil.textContent),
      fil.textContent.replace(/\s+/g, " ").slice(0, 90));
    /* ⚠ DEUX DEFAUTS VUS A L'ECRAN, JAMAIS AU BANC, LE JOUR MEME OU CETTE NOTE
       EST NEE. Le banc verifiait que le TEXTE est la ; il ne regardait ni son
       habit ni ce qui l'entoure.
       ① La note portait `.u-coupe` — une classe deja prise par l'avis de
          troncature au plafond de tokens, retire mais dont la regle survivait
          en orpheline. Elle s'habillait donc en ambre a lisere et heritait
          d'un sens qui n'etait pas le sien.
       ② Le tour reste `streaming` (le gateway n'annonce jamais sa fin), donc
          le curseur clignotait JUSTE SOUS la note : « j'ecris » au-dessus de
          « je me suis arrete ». */
    check("...sous son propre nom, pas sous celui de l'avis de troncature",
      !!fil.querySelector(".u-interrompu") && !fil.querySelector(".u-coupe"),
      fil.querySelector(".u-coupe") ? "porte encore .u-coupe" : "");
    check("...et le curseur cesse de clignoter : on n'écrit plus et on ne l'a plus",
      !fil.querySelector('.msg.ulysse .u-md[data-caret="1"]'),
      fil.querySelector('[data-caret="1"]') ? "un curseur clignote encore" : "");
    /* ⚠ CE GARDE A TUE MA PROPRE PRECAUTION, ET C'ETAIT LE BON RESULTAT.
       Marquer tot semblait risquer d'accuser un tour LENT qui allait repondre.
       J'avais donc ecrit un mecanisme pour LEVER la marque a la premiere
       reponse. Ce garde, ecrit pour le prouver, est tombe du premier coup :
       `currentAssistantTurn()` s'ARRETE au premier tour utilisateur en
       remontant, donc une reponse tardive entre dans un tour NEUF et le bloc
       marque reste vide quoi qu'il arrive.
       La marque est exacte par construction ; la precaution etait du code mort
       qui pretendait le contraire. C'est cette propriete-la qu'on garde. */
    const marques = () =>
      win.eval('conv.turns.filter(function(t){return t.interrompu}).length');
    check("...et un seul tour porte la marque, celui qui est resté vide",
      marques() === 1, marques() + " tour(s) marqué(s)");
    const avant = win.eval("conv.turns.length");
    ws.push({ jsonrpc: "2.0", method: "event", params: {
      type: "message.delta", session_id: "live_1",
      payload: { text: "réponse tardive du tour coupé" } } });
    await wait(60);
    check("...une réponse tardive entre dans un tour NEUF, jamais dans le bloc marqué",
      win.eval("conv.turns.length") === avant + 1
      && win.eval("conv.turns[conv.turns.length-1].text")
           .indexOf("réponse tardive") >= 0
      && !win.eval("conv.turns[conv.turns.length-1].interrompu"),
      "tours : " + avant + " → " + win.eval("conv.turns.length"));
    check("...donc la marque tient : le bloc coupé ne recevra plus rien",
      marques() === 1
      && /Interrompu par votre correction/
           .test(win.document.getElementById("thread").textContent),
      marques() + " tour(s) marqué(s)");
    /* Un tour qui a DEJA produit n'est pas « interrompu » : il est incomplet,
       ce qui n'est pas la meme chose et ne se dit pas pareil. */
    win.eval('conv.turns.length = 0; conv.running = false;');
    win.eval('newTurn("user", "x").state = "done";');
    win.eval('var _a = newTurn("assistant"); _a.text = "j\'ai deja ecrit ceci";');
    win.eval("conv.running = true;");
    win.document.getElementById("reply").value = "autre chose";
    win.document.getElementById("composer").dispatchEvent(new win.Event("submit"));
    await wait(80);
    check("...et un tour qui avait déjà produit n'est PAS accusé",
      win.eval('conv.turns.filter(function(t){return t.interrompu}).length') === 0);
    win.eval('conv.turns.length = 0; conv.running = false; paintThread();');
  }

  console.log("\n--- La coupure du lien ---");
  ws.onclose({ code: 1006 });
  await wait(60);
  txt = win.document.getElementById("thread").textContent;
  check("la coupure est annoncée à l'utilisateur", txt.includes("Lien interrompu"));
  /* ⚠ ET ELLE N'ENVOIE PLUS RELANCER LE .BAT POUR RIEN. Mesure du 2026-08-12,
     pendant une vraie coupure : les trois backends repondaient, `link.state`
     etait deja revenu a « open » — `_scheduleRetry()` rebranche seul — et le
     message suivant est parti sans rien relancer. Le banc ne verifiait que la
     PRESENCE du message, jamais que son conseil soit encore vrai. */
  check("...et elle dit qu'Ulysse se rebranche seul, pas de relancer le .bat",
    /rebranche tout seul/.test(txt) && !/Lien interrompu[^]{0,120}lancer_ulysse/.test(txt),
    txt.slice(txt.indexOf("Lien interrompu"), txt.indexOf("Lien interrompu") + 150));
  check("l'identifiant de session mort est abandonné (C3)",
    win.eval("conv.sessionId") === null, String(win.eval("conv.sessionId")));
  // `hs` est la cinquieme classe d'etat : c'est elle qui marquera le kebab.
  // En Cowork le lien EST la condition — sans lui l'agent ne recoit rien.
  check("une brique qui ne répond plus pose la classe hs",
    win.document.getElementById("pDiscuter").classList.contains("hs"),
    "état du lien : " + win.eval("link.state"));

  /* ══ LE MODE, QUI N'EST PLUS UN MOTEUR MAIS UNE PERMISSION ═════════════════
     Ce bloc éprouvait « le mode Chat (sans outils) » : /proxy/chat, le plafond
     PROXY_MAX_TOKENS, l'avis de troncature. Tout cela a disparu le 2026-08-12.

     kuchu : « si l'on ne peut pas éditer des fichiers, créer des fichiers, les
     télécharger, il ne sert à rien, strictement à rien. » Le mode Chat ne
     choisissait pas une posture, il amputait le produit — et nous étions en
     train de lui rendre une à une les capacités de Cowork.

     Ce qui suit éprouve ce qui l'a remplacé : la porte d'approbation, le plan
     lisible, et la bascule qui vaut validation.
     Voir PASSE-DESIGN-UN-SEUL-FIL.md. */
  console.log("\n--- Le mode : une permission, pas un moteur ---");
  const segs = win.document.querySelectorAll('.u-modeseg button[data-mode="plan"]');
  check("la bascule est sous le composeur, et il n'y en a qu'une",
    segs.length === 1, segs.length + " trouvee(s)");
  const boutons = win.document.querySelectorAll(".u-modeseg button");
  check("Plan est proposé avant Build",
    boutons[0].dataset.mode === "plan" && /Plan/.test(boutons[0].textContent),
    boutons[0].textContent);
  segs[0].click();
  await wait(30);
  check("la bascule répond", segs[0].classList.contains("on")
    && win.eval("mode") === "plan");

  /* ⚠ PLUS AUCUN APPEL A /proxy/chat. C'etait le chemin du mode pur : le
     modele nu, sans session, sans outils. Il ne doit plus rien emprunter —
     un second chemin qui survit est un second endroit ou diverger. */
  fetched.length = 0;
  const avantPlan = FakeWS.sent.length;
  win.document.getElementById("reply").value = "Un plan de chapitre";
  win.document.getElementById("composer").dispatchEvent(new win.Event("submit"));
  await wait(80);
  /* Le faux ne repond pas tout seul — c'est voulu, ca permet de regarder la
     trame avant d'y repondre. Mais un message qui attend une session qui
     n'arrive jamais ne produit AUCUN `prompt.submit`, et la verification
     suivante n'aurait rien a lire. On ouvre donc la session a la main. */
  FakeWS.sent.slice(avantPlan).forEach((brut) => {
    let m; try { m = JSON.parse(brut.trim()); } catch (e){ return; }
    if (m && m.method === "session.create"){
      FakeWS.last.push({ jsonrpc: "2.0", id: m.id,
        result: { session_id: "live_1", info: { cwd: "C:/p" } } });
    }
  });
  await wait(140);
  check("aucun message ne passe plus par /proxy/chat",
    !fetched.some((f) => f.path === "/proxy/chat"),
    JSON.stringify(fetched.map((f) => f.path)));
  {
    /* ⚠ ON CHERCHE DU CODE, PAS DES MOTS. Écrite en cherchant « sendPure »
       n'importe où, cette vérification tombait sur mes propres commentaires
       — ceux qui racontent POURQUOI le chemin a été retiré, et qui doivent
       rester. Un test qui interdit de nommer ce qu'on a supprimé interdit
       d'en garder la mémoire. */
    const appSrc = fs.readFileSync(path.join(DIR, "ulysse-app.js"), "utf8");
    const coreSrc2 = fs.readFileSync(path.join(DIR, "ulysse-core.js"), "utf8");
    check("...et le chemin pur n'existe plus dans le code",
      !/function\s+sendPure|sendPure\s*\(/.test(appSrc)
      && !/pureTurns\s*[.[]|pureHistory\s*[.[]|pureBusy\s*=/.test(appSrc)
      && !/pureChat\s*:/.test(coreSrc2),
      /sendPure\s*\(/.test(appSrc) ? "sendPure appelé" : "");
    /* Une issue qui n'ouvre plus est pire qu'une absence d'issue : on la
       prend, et on retombe devant la même porte. Les messages du lien coupé
       renvoyaient vers « la Discussion, elle n'a pas besoin de ce lien ».
       Le banc ne l'avait pas vu — il vérifie qu'un message dit QUOI FAIRE,
       jamais que ce qu'il dit soit encore vrai. */
    /* ⚠ ON VISE LES CHAINES, PAS LE TEXTE. Même piège que juste au-dessus, et
       je l'ai repris deux fois : la première version attrapait le commentaire
       qui EXPLIQUE le retrait. On exige donc que la phrase soit dans un
       littéral entre guillemets droits — c'est-à-dire dans quelque chose que
       quelqu'un lira à l'écran. */
    /* `[^"]*` traverse les retours à la ligne : il enjambait soixante lignes
       pour atteindre le commentaire, exactement ce qu'on voulait éviter.
       `[^"\n]*` reste dans la ligne, là où vit un littéral. */
    const versUnModeMort = /"[^"\n]*passez en (Discussion|Cowork)/;
    check("...et aucun message ne renvoie vers un mode qui n'existe plus",
      !versUnModeMort.test(coreSrc2) && !versUnModeMort.test(appSrc),
      versUnModeMort.test(coreSrc2) ? "renvoi dans ulysse-core.js"
        : versUnModeMort.test(appSrc) ? "renvoi dans ulysse-app.js" : "");
  }

  /* ⚠ LA LIGNE DE CADRE PART DANS LE TOUR, PAS DANS LE SYSTEM PROMPT.
     Le prefixe pese 15 067 tokens (mesure sur l'installation de kuchu) et le
     cache ne tient que s'il ne bouge pas. L'ecrire dans le system prompt
     l'invaliderait A CHAQUE BASCULE — la simplicite payee en argent. */
  /* ⚠ ET IL FAUT VERIFIER QU'ELLE PART VRAIMENT. Ecrite en n'appelant que
     `ligneDeMode()`, cette verification prouvait que la fonction rend la
     bonne phrase — pas qu'elle atteint le fil. Retirer `+ ligneDeMode()` de
     `onSend` laissait le banc au vert : mutation posee, mutation AVEUGLE.
     On regarde donc la trame envoyee. */
  // Que la ligne parte VRAIMENT est verifie plus haut, sur une session vivante
  // (« le mode voyage avec le message »). Ici le lien est deja coupe par les
  // essais precedents : on n'y eprouve que la phrase elle-meme.
  /* ⚠ UN ONGLET CACHÉ NE REÇOIT PAS DE `requestAnimationFrame`. Le repaint y
     etait suspendu ET `paintQueued` restait bloque a `true` : tout changement
     d'etat suivant repartait par le `return`. Pendant qu'on regarde ailleurs,
     l'agent travaille et l'ecran ne bouge plus — le bouton d'arret reste
     cache alors que le tour tourne.
     Constate le 2026-08-12 en jouant un scenario reel, jamais au banc. */
  {
    const appSrc = fs.readFileSync(path.join(DIR, "ulysse-app.js"), "utf8");
    check("un onglet caché continue de se repeindre — rAF y est suspendu",
      /document\.hidden[\s\S]{0,80}setTimeout/.test(appSrc)
      && /visibilitychange/.test(appSrc),
      /document\.hidden/.test(appSrc) ? "" : "aucun repli hors rAF");
  }
  /* Et le bouton d'arret suit l'etat, pas le mode : il etait conditionne a
     `mode === "cowork"`, donc invisible dans un mode ou l'on pouvait pourtant
     lancer un tour. */
  win.eval("conv.running = true; paintHint();");
  check("...et le bouton d'arrêt apparaît dès qu'un tour tourne",
    win.document.getElementById("stopBtn").style.display !== "none"
    && win.document.getElementById("snd1").style.display === "none",
    "stop=" + win.document.getElementById("stopBtn").style.display
    + " envoi=" + win.document.getElementById("snd1").style.display);
  win.eval("conv.running = false; paintHint();");

  /* ══ UNE PROMESSE QU'ON NE TIENT PAS EST PIRE QU'AUCUNE PROMESSE ═══════════
     La porte ne se declenche que sur `approval.request`. Or `approvals.mode`
     valait « smart » chez kuchu : Hermes s'auto-autorise et n'emet AUCUNE
     demande. Le mode Plan annoncait « rien ne sera modifie sur le disque »
     sans pouvoir le tenir — l'agent a lance `terminal` trois fois sous nos
     yeux. Trouve en jouant un scenario reel, jamais au banc.
     Ulysse ne peut pas reparer seul (le reglage est GLOBAL, il vaut pour le
     TUI). Alors il regarde, il le DIT, et il propose. Le clic est l'accord. */
  win.eval('conv.turns.length = 0; modeAccords = "smart"; setMode2("plan"); paintThread();');
  check("accords en « smart » : Ulysse dit que Plan ne garantit rien",
    !!win.document.getElementById("accordsManuel")
    && /s'autorise lui-même/.test(win.document.getElementById("thread").textContent),
    win.document.getElementById("accordsManuel") ? "" : "aucun avertissement");
  /* ⚠ ET LA PROMESSE ELLE-MEME DISPARAIT. Le garder tout en affichant
     l'avertissement, ce serait dire une chose et son contraire sur le meme
     ecran — et c'est la version affirmative qu'on retiendrait. */
  check("...et la phrase « rien ne sera modifié » n'est PLUS affichée",
    !/[Rr]ien ne sera modifi/.test(win.document.getElementById("thread").textContent),
    win.document.getElementById("thread").textContent.slice(0, 70));
  /* ⚠ CE BANC GARDAIT UNE FAUSSETE. Il verifiait ici « accords en manuel : la
     promesse revient, l'avertissement part » — il exigeait le defaut.
     Eprouve le 2026-08-12 APRES le passage en manuel, donc dans les conditions
     que cet ecran reclamait : `write_file` a ecrit, `terminal echo` a tourne
     en 185 ms, ZERO `approval.request`. Le code d'Hermes le dit :
       · approval.py:3938 — `if not warnings: return {"approved": True}`,
         avant toute lecture du mode. Sans motif de danger, pas de question,
         dans TOUS les modes ;
       · file_tools.py:706 — la seule porte toujours-demander sur une ecriture
         couvre agents.md, claude.md, soul.md, .cursorrules. Rien d'autre.
     Il n'existe donc aucun reglage sous lequel « rien ne sera modifie sur le
     disque » soit vrai. La phrase est retiree partout, et l'encart ne
     disparait plus : il change de propos. */
  win.eval('modeAccords = "manual"; paintThread();');
  {
    const fil = win.document.getElementById("thread").textContent;
    check("accords en « manuel » : la promesse ne revient PAS — elle n'est vraie nulle part",
      !/[Rr]ien ne sera modifi/.test(fil), fil.slice(0, 80));
    check("...et l'écran ne se tait pas non plus : il dit ce qui n'est pas retenu",
      /ne retient pas/.test(fil) && /sans question/.test(fil), fil.slice(0, 120));
    check("...sans bouton, puisqu'il n'y a plus rien à basculer",
      !win.document.getElementById("accordsManuel"));
  }
  /* Tant qu'on n'a pas pu lire le reglage, on n'affirme RIEN — ni promesse,
     ni accusation, ni portee. On ne remplace pas un mensonge par un autre. */
  win.eval('modeAccords = null; paintThread();');
  check("...et tant qu'on ignore le réglage, on n'affirme rien du tout",
    !win.document.getElementById("accordsManuel")
    && !/[Rr]ien ne sera modifi/.test(win.document.getElementById("thread").textContent)
    && !/ne retient pas/.test(win.document.getElementById("thread").textContent));
  /* La phrase ne doit pas non plus se reinstaller par la bande — elle vivait a
     TROIS endroits : l'accueil, la note sous le composeur, et l'encart. */
  win.eval('modeAccords = "manual"; conv.turns.length = 0; setMode2("plan"); paintThread();');
  check("...et la promesse n'est nulle part ailleurs sur l'écran",
    !/[Rr]ien n(?:e sera|'est) modifi/.test(win.document.getElementById("pDiscuter").textContent),
    win.document.getElementById("modenote1")
      ? win.document.getElementById("modenote1").textContent : "");

  check("la ligne de mode tient en une ligne courte — le préfixe pèse déjà 15 067 tokens",
    /\[Mode Plan/.test(win.eval("ligneDeMode()"))
    && win.eval("ligneDeMode()").length < 200,
    win.eval("ligneDeMode()").trim().slice(0, 70));
  win.eval('setMode2("build")');
  check("...et elle change avec le mode",
    /\[Mode Build/.test(win.eval("ligneDeMode()")));
  win.eval('setMode2("plan")');
  {
    const appSrc = fs.readFileSync(path.join(DIR, "ulysse-app.js"), "utf8");
    check("...jamais dans le préambule de session — le cache sauterait",
      !/preamble[\s\S]{0,200}Mode (Plan|Build)/.test(appSrc));
  }

  /* ══ LA PORTE D'APPROBATION ════════════════════════════════════════════════
     En Plan, ecrire et executer sont refuses AVANT meme d'afficher la
     question. C'est structurel : la ligne de cadre le dit a l'agent, mais si
     le modele l'oublie, la porte tient. Une garantie qui repose sur la bonne
     volonte du modele n'est pas une garantie. */
  /* ⚠ LE PAYLOAD EST SOUS `params.payload`, PAS A PLAT. Ecrit a plat, ce
     harnais envoyait des evenements vides : le produit ne refusait rien et
     les verifications passaient au rouge en accusant le produit. Un faux qui
     ne parle pas comme le vrai n'eprouve rien. */
  const evenement = (type, payload) => {
    win.eval('link.listeners.forEach(function(f){ f(' + JSON.stringify(type)
      + ', ' + JSON.stringify({ type: type, session_id: "S1", payload: payload })
      + '); });');
  };
  const demandeAccord = (outil, cible) => evenement("approval.request",
    { tool: outil, command: cible, path: cible,
      choices: ["once", "session", "deny"] });
  win.eval("conv.approval = null; conv.turns.length = 0;");
  demandeAccord("write_file", "C:/p/note.md");
  await wait(40);
  win.eval("paintThread()");
  let refus = win.document.querySelector("#thread .m-refus");
  check("en Plan, une écriture est refusée sans qu'on ait à répondre",
    !!refus && win.eval("conv.approval") === null,
    refus ? "refusée" : "la question a été posée");
  /* ⚠ UN REFUS QUI S'ARRETE A « NON » EST UN MUR POLI. Il doit dire sa cause
     ET sa sortie : sans ca, on voit l'agent s'interrompre sans savoir que le
     mode en est la raison, ni qu'un clic suffit. */
  check("...et le refus dit sa cause ET la sortie",
    !!refus && /Plan/.test(refus.textContent)
    && /Build/.test(refus.textContent)
    && /write_file/.test(refus.textContent),
    refus ? refus.textContent.trim().slice(0, 90) : "");
  /* ⚠ QUATRIEME ENDROIT OU LA PROMESSE VIVAIT. Ce refus disait « nous sommes
     en Plan, ou rien n'est modifie sur le disque » — la meme affirmation que
     celle retiree de l'accueil, de la note et de l'encart, a un TEMPS DE VERBE
     pres, ce qui lui a permis de passer sous le garde ecrit le matin meme.
     Trouve en relisant le fichier, pas en le testant.
     Ulysse refuse ce qu'on lui SOUMET ; il ne peut pas jurer que rien ne
     passe — Hermes ne soumet ni une ecriture ordinaire ni une commande sans
     motif de danger (approval.py:3938, file_tools.py:706). */
  check("...sans jurer que rien ne peut être modifié — il ne le peut pas",
    !!refus && !/[Rr]ien n(?:e sera|'est) modifi/.test(refus.textContent),
    refus ? refus.textContent.trim().slice(0, 90) : "");
  // Lire n'est pas modifier : le mode Plan n'a aucune raison de s'y opposer.
  win.eval("conv.approval = null;");
  demandeAccord("read_file", "C:/p/note.md");
  await wait(40);
  check("...mais une LECTURE passe : le mode ne refuse que ce qui modifie",
    win.eval("conv.approval") !== null);
  /* ⚠ ON NOMME CE QU'ON REFUSE, JAMAIS CE QU'ON AUTORISE. Une liste blanche
     laisserait passer tout outil ajoute demain par Hermes — la promesse
     rompue en silence. Un outil inconnu demande l'accord, comme avant. */
  win.eval("conv.approval = null;");
  demandeAccord("outil_invente_demain", "quelque chose");
  await wait(40);
  check("...et un outil inconnu demande l'accord au lieu d'être avalé",
    win.eval("conv.approval") !== null);
  // En Build, plus rien n'est refuse d'office : c'est tout l'objet du mode.
  win.eval('setMode2("build"); conv.approval = null;');
  demandeAccord("write_file", "C:/p/note.md");
  await wait(40);
  check("en Build, l'écriture repose la question au lieu d'être refusée",
    win.eval("conv.approval") !== null);
  win.eval('setMode2("plan"); conv.approval = null; conv.turns.length = 0; paintThread();');

  /* ══ LE PLAN, ET LE BOUTON QUI LE VALIDE ═══════════════════════════════════
     Hermes n'emet AUCUN evenement de plan — les 60 `_emit(...)` du serveur ont
     ete releves. Mais l'outil `todo` renvoie la liste complete a chaque appel,
     et c'est un signal lisible : {id, content, status}. */
  /* ⚠ LE VRAI HERMES RENVOIE UN OBJET, PAS DU JSON EN TEXTE. Ce harnais
     envoyait `JSON.stringify(items)` : le produit lisait « [object Object] »
     contre le vrai serveur et n'affichait AUCUN plan, pendant que le banc
     restait vert. Trouve en jouant un scenario reel le 2026-08-12.
     Un faux qui ne parle pas comme le vrai n'eprouve rien — sixieme fois. */
  const envoieTodo = (items) => {
    evenement("tool.start", { tool_id: "T1", name: "todo" });
    evenement("tool.complete", { tool_id: "T1", name: "todo",
                                 result: { todos: items } });
  };
  win.eval('conv.turns.length = 0; conv.running = true;');
  envoieTodo([{ id: "1", content: "Retirer le chemin pur", status: "pending" },
              { id: "2", content: "Brancher la porte", status: "pending" },
              { id: "3", content: "Rejouer le banc", status: "pending" }]);
  win.eval('conv.turns.forEach(function(t){ t.state = "done"; }); paintThread();');
  const plan = win.document.querySelector("#thread .m-plan");
  check("un plan posé avec todo s'affiche, étapes comprises",
    !!plan && win.document.querySelectorAll("#thread .m-etape").length === 3
    && /Rejouer le banc/.test(plan.textContent),
    plan ? plan.textContent.trim().slice(0, 70) : "aucun plan");
  check("...et il porte le bouton « Build and Vérif »",
    !!win.document.getElementById("basculeBuild"));
  /* ⚠ ON NE DEVINE JAMAIS UN PLAN DANS LE TEXTE. Compter des puces ferait
     apparaitre le bouton sur une reponse qui enumere trois restaurants — et
     un bouton qui se propose a tort apprend a ne plus le lire. */
  win.eval('conv.turns.length = 0;');
  win.eval('var t = newTurn("assistant", "Etape 1 : faire ceci\\nEtape 2 : cela\\n- puis ca"); t.state = "done"; paintThread();');
  check("...alors qu'un texte en forme de plan n'en produit AUCUN",
    !win.document.querySelector("#thread .m-plan"),
    win.document.querySelector("#thread .m-plan") ? "un plan a ete devine" : "rien");
  // Un travail deja commence n'est plus a valider : proposer de le « lancer »
  // serait proposer de le recommencer.
  win.eval('conv.turns.length = 0;');
  envoieTodo([{ id: "1", content: "Deja fait", status: "completed" },
              { id: "2", content: "En cours", status: "in_progress" }]);
  win.eval('conv.turns.forEach(function(t){ t.state = "done"; }); paintThread();');
  check("un plan déjà entamé s'affiche SANS bouton — il n'y a plus à valider",
    !!win.document.querySelector("#thread .m-plan")
    && !win.document.getElementById("basculeBuild"));
  check("...et l'étape faite se distingue de celle en cours",
    !!win.document.querySelector("#thread .m-etape.completed")
    && !!win.document.querySelector("#thread .m-etape.in_progress"));

  /* « Verif » n'est pas un cran du selecteur : c'est la fin du build, decidee
     par kuchu. Elle s'affiche quand TOUTES les etapes sont terminees — on ne
     l'invente pas, une phase inventee serait pire qu'une phase absente. */
  win.eval('setMode2("build"); paintThread();');
  check("tant qu'une étape reste ouverte, la phase dit « Build »",
    win.document.getElementById("modeMention").textContent === "Build",
    win.document.getElementById("modeMention").textContent);
  win.eval('conv.turns.length = 0;');
  envoieTodo([{ id: "1", content: "Fini", status: "completed" },
              { id: "2", content: "Fini aussi", status: "completed" }]);
  win.eval('conv.turns.forEach(function(t){ t.state = "done"; }); paintThread();');
  check("...et « Vérif » quand tout est terminé",
    win.document.getElementById("modeMention").textContent === "Vérif",
    win.document.getElementById("modeMention").textContent);
  /* ⚠ ON LAISSE LE PLAN EN PLACE. L'ecran Plan suit desormais le PLAN quand il
     y en a un, et la trace des outils sinon : « lorsqu'un plan est lance, on
     peut suivre le plan car il apparait dans Plan, on voit le graph node »
     (kuchu). Vider le fil ici priverait les verifications de l'ecran Plan de
     ce qu'elles doivent justement voir. */
  win.eval('setMode2("plan"); conv.running = false; paintThread();');
  check("le plan alimente l'écran Plan, pas seulement le fil",
    win.eval("etapesReelles().length") === 2
    && win.eval("etapesReelles()[0].t") === "Fini",
    win.eval("JSON.stringify(etapesReelles().map(function(s){return s.t;}))"));
  check("...et une étape terminée y est à 100 %, une étape à faire à 0",
    win.eval("etapesReelles()[0].pct") === 100,
    String(win.eval("etapesReelles()[0].pct")));

  /* ══ Les six defauts trouves par la passe de design du 2026-08-08 ══════════
     Chacun etait invisible cote reseau et invisible cote contrat : la page
     s'affichait, les identifiants etaient tous la, et pourtant la mise en
     scene du fil sans memoire ne sortait jamais, le volet du Vestiaire
     coupait son texte, et le schema faisait 2766 px de large. Sans ces
     verifications, la prochaine passe de design les reintroduit sans bruit. */
  console.log("\n--- Les six réparations (elles ne doivent pas revenir) ---");

  // R1 — la classe que toute la mise en scene du fil sans memoire attend.
  win.eval("incognito = true; paintHint(); paintThread();");
  await wait(30);
  const pd = win.document.getElementById("pDiscuter");
  check("R1 · le fil sans mémoire pose bien #pDiscuter.incog",
    pd.classList.contains("incog"), pd.className);
  check("R1 · la pastille « Sans mémoire » est visible, pas seulement remplie",
    win.getComputedStyle(win.document.getElementById("privchip")).display !== "none");
  check("R1 · la ligne en tête de fil est écrite",
    !!win.document.querySelector("#thread .privnote"));
  win.eval("incognito = false; paintHint(); paintThread();");
  await wait(20);
  check("R1 · et elle disparaît quand on revient au fil normal",
    !pd.classList.contains("incog") && !win.document.querySelector("#thread .privnote"));

  // R2 — .glegend est la legende du SCHEMA : position:absolute. Dans la
  // sous-barre du composeur elle se posait par-dessus l'interrupteur.
  const hint = win.document.getElementById("composerHint");
  check("R2 · #composerHint ne porte plus .glegend",
    !hint.classList.contains("glegend"), hint.className);
  check("R2 · il reste dans le flux de la sous-barre",
    win.getComputedStyle(hint).position !== "absolute");

  // R3 / R4 — le Vestiaire.
  win.eval('nav("Vestiaire")');
  await wait(60);
  win.document.querySelector('#vseg button[data-v="skills"]').click();
  await wait(120);
  const vdet = win.document.getElementById("vdet");
  check("R3 · le volet de détail a bien .vdet-head et .vdet-body",
    !!vdet.querySelector(".vdet-head") && !!vdet.querySelector(".vdet-body"));
  check("R3 · plus de <h2> non stylé dans un volet de 330 px",
    !vdet.querySelector("h2"));
  check("R3 · la tête reprend .vhero, prévue par la maquette et jamais servie",
    !!vdet.querySelector(".vhero"));

  // La 2e competence, puis un filtre qui la garde, puis plus de filtre : par
  // INDEX la selection retombait sur la premiere ; par identite elle tient.
  win.document.querySelectorAll("#vgrid [data-i]")[1].click();
  await wait(60);
  check("R4 · la sélection porte sur la compétence désignée",
    vdet.textContent.includes("Désactivé"), vdet.textContent.slice(0, 60));
  const vq = win.document.getElementById("vq");
  vq.value = "vieux";
  vq.dispatchEvent(new win.Event("input"));
  await wait(60);
  vq.value = "";
  vq.dispatchEvent(new win.Event("input"));
  await wait(60);
  check("R4 · le filtre ne déplace plus la sélection (identité, pas index)",
    vdet.textContent.includes("Désactivé"), vdet.textContent.slice(0, 60));
  vq.value = "cadrage";
  vq.dispatchEvent(new win.Event("input"));
  await wait(60);
  check("R4 · une sélection exclue par le filtre ne laisse pas le volet vide",
    vdet.textContent.includes("cadrage"), vdet.textContent.slice(0, 60));
  vq.value = "";
  vq.dispatchEvent(new win.Event("input"));
  await wait(40);

  // R5 — le .ctl de l'etabli etait dans le HTML et VIDE.
  win.eval('nav("Discuter"); setMode("atelier")');
  await wait(60);
  const work = win.document.getElementById("work");
  check("R5 · l'Établi s'ouvre", work.classList.contains("atelier"));
  /* ⚠ ON VISE LA CROIX PAR SON `id`, PAS « le premier bouton du .ctl ».
     Écrit d'abord en `querySelector("#ctlEtabli button")`, ce test a cassé le
     2026-08-12 quand un second bouton — relire le dossier — est arrivé dans
     le même bloc : il cliquait le nouveau et concluait que la croix ne
     fermait plus rien. Un test qui désigne par la position accuse le voisin. */
  const croix = win.document.getElementById("etabliClose");
  check("R5 · son en-tête porte une commande, pas un bloc vide",
    !!win.document.querySelector("#ctlEtabli button"));
  if (croix){
    croix.click();
    await wait(30);
    check("R5 · elle referme l'Établi", !work.classList.contains("atelier"));
  } else {
    check("R5 · elle referme l'Établi", false, "#etabliClose absent");
  }

  // R6 — une chaine de douze outils tenait sur UNE ligne : 2766 x 144.
  win.eval("graph.setData("
    + "Array.from({length:12},(_,i)=>({n:i+1,t:'outil '+(i+1),pct:100})),"
    + "Array.from({length:11},(_,i)=>[i+1,i+2]), {})");
  await wait(30);
  const vue = win.eval("JSON.parse(JSON.stringify(graph.state.VUE))");
  const rangs = win.eval(
    "new Set(Object.values(graph.state.POS).map(p=>Math.round(p.y))).size");
  check("R6 · douze étapes ne font plus un ruban", vue.w < 1500,
    Math.round(vue.w) + " x " + Math.round(vue.h));
  check("R6 · elles se répartissent sur plusieurs rangées", rangs > 1, rangs + " rangée(s)");
  const traits = win.document.querySelectorAll("#svg path.edge");
  check("R6 · les onze liens sont tracés", traits.length === 11, traits.length + " tracé(s)");
  check("R6 · aucun tracé malformé",
    !Array.from(traits).some((p) => /NaN|undefined/.test(p.getAttribute("d") || "")));
  // Le plan BRANCHANT de la maquette doit garder son rangement par couches :
  // replier n'est juste que pour une chaine.
  win.eval("graph.setData([1,2,3,4,5,6].map(n=>({n,t:'e'+n,pct:0})),"
    + "[[1,2],[2,3],[2,4],[3,5],[4,5],[5,6]], {})");
  await wait(30);
  check("R6 · un vrai graphe garde le rangement par couches",
    win.eval("new Set(Object.values(graph.state.POS).map(p=>Math.round(p.x))).size") === 5);

  /* ══ Les cinq passes de design, appliquées le 2026-08-08 ═══════════════
     Chacune reprend quelque chose que la maquette avait dessiné et que le
     produit n'avait pas repris — `.acts`, `.dots`, `.sactions`, `.vdet-body`,
     `.ask`. Sans ces vérifications, la prochaine passe les redéfait. */
  console.log("\n--- Les cinq passes de design ---");

  // ── Listes : les actions de ligne, les rangs, le fil d'Ariane ──
  win.eval('nav("Travaux")');
  await wait(120);
  const w0 = win.document.getElementById("works");
  check("Listes · une ligne de Travaux a ses actions",
    w0.querySelectorAll(".row .acts [data-a]").length >= 3,
    w0.querySelectorAll(".row .acts [data-a]").length + " action(s)");
  check("Listes · la ligne a deux niveaux, pas trois meta de même poids",
    !!w0.querySelector(".row .u-l2 .t") && !!w0.querySelector(".row .u-l2 .s"));
  check("Listes · la date est à part, en largeur fixe",
    !!w0.querySelector(".row .u-quand"));
  check("Listes · les rangs existent (épinglées · récentes · archivées)",
    !!w0.querySelector(".u-rang"));
  // Épingler passe par PATCH — l'endpoint existe (sessions.py:661).
  fetched.length = 0;
  w0.querySelector('.acts [data-a="epingler"]').click();
  await wait(80);
  check("Listes · épingler appelle bien PATCH /api/sessions/{id}",
    fetched.some((f) => f.method === "PATCH" && /^\/api\/sessions\//.test(f.path)),
    JSON.stringify(fetched));
  check("Listes · « Rafraîchir » n'est plus un bouton plein",
    !win.document.getElementById("travRefresh").classList.contains("ghost-btn"));
  check("Listes · Travaux a gagné son filtre", !!win.document.getElementById("travQ"));

  win.eval('nav("Livrables")');
  await wait(150);
  const crumbs = win.document.getElementById("livCrumbs");
  check("Listes · chaque segment du fil d'Ariane est un bouton",
    crumbs.querySelectorAll("[data-cr]").length >= 1);
  check("Listes · une ligne de fichier a ses actions",
    win.document.querySelectorAll("#livList .row .acts [data-a]").length >= 2);

  /* ── PROJETS ────────────────────────────────────────────────────────────
     Le panneau groupait les sessions par `cwd`. Il lit maintenant
     `projects.tree`, qui fait autorité — et qui mêle TROIS espèces.

     Le fixture les porte toutes les trois, avec les drapeaux tels qu'Hermès
     les envoie vraiment (relevé sur la machine, 2026-08-09). Un faux qui ne
     mentirait pas comme le vrai ne prouverait rien : c'est le défaut qui a
     déjà coûté trois fois à ce projet. */
  win.eval('nav("Projets")');
  await wait(80);
  /* Le panneau demande d'abord `projects.list` — c'est la SEULE liste qui
     rende les archivés (`projects.tree` les masque, `project_tree.py:569`).
     Sans réponse ici, l'arbre ne part jamais. */
  const dmdArch = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .filter((m) => m.method === "projects.list").pop();
  check("Projets · les archivés sont demandés à « projects.list »", !!dmdArch,
    JSON.stringify(FakeWS.sent.map((s) => JSON.parse(s.trim()).method)));
  FakeWS.last.push({ jsonrpc: "2.0", id: dmdArch && dmdArch.id, result: {
    projects: [
      { id: "p1", name: "Migration des factures", color: "#9334E6", icon: "doc",
        primary_path: "D:/Fact", archived: false },
      { id: "pz", name: "Essai de janvier", color: "#9AA0A6", icon: "dossier",
        primary_path: "D:/Essai", archived: true }
    ], active_id: null } });
  await wait(80);
  const dmd = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .filter((m) => m.method === "projects.tree").pop();
  check("Projets · la liste est demandée à « projects.tree », pas déduite",
    !!dmd, JSON.stringify(FakeWS.sent.map((s) => JSON.parse(s.trim()).method)));
  FakeWS.last.push({ jsonrpc: "2.0", id: dmd && dmd.id, result: { projects: [
    { id: "p1", label: "Migration des factures", path: "D:/Fact", color: "#9334E6",
      icon: "doc", isAuto: false, isNoProject: false, sessionCount: 11,
      lastActive: 1786280000, repos: [], previewSessions: [] },
    { id: "D:/Atelier", label: "Atelier", path: "D:/Atelier", color: null,
      icon: null, isAuto: true, isNoProject: false, sessionCount: 4,
      lastActive: 1786270000, repos: [], previewSessions: [] },
    // Un dossier déduit À L'INTÉRIEUR d'un autre : c'est celui qui sera
    // absorbé, et qu'il faut nommer avant de ranger le parent.
    { id: "D:/Atelier/four", label: "four", path: "D:/Atelier/four", color: null,
      icon: null, isAuto: true, isNoProject: false, sessionCount: 1,
      lastActive: 1786260000, repos: [], previewSessions: [] },
    { id: "__no_project__", label: "Home", path: null, color: null, icon: null,
      isAuto: false, isNoProject: true, sessionCount: 39,
      lastActive: 1786290000, repos: [], previewSessions: [] }
  ], active_id: null, scoped_session_ids: [] } });
  await wait(120);

  const proj = win.document.getElementById("projets");
  const cartes = proj.querySelectorAll(".pcard");
  check("Projets · les deux sections se lisent AVANT les actions",
    /Vos projets/.test(proj.textContent)
    && /Dossiers où vous avez travaillé/.test(proj.textContent),
    proj.textContent.slice(0, 90));

  // ⚠ LE POINT QUI PORTE TOUT. Un dossier déduit n'a ni nom propre ni id :
  // « renommer » et « archiver » n'agiraient sur rien. Les afficher
  // obligerait à cliquer pour comprendre pourquoi — STU-1.
  const deduite = proj.querySelector(".pcard.j-auto");
  check("Projets · le dossier déduit a sa propre apparence, pas une étiquette",
    !!deduite && !!deduite.querySelector(".j-ic.j-vide"),
    deduite ? deduite.className : "aucune carte déduite");
  check("Projets · ...et AUCUNE action de projet ne lui est proposée",
    !!deduite && !deduite.querySelector('[data-a="regler"]')
    && !deduite.querySelector('[data-a="archiver"]'),
    deduite ? [...deduite.querySelectorAll("[data-a]")]
      .map((b) => b.dataset.a).join(",") || "aucune" : "?");
  const vraie = [...cartes].find((c) => !c.classList.contains("j-auto"));
  check("Projets · le vrai projet, lui, garde ses réglages",
    !!vraie && !!vraie.querySelector('[data-a="regler"]'),
    vraie ? vraie.className : "aucune carte pleine");

  // « Home » n'est pas un lieu : lui donner une carte en ferait un projet
  // qu'on ne peut ni régler ni supprimer.
  check("Projets · « Home » n'est PAS une carte, c'est le reste en pied de liste",
    !!proj.querySelector(".j-home")
    && ![...cartes].some((c) => /Home/.test(c.textContent)),
    proj.querySelector(".j-home") ? "ligne présente" : "absente");
  check("Projets · ...et il dit combien de conversations n'appartiennent à rien",
    /39 conversations/.test(proj.textContent));

  // La mémoire n'est PAS cloisonnée par projet. On ne l'affiche pas comme
  // promesse — et on ne se tait pas non plus : le silence laisserait croire
  // ce que la phrase de la maquette disait.
  /* ── CE QUE LE PROJET CONTIENT, ET COMMENT L'EN RESSORTIR ───────────────
     ⚠ LA SOURCE N'EST PAS `repos`. La passe supposait « repos, ou bien les
     cwd des sessions ». Mesuré contre Hermès en marche : `repos` donne les
     RACINES GIT, pas les dossiers de travail — il aurait dit « freeB » là où
     kuchu travaille dans `freeB\hermes-bridge`, et il aurait manqué
     `Projet Ulysse\web` (58 sessions) entièrement.
     C'est `projects.project_sessions` qui rend la vérité. */
  const dmdSes = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .filter((m) => m.method === "projects.project_sessions").pop();
  check("Dedans · ce que contient le projet est demandé aux SESSIONS, pas à « repos »",
    !!dmdSes && dmdSes.params.project_id === "p1",
    dmdSes ? JSON.stringify(dmdSes.params) : "aucun appel");
  FakeWS.last.push({ jsonrpc: "2.0", id: dmdSes && dmdSes.id, result: { project: {
    repos: [{ path: "D:/Fact", groups: [{ sessions: [
      { id: "a", cwd: "D:/Fact" },
      { id: "b", cwd: "D:/Fact/scans" },
      { id: "c", cwd: "D:/Fact/scans" },
      { id: "d", cwd: "D:/ailleurs" }
    ] }] }] } } });
  await wait(150);

  const carteVraie2 = [...win.document.querySelectorAll("#projets .pcard")]
    .find((c) => !c.classList.contains("j-auto") && /Migration/.test(c.textContent));
  const repli = carteVraie2 && carteVraie2.querySelector("[data-deplier]");
  check("Dedans · la carte porte la ligne, avec le bon compte",
    !!repli && /1 dossier</.test(repli.innerHTML),
    repli ? repli.textContent.trim() : "absente");
  // ⚠ `D:/ailleurs` n'est PAS dans le projet : il ne doit pas être compté.
  check("Dedans · ...et ce qui est HORS du dossier n'est pas compté",
    !!repli && !/2 dossiers/.test(repli.textContent),
    repli ? repli.textContent.trim() : "absente");
  check("Dedans · elle est repliée par défaut — on ne l'ouvre que si on la cherche",
    !carteVraie2.querySelector(".j-sous"));

  repli.click();
  await wait(150);
  const ouvert = [...win.document.querySelectorAll("#projets .pcard")]
    .find((c) => /Migration/.test(c.textContent));
  check("Dedans · dépliée, elle montre le chemin et le compte de sessions",
    !!ouvert.querySelector(".j-sous")
    && /D:\/Fact\/scans/.test(ouvert.textContent)
    && /2 sessions/.test(ouvert.textContent),
    ouvert.textContent.replace(/\s+/g, " ").slice(0, 100));
  // C'est CE bouton qui rend vraie la promesse de la feuille de rangement.
  check("Dedans · ...et le geste promis est là : « En faire un projet »",
    !!ouvert.querySelector('.j-sous [data-ranger="D:/Fact/scans"]'));
  check("Dedans · ...avec la phrase qui dit que rien n'est perdu",
    /Rien n’est perdu/.test(ouvert.textContent));

  /* ── ARCHIVER, ET NON « METTRE À LA CORBEILLE » ─────────────────────────
     `archive` pose un drapeau, `restore` le retire, et RIEN N'EXPIRE : le
     drapeau est posé à un seul endroit et retiré à un seul autre, aucune
     tâche ne purge. « Trente jours » aurait été une promesse qu'Hermès ne
     tient pas, et « corbeille » en suggère une même sans la nommer. */
  const barreArch = win.document.getElementById("trashBtn");
  check("Archiver · la barre dit « Archivés », jamais « Corbeille »",
    !!barreArch && /Archivés/.test(barreArch.textContent)
    && !/[Cc]orbeille/.test(barreArch.textContent),
    barreArch ? barreArch.textContent.trim() : "absent");
  check("Archiver · ...et elle compte ceux qu'il y a, sans afficher un zéro",
    /· 1/.test(barreArch.textContent), barreArch.textContent.trim());

  // ⚠ Archiver n'existe QUE sur un vrai projet : un dossier déduit n'a pas
  //   d'identifiant à archiver, et « Home » n'est pas un projet.
  check("Archiver · le vrai projet peut être archivé",
    !!vraie && !!vraie.querySelector("[data-arch-id]"));
  check("Archiver · ...et le dossier déduit, NON — il n'a rien à archiver",
    !!deduite && !deduite.querySelector("[data-arch-id]"));

  vraie.querySelector("[data-arch-id]").click();
  await wait(60);
  const vueArch = win.document.getElementById("projetBody");
  check("Archiver · on demande avant, et on dit les trois choses",
    /revient quand vous voulez/.test(vueArch.textContent)
    && /dossier n’est pas touché/.test(vueArch.textContent)
    && /restent dans Travaux/.test(vueArch.textContent),
    vueArch.textContent.slice(0, 70));
  check("Archiver · ...et on promet « sans limite de temps », pas trente jours",
    /sans limite de temps/i.test(vueArch.textContent.replace(/\s+/g, " "))
    && !/30 jours|trente jours/i.test(vueArch.textContent),
    vueArch.textContent.replace(/\s+/g, " ").slice(0, 90));
  vueArch.querySelector('[data-ja="oui"]').click();
  await wait(60);
  const appelArch = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .filter((m) => m.method === "projects.archive").pop();
  check("Archiver · l'appel part sur l'identifiant du projet, sans « restore »",
    !!appelArch && appelArch.params.id === "p1" && !appelArch.params.restore,
    appelArch ? JSON.stringify(appelArch.params) : "aucun appel");
  win.eval("fermerProjet()");

  check("Projets · la note dit que la mémoire N'EST PAS cloisonnée",
    /commun à tous/.test(proj.textContent)
    && !/n'en sort jamais/.test(proj.textContent),
    proj.textContent.slice(0, 60));

  /* ── LA VUE DES ARCHIVÉS ────────────────────────────────────────────────
     `projects.tree` les masque (`project_tree.py:569`) ; seule
     `projects.list` les rend, avec leur drapeau. */
  barreArch.click();
  await wait(60);
  const listeArch = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .filter((m) => m.method === "projects.list").pop();
  FakeWS.last.push({ jsonrpc: "2.0", id: listeArch && listeArch.id, result: {
    projects: [{ id: "pz", name: "Essai de janvier", color: "#9AA0A6",
                 icon: "dossier", primary_path: "D:/Essai", archived: true }],
    active_id: null } });
  await wait(120);
  const vueA = win.document.getElementById("projets");
  check("Archivés · la vue montre le projet archivé, barré",
    !!vueA.querySelector(".pcard.gone") && /Essai de janvier/.test(vueA.textContent),
    vueA.textContent.slice(0, 60));
  check("Archivés · ...et redit que le dossier n'a jamais été touché",
    /dossier n’a jamais été touché/.test(vueA.textContent));
  // On ne range rien depuis les archivés : le bouton s'efface.
  check("Archivés · « Ranger un dossier » disparaît, on n'y range rien",
    win.document.getElementById("newProj").style.display === "none");

  // Remettre : le MÊME appel, dans l'autre sens.
  vueA.querySelector('[data-arch-a="remettre"]').click();
  await wait(60);
  const remis = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .filter((m) => m.method === "projects.archive").pop();
  check("Archivés · « Remettre » est le même appel avec « restore »",
    !!remis && remis.params.id === "pz" && remis.params.restore === true,
    remis ? JSON.stringify(remis.params) : "aucun appel");

  // ⚠ Supprimer est DÉFINITIF et en cascade. On ne le propose que depuis les
  //   archivés — après un premier geste — et on redemande.
  FakeWS.last.push({ jsonrpc: "2.0", id: remis && remis.id, result: {} });
  await wait(60);
  const listeA2 = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .filter((m) => m.method === "projects.list").pop();
  FakeWS.last.push({ jsonrpc: "2.0", id: listeA2 && listeA2.id, result: {
    projects: [{ id: "pz", name: "Essai de janvier", color: "#9AA0A6",
                 icon: "dossier", primary_path: "D:/Essai", archived: true }],
    active_id: null } });
  await wait(120);
  const purger = win.document.querySelector('#projets [data-arch-a="purger"]');
  check("Archivés · « Supprimer définitivement » n'existe QUE là", !!purger);
  purger.click();
  await wait(60);
  const vueSup = win.document.getElementById("projetBody");
  check("Archivés · ...et on redemande, en disant que ça ne se défait pas",
    /ne revient pas/.test(vueSup.textContent)
    && /Archiver se défait/.test(vueSup.textContent),
    vueSup.textContent.slice(0, 70));
  check("Archivés · ...et on redit que le dossier n'est pas touché",
    /dossier n’est toujours pas touché/.test(vueSup.textContent));
  const avantSup = FakeWS.sent.length;
  vueSup.querySelector('[data-ja="non"]').click();
  await wait(40);
  check("Archivés · « Annuler » ne supprime rien du tout",
    !FakeWS.sent.slice(avantSup).map((s) => JSON.parse(s.trim()))
      .some((m) => m.method === "projects.delete"));
  win.eval("projArchives = false;");

  /* ── RANGER UN DOSSIER EN PROJET ────────────────────────────────────────
     `projects.create` n'écrit RIEN sur le disque : il désigne un dossier qui
     existe. Le vocabulaire de cet écran en dépend entièrement. */
  const ranger = deduite && deduite.querySelector("[data-ranger]");
  check("Ranger · le dossier déduit offre le seul geste qui a un sens sur lui",
    !!ranger && /En faire un projet/.test(ranger.textContent),
    ranger ? ranger.textContent.trim() : "aucun bouton");
  ranger.click();
  await wait(60);
  /* La feuille redemande l'arbre pour savoir ce qu'elle absorbe : ce sont les
     dossiers DÉDUITS qui tombent à l'intérieur, exactement ceux qui vont
     disparaître de la liste. Sans cette réponse, elle n'annonce rien —
     ce qui est le bon défaut : on ne promet pas qu'un dossier est vide. */
  const arbreRan = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .filter((m) => m.method === "projects.tree").pop();
  FakeWS.last.push({ jsonrpc: "2.0", id: arbreRan && arbreRan.id, result: {
    projects: [
      { id: "D:/Atelier/four", label: "four", path: "D:/Atelier/four",
        isAuto: true, isNoProject: false, sessionCount: 1 }
    ], active_id: null, scoped_session_ids: [] } });
  await wait(120);
  const feuilleRanger = win.document.getElementById("projetBody");
  check("Ranger · la feuille s'ouvre",
    win.document.getElementById("sProjet").classList.contains("on"));
  check("Ranger · elle dit « ranger », jamais « créer » — rien n'est fabriqué",
    /Ranger un dossier en projet/.test(feuilleRanger.textContent)
    && !/Créer un projet/.test(feuilleRanger.textContent));
  /* « Choisir… » a longtemps été ABSENT — un bouton qui ouvre le vide est un
     bouton mort. L'explorateur existe depuis le 2026-08-09, et son absence
     bloquait le rangement d'un dossier IMBRIQUÉ : kuchu avait rangé
     `Desktop`, ses sous-dossiers avaient disparu de la liste, et plus rien ne
     permettait de ranger `Projet Ulysse`. Hermès le permettait, l'écran non. */
  check("Ranger · « Choisir… » existe, et il OUVRE quelque chose",
    !!feuilleRanger.querySelector('[data-jp="choisir"]'));
  check("Ranger · le chemin est montré en entier, c'est le seul champ qui engage",
    /D:\/Atelier/.test(feuilleRanger.textContent));
  /* ⚠ CE QUE KUCHU A DÉCOUVERT À SES DÉPENS. Un projet réclame tout son
     SOUS-ARBRE : ranger `Desktop` a fait disparaître `Projet Ulysse` et
     `freeB` de la liste, absorbés, et rien ne l'avait annoncé. C'est un fait
     mesuré (`project_for_path` prend le plus long préfixe), pas une mise en
     garde inventée — donc on le dit. */
  /* ⚠ On NOMME ce qui va être absorbé, et on donne l'issue. La dernière
     phrase n'est pas un adoucissement : sans elle, l'avertissement ne serait
     qu'une inquiétude — on saurait qu'on perd quelque chose sans savoir
     comment le récupérer. Elle n'est vraie que grâce à la ligne repliable de
     la carte : les deux tiennent ensemble. */
  check("Ranger · le dossier absorbé est NOMMÉ, pas seulement compté",
    /four/.test(feuilleRanger.textContent)
    && /sortira de la liste/.test(feuilleRanger.textContent),
    feuilleRanger.textContent.replace(/\s+/g, " ").slice(0, 110));
  check("Ranger · ...et on dit par où le ressortir — sinon c'est une inquiétude",
    /ressortir depuis sa carte/.test(feuilleRanger.textContent));
  check("Ranger · le nom est prérempli avec celui du dossier",
    feuilleRanger.querySelector("#jNom") && feuilleRanger.querySelector("#jNom").value === "Atelier",
    feuilleRanger.querySelector("#jNom") ? feuilleRanger.querySelector("#jNom").value : "absent");
  // ⚠ La troisième ligne est celle qui manquait : la mémoire reste commune.
  check("Ranger · « ce que ça change » dit AUSSI ce qui ne change pas",
    /reste commune/.test(feuilleRanger.textContent)
    && /Aucun fichier n’est créé/.test(feuilleRanger.textContent));

  // Un nom vide : Hermès le refuse (`project name must not be empty`). On ne
  // laisse pas partir l'appel pour se faire refuser — on le dit avant.
  const avantCreate = FakeWS.sent.length;
  feuilleRanger.querySelector("#jNom").value = "   ";
  feuilleRanger.querySelector('[data-jp="creer"]').click();
  await wait(40);
  check("Ranger · un nom vide ne part même pas — on le dit avant",
    !FakeWS.sent.slice(avantCreate).map((s) => JSON.parse(s.trim()))
      .some((m) => m.method === "projects.create"));

  feuilleRanger.querySelector("#jNom").value = "Atelier de poterie";
  feuilleRanger.querySelectorAll("[data-col]")[2].click();
  feuilleRanger.querySelector('[data-jp="creer"]').click();
  await wait(60);
  const cree = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .find((m) => m.method === "projects.create");
  check("Ranger · l'appel part avec le nom, le dossier et la couleur choisis",
    !!cree && cree.params.name === "Atelier de poterie"
    && cree.params.primary_path === "D:/Atelier"
    && (cree.params.folders || [])[0] === "D:/Atelier"
    && !!cree.params.color,
    cree ? JSON.stringify(cree.params) : "aucun appel");

  /* ── L'EXPLORATEUR DE DOSSIERS ──────────────────────────────────────────
     Son absence bloquait le cas réel : un dossier IMBRIQUÉ dans un projet
     déjà rangé n'apparaît plus dans la liste (un projet réclame tout son
     sous-arbre), donc plus aucun bouton pour le ranger — alors qu'Hermès le
     permet, `project_for_path` prenant le plus long préfixe. */
  win.eval('nav("Projets")');
  await wait(60);
  const bNewProj = win.document.getElementById("newProj");
  check("Explorateur · la barre des Projets porte « Ranger un dossier »",
    !!bNewProj && /Ranger un dossier/.test(bNewProj.textContent),
    bNewProj ? bNewProj.textContent.trim() : "absent");
  bNewProj.click();
  await wait(120);
  const vueChoix = win.document.getElementById("projetBody");
  check("Explorateur · il ouvre le choix du dossier",
    !!win.document.getElementById("ranList")
    && win.document.getElementById("sProjet").classList.contains("on"));
  check("Explorateur · ...et dit qu'aucun dossier ne sera créé",
    /n’en crée aucun/.test(vueChoix.textContent), vueChoix.textContent.slice(0, 80));
  check("Explorateur · le fil d'Ariane est là pour remonter",
    !!win.document.getElementById("ranFil"));

  // ⚠ Les FICHIERS sont montrés mais éteints. Les cacher ferait croire à un
  //    dossier vide ; les rendre cliquables proposerait de ranger un fichier
  //    en projet, ce qui n'a pas de sens.
  const rangees = win.document.querySelectorAll("#ranList .row");
  const fichiers = [...rangees].filter((r) => !r.hasAttribute("data-dir"));
  check("Explorateur · les fichiers se voient, mais ne se choisissent pas",
    rangees.length > 0 && fichiers.length > 0
    && fichiers.every((r) => !r.hasAttribute("data-dir")),
    rangees.length + " ligne(s), dont " + fichiers.length + " fichier(s)");

  /* ⚠ Sans `?path=`, l'API rend le DOSSIER PERSONNEL, pas une racine vide.
     Le bouton doit donc nommer le dossier RÉELLEMENT à l'écran — sinon il
     dirait « choisissez un dossier » alors qu'on en regarde un. */
  const prendre = win.document.getElementById("ranPrendre");
  check("Explorateur · le bouton nomme le dossier qu'on a SOUS LES YEUX",
    !!prendre && !prendre.disabled && /Ranger « faux-home »/.test(prendre.textContent),
    prendre ? prendre.textContent.trim() : "absent");
  check("Explorateur · ...et le fil d'Ariane le situe, il ne dit pas « racine » seule",
    /faux-home/.test(win.document.getElementById("ranFil").textContent),
    win.document.getElementById("ranFil").textContent.trim());

  // On descend dans un dossier, puis on le range : c'est le geste qui manquait.
  const sousDossier = win.document.querySelector("#ranList [data-dir]");
  check("Explorateur · on peut descendre dans un dossier", !!sousDossier);
  sousDossier.click();
  await wait(120);
  const prendre2 = win.document.getElementById("ranPrendre");
  check("Explorateur · ...et le ranger devient possible, sous son nom",
    !!prendre2 && !prendre2.disabled && /Ranger « /.test(prendre2.textContent),
    prendre2 ? prendre2.textContent.trim() : "absent");
  prendre2.click();
  await wait(120);
  check("Explorateur · le choix ramène à la feuille, sur le dossier choisi",
    !!win.document.getElementById("jNom")
    && /Ranger un dossier en projet/.test(
         win.document.getElementById("projetBody").textContent),
    win.document.getElementById("projetBody").textContent.slice(0, 60));
  win.eval("fermerProjet()");

  win.eval('nav("Automatisations")');
  await wait(200);
  const whTete = win.document.querySelector('#autos [data-open^="wh"]');
  check("Listes · une carte de webhook a une tête dépliable", !!whTete);
  if (whTete){
    whTete.click();
    await wait(60);
    check("Listes · et elle s'ouvre vraiment sur son adresse",
      whTete.closest(".acard").classList.contains("open")
      && /webhooks\//.test(whTete.closest(".acard").textContent),
      whTete.closest(".acard").className);
  } else check("Listes · et elle s'ouvre vraiment sur son adresse", false, "pas de tête");
  check("Listes · plus de .glegend hors du canevas du Plan",
    win.document.querySelectorAll("#autos .glegend").length === 0);

  // ── Vestiaire : les groupes de provenance ──
  win.eval('nav("Vestiaire")');
  await wait(80);
  win.document.querySelector('#vseg button[data-v="skills"]').click();
  await wait(150);
  check("Vestiaire · les compétences sont rangées par provenance",
    win.document.querySelectorAll("#vgrid [data-g]").length >= 1,
    win.document.querySelectorAll("#vgrid [data-g]").length + " groupe(s)");
  const g1 = win.document.querySelector("#vgrid [data-g]");
  const avant = win.document.querySelectorAll("#vgrid [data-i]").length;
  if (g1){
    g1.click();
    await wait(80);
    check("Vestiaire · un groupe se replie",
      win.document.querySelectorAll("#vgrid [data-i]").length < avant);
    g1.click();
    await wait(80);
  } else check("Vestiaire · un groupe se replie", false, "aucun groupe");
  check("Vestiaire · la réserve technique passe au pied, en petit",
    !!win.document.querySelector("#vdet .u-pied"));

  // ── Repères : le compte, et la dette éteinte ──
  win.eval('nav("Reperes")');
  await wait(80);
  const gl = win.document.getElementById("glossary");
  const totalIc = win.eval("Object.keys(I).length");
  const documentesIc = win.eval("Object.keys(I).filter(k=>I[k].nm||I[k].r).length");
  check("Repères · TOUS les signes sont documentés",
    documentesIc === totalIc, documentesIc + " / " + totalIc);
  check("Repères · le compte est affiché", /\d+ signes sur \d+/.test(gl.textContent));
  const repQ = win.document.getElementById("repQ");
  repQ.value = "archiver";
  repQ.dispatchEvent(new win.Event("input"));
  await wait(60);
  check("Repères · le filtre trouve un signe par son nom",
    win.document.querySelectorAll("#glossary .row").length === 1,
    win.document.querySelectorAll("#glossary .row").length + " ligne(s)");
  repQ.value = "";
  repQ.dispatchEvent(new win.Event("input"));

  // ── Plan : les bandeaux partis, le kebab d'étape revenu ──
  win.eval('nav("Plan")');
  await wait(120);
  check("Plan · les deux bandeaux de volet ont disparu",
    win.document.querySelectorAll("#pPlan .volet-head").length === 0);
  check("Plan · l'échelle remplace le bouton isolé",
    !!win.document.querySelector("#pPlan .u-echelle [data-z]")
    && win.document.getElementById("recentrer").closest(".u-echelle") !== null);
  const etapes = win.document.querySelectorAll("#steps .exp");
  check("Plan · les étapes réelles s'affichent", etapes.length > 0,
    etapes.length + " étape(s)");
  check("Plan · chaque étape a son kebab, VISIBLE",
    win.document.querySelectorAll("#steps .exp .dots[data-act]").length === etapes.length);
  if (etapes.length){
    win.document.querySelector("#steps .dots[data-act]").click();
    await wait(80);
    check("Plan · il ouvre les actions SOUS l'étape",
      !!win.document.querySelector("#steps .exp.exp-acts .sactions [data-a]"));
  } else check("Plan · il ouvre les actions SOUS l'étape", false, "aucune étape");
  check("Plan · le flux brut annonce son compte",
    /\d/.test(win.document.getElementById("voirJrn").textContent),
    win.document.getElementById("voirJrn").textContent);
  // La carte prend sa couleur — en STYLE, parce qu'une règle CSS bat un
  // attribut de présentation et `.node .b{fill:var(--bg)}` gagnerait.
  const carte = win.document.querySelector("#svg .node.st-done .b");
  check("Plan · une carte terminée prend sa couleur de famille",
    carte && /fill:/.test(carte.getAttribute("style") || ""),
    carte ? carte.getAttribute("style") : "aucune carte");

  // ── Discuter : le kebab, la gélule, la languette ──
  win.eval('nav("Discuter")');
  await wait(80);
  win.document.getElementById("moreBtn").click();
  await wait(80);
  // `#morePop` est reconstruit en innerHTML à chaque ouverture : #band doit
  // SURVIVRE au deuxième clic. Le piège s'était déclenché en test.
  check("Discuter · l'état du réseau descend dans le kebab",
    !!win.document.querySelector("#morePop #band"));
  win.document.getElementById("moreBtn").click();
  await wait(40);
  win.document.getElementById("moreBtn").click();
  await wait(80);
  check("Discuter · #band survit à la reconstruction du menu (sortir/réécrire/réinstaller)",
    !!win.document.getElementById("band")
    && !!win.document.querySelector("#morePop #band"));
  win.document.getElementById("moreBtn").click();
  await wait(40);

  win.document.querySelector('.u-modeseg button[data-mode="build"]').click();
  await wait(60);
  check("Discuter · les six cadres sont repliés derrière une gélule",
    !!win.document.getElementById("cadreBtn")
    && /Cadre/.test(win.document.getElementById("cadreBtn").textContent));
  win.document.getElementById("cadreBtn").click();
  await wait(60);
  check("Discuter · le repli reçoit #roles, déplacé et non recréé",
    !!win.document.querySelector("#cadrePop #roles [data-role]"));
  check("Discuter · avec les encoches de la maquette, pas un second langage",
    !!win.document.querySelector("#cadrePop .u-role .tick"));
  win.document.querySelector("#cadrePop [data-role]").click();
  await wait(60);
  check("Discuter · choisir un cadre le nomme sur la gélule",
    win.eval("activeRole") !== null
    && !/^Cadre$/.test(win.document.getElementById("cadreBtn").textContent.trim()),
    win.document.getElementById("cadreBtn").textContent);
  win.eval("activeRole = null; drawRoles(); paintHint()");
  await wait(40);
  check("Discuter · l'Établi laisse une languette quand il est rangé",
    !!win.document.getElementById("languette")
    && /Établi/.test(win.document.getElementById("languette").textContent));
  check("Discuter · la barre de titre ne porte plus les mots « Sans mémoire »",
    !/Sans mémoire/.test(win.document.getElementById("privchip").textContent));

  /* ══ Le premier lancement ═══════════════════════════════════════════════
     Cinq constats, chacun avec sa source. La maquette en affirmait quatre
     dont trois qu'aucun endpoint ne dit — c'est la première phrase qu'Ulysse
     adresse à quelqu'un. */
  console.log("\n--- Le premier lancement ---");
  check("il ne s'affiche PAS quand ce n'est pas le premier lancement",
    !win.document.getElementById("first").classList.contains("on"));

  fetched.length = 0;
  // Pas d'`await` ici : on regarde la carte À L'INSTANT ZÉRO, avant que le
  // faux serveur — qui répond en une microtâche — ait pu résoudre quoi que
  // ce soit. C'est le seul moment où l'état « en attente » est observable,
  // et c'est précisément celui qu'on veut vérifier.
  win.eval("lancerFirst()");
  const fc = win.document.getElementById("firstcard");
  check("la carte s'affiche AVANT que les appels soient revenus",
    fc.textContent.length > 0 && !!fc.querySelector(".defl"),
    fc.textContent.slice(0, 60));
  check("toutes les pastilles non résolues sont « en attente », pas rouges",
    fc.querySelectorAll(".dd.f-att").length === 4
    && fc.querySelectorAll(".dd.f-ko").length === 0,
    fc.querySelectorAll(".dd.f-att").length + " en attente, "
    + fc.querySelectorAll(".dd.f-ko").length + " en rouge");

  /* ── Les quatre écarts voulus — voir `web/ECARTS-MAQUETTE.md` ────────────
     La maquette porte quatre fois la MÊME coquille : un espacement vertical
     posé sur un `span`, qui n'en prend pas. Corrigés par Cowork le
     2026-08-09, et inscrits au registre.

     Le registre et les commentaires disent POURQUOI. Ils n'empêchent rien :
     la prochaine extraction verbatim de la maquette restaurerait la coquille
     en silence — c'est le risque que leur propre document nomme. Ces
     vérifications l'empêchent.

     On sonde avec de vrais `span`. Un `div` serait bloc de toute façon, et la
     vérification passerait aussi bien avec le défaut qu'avec sa correction. */
  const sonde = win.document.createElement("div");
  sonde.innerHTML =
      '<div class="srow2"><span class="txt"><span class="nm">n</span>'
    + '<span class="sub">s</span></span></div>'
    + '<div class="defl"><span class="dn">n</span><span class="dt">t</span></div>'
    + '<div class="dryline"><span class="dn">n</span><span class="dt">t</span></div>'
    + '<div class="fhead"><span class="nm">n</span><span class="fp">p</span>'
    + '<span class="sub">s</span></div>';
  win.document.body.appendChild(sonde);
  // `gcs` n'est déclaré que plus bas, avec les vérifications du Terminal.
  const affichage = (el) => win.getComputedStyle(el).getPropertyValue("display");
  [["srow2", "nm"], ["srow2", "sub"],
   ["defl", "dn"], ["defl", "dt"],
   ["dryline", "dn"], ["dryline", "dt"],
   ["fhead", "nm"], ["fhead", "fp"], ["fhead", "sub"]].forEach(([p, e]) => {
    const el = sonde.querySelector("." + p + " ." + e);
    check("écart · « ." + p + " ." + e + " » est un bloc, sa marge s'applique",
      !!el && affichage(el) === "block", el ? affichage(el) : "absent");
  });
  sonde.remove();
  await wait(30);
  check("les quatre appels partent en parallèle",
    ["/api/status", "/api/skills", "/api/memory"]
      .every((p) => fetched.some((f) => f.path.split("?")[0] === p)),
    JSON.stringify(fetched.map((f) => f.path)));

  await wait(200);
  check("chaque ligne porte sa source à l'écran",
    fc.querySelectorAll(".f-src").length === 5,
    fc.querySelectorAll(".f-src").length + " source(s)");
  check("le compte dit si l'écran a fini de parler",
    /Vérifié : \d+ %/.test(fc.textContent));
  check("le compte des compétences est le vrai",
    /3 compétences déclarées/.test(fc.textContent), fc.textContent.slice(0, 400));
  // Les trois phrases que la maquette affirmait sans pouvoir les savoir.
  check("aucune affirmation invérifiable (les trois lignes sont sorties)",
    !/sept assistants/i.test(fc.textContent)
    && !/coffre de notes/i.test(fc.textContent)
    && !/mise en ligne/i.test(fc.textContent));
  check("on peut toujours entrer", !!fc.querySelector("[data-go]"));

  fetched.length = 0;
  fc.querySelector("[data-go]").click();
  await wait(80);
  check("entrer quitte l'écran et ouvre l'application",
    !win.document.getElementById("first").classList.contains("on")
    && win.document.getElementById("app").classList.contains("on"));
  // Le marqueur vit cote serveur : ni localStorage, ni l'absence des
  // fichiers de memoire, qui dit autre chose.
  check("et le marqueur est posé côté serveur, pas dans la page",
    fetched.some((f) => f.path === "/ulysse/premier-vu" && f.method === "POST"),
    JSON.stringify(fetched.map((f) => f.method + " " + f.path)));

  /* ══ La dictée ══════════════════════════════════════════════════════════
     Le micro annoncait « pas encore branche » depuis le debut. */
  console.log("\n--- La dictée ---");
  win.eval('nav("Discuter")');
  await wait(60);
  const mic = win.document.getElementById("mic1");
  win.document.getElementById("reply").value = "";

  mic.click();
  await wait(60);
  check("le micro enregistre, et le dit",
    mic.classList.contains("u-ecoute"), mic.className);

  FIXTURES["/api/audio/transcribe"] = { ok: true, transcript: "Résume la veille.",
                                        provider: "whisper" };
  fetched.length = 0;
  // On repart de zero : `FakeWS.sent` accumule depuis le debut de la suite,
  // et y chercher un `prompt.submit` trouverait ceux des sections d'avant.
  FakeWS.sent.length = 0;
  const coupeesAvant = FakeRecorder.pistesCoupees;
  mic.click();
  await wait(150);
  const envoye = fetched.find((f) => f.path === "/api/audio/transcribe");
  check("l'enregistrement part vers /api/audio/transcribe",
    !!envoye && envoye.method === "POST", JSON.stringify(fetched.map((f) => f.path)));
  check("le texte arrive DANS le champ, il n'est pas envoyé",
    win.document.getElementById("reply").value === "Résume la veille."
    && !FakeWS.sent.some((s) => /prompt\.submit/.test(s)),
    win.document.getElementById("reply").value + " · "
    + FakeWS.sent.length + " trame(s) partie(s)");
  check("le micro revient au repos",
    !mic.classList.contains("u-ecoute") && !mic.classList.contains("u-attente"));
  // Sans ça, la pastille d'enregistrement du navigateur reste allumée.
  check("les pistes du micro sont coupées",
    FakeRecorder.pistesCoupees > coupeesAvant,
    FakeRecorder.pistesCoupees + " coupée(s)");

  // Un transcript VIDE n'est pas une panne : c'est du silence, et le backend
  // le renvoie avec ok:true (web_server.py:4390).
  win.document.getElementById("reply").value = "déjà écrit";
  FIXTURES["/api/audio/transcribe"] = { ok: true, transcript: "", provider: "whisper" };
  mic.click();
  await wait(60);
  mic.click();
  await wait(150);
  check("un silence ne touche pas au champ et n'annonce pas d'échec",
    win.document.getElementById("reply").value === "déjà écrit"
    && /Rien n'a été entendu/.test(win.document.getElementById("snack").textContent),
    win.document.getElementById("snack").textContent);

  // Un refus de micro n'est pas une panne : on dit quoi faire.
  const vraiGUM = win.navigator.mediaDevices.getUserMedia;
  win.navigator.mediaDevices.getUserMedia = () => {
    const e = new Error("refusé"); e.name = "NotAllowedError";
    return Promise.reject(e);
  };
  mic.click();
  await wait(80);
  check("un micro refusé dit quoi faire, pas « erreur »",
    /Autorisez-le/.test(win.document.getElementById("snack").textContent)
    && !mic.classList.contains("u-ecoute"),
    win.document.getElementById("snack").textContent);
  win.navigator.mediaDevices.getUserMedia = vraiGUM;
  win.document.getElementById("reply").value = "";

  console.log("\n--- Le Terminal : le vrai « hermes --tui » derrière un PTY ---");

  // Le tour des panneaux, tout en haut, est deja passe par le Terminal et y a
  // ouvert un vrai pont. On repart donc d'un ecran neuf pour que les comptes
  // ci-dessous mesurent CE bloc et pas l'histoire de la suite.
  win.eval('nav("Discuter"); fermerPty(); term = null; termFit = null;');
  await wait(20);
  const ptyDepart = FakeWS.urls.filter((u) => /\/api\/pty$/.test(u)).length;
  const ptyUrls = () => FakeWS.urls
    .filter((u) => /\/api\/pty$/.test(u)).slice(ptyDepart);
  const creesAvant = FakeTerminal.crees;
  win.eval('nav("Terminal")');
  await wait(120);

  const ecran = win.document.getElementById("tecran");
  check("l'écran du terminal existe et porte un xterm",
    !!ecran && FakeTerminal.crees === creesAvant + 1
    && FakeTerminal.last.hote === ecran,
    FakeTerminal.crees - creesAvant + " terminal(aux) créé(s)");
  check("l'addon d'ajustement est chargé et ajuste",
    FakeTerminal.last.addon instanceof FakeFit && FakeFit.ajustements > 0);

  // Le pont est un WebSocket, pas un POST — et il ne porte AUCUN jeton :
  // le secret vit dans serve.py, jamais dans la page.
  check("le pont s'ouvre sur ws://…/api/pty",
    ptyUrls().length === 1 && ptyUrls()[0] === "ws://127.0.0.1:8080/api/pty",
    JSON.stringify(ptyUrls()));
  check("...et l'adresse ne transporte pas de jeton",
    !/token|secret|key=/i.test(ptyUrls()[0] || ""), ptyUrls()[0]);

  const pty = FakeWS.dernierPty;
  check("la session s'annonce ouverte",
    win.document.getElementById("tstate").textContent === "session ouverte"
    && /Fermer la session/.test(win.document.getElementById("tGo").textContent),
    win.document.getElementById("tstate").textContent);

  // Hermès consomme lui-même cette séquence (web_server.py) : sans elle, la
  // TUI dessine ses cadres pour un terminal de la mauvaise taille.
  check("la taille de l'écran part dès l'ouverture",
    pty.envoye[0] === "\x1b[RESIZE:80;24]",
    JSON.stringify(pty.envoye[0] || null));
  // Et elle ne doit surtout PAS finir dans le fil de conversation.
  check("...sans polluer le socket du gateway",
    !FakeWS.sent.some((f) => typeof f === "string" && f.indexOf("RESIZE") >= 0));

  pty.envoye.length = 0;
  FakeTerminal.last.donnees("ls\r");
  check("ce qu'on tape part vers le PTY, tel quel",
    pty.envoye.length === 1 && pty.envoye[0] === "ls\r",
    JSON.stringify(pty.envoye));

  pty.onmessage({ data: "hermes › prêt\r\n" });
  check("ce que le PTY répond s'écrit à l'écran",
    /hermes › prêt/.test(FakeTerminal.last.tout()));

  // ⚠ LE PIÈGE. `#tmain` est reconstruit en innerHTML à chaque changement de
  // thème. Si l'écran vivant reste dans le gabarit, le changer de couleur
  // COUPE le PTY sous les doigts de quelqu'un en train de taper.
  const autre = Array.from(win.document.querySelectorAll("#pTerminal [data-th]"))
    .find((b) => !b.classList.contains("on"));
  autre.click();
  await wait(120);
  // L'identité du nœud NE SUFFIT PAS : pendant la réécriture il en existe
  // deux qui portent cet `id`, et le vivant peut rester orphelin dans
  // `#uStock` — même nœud, même session, mais invisible à l'écran. Il faut
  // vérifier qu'il est REVENU DANS LE PANNEAU.
  check("changer de thème ne détruit pas la session en cours",
    win.document.getElementById("tecran") === ecran
    && FakeTerminal.crees === creesAvant + 1
    && ptyUrls().length === 1 && pty.readyState === 1,
    "écran " + (win.document.getElementById("tecran") === ecran ? "gardé" : "PERDU")
    + ", " + ptyUrls().length + " pont(s)");
  check("...et l'écran vivant est bien REVENU dans le panneau, pas resté au stock",
    win.document.getElementById("tmain").contains(ecran)
    && !win.document.getElementById("uStock").contains(ecran),
    ecran.parentNode ? "parent : " + (ecran.parentNode.id || ecran.parentNode.className)
                     : "détaché");
  const fondVoulu = win.eval('TTHEMES.find((t) => t.id === "' + autre.dataset.th + '").bg');
  check("...et le thème s'applique au terminal vivant, sans le recréer",
    !!FakeTerminal.last.options.theme
    && FakeTerminal.last.options.theme.background === fondVoulu,
    JSON.stringify(FakeTerminal.last.options.theme || null) + " ≠ " + fondVoulu);

  // Chaque code de fermeture dit une cause différente (web_server.py:15748) :
  // les confondre ferait chercher au mauvais endroit.
  pty.onclose({ code: 4404 });
  await wait(20);
  // « coupé » n'est pas « aucune session » : l'un dit qu'on n'a rien ouvert,
  // l'autre que ça s'est interrompu.
  check("une fermeture 4404 nomme sa cause, pas « erreur »",
    /désactivée côté serveur/.test(FakeTerminal.last.tout())
    && win.document.getElementById("tstate").textContent === "lien coupé"
    && win.document.getElementById("pTerminal").classList.contains("u-term-coupe"),
    win.document.getElementById("tstate").textContent);

  // Le bouton doit vraiment rouvrir — un contrôle qui n'agit pas est
  // exactement ce que la règle STU-1 interdit.
  win.document.getElementById("tGo").click();
  await wait(60);
  check("« Ouvrir une session » rouvre bien un pont",
    ptyUrls().length === 2 && win.eval("termEtat") === "ouvert",
    ptyUrls().length + " pont(s), état " + win.eval("termEtat"));
  win.document.getElementById("tGo").click();
  await wait(20);
  check("« Fermer la session » ferme vraiment",
    win.eval("termEtat") === "repos" && win.eval("termWS") === null,
    win.eval("termEtat"));

  // xterm.js absent : la page ne peut pas le savoir avant d'essayer, et un
  // écran noir muet ferait croire à une panne d'Hermès.
  const ptysAvant = ptyUrls().length;
  win.eval("term = null; termFit = null;");
  const vraiTerm = win.Terminal;
  win.Terminal = undefined;
  win.eval("drawTerm()");
  await wait(60);
  check("sans xterm.js, l'écran DIT pourquoi au lieu de rester noir",
    /ne peut pas s.afficher/.test(win.document.getElementById("tecran").innerHTML)
    && /xterm\.js/.test(win.document.getElementById("tecran").innerHTML),
    win.document.getElementById("tecran").textContent.slice(0, 60));
  check("...et aucun pont n'est ouvert pour rien",
    ptyUrls().length === ptysAvant, ptyUrls().length + " vs " + ptysAvant);
  win.Terminal = vraiTerm;

  console.log("\n--- La passe de design du Terminal (2026-08-09) ---");

  // On repart d'un terminal branché, puis on FERME : entrer dans le panneau
  // ouvre une session, et les vérifications « au repos » se liraient sinon
  // à l'envers.
  win.eval("term = null; termFit = null;");
  win.eval('nav("Discuter"); nav("Terminal")');
  await wait(120);
  win.eval("fermerPty()");
  await wait(20);
  const ptyD = FakeWS.dernierPty;
  const panneau = win.document.getElementById("pTerminal");
  const gcs = (el, prop) => win.getComputedStyle(el).getPropertyValue(prop);

  // 1. La fenêtre enlève son déguisement : trois faux boutons sur la seule
  //    fenêtre qui mène en dehors de l'application, c'est ce que STU-1
  //    interdit partout ailleurs.
  check("1 · les trois fausses pastilles ont disparu de la barre",
    win.document.querySelectorAll("#tmain .tbar i").length === 0,
    win.document.querySelectorAll("#tmain .tbar i").length + " pastille(s)");
  check("1 · la barre dit ce qui tourne, pas le nom du thème",
    /hermes --tui/.test(win.document.querySelector("#tmain .u-quoi").textContent)
    && !/nuit|jour|ambre/i.test(win.document.querySelector("#tmain .tbar").textContent),
    win.document.querySelector("#tmain .tbar").textContent.trim());

  // 2. L'état de session : la seule chose qu'on doit savoir sans y penser.
  const past = win.document.getElementById("tstate");
  check("2 · l'état de session est une pastille, plus un murmure",
    gcs(past, "opacity") === "1" && gcs(past, "border-radius") !== "0px"
    && past.classList.contains("repos"),
    "opacité " + gcs(past, "opacity"));

  // 3. Ouvrir et fermer ne sont pas le même geste.
  check("3 · au repos, le panneau ne porte aucune classe d'ouverture",
    panneau.classList.contains("u-term-repos")
    && !panneau.classList.contains("u-term-ouvert"),
    panneau.className);

  // 4. La ligne d'état parlait du gateway, qui n'a rien à voir avec un PTY.
  const dim = win.document.querySelector("#tmain .dim");
  check("4 · la ligne d'état ne parle plus du gateway",
    !/gateway/i.test(dim.textContent) && /rendu/.test(dim.textContent),
    dim.textContent.trim());
  // Et elle n'invente pas le dossier de travail, que l'API n'expose pas.
  check("4 · ...et n'affiche aucun dossier qu'on ne connaît pas (STU-1)",
    !/dossier/i.test(dim.textContent), dim.textContent.trim());

  // 5. L'avertissement passe AVANT le premier geste.
  const avert = win.document.querySelector("#tmain .avert");
  const lancer = win.document.querySelector("#tmain .tlaunch");
  check("5 · l'avertissement est au-dessus du bouton d'ouverture",
    !!(avert.compareDocumentPosition(lancer) & 4),
    "avert " + (avert.compareDocumentPosition(lancer) & 4 ? "avant" : "APRÈS"));

  // 7. Deux familles, UN SEUL geste chacune. Ce qui les distingue n'est pas
  //    le geste : c'est où elles s'exécutent. Le mauvais geste ne doit pas
  //    exister là où il serait faux.
  const poseurs = win.document.querySelectorAll("#pTerminal [data-poser]");
  const copieurs = win.document.querySelectorAll("#pTerminal .tmemo [data-cmd]");
  check("7 · les deux familles existent, et chacune n'a qu'un geste",
    poseurs.length > 0 && copieurs.length > 0
    && !Array.from(poseurs).some((p) => p.hasAttribute("data-cmd"))
    && !Array.from(copieurs).some((c) => c.hasAttribute("data-poser")),
    copieurs.length + " à copier · " + poseurs.length + " à poser");
  // Une commande shell posée dans l'invite de l'agent partirait comme un
  // message. La seconde famille ne contient QUE des commandes de la TUI.
  check("7 · on ne pose que des commandes de la TUI, jamais du shell",
    Array.from(poseurs).every((p) => p.dataset.poser.startsWith("/")),
    Array.from(poseurs).map((p) => p.dataset.poser).join(" "));
  check("7 · ...et la note dit ce que l'invite attend",
    /attend d'abord une phrase/.test(
      win.document.querySelector("#pTerminal .u-tui .u-note").textContent));
  check("7 · session fermée, la famille de la session n'est pas proposée",
    gcs(win.document.querySelector("#pTerminal .u-tui"), "display") === "none",
    gcs(win.document.querySelector("#pTerminal .u-tui"), "display"));
  ptyD.envoye.length = 0;
  poseurs[0].click();
  check("7 · ...et cliqué quand même, il refuse au lieu d'envoyer dans le vide",
    ptyD.envoye.length === 0
    && /Ouvrez d'abord une session/.test(win.document.getElementById("snack").textContent),
    win.document.getElementById("snack").textContent);

  // Session ouverte : tout bascule.
  win.document.getElementById("tGo").click();
  await wait(80);
  check("7 · session ouverte, la famille de la session apparaît",
    gcs(win.document.querySelector("#pTerminal .u-tui"), "display") !== "none",
    gcs(win.document.querySelector("#pTerminal .u-tui"), "display"));
  check("le panneau bascule sur un seul état, jamais deux",
    Array.from(panneau.classList).filter((c) => /^u-term-/.test(c)).length === 1
    && panneau.classList.contains("u-term-ouvert"),
    Array.from(panneau.classList).filter((c) => /^u-term-/.test(c)).join(" "));

  // 5 & 6. La place que le terminal réclame.
  check("5 · session ouverte, l'avertissement se replie mais son titre reste",
    gcs(win.document.querySelector("#tmain .avert .u-long"), "display") === "none"
    && /ne s'appliquent pas ici/.test(
         win.document.querySelector("#tmain .avert").textContent),
    win.document.querySelector("#tmain .avert").textContent.trim().slice(0, 50));
  check("6 · les deux pavés qui n'engagent rien se replient",
    gcs(win.document.querySelector("#tmain .cout"), "display") === "none"
    && gcs(win.document.querySelector("#tmain .u-todo"), "display") === "none");
  check("6 · ...et on dit qu'ils sont repliés, avec où les retrouver",
    gcs(win.document.querySelector("#tmain .u-repli"), "display") === "block"
    && !!win.document.getElementById("tRepli"));
  check("6 · l'écran gagne la place ainsi libérée",
    gcs(win.document.getElementById("tecran"), "min-height") === "420px",
    gcs(win.document.getElementById("tecran"), "min-height"));

  // 7. Poser, pour de vrai — et SURTOUT sans lancer.
  const ptyO = FakeWS.dernierPty;
  ptyO.envoye.length = 0;
  const cmdVoulue = poseurs[0].dataset.poser;
  poseurs[0].click();
  check("7 · poser envoie la commande dans la ligne du terminal",
    ptyO.envoye.length === 1 && ptyO.envoye[0] === cmdVoulue,
    JSON.stringify(ptyO.envoye));
  // LE point qui compte : « Ulysse n'exécute rien que vous n'ayez lancé. »
  check("7 · ...et JAMAIS le retour chariot qui la lancerait",
    ptyO.envoye.every((f) => f.indexOf("\r") < 0 && f.indexOf("\n") < 0),
    JSON.stringify(ptyO.envoye));
  check("7 · poser ne copie pas aussi, alors que la ligne porte data-cmd",
    !/copié/i.test(win.document.getElementById("snack").textContent)
    && /à vous d'appuyer sur Entrée/.test(win.document.getElementById("snack").textContent),
    win.document.getElementById("snack").textContent);

  // Le piège, encore : la passe touche à #tmain, la session doit survivre.
  const ecranO = win.document.getElementById("tecran");
  const themeAutre = Array.from(win.document.querySelectorAll("#pTerminal [data-th]"))
    .find((b) => !b.classList.contains("on"));
  themeAutre.click();
  await wait(120);
  check("après la passe, changer de thème ne détruit toujours pas la session",
    win.document.getElementById("tecran") === ecranO
    && win.document.getElementById("tmain").contains(ecranO)
    && panneau.classList.contains("u-term-ouvert")
    && ptyO.readyState === 1,
    win.document.getElementById("tmain").contains(ecranO) ? "" : "écran resté au stock");

  console.log("\n--- Terminal, passe 2 : la place ---");

  // 0a. La colonne de 300 px n'a pas disparu : elle a EMMÉNAGÉ. Ses deux
  //     groupes sont déplacés, pas réécrits — rien de vivant n'est détruit.
  const cote = win.document.getElementById("tside");
  // Il y en a TROIS depuis que les familles sont séparées : l'apparence, et
  // les deux aides-mémoire. Aucun ne doit rester orphelin dans une colonne
  // devenue invisible — c'est ce que ce test garde.
  check("0a · aucun groupe ne reste orphelin dans la colonne",
    cote.querySelectorAll(".tgrp").length === 0
    && win.document.querySelectorAll("#tPopApp .tgrp").length === 1
    && win.document.querySelectorAll("#tPopMem .tgrp").length === 2,
    cote.querySelectorAll(".tgrp").length + " resté(s) · "
    + win.document.querySelectorAll("#tPopMem .tgrp").length + " dans l'aide-mémoire");
  check("0a · ...et la colonne ne prend plus de place ni le pointeur",
    gcs(cote, "width") === "0px" && gcs(cote, "pointer-events") === "none",
    gcs(cote, "width"));
  // Deux kebabs côte à côte seraient indistinguables : chacun porte l'icône
  // de ce qu'il contient.
  check("0a · les trois boutons portent chacun leur signe, et un intitulé",
    ["tApp", "tMem", "tFull"].every((id) => {
      const b = win.document.getElementById(id);
      return b && b.querySelector("svg") && b.getAttribute("aria-label");
    }));

  const app = win.document.getElementById("tApp");
  const mem = win.document.getElementById("tMem");
  const popApp = win.document.getElementById("tPopApp");
  const popMem = win.document.getElementById("tPopMem");
  app.click();
  check("0a · un repli s'ouvre", popApp.classList.contains("on"));
  mem.click();
  check("0a · ...et ouvrir l'autre ferme le premier",
    popMem.classList.contains("on") && !popApp.classList.contains("on"));

  // 0b. Le plein écran est APPLICATIF : une classe, pas l'API du navigateur —
  //     qui ferait sortir de l'application pour agrandir un de ses panneaux.
  const zoneTerm = win.document.querySelector("#pTerminal .term");
  const ecranAv = win.document.getElementById("tecran");
  const ptyAv = FakeWS.dernierPty;
  const creesAv = FakeTerminal.crees;
  win.document.getElementById("tFull").click();
  await wait(140);
  check("0b · le plein écran pose une classe, il ne reconstruit rien",
    zoneTerm.classList.contains("u-plein")
    && win.document.getElementById("tecran") === ecranAv
    && FakeTerminal.crees === creesAv && ptyAv.readyState === 1,
    FakeTerminal.crees - creesAv + " terminal(aux) recréé(s)");
  check("0b · ...et il n'appelle jamais le plein écran du navigateur",
    !win.document.fullscreenElement);
  // Les outils SUIVENT : c'est en plein écran qu'on travaille, donc c'est là
  // qu'on veut poser une commande. UN SEUL jeu, jamais deux — les mêmes
  // replis à deux endroits seraient deux endroits où les chercher.
  check("0b · en plein écran, les outils sont dans la ligne de sortie",
    win.document.querySelectorAll("#tOutils2 .icon-btn").length >= 2
    && win.document.querySelectorAll("#tOutils .icon-btn").length === 0,
    win.document.querySelectorAll("#tOutils2 .icon-btn").length + " ici · "
    + win.document.querySelectorAll("#tOutils .icon-btn").length + " restés en haut");
  check("0b · ...et « agrandir » disparaît : la ligne porte déjà la sortie",
    !win.document.getElementById("tFull")
    && !!win.document.getElementById("tSortie"));

  // ⚠ La touche EST le bouton. Il y avait un bouton « Quitter le plein écran »
  //    ET, à côté, la mention `Échap` : deux commandes pour un seul geste, et
  //    la large prenait la place qu'on vient justement chercher. Demandé par
  //    kuchu le 2026-08-09 : garder la touche, lire la phrase au survol.
  const touche = win.document.getElementById("tSortie");
  check("0b · la sortie est la touche elle-même, pas un bouton à côté d'elle",
    touche.tagName === "BUTTON" && !!touche.querySelector("kbd")
    && /^Échap$/.test(touche.querySelector("kbd").textContent.trim()),
    touche.outerHTML.slice(0, 80));
  // Cachée à l'ŒIL, jamais au lecteur d'écran : personne ne survole au clavier
  // ni à la voix. Un bouton sans nom accessible serait un bouton muet.
  check("0b · ...et elle garde un nom pour qui ne voit pas l'écran",
    touche.getAttribute("aria-label") === "Quitter le plein écran",
    String(touche.getAttribute("aria-label")));
  const dit = touche.querySelector(".u-dit");
  check("0b · la phrase existe, mais ne se lit pas au repos",
    !!dit && gcs(dit, "opacity") === "0" && gcs(dit, "max-width") === "0px",
    dit ? gcs(dit, "opacity") + " · " + gcs(dit, "max-width") : "absente");
  // jsdom ne simule pas `:hover` : on ne peut pas mesurer l'état survolé. On
  // vérifie donc que la règle qui le découvre EXISTE — sans elle, la phrase
  // serait invisible pour toujours, et la touche redeviendrait muette.
  const feuille = fs.readFileSync(path.join(DIR, "ulysse.html"), "utf8");
  check("0b · ...et c'est le survol qui la découvre",
    /\.u-echap:hover \.u-dit[\s\S]{0,120}max-width:\s*[1-9]/.test(feuille)
    && /\.u-echap:focus-visible \.u-dit/.test(feuille));
  // ⚠ LE PIÈGE. Au moment du bascule, les deux groupes ne sont plus dans
  // `#tside` — ils vivent dans les replis. Les y rechercher les perdrait.
  check("0b · les deux aides-mémoire ont suivi, aucun n'est perdu",
    win.document.querySelectorAll("#tPopApp .tgrp").length === 1
    && win.document.querySelectorAll("#tPopMem .tgrp").length === 2
    && win.document.querySelectorAll("#tPopMem [data-poser]").length > 0,
    win.document.querySelectorAll("#tPopApp .tgrp").length + " + "
    + win.document.querySelectorAll("#tPopMem .tgrp").length);

  // ⚠ Plein écran = LE TERMINAL. Tout ce qui l'entoure prend la place qu'on
  //    est venu chercher — et, en débordant, faisait DÉFILER la page, ce qui
  //    emportait hors de vue la ligne « Quitter le plein écran ». Elle
  //    existait, on ne la voyait plus : un plein écran dont on ne sait pas
  //    sortir. Signalé par kuchu le 2026-08-09.
  ["#tmain .avert", "#tmain .tlaunch", "#tmain .cout", "#tmain .u-todo", "#tmain .u-repli"]
    .forEach((sel) => {
      const el = win.document.querySelector(sel);
      check("0b · en plein écran, « " + sel.replace("#tmain ", "") + " » ne prend plus de place",
        !el || gcs(el, "display") === "none", el ? gcs(el, "display") : "absent");
    });
  check("0b · ...et le cadre ne défile plus : l'écran s'étire à la place",
    gcs(win.document.getElementById("tmain"), "overflow-y") === "hidden"
    && gcs(win.document.getElementById("tmain"), "display") === "flex",
    gcs(win.document.getElementById("tmain"), "overflow-y"));
  // L'avertissement ne disparaît pas : il MONTE dans la ligne de sortie.
  check("0b · ...mais l'avertissement ne disparaît pas, il monte dans la ligne",
    /ne s'appliquent pas ici/.test(
      win.document.querySelector("#tmain .u-sortie").textContent));

  // Un plein écran dont on ne sait pas sortir n'est pas un agrandissement.
  const sortie = win.document.querySelector("#tmain .u-sortie");
  check("0b · le chemin pour sortir est écrit à l'écran, et visible",
    gcs(sortie, "display") !== "none"
    && /Échap/.test(sortie.textContent)
    && !!win.document.getElementById("tSortie"),
    sortie.textContent.trim().slice(0, 44));
  check("0b · l'état de session ne disparaît jamais",
    !!win.document.getElementById("tstate")
    && gcs(win.document.getElementById("tstate"), "display") !== "none");

  // Échap ferme d'abord un repli — on ne perd jamais deux choses d'un coup.
  const echap = () => win.document.dispatchEvent(
    new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  win.document.getElementById("tApp").click();
  echap();
  check("0b · Échap ferme d'abord le repli, et laisse le plein écran",
    !win.document.getElementById("tPopApp").classList.contains("on")
    && zoneTerm.classList.contains("u-plein"));
  echap();
  await wait(140);
  check("0b · ...puis Échap sort du plein écran",
    !zoneTerm.classList.contains("u-plein"));

  // ⚠ Échap APPARTIENT au terminal quand on tape dedans : c'est une touche de
  // travail dans une TUI. La confisquer rendrait le terminal inutilisable en
  // plein écran, là précisément où on y travaille. Le bouton reste le chemin.
  win.document.getElementById("tFull").click();
  await wait(140);
  const saisie = win.document.createElement("textarea");
  win.document.getElementById("tecran").appendChild(saisie);
  saisie.focus();
  echap();
  await wait(60);
  check("0b · Échap tapé DANS le terminal lui revient, il ne replie rien",
    zoneTerm.classList.contains("u-plein"),
    zoneTerm.classList.contains("u-plein") ? "" : "le plein écran a été volé");
  saisie.remove();
  win.document.body.focus();
  echap();
  await wait(140);
  check("0b · ...et hors du terminal, Échap sort toujours",
    !zoneTerm.classList.contains("u-plein"));

  // Le contrat survit à tout ça — c'est ce que la passe promettait.
  const themeDepuisRepli = Array.from(
    win.document.querySelectorAll("#tPopApp [data-th]"))
    .find((b) => !b.classList.contains("on"));
  themeDepuisRepli.click();
  await wait(140);
  check("0b · après plein écran, retour et thème changé depuis le repli, "
    + "les huit id du contrat sont là",
    ["tside", "tmain", "tecran", "tstate", "tGo", "tSize", "uStock", "tOutils"]
      .every((id) => !!win.document.getElementById(id))
    && win.document.getElementById("tecran") === ecranAv
    && win.document.getElementById("tmain").contains(ecranAv),
    ["tside", "tmain", "tecran", "tstate", "tGo", "tSize", "uStock", "tOutils"]
      .filter((id) => !win.document.getElementById(id)).join(" ") || "toutes là");

  // ⚠ AUCUN contrôle mort dans ce panneau. « Copier « hermes » » a vécu
  //    depuis le premier jour sans gestionnaire : il était dans `.tlaunch`,
  //    et le câblage n'interrogeait que `#tside`. Un bouton visible qui
  //    n'agit pas est ce que la règle STU-1 interdit — et il a traversé deux
  //    passes de design sans qu'on le voie. On ne vérifie donc plus chaque
  //    bouton un par un : on exige que TOUS soient branchés.
  const morts = Array.from(
    win.document.querySelectorAll("#pTerminal [data-cmd], #pTerminal [data-poser],"
      + " #pTerminal .tbtn, #pTerminal .icon-btn,"
      + " #pTerminal .tlaunch button, #pTerminal .u-sortie button"))
    .filter((el) => !el.onclick)
    .map((el) => el.id || el.dataset.cmd || el.dataset.poser
      || el.textContent.trim().slice(0, 24));
  check("aucun contrôle du Terminal n'est mort",
    morts.length === 0, morts.join(" · "));

  // §1 — `/clear` : gardée, séparée, et son libellé dit ce qu'elle fait.
  const fort = win.document.querySelector("#pTerminal .tmemo .u-sep");
  check("1 · `/clear` est gardée, mais séparée par un filet",
    !!fort && !!fort.nextElementSibling
    && fort.nextElementSibling.dataset.poser === "/clear",
    fort && fort.nextElementSibling ? fort.nextElementSibling.dataset.poser : "absente");
  // La réponse à Cowork est dans le libellé, et elle est constatée : la
  // session fermée reste listée par /api/sessions.
  check("1 · ...et son libellé dit ce qu'elle fait, sans le mot « écran »",
    /nouvelle session à la place/.test(fort.nextElementSibling.textContent)
    && /restera dans \/sessions/.test(fort.nextElementSibling.textContent)
    && !/écran/.test(fort.nextElementSibling.textContent),
    fort.nextElementSibling.textContent.trim());

  // ── Les deux défauts que seul l'écran a montrés ────────────────────────
  // La TUI tournait, son texte était dans le tampon, et l'écran restait NOIR.
  // jsdom ne peint rien : il ne pouvait pas le voir. On exige donc le geste.
  const repeintsAvant = FakeTerminal.last.repeints;
  win.eval("termEtat = 'repos'; majTermEtat(); termEtat = 'ouvert'; majTermEtat();");
  await wait(120);
  check("changer d'état repeint le terminal, pas seulement la mise en page",
    FakeTerminal.last.repeints > repeintsAvant,
    FakeTerminal.last.repeints - repeintsAvant + " repeinte(s)");

  // La ligne d'état se dessine souvent AVANT que /api/status ait répondu.
  // Elle restait figée sur « Hermès … » pour toute la durée de la visite.
  win.eval("lastStatus = null; majDimTerm()");
  const dimVide = win.document.querySelector("#tmain .dim").textContent;
  check("sans état connu, la ligne dit qu'elle ne sait pas encore",
    /…/.test(dimVide) && !/gateway/i.test(dimVide), dimVide.trim());
  await win.eval("loadStatus()");
  await wait(60);
  const dimPleine = win.document.querySelector("#tmain .dim").textContent;
  check("...et quand l'état arrive en retard, elle se met à jour toute seule",
    /0\.20\.0/.test(dimPleine), dimPleine.trim());

  console.log("\n--- Écrire dans la mémoire ---");

  win.eval("ouvrirReglages(1)");
  await wait(200);
  const memCorps = win.document.getElementById("setbody");

  // Les trois gestes n'ont pas le même risque : créer ne perd rien,
  // remplacer perd tout ce qui était là.
  const memRangs = memCorps.querySelectorAll(".u-mfile");
  const memBoutons = Array.from(memCorps.querySelectorAll("[data-mf]"))
    .map((b) => b.dataset.mf + ":" + b.dataset.mode);
  // ⚠ La forme RÉELLE de `builtin_files` : un objet nom -> octets. Le code
  //    appelait `.filter` dessus et levait contre le vrai Hermès.
  const norm = JSON.parse(win.eval(
    'JSON.stringify(memFichiersApi({builtin_files:{memory:2263,user:1380,projet:0}}))'));
  check("`builtin_files` est lu comme un objet nom → octets, pas comme une liste",
    norm.length === 3 && norm[0].nom === "memory" && norm[0].octets === 2263,
    JSON.stringify(norm));
  check("...et un fichier de 0 octet compte comme non renseigné",
    JSON.parse(win.eval(
      'JSON.stringify(memManquants({builtin_files:{memory:2263,projet:0}}))'))
      .join() === "projet");

  check("les trois fichiers de mémoire sont là, avec le bon geste",
    memRangs.length === 3
    && memBoutons.includes("USER.md:remplacer")     // existe sur le faux disque
    && memBoutons.includes("MEMORY.md:remplacer")
    && memBoutons.includes("SOUL.md:verrou"),       // jamais « remplacer »
    memBoutons.join(" · "));
  check("...et SOUL.md ne propose AUCUN chemin vers l'écriture",
    !memBoutons.includes("SOUL.md:remplacer") && !memBoutons.includes("SOUL.md:creer")
    && /Protégé/.test(memCorps.querySelector(".u-mfile.u-verrou").textContent));

  // Le diff est ce qu'on lit avant d'écraser. S'il est faux, tout ment.
  const memBrut1 = win.eval('JSON.stringify(diffLignes("a\\nb\\nc", "a\\nX\\nc"))');
  const memD1 = JSON.parse(memBrut1);
  check("le diff compte juste : une ligne changée = une retirée, une ajoutée",
    memD1.moins === 1 && memD1.plus === 1 && memD1.egales === 2,
    "−" + memD1.moins + " +" + memD1.plus + " =" + memD1.egales);
  const memD2 = JSON.parse(win.eval('JSON.stringify(diffLignes("a\\nb", "a\\nb"))'));
  check("...et deux textes identiques ne montrent aucune différence",
    memD2.moins === 0 && memD2.plus === 0 && memD2.lignes.every((l) => l[0] === "rien"));
  const memD3 = JSON.parse(win.eval('JSON.stringify(diffLignes("", "neuf"))'));
  check("...un fichier vide qu'on remplit n'affiche rien comme « retiré »",
    memD3.moins === 0 && memD3.plus >= 1, "−" + memD3.moins + " +" + memD3.plus);

  // La memFeuille de remplacement : le seul cas où quelque chose se perd.
  Array.from(memCorps.querySelectorAll("[data-mf]"))
    .find((b) => b.dataset.mf === "USER.md").click();
  await wait(180);
  const memFeuille = win.document.getElementById("ecrireBody");
  check("la feuille s'ouvre sur le contenu ACTUEL, pas sur une page blanche",
    win.document.getElementById("sEcrire").classList.contains("on")
    && /Céramiste à Nantes/.test(win.document.getElementById("uMemTexte").value),
    win.document.getElementById("uMemTexte").value.slice(0, 30));
  check("...et la garantie de retour est dite, avec sa condition",
    /version d'avant sera gardée/.test(memFeuille.textContent)
    && /rien ne sera écrit/i.test(memFeuille.textContent));
  check("...les versions gardées sont listées, avec un retour possible",
    memFeuille.querySelectorAll("[data-rv]").length === 1);

  // ⚠ LES FINS DE LIGNE. Sur Windows ces fichiers sont en CRLF ; un textarea
  //    rend du LF. Sans normalisation, TOUTES les lignes diffèrent : l'écran
  //    annonçait « 5 retirées, 6 ajoutées, 0 inchangée » pour une seule ligne
  //    ajoutée — un diff qui ment sur ce qu'on s'apprête à perdre.
  const crlfD = JSON.parse(win.eval(
    'JSON.stringify(diffLignes("a\\r\\nb\\r\\nc".replace(/\\r\\n/g, "\\n"), "a\\nb\\nc"))'));
  check("un fichier en CRLF ne fait pas passer tout le contenu pour changé",
    crlfD.moins === 0 && crlfD.plus === 0 && crlfD.egales === 3,
    "−" + crlfD.moins + " +" + crlfD.plus + " =" + crlfD.egales);

  // Le diff se recalcule à la frappe : c'est lui qu'on lit, pas le champ.
  const memChamp = win.document.getElementById("uMemTexte");
  memChamp.value = "# Profil\n\nCéramiste à Nantes.\nEt je donne des cours.\n";
  memChamp.dispatchEvent(new win.Event("input"));
  await wait(40);
  const memBilan = win.document.querySelector("#uMemDiff .u-bilan");
  check("le bilan se recalcule à chaque frappe",
    /1 ligne retirée/.test(memBilan.textContent) && /1 ajoutée/.test(memBilan.textContent),
    memBilan.textContent.trim());

  // ⚠ L'écriture passe par serve.py, JAMAIS par /api/fs/write-text en direct :
  //    ce serait contourner la copie datée, et l'écran promettrait alors un
  //    retour en arrière qui n'existe pas.
  fetched.length = 0;
  win.document.getElementById("uMemGo").click();
  await wait(150);
  const memEnvois = fetched.filter((f) => f.method === "POST");
  check("écrire passe par serve.py, jamais par /api/fs/write-text en direct",
    memEnvois.some((f) => f.path === "/ulysse/ecrire")
    && !fetched.some((f) => f.path.indexOf("/api/fs/write-text") === 0),
    memEnvois.map((f) => f.path).join(" "));
  check("...et la feuille se ferme en le disant",
    !win.document.getElementById("sEcrire").classList.contains("on")
    && /version d'avant est gardée/.test(win.document.getElementById("snack").textContent),
    win.document.getElementById("snack").textContent);

  // Le verrou : trois niveaux, trois couleurs. Les peindre tous en vert
  // serait plus rassurant et moins vrai.
  Array.from(win.document.querySelectorAll("[data-mf]"))
    .find((b) => b.dataset.mf === "SOUL.md").click();
  await wait(120);
  const memNiv = win.document.querySelectorAll("#ecrireBody .u-niv-l");
  check("le verrou dit TROIS niveaux, pas une promesse",
    memNiv.length === 3 && memNiv[0].classList.contains("ok")
    && memNiv[1].classList.contains("ok") && memNiv[2].classList.contains("warn"),
    Array.from(memNiv).map((n) => n.className.replace("u-niv-l ", "")).join(" · "));
  check("...et le troisième dit que l'agent, lui, en a les moyens",
    /l'agent, lui, en a les moyens/i.test(memNiv[2].textContent)
    && /accords soient demandés/.test(memNiv[2].textContent),
    memNiv[2].textContent.trim().slice(0, 50));
  // On cherche l'absence de CONTRÔLE, pas de mots : l'écran contient bien la
  // phrase « pas de « écrire quand même » » — pour la nier.
  check("...la feuille du verrou n'offre aucun chemin vers l'écriture",
    !win.document.querySelector("#ecrireBody textarea")
    && !win.document.querySelector("#ecrireBody .validate")
    && !win.document.querySelector("#ecrireBody [data-mf]"),
    Array.from(win.document.querySelectorAll("#ecrireBody button"))
      .map((b) => b.textContent.trim()).join(" · "));
  win.eval("fermerEcriture()");

  /* ══ Montrer un fichier — UN SEUL écran ═══════════════════════════════════
     `ulysse-artifact.js` est arrivé le 2026-08-11 sans passe de design et
     SANS UNE SEULE LIGNE ICI. Il apportait un second visualiseur pour un
     objet qui en avait déjà un, et trois défauts que rien ne pouvait voir.
     C'est le point le moins visible de la passe et le plus utile : sans
     ces vérifications, le prochain fichier entre par la même porte. */
  console.log("\n--- Montrer un fichier ---");
  win.eval('nav("Discuter")');
  await wait(60);

  // ⚠ LA CARTE DÉSIGNE UN CHEMIN, pas un dossier réservé. `ARTIFACT_RE`
  //    n'acceptait que `/artifacts/…` — or le travail se fait dans le projet.
  //    Un agent qui vient d'écrire un fichier ne pouvait pas en poser la
  //    carte : il écrivait le chemin en toutes lettres, et on ne pouvait pas
  //    cliquer dessus. C'était exactement le fichier qu'on voulait ouvrir.
  const carteHTML = win.eval(
    'injectArtifacts("voici <b>D</b> [artifact: D:/faux-home/notes.md]")');
  check("la carte se pose sur un chemin de projet, pas sur /artifacts/",
    carteHTML.indexOf("f-carte") >= 0
    && carteHTML.indexOf(encodeURIComponent("D:/faux-home/notes.md")) >= 0,
    carteHTML.slice(0, 120));
  check("...et elle dit OÙ IL EST, tronqué par la tête",
    /class="f-ou">[^<]*faux-home/.test(carteHTML)
    && carteHTML.indexOf("généré · artefact") < 0,
    (carteHTML.match(/class="f-ou">([^<]*)/) || [])[1]);
  // Une balise non fermée ne doit pas avaler le paragraphe.
  check("une balise non fermée n'avale pas la suite du message",
    win.eval('injectArtifacts("[artifact: sans fin\\net la suite")')
      .indexOf("f-carte") < 0);

  /* ⚠ L'ICÔNE SE MESURE SUR LE RENDU, pas dans le texte du fichier.
     Le balayage statique cherche `svg("un nom")` ; il ne voit RIEN quand le
     nom sort d'une fonction — et c'est le cas ici, l'icône dépend de
     l'extension. Le défaut d'origine (« table » pour les .csv, absente du
     registre, donc `<path d="undefined"/>` et une pastille vide) serait donc
     revenu sous le nez du garde-fou statique : vérifié en remettant le défaut,
     il passait au vert.
     On regarde donc ce qui est DESSINÉ, pour toutes les extensions que la
     carte sait distinguer. Ça attrape n'importe quel nom inconnu, quelle que
     soit la façon dont il est choisi. */
  const bancIcones = ["a.md", "b.csv", "c.txt", "d.png", "e.bin", "f"];
  const rendus = win.eval("JSON.stringify(" + JSON.stringify(bancIcones)
    + '.map(function(n){ return injectArtifacts("[artifact: D:/x/" + n + "]"); }))');
  const creuses = JSON.parse(rendus)
    .map((h, i) => /d="(undefined|null|)"/.test(h) ? bancIcones[i] : null)
    .filter(Boolean);
  check("aucune carte ne dessine une icône creuse, quelle que soit l'extension",
    creuses.length === 0, creuses.length ? "vide(s) : " + creuses.join(", ")
      : bancIcones.length + " extension(s)");

  // ⚠ UN SEUL VISUALISEUR. `showFile()` ouvrait #sFile (une modale : le fond
  //    s'assombrit, la conversation disparaît) pendant que le fil ouvrait un
  //    volet. Lequel apparaissait dépendait de l'endroit où l'on avait cliqué.
  win.eval('showFile("D:/faux-home/notes.md", "notes.md")');
  await wait(150);
  const appEl = win.document.getElementById("app");
  /* ⚠ `#sFile` N'EXISTE PLUS. La modale a été retirée le 2026-08-12 : un
     fichier se montre dans UN SEUL écran. On ne vérifie donc plus qu'elle
     reste fermée — on vérifie qu'elle ne REVIENT pas. Une modale morte qui
     traîne finit par être rebranchée « parce qu'elle est là ». */
  check("l'Établi et le fil ouvrent LE MÊME écran : le volet",
    appEl.classList.contains("artifact-split")
    && !win.document.getElementById("sFile"),
    appEl.className + " · sFile=" + (win.document.getElementById("sFile")
      ? "existe encore" : "retirée"));
  check("...et la modale ne revient pas par la fenêtre",
    !win.document.getElementById("sFile")
    && !win.document.getElementById("fileBody")
    && fs.readFileSync(path.join(DIR, "ulysse.html"), "utf8")
        .indexOf('id="sFile"') < 0);
  // L'Établi vieillit vite : l'agent écrit pendant qu'on le regarde. Il est
  // le seul panneau qui n'avait pas de quoi se relire.
  win.eval('setMode("atelier")');
  await wait(200);
  check("l'Établi a de quoi se relire, comme tous les autres panneaux",
    !!win.document.getElementById("etabliRefresh"),
    win.document.getElementById("ctlEtabli")
      ? win.document.getElementById("ctlEtabli").innerHTML.slice(0, 60) : "pas de .ctl");
  {
    const compte = () => fetched.filter(
      (f) => f.path.indexOf("/api/files") === 0
             && f.path.indexOf("/api/files/read") !== 0).length;
    const avant = compte();
    win.document.getElementById("etabliRefresh").click();
    await wait(300);
    check("...et le bouton redemande vraiment le dossier au backend",
      compte() > avant, avant + " → " + compte() + " lecture(s) de dossier");
  }
  win.eval('setMode("chat")');
  await wait(60);

  // ⚠ LE VOLET DÉFILE. `.u-art-body{flex:1}` vivait sous un
  //    `<aside class="u-art-panel">` qui n'avait AUCUNE règle : le corps
  //    n'était donc pas un enfant flex, sa hauteur restait libre, et
  //    `overflow:hidden` coupait. Un document de six écrans était tronqué
  //    SANS barre de défilement — et toutes les passes de design en font six.
  //    On mesure la CHAÎNE, pas la présence d'une règle : jsdom ne calcule
  //    pas les hauteurs, mais il dit qui est le parent de qui.
  const voletF = win.document.getElementById("artifactViewer");
  const corpsF = win.document.getElementById("artVBody");
  check("le corps du volet est un enfant DIRECT de la colonne flex",
    !!voletF && corpsF.parentElement === voletF
    && !win.document.querySelector(".u-art-panel"),
    corpsF.parentElement ? corpsF.parentElement.className : "orphelin");
  const styleCorps = win.getComputedStyle(corpsF);
  check("...et il peut devenir plus petit que son contenu (min-height:0)",
    styleCorps.overflowY === "auto" && styleCorps.minHeight === "0px",
    "overflow-y:" + styleCorps.overflowY + " min-height:" + styleCorps.minHeight);
  // Le fantôme de la modale : le script fabriquait un backdrop pendant que la
  // feuille écrivait, trois lignes plus haut, « Pas de backdrop masquant ».
  check("le volet ne fabrique plus le backdrop que la feuille interdit",
    !win.document.querySelector(".u-art-backdrop"));

  // Ce que la modale savait et que le volet ignorait : la source, oui, mais
  // aussi l'image, la taille, le refus, le téléchargement. La fusion doit
  // avoir TOUT récupéré, sinon on a juste déplacé le trou.
  check("le volet a récupéré le rendu markdown de la modale",
    !!corpsF.querySelector(".u-md"), corpsF.innerHTML.slice(0, 60));
  /* ⚠ ET IL MONTRE LE DOCUMENT EN ENTIER. Le rendu portait `shorten(texte,
     20000)`, repris de la modale : au-delà, la fin disparaissait avec pour
     tout signal un « … » collé au dernier paragraphe. CONTRAT-INTERFACE.md
     fait 28 683 caractères — on en lisait les deux tiers. Un volet dont le
     métier est de lire des documents ne peut pas en cacher la fin ; la limite
     honnête existe déjà et refuse à voix haute (PREVIEW_MAX_BYTES).
     Le faux `notes.md` fait 400 lignes exprès : il dépasse la coupe. */
  check("...et il montre le document ENTIER, sans coupe silencieuse",
    corpsF.textContent.indexOf("…") < 0
    && (corpsF.textContent.match(/Une ligne de plus/g) || []).length === 400,
    (corpsF.textContent.match(/Une ligne de plus/g) || []).length + " lignes sur 400");
  win.document.getElementById("artVSource").click();
  await wait(40);
  check("...et il garde la source, que la modale n'avait pas",
    !!corpsF.querySelector(".u-art-raw"));
  win.document.getElementById("artVSource").click();
  await wait(40);

  /* ⚠ UN BOUTON QUI S'ALLUME SANS AGIR. ⟨/⟩ ne se desactivait que devant un
     binaire : devant un CSV il s'allumait et ne changeait RIEN, parce que le
     rendu n'existait que pour le markdown — tout le reste tombait dans le
     meme <pre>. Le fichier interdit pourtant cela en toutes lettres : « un
     bouton qui ne peut rien faire se desactive plutot que de mentir ».
     Et un CSV en texte brut n'est pas lu : c'est une soupe de virgules. Or
     c'est ICI qu'un fichier se developpe, plus dans le fil. */
  win.eval('showFile("D:/faux-home/tableau.csv", "tableau.csv")');
  await wait(150);
  check("un CSV se lit en colonnes, pas en soupe de virgules",
    !!corpsF.querySelector("table.u-art-tab")
    && corpsF.querySelectorAll("table.u-art-tab tbody tr").length === 3,
    corpsF.innerHTML.slice(0, 70));
  check("...le point-virgule d'un export français découpe, lui aussi",
    corpsF.querySelectorAll("table.u-art-tab thead th").length === 3,
    [...corpsF.querySelectorAll("thead th")].map((x) => x.textContent).join("|"));
  check("...et un séparateur ENFERMÉ dans un libellé ne coupe rien",
    /Achat regle Carrefour, Ile-de-France/
      .test(corpsF.querySelector("tbody tr td:nth-child(2)").textContent),
    corpsF.querySelector("tbody tr td:nth-child(2)").textContent);
  check("...le bouton ⟨/⟩ est vivant quand il a deux lectures à offrir",
    !win.document.getElementById("artVSource").disabled);
  win.document.getElementById("artVSource").click();
  await wait(40);
  check("...et il rend bien la source, pas le même tableau",
    !!corpsF.querySelector(".u-art-raw") && !corpsF.querySelector("table.u-art-tab"));
  win.document.getElementById("artVSource").click();
  await wait(40);
  /* Un .txt n'a qu'une seule facon d'etre lu : le bouton doit s'eteindre,
     sinon il repromet la bascule qui n'a jamais eu lieu. */
  win.eval('ouvrirTexteEnMemoire("releve.txt", "deux lignes\\nde texte brut")');
  await wait(60);
  check("...et il s'éteint pour un .txt, qui n'a qu'une seule lecture",
    win.document.getElementById("artVSource").disabled,
    "disabled=" + win.document.getElementById("artVSource").disabled);

  win.eval('showFile("D:/faux-home/logo.png", "logo.png")');
  await wait(150);
  check("le volet a récupéré les IMAGES de la modale",
    !!corpsF.querySelector("img"), corpsF.innerHTML.slice(0, 60));
  check("...et il désactive source et copie plutôt que de mentir",
    win.document.getElementById("artVSource").disabled
    && win.document.getElementById("artVCopy").disabled);
  check("...et le téléchargement porte le fichier, pas un lien vide",
    (win.document.getElementById("artVDl").getAttribute("href") || "")
      .indexOf("data:image/png") === 0);

  // Le backend rend le fichier ENTIER en base64 (+33 %) : au-delà de la
  // limite, l'onglet se fige. La modale refusait ; le volet ne savait pas.
  win.eval('showFile("D:/faux-home/gros.bin", "gros.bin")');
  await wait(150);
  check("le volet a récupéré le REFUS au-delà de la limite",
    /Trop volumineux/.test(corpsF.textContent)
    && !corpsF.querySelector("img") && !corpsF.querySelector(".u-art-raw"),
    corpsF.textContent.trim().slice(0, 60));

  // ⚠ UNE CARTE QUI PROMET UN FICHIER ABSENT EST UN BOUTON MORT. On le dit
  //    AVANT le clic. C'est ce que le fixture constant rendait invisible :
  //    il répondait « notes.md » pour n'importe quel chemin.
  const fil = win.document.getElementById("thread");
  fil.insertAdjacentHTML("beforeend", win.eval(
    'injectArtifacts("[artifact: D:/faux-home/parti.md]")'));
  await wait(200);
  const morte = fil.querySelector('.f-carte[data-fichier*="parti"]');
  check("une carte dont le fichier n'existe pas le dit avant le clic",
    !!morte && morte.classList.contains("absent")
    && /introuvable/.test(morte.textContent),
    morte ? morte.textContent.trim() : "pas de carte");
  const avantClic = fetched.length;
  if (morte) morte.click();
  await wait(80);
  check("...et cliquer dessus n'ouvre rien",
    fetched.length === avantClic || !/parti/.test(corpsF.innerHTML));

  // La carte d'un fichier présent, elle, finit par dire sa taille — et ne la
  // redemande pas à chaque peinture du fil.
  fil.insertAdjacentHTML("beforeend", win.eval(
    'injectArtifacts("[artifact: D:/faux-home/tableau.csv]")'));
  await wait(200);
  const vivante = fil.querySelector('.f-carte[data-fichier*="tableau"]');
  check("la carte d'un fichier présent dit sa taille",
    !!vivante && !vivante.classList.contains("absent")
    && /o\b|ko/.test(vivante.querySelector(".f-ou").textContent),
    vivante ? vivante.querySelector(".f-ou").textContent : "pas de carte");
  const lectures = fetched.filter(
    (f) => f.path.indexOf("/api/files/read") === 0 && /tableau/.test(f.path)).length;
  win.eval("paintThread()");
  await wait(200);
  check("...et une repeinture du fil ne la redemande pas au backend",
    fetched.filter((f) => f.path.indexOf("/api/files/read") === 0
                          && /tableau/.test(f.path)).length === lectures,
    "avant " + lectures + ", après " + fetched.filter(
      (f) => f.path.indexOf("/api/files/read") === 0 && /tableau/.test(f.path)).length);

  win.eval("closeArtifactViewer()");
  await wait(40);
  check("fermer le volet rend sa largeur à la conversation",
    !appEl.classList.contains("artifact-split"), appEl.className);

  /* ══ Le lien vient de ce que l'agent A FAIT ═══════════════════════════════
     Signalé par kuchu le 2026-08-11 : « montre-moi le contrat d'interface »
     faisait réciter le fichier dans le fil, SANS aucun moyen de l'ouvrir. La
     balise `[artifact: …]` dépend de ce que l'agent pense à écrire, et il n'y
     pense pas — c'était la réserve du §5 de la passe.
     Levée en lisant Hermès : `tool.complete` porte `args` (le dict complet)
     TOUJOURS — server.py:5423, pas seulement en mode verbeux — et la clé est
     `path` pour read_file/write_file/patch (agent/display.py:443). */
  const cheminReel = "D:/faux-home/notes.md";
  win.eval('conv.info = Object.assign({}, conv.info || {}, {cwd:"D:/faux-home"});');
  const wsOutil = FakeWS.last;
  const ev = (type, payload) => wsOutil.push({ jsonrpc: "2.0", method: "event",
    params: { type: type, session_id: "live_1", payload: payload } });
  ev("message.start", {});
  // ⚠ Le chemin arrive sur tool.complete, PAS sur tool.start : `context` n'est
  //    qu'un aperçu tronqué à 80 caractères, et `args_text` n'existe qu'en
  //    mode verbeux. C'est `args` qui fait foi, et il est toujours envoyé.
  ev("tool.start", { tool_id: "tt1", name: "read_file", context: "notes.md" });
  ev("tool.complete", { tool_id: "tt1", name: "read_file",
                        args: { path: "notes.md" }, result: "ok" });
  ev("message.complete", { status: "ok" });
  await wait(250);
  const ligne = win.document.querySelector('#thread .u-tool[data-fichier]');
  check("une ligne d'outil qui a touché un fichier devient le lien",
    !!ligne && decodeURIComponent(ligne.dataset.fichier) === cheminReel,
    ligne ? decodeURIComponent(ligne.dataset.fichier) : "aucune ligne ouvrable");
  // ⚠ Le chemin de l'agent est souvent RELATIF à son dossier de travail. Sans
  //    le cwd de la session, `/api/files/read` ne saurait pas le résoudre.
  check("...un chemin relatif est résolu sur le cwd de la session",
    !!ligne && decodeURIComponent(ligne.dataset.fichier).indexOf("D:/faux-home/") === 0);
  check("...et il n'y a PAS de carte en plus : la ligne nomme déjà le fichier",
    !!ligne && ligne.querySelectorAll(".f-carte").length === 0
    && win.document.querySelectorAll("#thread .u-tools .f-carte").length === 0);
  if (ligne){
    ligne.click();
    await wait(400);
    check("...cliquer la ligne ouvre le volet sur ce fichier",
      appEl.classList.contains("artifact-split")
      && win.document.getElementById("artVName").textContent === "notes.md",
      win.document.getElementById("artVName").textContent);
    // Le « ▸ résultat » garde son geste : il se déplie, il n'ouvre pas.
    win.eval("closeArtifactViewer()");
    await wait(40);
    const som = ligne.querySelector("summary");
    if (som){
      som.click();
      await wait(150);
      check("...mais déplier « résultat » n'ouvre pas le volet par-dessus",
        !appEl.classList.contains("artifact-split"), appEl.className);
    }
  }
  // ⚠ LISTE FERMÉE. « path » ne veut pas dire la même chose pour tous les
  //    outils : un outil inconnu ne doit pas se transformer en lien.
  ev("message.start", {});
  ev("tool.complete", { tool_id: "tt2", name: "browser_navigate",
                        args: { path: "/une/route" }, result: "ok" });
  ev("message.complete", { status: "ok" });
  await wait(250);
  check("un outil hors de la liste ne devient PAS un lien",
    win.document.querySelectorAll('#thread .u-tool[data-fichier]').length === 1,
    win.document.querySelectorAll('#thread .u-tool[data-fichier]').length + " ligne(s)");
  win.eval("closeArtifactViewer()");
  await wait(40);

  /* ══ Coller une image, c'est joindre une image ═════════════════════════════
     Le collage écrivait dans `web/captures/` — le dossier SERVI — via une
     route à lui, et insérait « [capture: C:\chemin ] » dans le message pour
     le retirer de la bulle à l'affichage. Même geste que le « + », deux
     mécaniques, et rien à l'écran pour dire laquelle on avait déclenchée. */
  console.log("\n--- Coller une image ---");
  const codePage = fs.readFileSync(path.join(DIR, "ulysse-app.js"), "utf8");
  const codeServe = fs.readFileSync(path.join(DIR, "serve.py"), "utf8");
  // On cherche l'absence de MÉCANIQUE, pas de mots : les commentaires
  // racontent l'histoire des deux routes, et c'est très bien.
  check("le collage n'a plus de route à lui",
    codeServe.indexOf('== "/ulysse/capture"') < 0
    && codeServe.indexOf('== "/ulysse/artifact"') < 0
    && codeServe.indexOf("def sauver_capture") < 0
    && codeServe.indexOf("def sauver_artifact") < 0);
  check("...ni de seconde liste à côté des pièces jointes",
    codePage.indexOf("refsCaptures") < 0
    && codePage.indexOf("dessineCaptures") < 0
    && !/const captures\s*=/.test(codePage));
  check("...et le produit n'écrit plus dans son propre dossier servi",
    !fs.existsSync(path.join(DIR, "captures"))
    && !fs.existsSync(path.join(DIR, "artifacts")));
  /* ⚠ AUCUN JETON SUR LE DISQUE. `lancer_ulysse.bat` en fabrique un neuf à
     chaque démarrage et le passe par VARIABLE D'ENVIRONNEMENT — précisément
     pour qu'il ne touche aucun fichier : « le jeton ne vit que dans la mémoire
     des processus lancés ici ». Un `web/.jeton-session` de 40 octets avait
     pourtant survécu depuis le 2026-08-08, écrit par une version antérieure,
     que plus rien ne lisait. Trouvé en écrivant le .gitignore, pas avant, et
     il serait parti sur GitHub avec un `git add .`.
     Ce test garde la promesse, pas le fichier. */
  check("aucun jeton de session ne traîne dans le dossier servi",
    !fs.existsSync(path.join(DIR, ".jeton-session")));
  // Le fond : le collage passe par le MÊME chemin que le « + ».
  check("coller une image appelle surFichiers, comme le « + »",
    /function collerCapture[\s\S]*?surFichiers\(/.test(codePage),
    "sinon c'est encore une seconde mécanique");

  /* ⚠ ET IL FAUT QUE CE CHEMIN ABOUTISSE. Le 2026-08-11, contre le VRAI
     gateway, joindre une image renvoyait **`4016 image not found`** — parce
     que `attacherFichier` appelait `image.attach`, qui veut un `path` visible
     du gateway et ne regarde JAMAIS `data_url`. Le navigateur ne peut pas en
     fournir : le fichier n'existe que sur le disque du client.
     Ça valait pour le collage ET pour le « + », depuis toujours. Rien ici ne
     pouvait le voir : le faux Hermès accepte n'importe quel appel RPC, donc
     un test « la pièce est jointe » passait au vert sur une pièce refusée.
     La bonne porte est `image.attach_bytes` (methods_prompt.py:453), dont la
     docstring décrit ce cas mot pour mot. On vérifie donc LA MÉTHODE APPELÉE,
     puisque c'est elle qui était fausse. */
  const codeCore = fs.readFileSync(path.join(DIR, "ulysse-core.js"), "utf8");
  const corpsAttache = (codeCore.match(
    /async function attacherFichier[\s\S]*?\n}/) || [""])[0];
  check("une image joint ses OCTETS — image.attach ne lit pas de data_url",
    corpsAttache.indexOf("image.attach_bytes") >= 0
    && corpsAttache.indexOf("content_base64") >= 0
    && !/rpc\(\s*"image\.attach"/.test(corpsAttache),
    corpsAttache.indexOf("image.attach_bytes") < 0 ? "image.attach_bytes absent"
      : "reste un appel à image.attach");
  check("...et un fichier non-image garde file.attach, qui rend « @file: »",
    corpsAttache.indexOf("file.attach") >= 0
    && corpsAttache.indexOf("ref_text") >= 0);
  // Le gateway refuse une image au-delà de 25 Mo (server.py:10350). Refuser
  // ici à 32 Mo, c'était promettre un envoi que le gateway allait rejeter.
  check("le plafond des images est celui du gateway, pas celui des fichiers",
    /image \? 25 : 32/.test(codePage), "25 Mo pour une image, 32 sinon");
  // En Discussion le proxy n'envoie que du texte : joindre ouvrirait une
  // session Cowork dans le dos de la personne pour une pièce qui n'arriverait
  // pas. On le dit, on ne le fait pas.
  /* ══ JOINDRE : UN SEUL CHEMIN, DANS LES DEUX MODES ═════════════════════════
     Ce bloc éprouvait deux chemins de pièce jointe. En Discussion les octets
     restaient dans la page et partaient en contenu multimodal vers
     /proxy/chat ; en Cowork ils passaient par le gateway. Deux chemins, deux
     façons d'échouer — et un fichier non-image simplement refusé d'un côté.

     Le mode pur a disparu le 2026-08-12. Il y a toujours une session à
     nourrir, donc `attacherFichier()` fait le travail dans les deux modes.
     Ce qu'on garde de l'ancien bloc, c'est sa leçon la plus chère :
     `image.attach_bytes`, JAMAIS `image.attach` — depuis un navigateur, la
     seconde répond « 4016 image not found », et elle l'a fait pendant des
     semaines sans que rien ne le dise. */
  win.eval('setMode2("plan")');
  await wait(60);
  const avantColle = FakeWS.sent.length;
  /* Le faux ne repond pas tout seul : c'est VOULU, c'est ce qui permet de
     regarder la trame avant d'y repondre. On repond donc a la main, et on
     repond comme le vrai — un `ref_text`, pas un booleen. */
  const repondus = new Set();
  const repondreAux = async (depuis) => {
    for (let tour = 0; tour < 4; tour++){
      await wait(60);
      FakeWS.sent.slice(depuis).forEach((brut) => {
        let m; try { m = JSON.parse(brut.trim()); } catch (e){ return; }
        if (!m || repondus.has(m.id)) return;
        repondus.add(m.id);
        if (m.method === "session.create"){
          FakeWS.last.push({ jsonrpc: "2.0", id: m.id,
            result: { session_id: "live_1", info: { cwd: "C:/p" } } });
        } else if (m.method === "image.attach_bytes"){
          FakeWS.last.push({ jsonrpc: "2.0", id: m.id,
            result: { attached: true, ref_text: "@image:colle.png" } });
        } else if (m.method === "file.attach"){
          FakeWS.last.push({ jsonrpc: "2.0", id: m.id,
            result: { attached: true, name: "notes.txt", ref_text: "@file:notes.txt" } });
        }
      });
    }
  };
  win.eval(`(function(){
    const bin = atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    const f = new File([a], "colle.png", { type: "image/png" });
    return surFichiers([f]);
  })()`);
  await repondreAux(avantColle);
  const jointeDisc = JSON.parse(win.eval("JSON.stringify(jointes)"));
  check("en Plan, une image collée est acceptée",
    jointeDisc.length === 1 && jointeDisc[0].etat === "prete",
    JSON.stringify(jointeDisc.map((j) => j.etat)));
  /* ⚠ LA METHODE APPELEE, PAS SEULEMENT LE CHEMIN EMPRUNTE. Le faux Hermès
     acceptait n'importe quel appel RPC, donc « la pièce est jointe » passait
     au vert sur une pièce refusée par le vrai. C'est la leçon la plus chère du
     projet : un faux qui ne ment pas comme le vrai ne prouve rien. */
  {
    const trames = FakeWS.sent.slice(avantColle)
      .map((t) => { try { return JSON.parse(t); } catch (e){ return {}; } });
    check("...par image.attach_bytes — jamais image.attach, qui répond 4016",
      trames.some((t) => t.method === "image.attach_bytes")
      && !trames.some((t) => t.method === "image.attach"),
      JSON.stringify(trames.map((t) => t.method)));
    check("...et les octets partent dans l'appel, pas un chemin local",
      trames.some((t) => t.params && /^data:image\//.test(
        String(t.params.content_base64 || ""))));
  }
  /* Un fichier NON-IMAGE passe maintenant lui aussi. C'était le refus le plus
     coûteux du mode pur : « le modèle n'ouvre pas de fichier ». Il y a une
     session, donc il y a un chemin — et lire n'est pas modifier, le mode Plan
     n'a aucune raison de s'y opposer. */
  win.eval("jointes.length = 0; dessineJointes();");
  const avantTxt = FakeWS.sent.length;
  win.eval(`surFichiers([new File(["texte"], "notes.txt", { type: "text/plain" })])`);
  await repondreAux(avantTxt);
  {
    const j = JSON.parse(win.eval("JSON.stringify(jointes)"));
    check("...et un fichier non-image n'est PLUS refusé en Plan",
      j.length === 1 && j[0].etat === "prete",
      JSON.stringify(j.map((x) => x.etat)));
  }
  win.eval("jointes.length = 0; dessineJointes();");

  /* ══ Le rendu markdown ════════════════════════════════════════════════════
     Il n'avait AUCUNE vérification, et il en portait quatre défauts. Ils
     vivaient déjà dans les bulles ; le volet, qui rend des documents entiers,
     les a rendus impossibles à ignorer (signalés par kuchu, 2026-08-11). */
  console.log("\n--- Le rendu markdown ---");
  const md = (s) => win.eval("mdRender(" + JSON.stringify(s) + ")");

  // ⚠ 1. UNE LIGNE N'EST PAS UN PARAGRAPHE. Nos fichiers sont coupés à 78
  //    colonnes : chaque ligne devenait son propre <p>, donc l'escalier.
  const enrobe = md("Une phrase assez longue\nqui continue ici\net finit là.");
  check("des lignes consécutives font UN paragraphe, pas un escalier",
    (enrobe.match(/<p>/g) || []).length === 1
    && enrobe.indexOf("longue qui continue ici et finit là") >= 0,
    enrobe);
  check("...et une ligne vide sépare toujours deux paragraphes",
    (md("Premier.\n\nSecond.").match(/<p>/g) || []).length === 2);
  // ⚠ 2. Corollaire direct : l'inline s'appliquait ligne par ligne, donc un
  //    gras à cheval sur un retour restait littéral, astérisques comprises.
  check("un **gras** à cheval sur deux lignes n'est plus littéral",
    md("voici du **gras\nsur deux lignes** ici").indexOf("<strong>") >= 0
    && md("voici du **gras\nsur deux lignes** ici").indexOf("**") < 0,
    md("voici du **gras\nsur deux lignes** ici"));
  // ⚠ Un gras qui CONTIENT une astérisque échouait aussi : `[^*]+` ne pouvait
  //    pas la franchir. Cas réel, trouvé dans CONTRAT-INTERFACE.md — le motif
  //    est dans un `code`, déjà transformé en <code> quand le gras s'applique.
  check("...et un **gras contenant une astérisque** tient aussi",
    md("**Les `apercu-*.html` RECOPIENT la feuille** — suite")
      .indexOf("<strong>") >= 0
    && md("**Les `apercu-*.html` RECOPIENT la feuille** — suite")
      .indexOf("**") < 0,
    md("**Les `apercu-*.html` RECOPIENT la feuille** — suite"));
  // ...sans pour autant mettre en gras ce qui n'en est pas.
  check("...mais « a ** b ** c » n'est pas du gras",
    md("a ** b ** c").indexOf("<strong>") < 0, md("a ** b ** c"));
  check("...et deux gras côte à côte restent deux gras",
    (md("**un** et **deux**").match(/<strong>/g) || []).length === 2,
    md("**un** et **deux**"));

  // ⚠ 3. LES BLOCS INDENTÉS. `/^>\s?/` exigeait la colonne zéro : une citation
  //    dans une liste s'affichait avec son chevron en clair.
  const cit = md("- un point\n\n  > une citation indentée\n  > sur deux lignes");
  check("une citation indentée est une citation, pas du texte avec un chevron",
    cit.indexOf("<blockquote>") >= 0 && cit.indexOf("&gt;") < 0, cit);
  check("...et son contenu est du markdown, pas du texte plat",
    md("> avec du **gras** dedans").indexOf("<strong>") >= 0);
  check("...un titre indenté aussi",
    md("  ## Titre indenté").indexOf("<h2") >= 0);

  // ⚠ 4. LES BLOCS DE CODE N'EXISTAIENT PAS. Sans eux, joindre les lignes
  //    (défaut 1) aurait mis un bloc entier sur UNE SEULE ligne : corriger le
  //    premier obligeait à écrire celui-ci.
  const bloc = md("Avant.\n\n```js\nconst a = 1;\n  const b = 2;\n```\n\nAprès.");
  check("un bloc ``` est rendu comme un bloc de code",
    bloc.indexOf('<pre class="u-md-c"><code>') >= 0, bloc.slice(0, 90));
  check("...ses lignes ne sont PAS jointes, et son indentation survit",
    bloc.indexOf("const a = 1;\n  const b = 2;") >= 0, JSON.stringify(bloc));
  check("...et rien n'y est lu comme du markdown",
    md("```\n# pas un titre\n- pas une liste\n**pas du gras**\n```")
      .indexOf("<h1") < 0
    && md("```\n# pas un titre\n- pas une liste\n**pas du gras**\n```")
      .indexOf("<strong>") < 0);
  // Un bloc jamais fermé ne doit pas faire disparaître la fin du message.
  check("...un bloc jamais fermé ne perd pas le texte",
    md("```\nresté ouvert").indexOf("resté ouvert") >= 0);

  // La suite d'un point de liste, coupée à 78 colonnes, reste DANS son point.
  const suite = md("- un point qui est long\n  et qui continue dessous\n- un autre");
  check("la suite indentée d'un point de liste reste dans son point",
    (suite.match(/<li>/g) || []).length === 2
    && suite.indexOf("long et qui continue dessous") >= 0, suite);
  /* ⚠ ET LE POINT EST DÉCORÉ EN ENTIER, pas ligne par ligne. Écrit d'abord
     en collant `inline(ligne)` à la précédente, ce cas redécorait chaque
     ligne séparément : un `**gras**` à cheval sur le retour restait littéral
     DANS LES LISTES, alors qu'il venait d'être réparé pour les paragraphes.
     Vu le soir même en ouvrant une passe dans le volet — son premier point
     montrait ses astérisques. Le même défaut, à deux endroits, et le test ne
     couvrait que le premier. */
  const grasLi = md("- début du point avec du **gras\n  qui franchit le retour** ici");
  check("...et un **gras** à cheval sur le retour tient DANS un point de liste",
    grasLi.indexOf("<strong>") >= 0 && grasLi.indexOf("**") < 0, grasLi);
  check("...idem pour un point de liste ordonnée",
    md("1. un **gras\n   coupé** ici").indexOf("<strong>") >= 0
    && md("1. un **gras\n   coupé** ici").indexOf("**") < 0);

  // ⚠ CE QUI NE DOIT PAS AVOIR BOUGÉ. Le rendu échappe AVANT de décorer : un
  //    titre de session portant <img onerror=…> s'exécuterait dans la page,
  //    avec accès au proxy authentifié.
  check("le HTML est toujours neutralisé, dans le texte comme dans le code",
    md('<img src=x onerror="vol()">').indexOf("<img") < 0
    && md("```\n<script>vol()</script>\n```").indexOf("<script") < 0,
    md('<img src=x onerror="vol()">'));
  check("les tableaux tiennent encore",
    md("| a | b |\n|---|---|\n| 1 | 2 |").indexOf('<table class="u-md-t">') >= 0);
  check("les listes ordonnées et les traits aussi",
    md("1. un\n2. deux").indexOf("<ol") >= 0 && md("---").indexOf("<hr>") >= 0);

  /* ⚠ ET LA FEUILLE SUIT LA CLASSE, PLUS L'ENDROIT. Les règles étaient
     écrites `.msg .u-md …` : le volet rend le même `.u-md`, mais hors d'une
     bulle — ses tableaux étaient sans bordures et ses citations sans barre.
     On mesure sur un `.u-md` posé AILLEURS que dans le fil. */
  const dehors = win.document.createElement("div");
  dehors.className = "u-md";
  dehors.innerHTML = md("> une citation\n\n| a |\n|---|\n| 1 |\n\n```\ncode\n```");
  win.document.body.appendChild(dehors);
  /* ⚠ ON NE MESURE PAS `border-left-width` : jsdom ne décompose pas le
     raccourci `border-left`, il rend « 16px » quoi qu'on écrive — une
     vérification qui passerait aussi bien avec la règle qu'avec son absence.
     `line-height` et `background-color` sont résolus pour de vrai. */
  const qt = win.getComputedStyle(dehors.querySelector("blockquote"));
  const pre = win.getComputedStyle(dehors.querySelector("pre.u-md-c"));
  check("le markdown est stylé HORS d'une bulle — le volet en rend aussi",
    win.getComputedStyle(dehors).lineHeight === "1.65"
    && qt.backgroundColor === "rgba(127, 127, 127, 0.06)",
    "interligne " + win.getComputedStyle(dehors).lineHeight
    + " · citation " + qt.backgroundColor);
  check("...et un bloc de code défile plutôt que de pousser la colonne",
    pre.overflowX === "auto", pre.overflowX);
  dehors.remove();

  /* ══ Emporter un livrable ═════════════════════════════════════════════════
     En Discussion, le modèle ne peut rien écrire sur le disque — et il n'en a
     pas besoin. Il écrit le contenu dans sa réponse ; c'est Ulysse qui en fait
     un fichier, au clic, dans le navigateur. Rien ne touche le disque tant
     qu'on ne clique pas, et ce clic EST l'accord.

     ⚠ CE QUI SUIT A CHANGÉ DE PLACE LE 2026-08-12. Le ⤓ était au coin du bloc,
     au milieu du texte. kuchu a parcouru une réponse entière, a regardé la fin,
     n'a rien vu — et les trois fichiers étaient là, noyés. Le bilan est
     maintenant à la FIN du tour, et le ⤓ inline a disparu : un fichier, un
     signe. Voir PASSE-DESIGN-LIVRABLES-DU-TOUR.md §1 et §2. */
  const bloc2 = md("```csv\nmois,ventes\njanvier,1240\n```");
  check("un bloc de code ne porte PLUS de bouton au milieu du texte",
    bloc2.indexOf("u-md-dl") < 0 && bloc2.indexOf("u-md-fig") < 0
    && bloc2.indexOf("<pre class=\"u-md-c\"") >= 0,
    bloc2.slice(0, 110));
  check("...et PAS une carte de fichier — il n'y a rien à ouvrir",
    bloc2.indexOf("f-carte") < 0);

  /* Ce qui entre dans l'encart, et surtout ce qui n'y entre pas. Une liste qui
     contient du bruit cesse d'être lue : on préfère oublier un livrable que
     d'en inventer trois. */
  const livr = (s) => win.eval("livrablesDuTexte(" + JSON.stringify(s) + ")");
  check("un bloc en langue de fichier est un livrable",
    livr("```csv\nmois,ventes\njanvier,1240\n```").length === 1);
  check("...mais pas un ```texte, un ```bash, ni un bloc sans langue",
    livr("```texte\nhttps://exemple.fr\nvoir plus haut\n```").length === 0
    && livr("```bash\ncd /tmp\nls -la\n```").length === 0
    && livr("```\ndeux lignes\nsans langue\n```").length === 0,
    [livr("```texte\na\nb\n```").length, livr("```bash\na\nb\n```").length,
     livr("```\na\nb\n```").length].join(" · "));
  check("...ni un bloc d'une seule ligne — une URL n'est pas un fichier",
    livr("```csv\nhttps://exemple.fr\n```").length === 0);
  check("un nom explicite suffit, même sans langue de fichier",
    livr("```texte notes.txt\nune ligne\net deux\n```").length === 1);

  // Le nom : la clôture d'abord, sinon la langue, jamais un nom inventé.
  const nomDe = (src) => (livr(src)[0] || {}).nom || "";
  check("le nom vient de la clôture quand l'agent en donne un",
    nomDe("```csv ventes-2026.csv\na,b\nc,d\n```") === "ventes-2026.csv",
    nomDe("```csv ventes-2026.csv\na,b\nc,d\n```"));
  check("...sinon de la langue, sans rien inventer de plausible",
    nomDe("```csv\na,b\nc,d\n```") === "extrait.csv"
    && nomDe("```python\nx=1\ny=2\n```") === "extrait.py",
    [nomDe("```csv\na,b\nc,d\n```"), nomDe("```python\nx=1\ny=2\n```")].join(" · "));
  /* ⚠ UN NOM N'EST PAS UN CHEMIN. `download` accepte ce qu'on lui donne : un
     agent qui écrirait « ```csv ../../ailleurs.csv » ne doit pas pouvoir
     viser hors du dossier de téléchargement. On n'accepte comme nom que ce
     qui EST un nom, et on retombe sur le défaut sinon. */
  check("un chemin proposé comme nom est refusé, pas nettoyé à moitié",
    nomDe("```csv ../../ailleurs.csv\na,b\nc,d\n```") === "extrait.csv"
    && nomDe("```csv C:\\\\Windows\\\\x.csv\na,b\nc,d\n```") === "extrait.csv",
    nomDe("```csv ../../ailleurs.csv\na,b\nc,d\n```"));

  /* L'ENCART, DANS LE TOUR. C'est le point que kuchu a signalé : il doit être
     APRÈS le texte, et se voir en faisant défiler sans lire. */
  const tour = (t) => win.eval("turnHTML(" + JSON.stringify(t) + ")");
  const hEnc = tour({ key: 901, role: "assistant", state: "done",
    text: "Voici le tableau.\n\n```csv\nmois,ventes\njanvier,1240\n```",
    tools: [{ name: "write_file", path: "C:/p/notes.md", state: "done" }] });
  check("l'encart existe et compte les deux espèces ensemble",
    hEnc.indexOf("l-livrables") >= 0 && /2 fichiers produits/.test(hEnc),
    hEnc.slice(hEnc.indexOf("l-livrables"), hEnc.indexOf("l-livrables") + 120));
  check("...il vient APRÈS le texte, pas au milieu",
    hEnc.indexOf("l-livrables") > hEnc.indexOf("Voici le tableau"));
  check("les deux espèces s'ouvrent ET s'emportent — le geste ne dépend pas"
    + " de l'endroit où sont les octets",
    /data-fichier="[^"]*notes\.md"[\s\S]*?l-ouvrir[\s\S]*?l-dl/.test(hEnc)
    && /data-bloc="901:0"[\s\S]*?l-ouvrir[\s\S]*?l-dl/.test(hEnc));
  check("...et chaque ligne dit ce que c'est : CSV, MD, le type en pastille",
    /<span class="l-type">CSV<\/span><span class="l-nom">extrait\.csv/.test(hEnc)
    && /<span class="l-type">MD<\/span><span class="l-nom">notes\.md/.test(hEnc),
    (hEnc.match(/<span class="l-type">[^<]*<\/span><span class="l-nom">[^<]*/g)
      || []).join(" · "));

  /* ⚠ LE CONTENU D'UN FICHIER NE SE DÉROULE PAS DANS LE FIL. « Ça prend de la
     place pour rien, et ce n'est pas là qu'il faut le développer » — kuchu,
     2026-08-12. Il se regarde dans le volet, en cliquant sa ligne. */
  check("le contenu du livrable a QUITTÉ le fil — il ne s'y déroule plus",
    hEnc.indexOf("janvier,1240") < 0 && hEnc.indexOf("Voici le tableau") >= 0,
    hEnc.indexOf("janvier,1240") < 0 ? "absent" : "encore déroulé");
  /* ...mais ce qui n'est PAS un livrable reste lisible sur place. Retirer un
     bloc d'exemple du fil le ferait disparaître sans rien en échange : il
     n'entre pas non plus dans l'encart. */
  const hEx = tour({ key: 905, role: "assistant", state: "done", tools: [],
    text: "Lancez ceci :\n\n```bash\ncd web\npython serve.py\n```" });
  check("...alors qu'un bloc d'exemple reste où il est — rien ne l'accueille",
    hEx.indexOf("python serve.py") >= 0 && hEx.indexOf("l-livrables") < 0);
  /* La découpe alimente le fil ET l'encart. Si elles divergeaient, un bloc
     pourrait sortir du fil sans arriver dans l'encart : perdu, sans un mot. */
  const dec = (s) => win.eval("JSON.stringify(decouperLivrables("
    + JSON.stringify(s) + "))");
  check("rien ne sort du fil sans entrer dans l'encart — une seule découpe",
    JSON.parse(dec("a\n\n```csv\nx,y\n1,2\n```\n\nb")).texte.indexOf("x,y") < 0
    && JSON.parse(dec("a\n\n```csv\nx,y\n1,2\n```\n\nb")).livrables.length === 1
    && /a[\s\S]*b/.test(JSON.parse(dec("a\n\n```csv\nx,y\n1,2\n```\n\nb")).texte));
  /* Un bloc encore ouvert n'est pas un fichier : le retirer pendant qu'il
     arrive ferait clignoter la réponse, et l'emporter livrerait un tronçon. */
  check("un bloc non clos reste dans le fil et n'est pas proposé à l'emport",
    JSON.parse(dec("```csv\nx,y\n1,2")).livrables.length === 0
    && JSON.parse(dec("```csv\nx,y\n1,2")).texte.indexOf("x,y") >= 0);
  check("un tour qui n'a rien produit n'affiche pas d'encart vide",
    tour({ key: 902, role: "assistant", state: "done",
           text: "Bonjour.", tools: [] }).indexOf("l-livrables") < 0);
  /* Pendant que ça coule, le texte n'est pas fini : un encart qui apparaîtrait
     ligne après ligne se lirait comme une liste qui se trompe. */
  check("...ni un tour encore en train de couler",
    tour({ key: 903, role: "assistant", state: "streaming",
           text: "```csv\na,b\nc,d\n```", tools: [] }).indexOf("l-livrables") < 0);

  // Le geste est branché sur le DOCUMENT : l'encart vit dans le fil
  // aujourd'hui, ailleurs demain. Le brancher par endroit finirait par
  // marcher ici et pas là.
  const srcApp = fs.readFileSync(path.join(DIR, "ulysse-app.js"), "utf8");
  check("le geste est branché une fois, sur le document — pas par endroit",
    /document\.addEventListener\("click"[\s\S]{0,300}l-dl/.test(srcApp));
  /* ⚠ La clé d'un bloc se DÉDUIT, elle ne se compte pas. Un compteur donnerait
     une clé neuve à chaque peinture du fil — et le fil est repeint à chaque
     frappe : la Map enflerait d'une copie du fichier par peinture. */
  check("la clé d'un bloc survit à la repeinture du fil",
    tour({ key: 904, role: "assistant", state: "done",
           text: "```csv\na,b\nc,d\n```", tools: [] })
    === tour({ key: 904, role: "assistant", state: "done",
               text: "```csv\na,b\nc,d\n```", tools: [] })
    && win.eval("blocsLivrables.size") <= 4,
    "taille " + win.eval("blocsLivrables.size"));
  // Le liseré : c'est ce qui le fait repérer sans lire. Sur la source, parce
  // que jsdom rend « 16px » pour tout raccourci `border-left`.
  check("l'encart porte un liseré d'accent — il se repère sans lire",
    /\.l-livrables\{[^}]*border-left:3px solid var\(--accent/.test(
      fs.readFileSync(path.join(DIR, "ulysse.css"), "utf8")));

  /* ══ LES CHEMINS DÉGRADÉS ═════════════════════════════════════════════════
     C'est là qu'un produit non poli casse en public. Le produit a des messages
     pour ces cas ; AUCUN n'avait été éprouvé. On les met en scène et on exige
     d'eux trois choses, dans cet ordre :
       ① que la personne comprenne QUE ça a échoué — pas un écran qui attend ;
       ② POURQUOI, en mots dont elle peut faire quelque chose ;
       ③ QUOI FAIRE. Un message qui s'arrête à ② est un mur poli.
     Cette section vient en DERNIER : elle casse le lien et coupe les
     fixtures, donc rien ne doit tourner après elle. */
  console.log("\n--- Les chemins dégradés ---");
  win.eval('nav("Discuter"); setMode2("cowork");');
  await wait(60);

  // ① LE LIEN DE L'AGENT EST MORT, et la personne envoie quand même.
  win.eval("conv.sessionId = null; conv.storedId = null;");
  FakeWS.last.close();
  await wait(80);
  const avantEnvoi = win.document.getElementById("thread").textContent;
  win.document.getElementById("reply").value = "Range mes fichiers";
  win.document.getElementById("composer").dispatchEvent(new win.Event("submit"));
  await wait(400);
  const filHS = win.document.getElementById("thread").textContent;
  check("lien coupé · l'échec se voit, l'écran n'attend pas dans le vide",
    filHS !== avantEnvoi && !win.eval("conv.running"),
    "running=" + win.eval("conv.running"));
  /* ⚠ ON REGARDE TOUS LES MESSAGES DE PANNE, PAS LE PREMIER. Écrit d'abord
     avec un `querySelector` seul, ce test lisait un message plus ancien — et
     c'est ainsi qu'on a vu que l'ancien CONTREDISAIT le neuf : il promettait
     que « le prochain message ouvrira une nouvelle session » alors que le lien
     venait d'être coupé. Deux messages qui se contredisent, et c'est le
     premier qu'on lit. Les deux doivent donc tenir. */
  /* `.m-portee` est exclu : c'est l'encart qui dit ce que le mode Plan retient
     et ne retient pas. Rien n'y est cassé, il n'y a donc rien à relancer — lui
     réclamer une consigne reviendrait à lui faire inventer une panne. */
  const pannes = [...win.document.querySelectorAll(
    "#thread .msg.u-err, #thread .msg.u-sys:not(.m-portee)")];
  const muets = pannes.filter((m) => !/(relanc|lancez|Discussion)/i.test(m.textContent));
  check("lien coupé · ...et CHAQUE message dit quoi faire, aucun ne se contredit",
    pannes.length > 0 && muets.length === 0,
    muets.length ? muets[0].textContent.trim().slice(0, 110)
      : pannes.length + " message(s), tous actionnables");

  // ② HERMÈS EST MUET sur /api/* : les panneaux qui le lisent.
  FIXTURES["/api/files"] = undefined;
  const vraiFetch2 = win.fetch;
  win.fetch = (url, opts) => (String(url).indexOf("/api/files") >= 0
    ? Promise.resolve({ ok: false, status: 502,
        text: () => Promise.resolve('{"detail":"Bad Gateway"}') })
    : vraiFetch2(url, opts));
  win.eval('ouvrirEtabliSur("D:/faux-home")');
  await wait(300);
  const etabliHS = win.document.getElementById("files");
  check("Hermès muet · l'Établi le dit au lieu de rester vide",
    !!etabliHS.querySelector(".u-todo"), etabliHS.textContent.trim().slice(0, 80));
  check("Hermès muet · ...et il dit quoi faire",
    /(relanc|lancer|lancez|démarr|Hermès)/i.test(etabliHS.textContent),
    etabliHS.textContent.trim().slice(0, 120));
  win.fetch = vraiFetch2;

  console.log("\n--- Aucune erreur JavaScript pendant tout ça ---");
  check("la console est restée propre", errors.length === 0, errors.slice(0, 3).join(" | "));

  const ok = results.filter((r) => r[1]).length;
  console.log("\n" + "=".repeat(62));
  console.log("  " + ok + " / " + results.length + " vérifications passées");
  if (ok !== results.length){
    console.log("\n  Échecs :");
    results.filter((r) => !r[1]).forEach((r) => console.log("    - " + r[0] + "  (" + r[2] + ")"));
  }
  console.log("=".repeat(62));
  process.exit(ok === results.length ? 0 : 1);
}

main().catch((e) => { console.error("\nARRET :", e); process.exit(1); });
