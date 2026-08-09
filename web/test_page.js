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
  "/api/files": { path: "", parent: null, entries: [
      { name: "Projets", path: "Projets", is_directory: true },
      { name: "notes.md", path: "notes.md", is_directory: false, size: 84, mime_type: "text/markdown" },
      { name: "gros.bin", path: "gros.bin", is_directory: false, size: 210 * 1024 * 1024 }] },
  "/api/files/read": { name: "notes.md", path: "notes.md", size: 12, mime_type: "text/markdown",
                       data_url: "data:text/markdown;base64," + Buffer.from("# Notes\nreel\n").toString("base64") },
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

/* Les fichiers de mémoire, tels qu'un disque les rendrait. Le vrai
   `/api/fs/read-text` renvoie le texte ET sa taille ; l'écran d'écriture s'en
   sert pour la ligne d'état ET pour calculer la différence. */
const MEM_DISQUE = {
  "USER.md": "# Profil\n\nCéramiste à Nantes.\nJe tourne, je cuis au gaz.\n",
  "MEMORY.md": "# Ce qu'Ulysse a retenu\n\n- Préfère le tutoiement.\n"
};

function fakeFetch(url, opts){
  const p = String(url).replace(/^https?:\/\/[^/]+/, "");
  const bare = p.split("?")[0];
  fetched.push({ path: p, method: (opts && opts.method) || "GET" });
  let body = FIXTURES[bare];

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
  if (body === undefined && bare === "/proxy/chat"){
    body = { choices: [{ message: { role: "assistant", content: "Réponse sans outils." } }] };
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
  const SCRIPTS = ["ulysse-config.js", "ulysse-icons.js", "ulysse-view.js", "ulysse-core.js", "ulysse-app.js"];
  let html = fs.readFileSync(path.join(DIR, "ulysse.html"), "utf8");
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
    html = html.replace(tag, "<script>\n" + code + "\n</script>");
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
    const appeles = new Set();
    for (const f of ["ulysse-app.js", "ulysse-view.js"]){
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

  html = html.replace(lien, "<style>\n" + CSS + "\n</style>");

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
  // Chat par defaut : on n'ouvre pas quelqu'un sur le mode ou l'agent ecrit.
  check("Chat est le mode par défaut",
    win.eval("mode") === "pur"
    && win.document.querySelector('#pDiscuter .u-modeseg button.on').dataset.mode === "pur",
    String(win.eval("mode")));

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

  // Un tour complet, joue par le faux serveur, DEPUIS L'ACCUEIL. Il faut
  // passer en Cowork : c'est le mode ou une session s'ouvre. En Chat, le
  // modele repond par /proxy/chat et il n'y a rien a ouvrir.
  win.document.querySelector('#pDiscuter .u-modeseg button[data-mode="cowork"]').click();
  await wait(30);
  check("passer en Cowork ne quitte pas l'accueil",
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
  const dmdCoul = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .find((m) => m.method === "projects.list");
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
     est ouvert change le premier, pas le second. */
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

  /* ⚠ EN MODE CHAT, IL N'Y A PAS DE LIEU. Ce mode n'ouvre AUCUNE session
     Hermès — le modèle répond, il n'agit pas. `conv.info.cwd` ne viendra
     jamais, et « dossier en attente » annoncerait indéfiniment quelque chose
     qui n'arrive pas.

     Signalé par kuchu le 2026-08-09, capture à l'appui : la gélule était
     restée en attente sur un écran où rien ne pouvait l'ouvrir. Le défaut
     est passé parce que ce test n'existait pas. */
  const modeAvant = win.eval("mode");
  win.eval('mode = "pur"; paintHint();');
  await wait(40);
  check("Lieu · en mode Chat, aucune gélule — rien n'y travaille",
    !lieu().querySelector(".l-lieu"),
    lieu().textContent.trim().slice(0, 50) || "vide");
  check("Lieu · ...et surtout pas « en attente », qui promettrait un dossier",
    !/en attente/.test(lieu().textContent));
  win.eval('mode = "' + modeAvant + '"; paintHint();');
  await wait(40);
  check("Lieu · elle revient dès qu'on repasse en Cowork",
    !!lieu().querySelector(".l-lieu"),
    lieu().textContent.trim().slice(0, 40));
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
  check("la demande y figure sous « À décider »",
    /décider/.test(np.textContent) && np.textContent.includes("write_file"),
    np.textContent.slice(0, 110));

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
  FakeWS.last.push({ jsonrpc: "2.0", id: r3.id, result: { resolved: 1 } });
  await wait(50);

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


  console.log("\n--- La coupure du lien ---");
  ws.onclose({ code: 1006 });
  await wait(60);
  txt = win.document.getElementById("thread").textContent;
  check("la coupure est annoncée à l'utilisateur", txt.includes("Lien interrompu"));
  check("l'identifiant de session mort est abandonné (C3)",
    win.eval("conv.sessionId") === null, String(win.eval("conv.sessionId")));
  // `hs` est la cinquieme classe d'etat : c'est elle qui marquera le kebab.
  // En Cowork le lien EST la condition — sans lui l'agent ne recoit rien.
  check("une brique qui ne répond plus pose la classe hs",
    win.document.getElementById("pDiscuter").classList.contains("hs"),
    "état du lien : " + win.eval("link.state"));

  console.log("\n--- Le mode Chat (sans outils) ---");
  // La bascule est SOUS le composeur, et il n'y en a plus qu'une : l'ecran
  // d'entree et l'application sont le meme ecran. Chat vient en premier.
  const segs = win.document.querySelectorAll('.u-modeseg button[data-mode="pur"]');
  check("la bascule est sous le composeur, et il n'y en a qu'une",
    segs.length === 1, segs.length + " trouvee(s)");
  const boutons = win.document.querySelectorAll(".u-modeseg button");
  check("Chat est proposé avant Cowork",
    boutons[0].dataset.mode === "pur" && /Chat/.test(boutons[0].textContent),
    boutons[0].textContent);
  segs[0].click();
  await wait(30);
  check("la bascule répond", segs[0].classList.contains("on")
    && win.eval("mode") === "pur");
  await wait(40);
  fetched.length = 0;
  win.document.getElementById("reply").value = "Un plan de chapitre";
  win.document.getElementById("composer").dispatchEvent(new win.Event("submit"));
  await wait(120);
  check("l'appel part vers /proxy/chat",
    fetched.some((f) => f.path === "/proxy/chat" && f.method === "POST"),
    JSON.stringify(fetched));
  txt = win.document.getElementById("thread").textContent;
  check("la réponse s'affiche", txt.includes("Réponse sans outils"));

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
  const croix = win.document.querySelector("#ctlEtabli button");
  check("R5 · son en-tête porte une commande, pas un bloc vide", !!croix);
  if (croix){
    croix.click();
    await wait(30);
    check("R5 · elle referme l'Établi", !work.classList.contains("atelier"));
  } else {
    check("R5 · elle referme l'Établi", false, "#ctlEtabli est vide");
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
  const dmd = FakeWS.sent.map((s) => JSON.parse(s.trim()))
    .find((m) => m.method === "projects.tree");
  check("Projets · la liste est demandée à « projects.tree », pas déduite",
    !!dmd, JSON.stringify(FakeWS.sent.map((s) => JSON.parse(s.trim()).method)));
  FakeWS.last.push({ jsonrpc: "2.0", id: dmd && dmd.id, result: { projects: [
    { id: "p1", label: "Migration des factures", path: "D:/Fact", color: "#9334E6",
      icon: "doc", isAuto: false, isNoProject: false, sessionCount: 11,
      lastActive: 1786280000, repos: [], previewSessions: [] },
    { id: "D:/Atelier", label: "Atelier", path: "D:/Atelier", color: null,
      icon: null, isAuto: true, isNoProject: false, sessionCount: 4,
      lastActive: 1786270000, repos: [], previewSessions: [] },
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
  check("Projets · la note dit que la mémoire N'EST PAS cloisonnée",
    /commun à tous/.test(proj.textContent)
    && !/n'en sort jamais/.test(proj.textContent),
    proj.textContent.slice(0, 60));

  /* ── RANGER UN DOSSIER EN PROJET ────────────────────────────────────────
     `projects.create` n'écrit RIEN sur le disque : il désigne un dossier qui
     existe. Le vocabulaire de cet écran en dépend entièrement. */
  const ranger = deduite && deduite.querySelector("[data-ranger]");
  check("Ranger · le dossier déduit offre le seul geste qui a un sens sur lui",
    !!ranger && /En faire un projet/.test(ranger.textContent),
    ranger ? ranger.textContent.trim() : "aucun bouton");
  ranger.click();
  await wait(60);
  const feuilleRanger = win.document.getElementById("projetBody");
  check("Ranger · la feuille s'ouvre",
    win.document.getElementById("sProjet").classList.contains("on"));
  check("Ranger · elle dit « ranger », jamais « créer » — rien n'est fabriqué",
    /Ranger un dossier en projet/.test(feuilleRanger.textContent)
    && !/Créer un projet/.test(feuilleRanger.textContent));
  // Le dossier est déjà connu : un bouton « Choisir… » ouvrirait le vide.
  check("Ranger · ...et AUCUN « Choisir… », qui n'ouvrirait rien",
    !/Choisir/.test(feuilleRanger.textContent));
  check("Ranger · le chemin est montré en entier, c'est le seul champ qui engage",
    /D:\/Atelier/.test(feuilleRanger.textContent));
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

  win.document.querySelector('.u-modeseg button[data-mode="cowork"]').click();
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
