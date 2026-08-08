/* ============================================================================
 * ulysse-app.js — l'application
 * ----------------------------------------------------------------------------
 * La maquette est SCRIPTÉE : ses six étapes, ses douze agents, ses trois
 * automatisations et ses trois notifications sont écrits en dur. Ce fichier
 * garde sa mise en scène — les mêmes classes, les mêmes gestes, les mêmes mots
 * — et remplace ses jeux d'essai par ce qu'Hermès répond réellement.
 *
 * Chaque panneau dit d'où viennent ses données. Ce qui n'a pas d'endpoint est
 * affiché comme non relié : c'est la règle STU-1 d'endpoints-ulysse.md, et
 * c'est la seule façon qu'un écran reste vrai.
 * ========================================================================== */
"use strict";

const $ = (id) => document.getElementById(id);
const H = (id, html) => { const n = $(id); if (n) n.innerHTML = html; };

/* ═══ Le menu — repris de la maquette ════════════════════════════════════ */

const PANELS = [
  /* Niveau 2 — le fil du travail en cours. */
  { n: 2, id: "Discuter",  lbl: "Discuter",  ico: "bulle",   tint: "rgba(66,133,244,.10)" },
  // « Ce que fait l'agent », et non « Plan » — décidé avec kuchu le
  // 2026-08-08. Un plan promet un avenir ; cet écran montre un passé et un
  // présent : Hermès n'annonce pas ce qu'il va faire, il le fait et émet
  // tool.start / tool.complete à mesure. C'est le mot que la maquette avait
  // déjà trouvé, dans le bandeau de volet qu'on a supprimé.
  //
  // `id` reste « Plan » : il porte l'ancre `#Plan` et compose `#pPlan`, qui
  // est du contrat. Seul le libellé change.
  { n: 2, id: "Plan",      lbl: "Ce que fait l'agent", ico: "noeuds",
    tint: "rgba(155,114,203,.12)" },
  { n: 2, id: "Travaux",   lbl: "Travaux",   ico: "eclair",  tint: "rgba(52,168,83,.10)" },
  { n: 2, id: "Livrables", lbl: "Livrables", ico: "doc",     tint: "rgba(217,101,112,.10)" },
  /* Niveau 3 — la machine derrière. */
  { n: 3, id: "Projets",   lbl: "Projets",   ico: "dossier", tint: "rgba(66,133,244,.09)" },
  { n: 3, id: "Automatisations", lbl: "Automatisations", ico: "boucle", tint: "rgba(0,121,145,.10)" },
  { n: 3, id: "Vestiaire", lbl: "Vestiaire", ico: "equipe",  tint: "rgba(234,67,53,.09)" },
  { n: 3, id: "Reglages",  lbl: "Réglages",  ico: "regler",  tint: "rgba(95,99,104,.07)" },
  { n: 3, id: "Terminal",  lbl: "Terminal CLI", ico: "terminal", tint: "rgba(60,64,67,.10)" },
  { n: 3, id: "Reperes",   lbl: "Repères",   ico: "boussole", tint: "rgba(251,188,4,.11)" }
];

let current = null, pinned = false, coulisses = false;

const LIFE = {
  Discuter:        { onEnter: () => { paintThread(); paintBand(); } },
  Plan:            { onEnter: drawPlan },
  Travaux:         { onEnter: drawWorks },
  Livrables:       { onEnter: drawLivrables },
  Projets:         { onEnter: drawProjets },
  Automatisations: { onEnter: drawAutos },
  Vestiaire:       { onEnter: drawVestiaire },
  Reglages:        { onEnter: drawSet },
  Terminal:        { onEnter: drawTerm },
  Reperes:         { onEnter: drawGlossary }
};

function nav(id){
  // Une destination inconnue (#top, un vieux lien, une majuscule) ne doit
  // jamais laisser l'écran entièrement gris : tous les panneaux sont en
  // display:none, et sortir sans rien allumer donnait une page morte.
  const wanted = String(id || "").trim().toLowerCase();
  const p = PANELS.find((x) => x.id.toLowerCase() === wanted) || PANELS[0];
  current = p.id;
  document.querySelectorAll(".panel").forEach((e) => e.classList.remove("on"));
  $("p" + p.id).classList.add("on");
  document.documentElement.style.setProperty("--tint", p.tint);
  drawRail();
  if (LIFE[p.id] && LIFE[p.id].onEnter){
    try { LIFE[p.id].onEnter(); } catch (e){ console.error(e); }
  }
  if (location.hash.slice(1) !== p.id) location.hash = p.id;
}

/* La porte du niveau 3. Une fois poussée, elle reste ouverte : on ne redemande
   pas à quelqu'un de retrouver deux fois le même endroit. */
function toggleCoulisses(e){ if (e) e.stopPropagation(); coulisses = !coulisses; drawRail(); }

/* Deux vitesses, parce que ce ne sont pas deux mêmes intentions : la lisière
   gauche (18 px) — on ne s'y trouve pas par hasard, donc 140 ms ; la bande des
   icônes (72 px) — on la traverse dix fois par minute pour atteindre le
   contenu, donc 520 ms. Et 300 ms avant de refermer, pour qu'un tremblement de
   main ne fasse pas disparaître ce qu'on était en train de lire. */
let railT = null;
function railSet(v, delai){
  clearTimeout(railT);
  railT = setTimeout(() => {
    const w = $("railwrap");
    if (w.classList.contains("mini")) w.classList.toggle("open", v);
  }, delai);
}
function initRailHover(){
  const hot = $("railhot"), rail = $("rail");
  hot.addEventListener("mouseenter", () => railSet(true, 140));
  rail.addEventListener("mouseenter", () => railSet(true, 520));
  rail.addEventListener("mouseleave", () => railSet(false, 300));
  rail.addEventListener("click", () => railSet(false, 120));
}

function drawRail(){
  const item = (p) =>
    '<button class="rail-btn ' + (p.id === current ? "on" : "") + '" data-nav="' + p.id + '"'
    + ' aria-label="' + esc(p.lbl) + '">'
    + '<span class="ic">' + svg(p.ico, { size: 22, w: 1.6 }) + "</span>"
    + '<span class="lbl">' + esc(p.lbl) + "</span></button>";

  H("railItems",
    PANELS.filter((p) => p.n === 2).map(item).join("")
    + '<div class="rail-div"></div>'
    + '<button class="rail-btn" id="doorBtn" aria-label="Les coulisses"'
    + ' style="color:' + (coulisses ? "var(--muted)" : "var(--faint)") + '">'
    + '<span class="ic" style="transform:rotate(' + (coulisses ? 180 : 0) + "deg);"
    + 'transition:transform .24s cubic-bezier(.2,0,0,1)">' + svg("chevron", { size: 22, w: 1.6 })
    + "</span><span class=\"lbl\">Les coulisses</span></button>"
    + (coulisses ? PANELS.filter((p) => p.n === 3).map(item).join("") : ""));

  $("railItems").querySelectorAll("[data-nav]").forEach((b) => {
    b.onclick = () => nav(b.dataset.nav);
  });
  $("doorBtn").onclick = toggleCoulisses;
  H("burger", svg("menu"));
  Notifs.drawBell();
}

function pinRail(){
  pinned = !pinned;
  $("railwrap").classList.toggle("mini", !pinned);
  if (pinned) $("railwrap").classList.remove("open");
  $("burger").setAttribute("aria-label", pinned ? "Détacher le menu" : "Épingler le menu");
}

/* ═══ La dette — ce qu'Ulysse ne sait pas encore de vous ══════════════════
   La maquette la calcule sur un user.md fictif. Ici elle vient de
   GET /api/memory : les fichiers de mémoire intégrés qui n'existent pas
   encore. Même intention, donnée réelle. */

let detteMini = false, memoireEtat = null;

function majDette(){
  const w = $("dettewrap");
  if (!w) return;
  if (!memoireEtat || !memoireEtat.manquants || !memoireEtat.manquants.length){
    w.innerHTML = "";
    return;
  }
  const noms = memoireEtat.manquants.join(", ");
  if (detteMini){
    w.innerHTML = '<div class="dette mini"><span class="pt">' + svg("alerte", { size: 17 })
      + '</span><span class="tx">Profil non renseigné</span></div>';
    w.querySelector(".dette").onclick = () => { detteMini = false; majDette(); };
    return;
  }
  w.innerHTML = '<div class="dette"><span class="pt">' + svg("alerte", { size: 17 }) + "</span>"
    + '<span class="tx"><span class="lienr liena" id="detteGo">' + esc(noms) + "</span>"
    + " n'existe pas encore. Je ne sais ni à qui je parle, ni ce que vous connaissez"
    + " déjà : mes réponses resteront vagues.</span>"
    + '<span class="act"><button class="go" id="detteAct">Voir la mémoire</button>'
    + '<button class="later" id="detteRed">Réduire</button></span></div>';
  const go = () => { nav("Reglages"); setSel = 1; drawSet(); };
  $("detteGo").onclick = go;
  $("detteAct").onclick = go;
  $("detteRed").onclick = () => { detteMini = true; majDette(); };
}

/* ═══ Discuter ═══════════════════════════════════════════════════════════ */

/* Le Vestiaire = 6 RÔLES, pas des agents. Choisir un rôle préfixe le premier
   message avec son cadre : le moteur reçoit un prompt normal, rien de fragile
   côté API. (VES-1 à VES-6 de endpoints-ulysse.md.) */
const ROLES = [
  { id: "orchestrateur", name: "Orchestrateur", role: "Coordonne et vérifie",
    prompt: "Tu agis comme Orchestrateur : coordonne, découpe la tâche en étapes, délègue aux outils pertinents et vérifie le résultat avant de conclure." },
  { id: "generaliste", name: "Généraliste", role: "Polyvalent, sans spécialité",
    prompt: "Tu agis comme Généraliste : réponds de façon polyvalente et autonome, sans présupposer de spécialisation." },
  { id: "raisonnement", name: "Raisonnement", role: "Analyse en profondeur",
    prompt: "Tu agis comme Raisonnement : analyse en profondeur, expose ton cheminement étape par étape avant de conclure." },
  { id: "codage", name: "Codage", role: "Lit, écrit et teste le code",
    prompt: "Tu agis comme expert Codage : lis et écris les fichiers, teste réellement, et livre du code fonctionnel vérifié." },
  { id: "appel-outil", name: "Appel d'outil", role: "Branche les outils et les API",
    prompt: "Tu agis comme Appel d'outil : privilégie systématiquement les outils et API disponibles plutôt que de répondre en texte libre." },
  { id: "gardefou", name: "Garde-fou", role: "Signale les risques avant d'agir",
    prompt: "Tu agis comme Garde-fou : avant chaque action, signale les risques, les effets irréversibles, et demande confirmation si nécessaire." }
];

let activeRole = null;
// Chat par défaut : c'est le visage nu, celui qui n'engage aucun outil. On
// n'ouvre pas quelqu'un sur le mode où l'agent peut écrire et exécuter.
let mode = "pur";             // pur (Chat) | cowork
let pureBusy = false;         // le mode pur a sa propre occupation
let incognito = false;
const pureHistory = [], pureTurns = [];

/* Le repli présente les six avec les ENCOCHES de la maquette (`.opt` et
   `.tick`, le langage de ses questions à choix) : on ne dessine pas une
   deuxième façon de choisir dans le même produit.

   AUCUN cadre n'est pré-choisi. Afficher « Orchestrateur » d'entrée aurait
   été plus accueillant, mais `activeRole` vaut null et `roleOpts()` ne
   préfixe alors rien : l'interface aurait annoncé un cadre qui n'agit pas.
   Recliquer le cadre actif le retire — écrire sans cadre est un état qui
   existe, et c'est celui de départ. */
function drawRoles(){
  H("roles", ROLES.map((r) => {
    const on = activeRole && activeRole.id === r.id;
    return '<button class="u-role' + (on ? " on" : "") + '" data-role="' + esc(r.id) + '">'
      + '<span class="tick">' + (on ? svg("coche", { size: 11 }) : "") + "</span>"
      + "<span>" + esc(r.name) + "</span></button>";
  }).join(""));
  $("roles").querySelectorAll("[data-role]").forEach((b) => {
    b.onclick = () => {
      const r = ROLES.find((x) => x.id === b.dataset.role);
      activeRole = (activeRole && activeRole.id === r.id) ? null : r;   // reclic = désactive
      const p = $("cadrePop");
      if (p) p.classList.remove("on");
      drawRoles(); paintHint();
      if (current === "Vestiaire") drawVestiaire();
    };
  });
  majCadre();
}

/* La gélule reste GRISE dans les deux états. Elle ne passe pas au bleu quand
   un cadre est actif : ce serait donner à un réglage la couleur que le
   produit réserve à ce qui est SÉLECTIONNÉ DANS LE CONTENU. Un point bleu à
   gauche du nom suffit à dire qu'on n'écrit plus à nu. */
function majCadre(){
  const b = $("cadreBtn");
  if (!b) return;
  b.innerHTML = (activeRole ? "<i></i>" : "") + "<span>"
    + esc(activeRole ? activeRole.name : "Cadre") + "</span>";
  b.title = activeRole
    ? "Cadre « " + activeRole.name + " » — il est envoyé en tête du premier message"
    : "Choisir un cadre — il dit à l'agent comment travailler";
}

function turnHTML(t){
  const cls = t.role === "user" ? "you" : t.role === "assistant" ? "ulysse"
    : t.role === "error" ? "u-err" : "u-sys";
  let h = '<div class="msg ' + cls + '">';
  if (t.role === "user" || t.role === "assistant"){
    h += '<div class="u-who">' + (t.role === "user"
      ? "Vous" + (t.preamble ? " · cadre « " + esc(t.preamble) + " »" : "")
      : "Ulysse") + "</div>";
  }
  // Les outils AVANT le texte : c'est l'ordre réel d'exécution.
  if (t.tools && t.tools.length){
    h += '<div class="u-tools">' + t.tools.map((x) =>
      '<div class="u-tool' + (x.state === "done" ? " done" : "") + '"><span class="d"></span>'
      + '<div style="flex:1;min-width:0"><span class="n">' + esc(x.name) + "</span>"
      + (x.context ? '<div class="c">' + esc(x.context) + "</div>" : "")
      + (x.args ? '<div class="c">' + esc(x.args) + "</div>" : "")
      + (x.result ? "<details><summary>résultat</summary><pre>"
          + esc(shorten(x.result, 4000)) + "</pre></details>" : "")
      + "</div>"
      + '<span class="z">' + (x.state === "done" ? esc(fmtDur(x.ms)) : "en cours") + "</span>"
      + "</div>").join("") + "</div>";
  }
  if (t.reasoning){
    h += "<details><summary>réflexion de l'agent</summary><pre class=\"u-raw\">"
      + esc(t.reasoning) + "</pre></details>";
  }
  if (t.text || t.role !== "assistant" || !(t.tools && t.tools.length)){
    h += "<p" + (t.state === "streaming" && !t.text ? ' class="u-caret"' : "") + ">"
      + esc(t.text) + "</p>";
  }
  return h + "</div>";
}

function paintThread(){
  const host = $("thread");
  if (!host) return;
  const scroller = host.closest(".thread") || host;
  const stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 90;

  const turns = mode === "pur" ? pureTurns : conv.turns;
  let h = "";
  // La ligne du fil sans mémoire. Elle est le troisième des trois signaux
  // faibles de la maquette (teinte du fond, pastille près du titre, cette
  // ligne) ; `.privnote` l'attendait dans ulysse.css sans que rien ne l'écrive.
  if (incognito){
    h += '<div class="privnote">' + svg("incognito", { size: 16 })
      + "<span>Fil sans mémoire — il ne sera pas retrouvé dans les Travaux, "
      + "et se ferme avec la fenêtre.</span></div>";
  }
  if (!turns.length){
    h += '<div class="u-load">' + (mode === "pur"
      ? "Discussion : le modèle répond, il n'agit pas. Aucun outil n'est actif."
      : "Cowork : l'agent complet, outils actifs. La session s'ouvre au premier message.")
      + "</div>";
  }
  h += turns.map(turnHTML).join("");
  if (conv.status && conv.running && mode === "cowork"){
    h += '<div class="u-load">' + esc(conv.status.text || "…") + "</div>";
  }
  // La demande d'accord se pose EN FIN DE FIL, là où l'agent s'est arrêté.
  // C'est ce qui le bloque : ça ne peut pas vivre seulement dans une cloche.
  if (mode === "cowork") h += accordHTML();

  host.innerHTML = h;
  host.querySelectorAll("[data-ch]").forEach((b) => {
    b.onclick = () => repondreAccord(b.dataset.ch);
  });
  if (stick) scroller.scrollTop = scroller.scrollHeight;
  paintHint();
}

function paintHint(){
  const busy = mode === "pur" ? pureBusy : conv.running;
  $("snd1").style.display = busy && mode === "cowork" ? "none" : "";
  $("stopBtn").style.display = busy && mode === "cowork" ? "" : "none";
  $("reply").disabled = busy && mode === "pur";

  const cadre = activeRole ? " · cadre « " + activeRole.name + " »" : "";
  $("composerHint").textContent = mode === "cowork"
    ? (conv.sessionId
        ? "Session " + conv.sessionId + (conv.info && conv.info.model ? " · " + conv.info.model : "")
        : "Aucune session — elle s'ouvrira au premier message") + cadre
    : "Sans outils — le modèle répond, il n'agit pas." + cadre;

  // Les classes que toute la mise en scène attend. Sans `incog`,
  // `.privchip{display:none}` gagne et #privchip était rempli à chaque
  // passage ici pour rester invisible — de même pour la teinte et la ligne.
  majEtats();
  majCadre();
  // L'ICÔNE SEULE, sans les mots « Sans mémoire » : ils répétaient en toutes
  // lettres ce que la fenêtre entière est déjà en train de dire — la teinte
  // du fond, la ligne en tête de fil. Elle est posée en `--text` quand tout
  // le reste de la barre est en `--muted` : c'est ce contraste qui la rend
  // visible, pas sa taille.
  H("privchip", incognito
    ? '<span title="Fil sans mémoire — il ne sera pas conservé" '
      + 'aria-label="Fil sans mémoire" style="color:var(--text);display:flex">'
      + svg("incognito", { size: 17 }) + "</span>" : "");

  // Le nombre de fichiers rangés, sur la languette de l'Établi. Un volet
  // fermé qui ne laisse rien derrière lui ne se rouvre pas.
  const lg = $("languette");
  if (lg){
    const k = $("files") ? $("files").querySelectorAll(".row").length : 0;
    lg.innerHTML = svg("atelier", { size: 16 })
      + "<span>Établi" + (k ? " · " + k : "") + "</span>";
    lg.title = "Rouvrir l'Établi";
  }
}

function paintBand(){
  const chip = (k, l, v) => '<span class="u-chip' + (k ? " " + k : "") + '"><i></i><b>'
    + esc(l) + "</b>" + (v ? "<span>" + esc(v) + "</span>" : "") + "</span>";

  const wsKind = link.state === "open" ? "ok"
    : link.state === "denied" ? "err" : link.state === "connecting" ? "warn" : "";
  const wsTxt = { open: "connecté", connecting: "connexion…", denied: link.reason,
                  closed: "déconnecté", idle: "au repos" }[link.state] || link.state;

  let h = chip(wsKind, "Agent", wsTxt);
  if (!lastStatus){
    h += chip("err", "Hermès", "injoignable");
  } else {
    h += chip("ok", "Hermès", "v" + (lastStatus.version || "?"));
    h += chip(lastStatus.gateway_running ? "ok" : "warn", "Gateway",
      lastStatus.gateway_running ? (lastStatus.gateway_state || "en marche") : "arrêté");
  }
  H("band", h);
}

/* ═══ L'accueil → la conversation ════════════════════════════════════════
   Il n'y a plus deux écrans. `#pDiscuter` porte `accueil` tant qu'aucun
   message n'a été envoyé : le mot-marque est là, le composeur au centre, le
   fil à zéro. Au premier message le mot se fond et le composeur descend à sa
   place définitive — c'est du CSS, il n'y a aucune scène à basculer.

   L'attente reste VRAIE : elle dure ce que dure l'ouverture de la session, et
   elle s'arrête quand l'agent se manifeste. Un compteur qui ment sur ce qu'on
   attend est pire qu'une absence de compteur — il apprend à ne pas le croire.
   ─────────────────────────────────────────────────────────────────────── */

let accueil = true;          // aucun message n'a encore été envoyé
let waitT = null, filetEntree = null, attenteEntree = false;

function compteur(on){
  const w = $("wait0");
  if (!w) return;
  clearInterval(waitT);
  if (!on){ w.classList.remove("on"); return; }
  w.classList.add("on");
  const sec = w.querySelector(".sec"), fill = w.querySelector(".wait-fill");
  let s = 0;
  sec.textContent = "0";
  fill.style.width = "0%";
  waitT = setInterval(() => {
    s++;
    sec.textContent = s;
    // La barre ne prétend pas connaître la fin : elle progresse en
    // ralentissant, et n'atteint jamais le bout tant que rien n'est arrivé.
    fill.style.width = Math.min(92, 100 * (1 - Math.exp(-s / 9))) + "%";
  }, 1000);
}

function quitterAccueil(){
  if (!accueil) return;
  accueil = false;
  attenteEntree = false;
  clearInterval(waitT);
  clearTimeout(filetEntree);
  const w = $("wait0");
  if (w){
    w.querySelector(".wait-fill").style.width = "100%";
    setTimeout(() => w.classList.remove("on"), 260);
  }
  majEtats();
  majInvite();
  setTimeout(() => $("reply").focus(), 320);
}

/* Le premier message ouvre la session. On quitte l'accueil dès que quelque
   chose de RÉEL arrive : la session ouverte, ou le premier mot de l'agent.
   C'est le core qui prévient (coreHooks.onChange), pas un sondage — un
   sondage ajouterait au hasard un demi-battement à une attente qu'on cherche
   justement à raccourcir. */
function attendreOuverture(){
  attenteEntree = true;
  $("wait0txt").textContent = "Ouverture de la session";
  compteur(true);
  // Le filet ne sert qu'au cas où rien n'arrive jamais : personne ne doit
  // rester bloqué devant un compteur qui n'aboutit pas.
  filetEntree = setTimeout(() => {
    $("wait0txt").textContent = "L'agent ne répond pas — on entre quand même";
    quitterAccueil();
  }, 25000);
}

/* Les classes d'état de Discuter, posées d'un seul endroit — sinon elles se
   posent chacune de leur côté et finissent par se contredire.
     accueil — aucun message envoyé
     cowork  — l'agent complet (le mode Chat n'en porte pas)
     incog   — le fil sans mémoire
     hs      — une brique ne répond plus ; c'est elle qui marque le kebab */
function majEtats(){
  const p = $("pDiscuter");
  if (!p) return;
  p.classList.toggle("accueil", accueil);
  p.classList.toggle("cowork", mode === "cowork");
  p.classList.toggle("incog", incognito);
  p.classList.toggle("hs", reseauHS());
}

/* Une brique ne répond plus. Le lien WebSocket est le seul signal qui compte
   en Cowork : sans lui, l'agent ne peut rien recevoir. En Chat, il ne sert à
   rien — le proxy suffit — donc son absence n'est pas une panne. */
function reseauHS(){
  if (mode !== "cowork") return false;
  if (link.state === "denied" || link.state === "closed") return true;
  return !!(lastStatus && lastStatus.gateway_running === false);
}

/* ═══ Les pièces jointes ═════════════════════════════════════════════════
   Le « + » ouvre le sélecteur du système. Le navigateur n'a pas de chemin
   serveur à donner : il envoie les octets, et le gateway matérialise le
   fichier dans l'espace de la session (file.attach / image.attach). Ce qu'on
   récupère est une référence « @file:… » que les outils de l'agent savent
   lire — c'est elle qu'on ajoute au message.
   ─────────────────────────────────────────────────────────────────────── */

const jointes = [];    // {name, ref, image, size, etat:"envoi"|"prete"|"echec"}

function dessineJointes(){
  const html = jointes.map((j, i) =>
    '<span class="u-jointe' + (j.etat === "envoi" ? " att" : "") + '">'
    + svg(j.image ? "fichier" : "fichier", { size: 15 })
    + esc(j.name)
    + '<span class="o">' + (j.etat === "envoi" ? "envoi…"
        : j.etat === "echec" ? "échec" : esc(fmtBytes(j.size))) + "</span>"
    + '<button class="x" data-jx="' + i + '" aria-label="Retirer">'
    + svg("fermer", { size: 13 }) + "</button></span>").join("");
  ["jointes1"].forEach((id) => {
    const h = $(id);
    if (!h) return;
    h.innerHTML = html;
    h.querySelectorAll("[data-jx]").forEach((b) => {
      b.onclick = () => { jointes.splice(+b.dataset.jx, 1); dessineJointes(); };
    });
  });
}

async function choisirFichiers(){
  const inp = $("fileInput");
  inp.value = "";
  inp.click();
}

async function surFichiers(files){
  for (const f of Array.from(files || [])){
    // Le corps part en base64 dans une trame WebSocket : au-delà de quelques
    // dizaines de Mo, on refuse plutôt que de faire attendre sans rien dire.
    if (f.size > 32 * 1024 * 1024){
      snack("« " + f.name + " » fait " + fmtBytes(f.size)
        + " — trop lourd pour une pièce jointe. Passez par les Livrables.");
      continue;
    }
    const j = { name: f.name, ref: "", image: (f.type || "").indexOf("image/") === 0,
                size: f.size, etat: "envoi" };
    jointes.push(j);
    dessineJointes();
    try {
      const res = await attacherFichier(f);
      j.ref = res.ref;
      j.name = res.name || j.name;
      j.etat = "prete";
    } catch (e){
      j.etat = "echec";
      snack("« " + f.name + " » n'a pas pu être joint : " + e.message);
    }
    dessineJointes();
  }
}

/* ═══ La dictée ══════════════════════════════════════════════════════════
   Le micro annonçait « pas encore branché » depuis le début. Hermès expose
   `POST /api/audio/transcribe` (web_server.py:4308) : on lui envoie une
   data-URL audio, il rend un texte.

   Trois décisions de tenue :

   · **Le texte va DANS LE CHAMP, il ne part pas.** Une dictée qui envoie
     toute seule est une dictée qu'on ne peut pas corriger — et la
     reconnaissance se trompe. On relit, puis on envoie.
   · **Un transcript vide n'est pas une panne.** Le backend renvoie ok:true
     avec une chaîne vide quand il n'a entendu que du silence. L'annoncer
     comme un échec apprendrait à se méfier d'un outil qui a bien travaillé.
   · **On s'arrête tout seul à deux minutes.** La limite du backend est de
     25 Mo, soit des heures : personne ne doit découvrir un 413 après avoir
     parlé longtemps. On coupe avant, et on le dit.
   ─────────────────────────────────────────────────────────────────────── */

const DICTEE_MAX_MS = 120000;
let dictee = null;        // {rec, chunks, stream, t0, minuteur, filet}

function micEtat(quoi, sec){
  const b = $("mic1");
  if (!b) return;
  b.classList.toggle("u-ecoute", quoi === "ecoute");
  b.classList.toggle("u-attente", quoi === "transcrit");
  b.title = quoi === "ecoute" ? "Parlez — cliquez pour arrêter (" + sec + " s)"
    : quoi === "transcrit" ? "On écrit ce que vous avez dit…"
    : "Dicter à la place d'écrire";
  H("mic1", quoi === "ecoute" ? svg("point", { size: 22 })
    : quoi === "transcrit" ? svg("boucle", { size: 20 })
    : svg("micro", { size: 22 }));
}

async function basculerDictee(){
  if (dictee){ arreterDictee(); return; }

  if (!navigator.mediaDevices || !window.MediaRecorder){
    snack("Ce navigateur ne sait pas enregistrer le son.");
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e){
    // Un refus n'est pas une panne : on dit quoi faire, pas « erreur ».
    snack(e && e.name === "NotAllowedError"
      ? "Le micro est refusé pour cette page. Autorisez-le dans la barre d'adresse."
      : "Aucun micro disponible : " + (e && e.message ? e.message : "inconnu"));
    return;
  }

  // On laisse le navigateur choisir son conteneur, mais on refuse ce que le
  // backend n'accepte pas : il exige `audio/…` ou `video/webm`.
  const type = ["audio/webm", "audio/ogg", "audio/mp4"]
    .find((t) => window.MediaRecorder.isTypeSupported
      && window.MediaRecorder.isTypeSupported(t)) || "";
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => transcrire(chunks, rec.mimeType || type || "audio/webm");

  dictee = { rec: rec, chunks: chunks, stream: stream, t0: Date.now() };
  rec.start();
  micEtat("ecoute", 0);
  dictee.minuteur = setInterval(() => {
    micEtat("ecoute", Math.round((Date.now() - dictee.t0) / 1000));
  }, 1000);
  dictee.filet = setTimeout(() => {
    snack("Deux minutes : on s'arrête là et on transcrit.");
    arreterDictee();
  }, DICTEE_MAX_MS);
}

function arreterDictee(){
  if (!dictee) return;
  clearInterval(dictee.minuteur);
  clearTimeout(dictee.filet);
  const d = dictee;
  dictee = null;
  micEtat("transcrit");
  try { d.rec.stop(); } catch (e){ micEtat("repos"); }
  // Le flux reste ouvert tant qu'on ne le coupe pas : la pastille
  // d'enregistrement du navigateur resterait allumée après coup.
  d.stream.getTracks().forEach((t) => t.stop());
}

async function transcrire(chunks, mime){
  if (!chunks.length){ micEtat("repos"); return; }
  const blob = new Blob(chunks, { type: mime });
  try {
    const dataUrl = await new Promise((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = () => ko(new Error("lecture de l'enregistrement impossible"));
      r.readAsDataURL(blob);
    });
    const res = await REST.transcribe(dataUrl, mime);
    const texte = (res && res.transcript) || "";
    if (!texte){
      // ok:true et rien à écrire — c'est du silence, pas un échec.
      snack("Rien n'a été entendu. Le champ n'a pas bougé.");
      return;
    }
    const champ = $("reply");
    champ.value = champ.value ? champ.value.replace(/\s*$/, " ") + texte : texte;
    champ.focus();
    // On relit avant d'envoyer : la reconnaissance se trompe, et un message
    // parti tout seul ne se rattrape pas.
    snack("Écrit dans le champ" + (res.provider ? " (" + res.provider + ")" : "")
      + " — relisez avant d'envoyer.");
  } catch (e){
    snack(e.status === 413 ? "L'enregistrement est trop long pour être transcrit."
      : "Transcription impossible : " + e.message);
  } finally {
    micEtat("repos");
  }
}

/* Les références des pièces prêtes, ajoutées au message. */
function refsJointes(){
  const refs = jointes.filter((j) => j.etat === "prete" && j.ref).map((j) => j.ref);
  return refs.length ? "\n\n" + refs.join("\n") : "";
}

function viderJointes(){
  jointes.length = 0;
  dessineJointes();
}

/* ═══ La bascule Cowork / Discussion, sous le composeur ══════════════════
   Les deux écrans portent la même, et elles disent la même chose : c'est un
   seul réglage, montré à deux endroits, pas deux réglages à accorder. */

function setMode2(m){
  mode = m;
  document.querySelectorAll(".u-modeseg button").forEach((b) => {
    b.classList.toggle("on", b.dataset.mode === m);
  });
  const note = mode === "cowork"
    ? "l'agent complet — il peut lire, écrire et exécuter, en vous demandant votre accord"
    : "le modèle seul — il répond, il n'agit pas et ne touche à rien";
  if ($("modenote1")) $("modenote1").textContent = note;
  majInvite();
  majEtats();
  paintThread();
}

/* À l'accueil on demande, ensuite on répond : ce n'est pas la même invite, et
   elle change aux deux moments — au changement de mode ET à la sortie de
   l'accueil. D'où un seul endroit qui l'écrit. */
function majInvite(){
  if (!$("reply")) return;
  $("reply").placeholder = accueil ? "Dites ce que vous aimeriez faire."
    : mode === "cowork" ? "Répondre…" : "Écrivez votre message… (sans outils)";
}

/* Le cadre de rôle, commun aux deux composeurs. */
function roleOpts(){
  const opts = { session: {} };
  if (activeRole && !conv.sessionId){
    opts.preamble = "[Rôle : " + activeRole.name + "]\n" + activeRole.prompt;
    opts.preambleLabel = activeRole.name;
  }
  if (incognito) opts.session.close_on_disconnect = true;
  return opts;
}

async function onSend(ev){
  if (ev) ev.preventDefault();
  const input = $("reply");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  if (mode === "pur"){
    // En Chat il n'y a pas de session à ouvrir : le tour part et s'affiche.
    // Attendre quoi que ce soit serait une attente inventée.
    quitterAccueil();
    // Le mode Discussion n'a pas d'outils : une pièce jointe n'y servirait à
    // rien, et le laisser croire serait pire que le dire.
    if (jointes.length) snack("Les pièces jointes ne servent qu'en Cowork — "
      + "en Discussion, le modèle ne peut rien ouvrir.");
    await sendPure(text);
    return;
  }
  // Le premier message de Cowork ouvre la session : c'est la seule attente
  // qui soit vraie, et elle a son compteur.
  if (accueil) attendreOuverture();
  // Le cadre de rôle part vers le moteur, mais le fil affiche ce que la
  // personne a RÉELLEMENT écrit : lui relire une consigne qu'elle n'a pas
  // rédigée brouille la lecture de son propre fil.
  await submitPrompt(text + refsJointes(), roleOpts());
  viderJointes();
}

/* Le chat pur passe par /proxy/chat sur NOTRE origine : serve.py relaie vers
   le proxy Hermès et y pose la clé. La page n'en détient aucune. */
async function sendPure(text){
  const push = (role, txt, state) => {
    const t = { key: Date.now() + Math.random(), role: role, text: txt, tools: [],
                reasoning: "", state: state || "done" };
    pureTurns.push(t);
    return t;
  };
  push("user", text);
  pureHistory.push({ role: "user", content: text });
  const pending = push("assistant", "", "streaming");
  pureBusy = true;
  paintThread();

  const drop = () => { const i = pureTurns.indexOf(pending); if (i >= 0) pureTurns.splice(i, 1); };

  try {
    const data = await REST.pureChat(pureHistory);
    drop();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? contentToText(data.choices[0].message.content) : "";
    if (content && content.trim()){
      push("assistant", content.trim());
      pureHistory.push({ role: "assistant", content: content.trim() });
    } else {
      push("system", "(réponse reçue sans texte — réessayez.)");
      pureHistory.pop();
    }
  } catch (e){
    drop();
    pureHistory.pop();
    if (e.status === 403){
      push("system", "Le modèle gratuit est saturé. Réessayez dans quelques secondes, "
        + "ou changez PROXY_MODEL dans ulysse-config.js.");
    } else if (e.status === 502){
      push("error", "Le proxy Hermès ne répond pas. Lancez-le : "
        + "hermes proxy start --provider nous --port 8645");
    } else {
      push("error", "Discussion : " + e.message);
    }
  } finally {
    pureBusy = false;
    paintThread();
    $("reply").focus();
  }
}

/* --- L'Établi : les fichiers, à côté du fil ------------------------------ */

let etabliPath = null;

function setMode(m){
  $("work").classList.toggle("atelier", m === "atelier");
  if (m === "atelier") drawEtabli();
}

/* L'en-tête de l'Établi porte un `.ctl` — le bloc de contrôles de volet de la
   maquette, qui apparaît au survol. Il était dans le HTML et VIDE : l'Établi
   ne pouvait se refermer que depuis le kebab, c'est-à-dire ailleurs que là où
   on le regarde. On le remplit de sa croix. */
function wireCtlEtabli(){
  const host = $("ctlEtabli");
  if (!host) return;
  host.innerHTML = '<button id="etabliClose" aria-label="Fermer l\'Établi" '
    + 'title="Fermer l\'Établi">' + svg("fermer", { size: 18 }) + "</button>";
  $("etabliClose").onclick = () => setMode("chat");
}

async function drawEtabli(){
  H("files", '<div class="u-load">Lecture…</div>');
  try {
    const d = await REST.files(etabliPath || CFG.START_PATH || "");
    const up = (d.parent !== null && d.parent !== undefined && d.path)
      ? '<div class="row" data-dir="' + esc(d.parent) + '"><span class="ic">'
        + svg("dossier", { size: 18 }) + '</span><span class="nm">.. dossier parent</span></div>'
      : "";
    H("files", up + (d.entries || []).map((f) => {
      // La vraie cle du dashboard est `is_directory` (verifie en direct sur
      // /api/files). Avec `is_dir` seul, TOUS les dossiers passaient pour des
      // fichiers, et les ouvrir renvoyait 400 « Path is not a file ».
      const dir = f.is_directory || f.is_dir || f.type === "dir";
      return '<div class="row" ' + (dir ? 'data-dir="' + esc(f.path) + '"'
                                        : 'data-file="' + esc(f.path) + '"') + ">"
        + '<span class="ic">' + svg(dir ? "dossier" : "fichier", { size: 18 }) + "</span>"
        + '<span class="nm">' + esc(f.name) + '</span><span class="sp"></span>'
        + '<span class="meta">' + (dir ? "" : esc(fmtBytes(f.size))) + "</span></div>";
    }).join("") || '<div class="u-load">Dossier vide.</div>');
    wireFileRows("files", (p) => { etabliPath = p; drawEtabli(); });
  } catch (e){
    H("files", '<div class="u-todo">Lecture impossible : ' + esc(e.message) + "</div>");
  }
}

function wireFileRows(hostId, onDir){
  const host = $(hostId);
  host.querySelectorAll("[data-dir]").forEach((r) => { r.onclick = () => onDir(r.dataset.dir); });
  host.querySelectorAll("[data-file]").forEach((r) => {
    r.onclick = () => showFile(r.dataset.file, r.querySelector(".nm").textContent);
  });
}

/* La fiche d'un fichier. Le backend renvoie le fichier ENTIER en base64
   (+33 %) : au-delà de la limite, l'onglet se fige. On refuse plutôt que de
   le tenter — cliquer sur un fichier de 200 Mo ne doit pas coûter l'onglet. */
async function showFile(path, name){
  openS("sFile", "<h2>" + esc(name || path) + '</h2><div class="sub">' + esc(path)
    + '</div><div class="u-load">Lecture…</div>');
  const body = $("fileBody");
  try {
    const d = await REST.readFile(path);
    if (typeof d.size === "number" && d.size > PREVIEW_MAX_BYTES){
      body.innerHTML = "<h2>" + esc(name) + '</h2><div class="sub">' + esc(path) + "</div>"
        + '<div class="u-todo">Trop volumineux pour un aperçu (' + esc(fmtBytes(d.size))
        + ", limite " + esc(fmtBytes(PREVIEW_MAX_BYTES)) + "). Le chemin reste utilisable "
        + "dans un message à l'agent.</div>";
      return;
    }
    const mime = d.mime_type || "";
    let inner;
    if (mime.indexOf("image/") === 0 && d.data_url){
      inner = '<img src="' + esc(d.data_url) + '" style="max-width:100%;border-radius:12px">';
    } else {
      const text = decodeDataUrlText(d.data_url || "");
      inner = text === null
        ? '<div class="u-load">Fichier binaire — aperçu impossible.</div>'
        : '<pre class="u-raw">' + esc(shorten(text, 20000)) + "</pre>";
    }
    body.innerHTML = "<h2>" + esc(name) + '</h2><div class="sub">' + esc(path) + " · "
      + esc(fmtBytes(d.size)) + "</div>" + inner
      + '<div class="sheet-acts"><button class="txt-btn" id="fClose">Fermer</button></div>';
    $("fClose").onclick = () => closeS("sFile");
  } catch (e){
    body.innerHTML = "<h2>" + esc(name) + '</h2><div class="u-todo">Aperçu indisponible : '
      + esc(e.message) + "</div>";
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PLAN — le miroir vivant
   ---------------------------------------------------------------------------
   La maquette dessine un plan de six étapes connu d'avance. Hermès n'en
   produit pas : il n'annonce pas ce qu'il va faire, il le fait, et émet
   tool.start / tool.complete à mesure. Le schéma représente donc la SUITE
   RÉELLE des outils appelés — c'est le seul plan qui existe, et il est vrai.

   Les couleurs d'équipe deviennent des familles d'outils : lire, écrire,
   chercher, exécuter. La couleur garde son rôle — dire qui fait.
   ═══════════════════════════════════════════════════════════════════════════ */

const FAMILLES = {
  lire:     { n: "LECTURE",   c: "#1A73E8", re: /read|cat|get|list|ls|glob|grep|search|fetch/i },
  ecrire:   { n: "ÉCRITURE",  c: "#9334E6", re: /write|edit|create|patch|apply|save|append/i },
  executer: { n: "EXÉCUTION", c: "#E8710A", re: /bash|shell|exec|run|command|terminal|python|npm/i },
  reseau:   { n: "RÉSEAU",    c: "#00838F", re: /http|curl|web|browser|api|mcp/i }
};

function familleDe(nom){
  for (const k of Object.keys(FAMILLES)) if (FAMILLES[k].re.test(nom || "")) return k;
  return null;
}

const graph = Graph("svg");
let studioVue = "both", jrnOuvert = false;
const etapesOuvertes = new Set();

/* Les étapes = les outils appelés, dans l'ordre. */
function etapesReelles(){
  const out = [];
  conv.turns.forEach((t) => (t.tools || []).forEach((x) => {
    out.push({
      n: out.length + 1,
      t: x.name,
      d: x.context || x.args || "",
      result: x.result || "",
      ms: x.ms,
      pct: x.state === "done" ? 100 : 50,
      team: familleDe(x.name)
    });
  }));
  return out;
}

function drawPlan(){
  const steps = etapesReelles();
  const edges = steps.slice(1).map((s) => [s.n - 1, s.n]);   // une suite, donc une chaîne
  $("planMeta").textContent = conv.sessionId
    ? "session " + conv.sessionId + (conv.running ? " · en cours" : "")
    : "aucune session";
  $("planStop").style.display = conv.running ? "" : "none";
  majJrnBtn();

  graph.setData(steps, edges, FAMILLES);

  if (!steps.length){
    // L'état vide arrête de faire peur. La réserve technique est JUSTE — sans
    // ce réglage rien n'apparaîtra jamais, et il fallait le dire — mais elle
    // s'adresse à quelqu'un qui débogue, pas à quelqu'un qui attend. Ce qui
    // reste au premier plan, c'est ce qui va se passer.
    H("steps", '<div class="empty" style="padding:36px 20px">'
      + '<div class="big">Rien encore.</div>'
      + '<div class="u-vide-sub">Les étapes apparaîtront ici à mesure que l\'agent '
      + "utilise ses outils — une par outil appelé, dans l'ordre.</div></div>"
      + '<div class="u-todo">Si l\'agent travaille et que rien n\'apparaît, c\'est que '
      + "le réglage Hermès <code>display.tool_progress</code> est à off. Il se change "
      + "par le RPC <code>config.set</code>.</div>");
    return;
  }

  H("steps", steps.map((s) => {
    const fam = s.team ? FAMILLES[s.team] : null;
    const ouvert = etapesOuvertes.has(s.n);
    return '<div class="exp ' + (ouvert ? "open " : "")
      + (actEtape === s.n ? "exp-acts " : "") + '" data-n="' + s.n + '">'
      + '<div class="exp-h">'
      + '<button class="exp-t" data-t="' + s.n + '"><span class="n">' + s.n + "</span>"
      + '<span class="t">' + esc(s.t) + "</span>"
      + (fam ? '<span class="chip">' + esc(fam.n.toLowerCase()) + "</span>" : "")
      + "</button>"
      // Le kebab reste VISIBLE, en gris, pas au survol. C'est la règle que la
      // maquette a écrite au-dessus de `.dots` : « une commande qu'il faut
      // découvrir pour s'en servir n'est pas discrète, elle est cachée. »
      + '<button class="dots" data-act="' + s.n + '" title="Agir sur cette étape"'
      + ' aria-label="Agir sur cette étape">' + svg("points", { size: 18 }) + "</button>"
      + '<button class="chev" data-t="' + s.n + '" tabindex="-1" aria-hidden="true">'
      + svg("chevron", { size: 20 }) + "</button></div>"
      + '<div class="exp-b"><div class="in">'
      + (s.d ? "<p>" + esc(s.d) + "</p>" : "<p>Aucun détail transmis pour cette étape.</p>")
      + (s.result ? '<pre class="u-raw">' + esc(shorten(s.result, 3000)) + "</pre>" : "")
      + (s.pct === 100 ? '<span class="auto-note">Terminée en ' + esc(fmtDur(s.ms)) + ".</span>"
                       : '<span class="auto-note">En cours…</span>')
      // Les actions s'ouvrent SOUS l'étape plutôt que dans un menu flottant :
      // elles appartiennent à la ligne, elles ne survolent pas la liste.
      + '<div class="sactions">'
      + '<button data-a="fiche" data-n="' + s.n + '">Tout savoir</button>'
      + (s.d ? '<button data-a="fichier" data-n="' + s.n + '">Ouvrir le fichier</button>' : "")
      + '<button data-a="copier" data-n="' + s.n + '">Copier le détail</button>'
      + "</div>"
      + "</div></div></div>";
  }).join("")
  + (jrnOuvert ? '<div class="u-jrn">' + studioLog.slice().reverse().map((e) =>
      '<div><span class="h">' + esc(e.t.toLocaleTimeString("fr-FR", { hour12: false }))
      + '</span><span class="y">' + esc(e.type) + '</span><span class="b">'
      + esc(eventBrief(e.type, e.payload)) + "</span></div>").join("") + "</div>" : ""));

  $("steps").querySelectorAll("[data-t]").forEach((b) => {
    b.onclick = () => {
      const n = +b.dataset.t;
      if (etapesOuvertes.has(n)) etapesOuvertes.delete(n); else etapesOuvertes.add(n);
      const el = $("steps").querySelector('.exp[data-n="' + n + '"]');
      if (el) el.classList.toggle("open");
      majToutBtn();
    };
  });
  // Le double-clic ouvre la fiche — le même geste que le ⋯ du nœud dans le
  // schéma, pour que les deux volets se répondent.
  $("steps").querySelectorAll(".exp").forEach((el) => {
    el.ondblclick = (e) => {
      if (e.target.closest(".sactions")) return;
      ouvrirFiche(+el.dataset.n);
    };
  });
  $("steps").querySelectorAll("[data-act]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const n = +b.dataset.act;
      actEtape = actEtape === n ? null : n;
      if (actEtape !== null) etapesOuvertes.add(n);
      drawPlan();
    };
  });
  $("steps").querySelectorAll(".sactions [data-a]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      actionEtape(b.dataset.a, +b.dataset.n);
    };
  });
  majToutBtn();
}

/* Quelle étape a son pli d'actions ouvert. Une seule à la fois : deux
   rangées de boutons dans une liste qu'on parcourt, ce serait la liste qui
   disparaîtrait. */
let actEtape = null;

/* Cinq actions étaient proposées par la passe de design. Quatre sont ici.

   « Me demander avant X » N'EST PAS AFFICHÉE : elle supposait une liste
   d'outils sous accord côté Hermès. Vérifié dans le code source — il n'en a
   pas. Ce qui existe, c'est `approvals.deny` (des motifs qui BLOQUENT sans
   jamais demander, approval.py:542) et `approvals.mode`, global. Le pouvoir
   qu'elle visait existe ailleurs et se donne déjà : c'est « Autoriser
   toujours », dans la demande d'accord, au moment où la question se pose.

   « Rejouer cet outil » n'est pas là non plus : le protocole n'a pas de
   « relance cet appel avec les mêmes arguments ». Le refaire voudrait dire
   réécrire la demande à la main, ce qui n'est pas la même chose. */
function actionEtape(a, n){
  const s = etapesReelles().find((x) => x.n === n);
  if (!s) return;
  if (a === "fiche") return ouvrirFiche(n);
  if (a === "copier"){
    return copier(s.t + (s.d ? "\n" + s.d : "") + (s.result ? "\n\n" + s.result : ""),
      "Le détail de l'étape");
  }
  if (a === "fichier"){
    // Le « contexte » d'un outil est le plus souvent un chemin — c'est ce
    // qu'Hermès met dans `tool.start.context`. S'il n'en est pas un, la fiche
    // du fichier le dira, plutôt que d'échouer en silence.
    const p = String(s.d || "").trim().split(/\s+/)[0];
    if (!p) return snack("Cette étape ne désigne aucun fichier.");
    return showFile(p, p.split(/[\\/]/).pop());
  }
}

/* « Voir le flux brut » ouvrait un journal de 38 vh sans qu'on sache combien
   de lignes arrivaient. Son nombre est ce qui distingue un miroir d'un
   résumé — et ce qui dit s'il vaut la peine d'être ouvert. */
function majJrnBtn(){
  const b = $("voirJrn");
  if (!b) return;
  b.textContent = (jrnOuvert ? "Masquer" : "Voir") + " le flux brut"
    + (studioLog.length ? " · " + studioLog.length : "");
}

function majToutBtn(){
  const total = etapesReelles().length;
  const b = $("toutbtn");
  if (b) b.textContent = etapesOuvertes.size >= total && total ? "Tout replier" : "Tout déplier";
}

function eventBrief(type, pl){
  pl = pl || {};
  switch (type){
    case "message.delta":
    case "reasoning.delta":
    case "thinking.delta": return shorten(pl.text || "", 90);
    case "tool.start":     return (pl.name || "") + (pl.context ? " — " + shorten(pl.context, 70) : "");
    case "tool.complete":  return (pl.name || "") + " terminé";
    case "status.update":  return (pl.kind ? "[" + pl.kind + "] " : "") + shorten(pl.text || "", 80);
    case "message.complete": return "statut=" + (pl.status || "ok");
    case "error":          return shorten(pl.message || "", 90);
    case "session.info":   return (pl.model || "") + (pl.cwd ? " · " + shorten(pl.cwd, 50) : "");
    case "gateway.ready":  return "gateway prêt";
    default:               return shorten(JSON.stringify(pl), 90);
  }
}

/* La fiche d'une étape : tout ce qu'on peut vouloir savoir d'elle. */
function ouvrirFiche(n){
  const s = etapesReelles().find((x) => x.n === n);
  if (!s) return;
  const fam = s.team ? FAMILLES[s.team] : null;
  openS("sNode",
    '<div class="fhead"><h2>' + esc(s.t) + "</h2>"
    + '<div class="sub">' + (s.pct === 100 ? "Terminée en " + esc(fmtDur(s.ms)) : "En cours")
    + (fam ? " · " + esc(fam.n.toLowerCase()) : " · se fait toute seule") + "</div></div>"
    + (s.d ? "<p>" + esc(s.d) + "</p>" : "")
    + (s.result ? '<pre class="u-raw">' + esc(shorten(s.result, 6000)) + "</pre>" : "")
    + '<div class="sheet-acts"><button class="txt-btn" id="nClose">Fermer</button></div>');
  $("nClose").onclick = () => closeS("sNode");
}

function setStudio(v){
  studioVue = v;
  const s = $("studio");
  s.classList.toggle("max-canvas", v === "canvas");
  s.classList.toggle("max-reader", v === "reader");
  $("stseg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  if (v !== "reader") setTimeout(() => graph.draw(), 30);
}

/* ═══ Les actions de ligne ═══════════════════════════════════════════════
   `.acts` est dans ulysse.css depuis la maquette, avec sa règle d'apparition
   au survol — et les quatre listes ne s'en servaient nulle part. On voyait
   une session, un fichier, un projet, et on ne pouvait rien en faire sans
   sortir de l'écran.

   C'est le seul endroit du produit où la découverte au survol se défend : la
   ligne entière est déjà cliquable et fait l'action principale, les actions
   sont un supplément.

   Chacune a été confrontée à AUDIT-ENDPOINTS-REEL.md avant d'être affichée —
   une action visible qui échoue est pire que pas d'action.
   ─────────────────────────────────────────────────────────────────────── */

function acts(liste){
  return '<span class="acts">' + liste.map((a) =>
    '<button data-a="' + esc(a.a) + '"' + (a.danger ? ' class="danger"' : "")
    + ' title="' + esc(a.t) + '" aria-label="' + esc(a.t) + '">'
    + svg(a.ic, { size: 17 }) + "</button>").join("") + "</span>";
}

/* Un clic sur une action ne doit pas déclencher l'action principale de la
   ligne : sans ce stopPropagation, « Supprimer » reprendrait la conversation
   au passage. */
function wireActs(hostId, onAction){
  $(hostId).querySelectorAll(".acts [data-a]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      onAction(b.dataset.a, b.closest("[data-cle]"), b);
    };
  });
}

function copier(txt, quoi){
  const done = () => snack(quoi + " copié.");
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(done, () => snack("Copie refusée par le navigateur."));
  } else {
    snack("Le navigateur ne donne pas accès au presse-papier ici.");
  }
}

/* Les deux derniers segments d'un chemin. Le complet reste en `title` : un
   chemin de cent caractères écrase la ligne, mais on doit pouvoir le lire. */
function cheminCourt(p){
  const parts = String(p || "").split(/[\\/]/).filter(Boolean);
  return parts.length > 2 ? "…/" + parts.slice(-2).join("/") : parts.join("/");
}

/* ═══ Travaux — les sessions, réelles ════════════════════════════════════
   Trois rangs. Épingler et archiver ne sont pas des détails d'implémentation :
   c'est ce qui décide de la tenue de cette liste au bout de six mois. Sans
   eux, c'est un journal — on y retrouve ce qu'on vient de faire, jamais ce
   qu'on cherche. `PATCH /api/sessions/{id}` les tient (sessions.py:661).

   L'archivage n'est pas la suppression, et c'est tout l'intérêt : on range
   sans avoir à décider si on jette. Le seul geste rouge reste « Supprimer ». */

let travQ = "", travArchivees = false, travCache = [];

function drawWorksListe(){
  const q = travQ.toLowerCase().trim();
  const filtre = (s) => !q || (s.title || s.preview || s.id || "").toLowerCase().includes(q)
    || (s.cwd || "").toLowerCase().includes(q);
  const vus = travCache.filter(filtre);

  if (!travCache.length){
    H("works", '<div class="empty"><div class="big">Rien encore.</div>'
      + '<div class="u-vide-sub">Votre première conversation apparaîtra ici — '
      + "elle s'ouvre depuis Discuter.</div></div>");
    return;
  }
  if (!vus.length){
    H("works", '<div class="empty"><div class="big">Aucun résultat.</div>'
      + '<div class="u-vide-sub">' + travCache.length + " conversation"
      + (travCache.length > 1 ? "s" : "") + " ne correspond"
      + (travCache.length > 1 ? "ent" : "") + " pas à « " + esc(travQ)
      + " ». Videz le filtre pour tout revoir.</div></div>");
    return;
  }

  const rang = (s) => s.archived ? "arch" : (s.pinned ? "epi" : "rec");
  const groupes = { epi: [], rec: [], arch: [] };
  vus.forEach((s) => groupes[rang(s)].push(s));

  const ligneW = (s) => {
    const col = s.is_active ? "var(--amber)" : "var(--green)";
    const bits = [];
    if (s.message_count !== undefined) bits.push(s.message_count + " message"
      + (s.message_count > 1 ? "s" : ""));
    bits.push(s.is_active ? "en cours" : "terminée");
    if (s.cwd) bits.push(cheminCourt(s.cwd));
    return '<div class="row" data-cle="' + esc(s.id) + '" data-resume="' + esc(s.id) + '"'
      + (s.cwd ? ' title="' + esc(s.cwd) + '"' : "") + ">"
      + '<span class="dot" style="background:' + col + '"></span>'
      + '<span class="u-l2"><span class="t">' + esc(s.title || s.preview || s.id) + "</span>"
      + '<span class="s">' + esc(bits.join(" · ")) + "</span></span>"
      + '<span class="u-quand">' + esc(fmtWhen(s.last_active || s.started_at)) + "</span>"
      + acts([
          { a: "reprendre", ic: "relancer", t: "Reprendre cette conversation" },
          { a: s.pinned ? "desepingler" : "epingler", ic: "epingle",
            t: s.pinned ? "Ne plus épingler" : "Épingler en tête" },
          { a: s.archived ? "desarchiver" : "archiver", ic: "boite",
            t: s.archived ? "Sortir des archives" : "Archiver — ranger sans jeter" },
          { a: "lien", ic: "copier", t: "Copier le lien de cette conversation" },
          { a: "supprimer", ic: "corbeille", danger: true, t: "Supprimer définitivement" }
        ])
      + "</div>";
  };

  const bloc = (titre, arr, extra) => arr.length
    ? '<div class="u-rang">' + esc(titre) + " · " + arr.length
      + '<span class="l"></span>' + (extra || "") + "</div>"
      + arr.map(ligneW).join("")
    : "";

  H("works",
    bloc("Épinglées", groupes.epi)
    + bloc("Récentes", groupes.rec)
    + (groupes.arch.length
        ? '<div class="u-rang">Archivées · ' + groupes.arch.length + '<span class="l"></span>'
          + '<button id="travArch">' + (travArchivees ? "replier" : "voir") + "</button></div>"
          + (travArchivees ? groupes.arch.map(ligneW).join("") : "")
        : ""));

  const arch = $("travArch");
  if (arch) arch.onclick = () => { travArchivees = !travArchivees; drawWorksListe(); };

  $("works").querySelectorAll("[data-resume]").forEach((r) => {
    r.onclick = () => reprendre(r);
  });
  wireActs("works", async (a, ligne) => {
    const id = ligne.dataset.cle;
    const s = travCache.find((x) => x.id === id);
    if (a === "reprendre") return reprendre(ligne);
    if (a === "lien") return copier(location.origin + "/ulysse.html#Travaux", "Le lien");
    if (a === "supprimer") return supprimerSession(id, s);
    const champs = a === "epingler" ? { pinned: true }
      : a === "desepingler" ? { pinned: false }
      : a === "archiver" ? { archived: true } : { archived: false };
    try {
      await REST.patchSession(id, champs);
      Object.assign(s, champs);
      drawWorksListe();
      snack(a === "epingler" ? "Épinglée." : a === "desepingler" ? "Plus épinglée."
        : a === "archiver" ? "Archivée — elle n'est pas perdue." : "Sortie des archives.");
    } catch (e){ snack("Refusé : " + e.message); }
  });
}

function reprendre(ligne){
  ligne.style.opacity = ".5";
  return resumeSession(ligne.dataset.resume).then(() => {
    nav("Discuter");
    snack("Conversation reprise.");
  }).catch((e) => {
    ligne.style.opacity = "";
    snack("Reprise impossible : " + e.message);
  });
}

/* La seule action irréversible de l'écran. On l'annonce, on la fait, et on
   dit que le retour en arrière n'existe pas — plutôt qu'un « Annuler » de six
   secondes qu'aucun endpoint ne sait tenir. */
async function supprimerSession(id, s){
  const nom = (s && (s.title || s.preview)) || id;
  try {
    await REST.deleteSession(id);
    travCache = travCache.filter((x) => x.id !== id);
    drawWorksListe();
    snack("« " + nom + " » supprimée. Cette action ne se défait pas.");
  } catch (e){ snack("Suppression refusée : " + e.message); }
}

async function drawWorks(){
  H("works", '<div class="u-load">Chargement…</div>');
  try {
    const d = await REST.sessions(50, "recent");
    travCache = (d && d.sessions) || [];
    drawWorksListe();
  } catch (e){
    H("works", '<div class="u-todo">Lecture impossible : ' + esc(e.message) + "</div>");
  }
}

/* ═══ Livrables — les fichiers produits ══════════════════════════════════ */

let livPath = null, livQ = "", livCache = null;

/* Le fil d'Ariane devient cliquable. Il était un bouton « racine » suivi du
   chemin en TEXTE MORT : pour remonter d'un seul cran il fallait redescendre
   à la racine et tout refaire. Chaque segment est son propre bouton ; le
   dernier reste du texte, puisqu'on y est déjà. */
function livFil(chemin){
  const parts = String(chemin || "").split(/[\\/]/).filter(Boolean);
  let cumul = "";
  return '<button id="livHome" data-cr="">racine</button>'
    + parts.map((p, i) => {
        cumul = cumul ? cumul + "/" + p : p;
        return "<span>›</span>" + (i === parts.length - 1
          ? "<span>" + esc(p) + "</span>"
          : '<button data-cr="' + esc(cumul) + '">' + esc(p) + "</button>");
      }).join("");
}

function drawLivListe(){
  const d = livCache;
  if (!d) return;
  const q = livQ.toLowerCase().trim();
  const toutes = d.entries || [];
  const vues = toutes.filter((f) => !q || (f.name || "").toLowerCase().includes(q));

  const up = (d.parent !== null && d.parent !== undefined && d.path)
    ? '<div class="row" data-dir="' + esc(d.parent) + '"><span class="ic">'
      + svg("retour", { size: 18 }) + '</span><span class="nm">.. dossier parent</span>'
      + '<span class="sp"></span></div>'
    : "";

  const vide = !toutes.length
    ? '<div class="empty"><div class="big">Dossier vide.</div>'
      + '<div class="u-vide-sub">Rien n\'a encore été produit ici. '
      + "Les fichiers écrits par l'agent apparaîtront dans son dossier de travail.</div></div>"
    : (!vues.length
        ? '<div class="empty"><div class="big">Aucun résultat.</div>'
          + '<div class="u-vide-sub">' + toutes.length + " entrée"
          + (toutes.length > 1 ? "s" : "") + " ici, aucune ne contient « " + esc(livQ)
          + " ».</div></div>"
        : "");

  H("livList", up + (vide || vues.map((f) => {
    // La vraie cle du dashboard est `is_directory` (verifie en direct sur
    // /api/files). Avec `is_dir` seul, TOUS les dossiers passaient pour des
    // fichiers, et les ouvrir renvoyait 400 « Path is not a file ».
    const dir = f.is_directory || f.is_dir || f.type === "dir";
    return '<div class="row" data-cle="' + esc(f.path) + '" '
      + (dir ? 'data-dir="' + esc(f.path) + '"' : 'data-file="' + esc(f.path) + '"') + ">"
      + '<span class="ic">' + svg(dir ? "dossier" : "fichier", { size: 18 }) + "</span>"
      + '<span class="nm">' + esc(f.name) + "</span>"
      + '<span class="sp"></span>'
      + '<span class="meta">' + (dir ? "dossier" : esc(fmtBytes(f.size))) + "</span>"
      + acts(dir
          ? [{ a: "ouvrir", ic: "suivant", t: "Ouvrir ce dossier" },
             { a: "chemin", ic: "copier", t: "Copier le chemin" }]
          : [{ a: "etabli", ic: "atelier", t: "Poser sur l'Établi" },
             { a: "chemin", ic: "copier", t: "Copier le chemin" }])
      + "</div>";
  }).join("")));

  wireFileRows("livList", (p) => { livPath = p; drawLivrables(); });
  wireActs("livList", (a, ligne) => {
    const p = ligne.dataset.cle;
    if (a === "chemin") return copier(p, "Le chemin");
    if (a === "ouvrir"){ livPath = p; return drawLivrables(); }
    // « Poser sur l'Établi » n'est pas un appel réseau : l'Établi lit le
    // dossier, on l'ouvre donc sur le parent du fichier et on montre sa fiche.
    etabliPath = livCache.path || "";
    setMode2("cowork");
    setMode("atelier");
    nav("Discuter");
    showFile(p, p.split(/[\\/]/).pop());
  });
}

async function drawLivrables(){
  H("livrables", '<div class="u-crumbs" id="livCrumbs"></div>'
    + '<div id="livList"><div class="u-load">Chargement…</div></div>');
  try {
    livCache = await REST.files(livPath || CFG.START_PATH || "");
    H("livCrumbs", livFil(livCache.path));
    $("livCrumbs").querySelectorAll("[data-cr]").forEach((b) => {
      b.onclick = () => { livPath = b.dataset.cr || null; drawLivrables(); };
    });
    drawLivListe();
  } catch (e){
    H("livrables", '<div class="u-todo">Lecture impossible : ' + esc(e.message) + "</div>");
  }
}

/* ═══ Projets — chacun son bac à sable ═══════════════════════════════════
   Hermès n'a pas de notion « projet Ulysse ». Le regroupement RÉEL qu'il
   connaît est le dossier de travail des sessions : c'est donc lui qu'on
   montre, plutôt que d'inventer des projets qui n'en sont pas. */

async function drawProjets(){
  H("projets", '<div class="u-load">Chargement…</div>');
  try {
    const d = await REST.sessions(100, "recent");
    const par = new Map();
    ((d && d.sessions) || []).forEach((s) => {
      const k = s.cwd || "";
      if (!par.has(k)) par.set(k, []);
      par.get(k).push(s);
    });
    if (!par.size){
      H("projets", '<div class="empty"><div class="big">Aucun dossier de travail.</div>'
        + "<div>Il s'en créera un dès la première conversation dans un dossier.</div></div>");
      return;
    }
    // La couleur était tirée du RANG dans la liste (`COL[i % COL.length]`) :
    // elle changeait dès qu'un projet en dépassait un autre. Une couleur qui
    // bouge n'est pas un repère. Elle vient maintenant du CHEMIN, qui, lui,
    // ne bouge pas.
    const COL = ["#1A73E8", "#9334E6", "#E8710A", "#00838F", "#D96570", "#188038"];
    const teinte = (cle) => {
      let n = 0;
      for (let k = 0; k < cle.length; k++) n = (n * 31 + cle.charCodeAt(k)) >>> 0;
      return COL[n % COL.length];
    };

    let h = "";
    par.forEach((sessions, cwd) => {
      const nom = cwd ? (cwd.split(/[\\/]/).filter(Boolean).pop() || cwd) : "Sans dossier";
      const actif = sessions.some((s) => s.is_active);
      const dernier = Math.max(...sessions.map((s) => s.last_active || s.started_at || 0));
      const msgs = sessions.reduce((a, s) => a + (s.message_count || 0), 0);
      h += '<div class="pcard" data-cle="' + esc(cwd) + '"><div class="top">'
        + '<span class="dot" style="background:' + teinte(cwd || "sans") + '"></span>'
        + '<span class="nm">' + esc(nom) + "</span>"
        + '<span class="chip">' + sessions.length + " session"
        + (sessions.length > 1 ? "s" : "") + "</span>"
        + '<span class="sp"></span>'
        + '<span class="meta">' + esc(fmtWhen(dernier)) + "</span>"
        + '<span class="chip b">' + (actif ? "En cours" : "Au repos") + "</span>"
        + acts([{ a: "chemin", ic: "copier", t: "Copier le chemin du dossier" },
                { a: "regler", ic: "regler", t: "Régler la mémoire et les accords" }])
        + "</div>"
        + '<div class="iso">'
        + "<span>" + svg("bac", { size: 17 }) + " Bac à sable — "
        + esc(cwd || "dossier de lancement d'Hermès") + "</span>"
        // La MÉMOIRE, avec ce qu'Hermès donne réellement : des séances et une
        // date. Pas des journaux — il n'en expose pas.
        + "<span>" + svg("coffre", { size: 17 }) + " Mémoire — " + sessions.length
        + " séance" + (sessions.length > 1 ? "s" : "")
        + (msgs ? ", " + msgs + " message" + (msgs > 1 ? "s" : "") : "")
        + ", dernière " + esc(fmtWhen(dernier)) + "</span>"
        // La troisième tuile de la maquette — le COFFRE, sa taille et son
        // nombre de fichiers — n'est PAS affichée : `projects.tree` ne donne
        // ni l'une ni l'autre, et les calculer voudrait dire parcourir tout
        // l'arbre. Mieux vaut deux tuiles vraies que trois dont une ment
        // (règle STU-1).
        + '<span class="relaunch"><button class="rbtn" data-cwd="' + esc(cwd) + '">'
        + svg("relancer", { size: 18 }) + "Travailler ici</button></span>"
        + "</div></div>";
    });
    H("projets", h);
    $("projets").querySelectorAll("[data-cwd]").forEach((b) => {
      b.onclick = () => {
        resetSession(); accordRepondu = null;
        CFG.SESSION_CWD = b.dataset.cwd;
        nav("Discuter");
        snack("Dossier de travail : " + (b.dataset.cwd || "celui d'Hermès")
          + " — la prochaine session s'y ouvrira.");
      };
    });
    wireActs("projets", (a, carte) => {
      if (a === "chemin") return copier(carte.dataset.cle, "Le chemin");
      ouvrirReglages(1);             // « Ce qu'Ulysse sait » — la mémoire
    });
  } catch (e){
    H("projets", '<div class="u-todo">Lecture impossible : ' + esc(e.message) + "</div>");
  }
}

/* ═══ Automatisations — cron et webhooks réels ═══════════════════════════ */

async function drawAutos(){
  let h = '<div class="trashnote">' + svg("boucle", { size: 20 })
    + "<span>Une automatisation tourne <b>toute seule</b>. C'est ce qui la rend "
    + "rapide et prévisible — et c'est aussi pourquoi elle ne décide de rien.</span></div>";
  H("autos", h + '<div class="u-load">Chargement…</div>');

  let corps = h;

  // --- Tâches planifiées (AUTO-1, /api/cron/jobs) -----------------------
  try {
    const d = await REST.cronJobs();
    const jobs = Array.isArray(d) ? d : ((d && (d.jobs || d.items)) || []);
    corps += '<div class="seth">Tâches planifiées<span class="l"></span></div>';
    if (!jobs.length){
      corps += '<div class="u-load">Aucune tâche. Créez-en une : <code>hermes cron add</code></div>';
    } else {
      corps += jobs.map((j, i) => {
        const id = j.id || j.job_id || j.name;
        const off = j.paused === true || j.enabled === false;
        return '<div class="acard" id="ac' + i + '"><div class="ahead" data-open="' + i + '">'
          + '<span class="dot" style="margin-top:8px;background:'
          + (off ? "var(--grey)" : "var(--green)") + '"></span>'
          + '<div class="amain"><div class="an">' + esc(j.name || id) + "</div>"
          + '<div class="aq">' + esc(shorten(j.prompt || j.command || "", 140)) + "</div>"
          + '<div class="ameta"><span class="chip b">' + esc(j.schedule || j.cron || "—")
          + "</span>"
          + '<span class="nomind">' + svg("equipe", { size: 15 }) + " aucun agent</span></div>"
          + "</div>"
          + '<div class="sw ' + (off ? "" : "on") + '" data-tog="' + esc(id) + '"'
          + ' data-off="' + (off ? "1" : "0") + '"><i></i></div>'
          + '<span class="chev">' + svg("chevron", { size: 20 }) + "</span></div>"
          + '<div class="abody"><div class="in">'
          + '<div class="srow"><span class="sk">Déclencher maintenant'
          + '<span class="sub">Sans attendre la prochaine échéance</span></span>'
          + '<span class="sv"><button class="btn-pick" data-fire="' + esc(id) + '">'
          + "Déclencher</button></span></div>"
          + "</div></div></div>";
      }).join("");
    }
  } catch (e){
    corps += '<div class="u-todo">Tâches planifiées illisibles : ' + esc(e.message) + "</div>";
  }

  // --- Webhooks ---------------------------------------------------------
  // La LISTE vient du DASHBOARD (/api/webhooks). Le gateway :8644 n'expose
  // pas de GET /webhooks : il n'y route que POST /webhooks/{nom}.
  try {
    const d = await REST.webhooks();
    corps += '<div class="seth">Webhooks<span class="l"></span></div>';
    if (d && d.enabled === false){
      corps += '<div class="u-todo"><b>Plateforme webhook désactivée.</b> Activez-la puis '
        + "relancez le gateway : <code>hermes gateway setup</code>.</div>";
    } else {
      const subs = (d && d.subscriptions) || [];
      if (!subs.length){
        corps += '<div class="u-load">Aucune route. Créez-en une : '
          + "<code>hermes webhook subscribe &lt;nom&gt; --prompt \"…\"</code></div>";
      } else {
        // Les cartes de webhook avaient l'air de se déplier — même `.acard`
        // que les tâches — et n'avaient ni `data-open` ni corps. On leur en
        // donne un : une route a de quoi le remplir (son URL, ses événements,
        // l'état de son secret), et c'est ce qu'on cherche quand on vient ici.
        corps += subs.map((w, i) => {
          const off = w.enabled === false;
          const url = (d.base_url || "") + "/webhooks/" + w.name;
          return '<div class="acard" id="wh' + i + '"><div class="ahead" data-open="wh' + i + '">'
            + '<span class="dot" style="margin-top:8px;background:'
            + (off ? "var(--grey)" : "var(--green)") + '"></span>'
            + '<div class="amain"><div class="an">' + esc(w.name) + "</div>"
            + '<div class="aq">' + esc(shorten(w.prompt || w.description || "", 140)) + "</div>"
            + '<div class="ameta"><span class="chip">' + esc(w.deliver || "log") + "</span>"
            + '<span class="nomind">' + svg("prise", { size: 15 })
            + (w.secret_set ? " signature requise" : " sans secret") + "</span></div></div>"
            + '<span class="chev">' + svg("chevron", { size: 20 }) + "</span></div>"
            + '<div class="abody"><div class="in">'
            + '<div class="srow"><span class="sk">Adresse à appeler'
            + '<span class="sub">Une requête POST signée sur cette route lance le travail.'
            + "</span></span>"
            + '<span class="sv"><button class="btn-pick" data-cmd="' + esc(url) + '">'
            + "Copier</button></span></div>"
            + '<pre class="u-raw">' + esc(url) + "</pre>"
            + ((w.events && w.events.length)
                ? '<div class="srow"><span class="sk">Événements écoutés</span>'
                  + '<span class="sv">' + w.events.map((e) => '<span class="chip">'
                  + esc(e) + "</span>").join(" ") + "</span></div>"
                : "")
            + '<div class="srow"><span class="sk">Déclencher maintenant'
            + '<span class="sub">'
            + (w.secret_set
                ? "serve.py signe la requête ; le secret ne descend jamais dans la page."
                : "Cette route n'a pas de secret — le gateway la refusera (webhook.py:653).")
            + "</span></span>"
            + '<span class="sv"><button class="btn-pick" data-wh="' + esc(w.name) + '"'
            + (off ? " disabled" : "") + ">Déclencher</button></span></div>"
            + "</div></div></div>";
        }).join("");
        if (d.base_url){
          corps += '<div class="u-note"><i></i>Gateway : ' + esc(d.base_url)
            + " — la signature HMAC est posée par serve.py, le secret ne descend jamais "
            + "dans le navigateur.</div>";
        }
      }
    }
  } catch (e){
    corps += '<div class="u-todo">Webhooks illisibles : ' + esc(e.message) + "</div>";
  }

  H("autos", corps);
  wireAutos();
}

function wireAutos(){
  const host = $("autos");
  host.querySelectorAll("[data-open]").forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest("[data-tog]") || e.target.closest("[data-fire]")
          || e.target.closest("[data-wh]") || e.target.closest("[data-cmd]")) return;
      // Les tâches portent un index nu (« 0 »), les webhooks un id complet
      // (« wh0 ») : deux listes dans le même panneau ne peuvent pas se
      // partager une numérotation.
      const cle = el.dataset.open;
      const cible = $(/^\d+$/.test(cle) ? "ac" + cle : cle);
      if (cible) cible.classList.toggle("open");
    };
  });
  // Une ligne d'aide-mémoire ou une adresse : elles sont là pour être
  // reprises, les faire recopier à la main est le seul usage qu'on
  // n'attendait pas d'elles.
  host.querySelectorAll("[data-cmd]").forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); copier(b.dataset.cmd, "L'adresse"); };
  });
  host.querySelectorAll("[data-tog]").forEach((el) => {
    el.onclick = async (e) => {
      e.stopPropagation();
      const off = el.dataset.off === "1";
      try {
        await (off ? REST.resumeCron(el.dataset.tog) : REST.pauseCron(el.dataset.tog));
        drawAutos();
        snack(off ? "Tâche relancée." : "Tâche mise en pause.");
      } catch (err){ snack("Non modifiée : " + err.message); }
    };
  });
  host.querySelectorAll("[data-fire]").forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      b.disabled = true;
      try { await REST.triggerCron(b.dataset.fire); snack("Tâche déclenchée."); }
      catch (err){ snack("Échec : " + err.message); }
      finally { b.disabled = false; }
    };
  });
  host.querySelectorAll("[data-wh]").forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      const nom = b.dataset.wh;
      try {
        // serve.py signe en HMAC-SHA256 V2 : le gateway refuse toute requête
        // non signée, et le secret ne descend jamais ici.
        await REST.fireWebhook(nom);
        snack("« " + nom + " » déclenché.");
      } catch (err){
        snack("« " + nom + " » : " + err.message);
      } finally { b.disabled = false; }
    };
  });
}

/* ═══ Vestiaire — les rôles et les compétences ═══════════════════════════ */

let vMode = "roles", vSelId = null, vFiltre = "", skillsCache = null;
const vReplies = new Set();   // les provenances repliées

/* La sélection se garde par IDENTITÉ, pas par rang. `vSel` était un index dans
   la liste FILTRÉE : sélectionner la 40ᵉ compétence puis taper un filtre qui
   n'en retient que deux laissait vSel à 39, et `L[39]` valait `undefined`. Le
   remettre à zéro à chaque frappe aurait évité le vide, mais aurait déplacé la
   sélection à chaque lettre tapée. Par identité, elle survit au filtre tant
   que le filtre ne l'exclut pas. */
function vKey(x){
  if (!x) return null;
  return vMode === "roles" ? "r:" + x.id : "s:" + (x.name || x.path || "");
}

function vListe(){
  const q = vFiltre.toLowerCase().trim();
  if (vMode === "roles"){
    return ROLES.filter((r) => !q || r.name.toLowerCase().includes(q)
      || r.role.toLowerCase().includes(q));
  }
  return (skillsCache || []).filter((s) => !q || (s.name || "").toLowerCase().includes(q)
    || (s.description || "").toLowerCase().includes(q));
}

async function drawVestiaire(){
  if (vMode === "skills" && skillsCache === null){
    H("vgrid", '<div class="u-load" style="grid-column:1/-1">Chargement…</div>');
    try {
      const d = await REST.skills();
      // /api/skills renvoie une LISTE (web_routers/skills.py:395).
      skillsCache = Array.isArray(d) ? d : ((d && d.skills) || []);
    } catch (e){
      skillsCache = [];
      H("vgrid", '<div class="u-todo" style="grid-column:1/-1">Lecture impossible : '
        + esc(e.message) + "</div>");
      return;
    }
  }

  const L = vListe();
  let vSel = L.findIndex((x) => vKey(x) === vSelId);
  if (vSel < 0) vSel = 0;
  vSelId = vKey(L[vSel]);

  $("vmeta").textContent = vMode === "roles"
    ? ROLES.length + " rôles · " + (activeRole ? "« " + activeRole.name + " » actif" : "aucun actif")
    : (skillsCache || []).length + " compétences · "
      + (skillsCache || []).filter((s) => s.enabled !== false).length + " actives";

  H("vgrid", grilleV(L, vSel));

  $("vgrid").querySelectorAll("[data-g]").forEach((b) => {
    b.onclick = () => {
      const g = b.dataset.g;
      if (vReplies.has(g)) vReplies.delete(g); else vReplies.add(g);
      drawVestiaire();
    };
  });
  $("vgrid").querySelectorAll("[data-i]").forEach((t) => {
    t.onclick = () => { vSelId = vKey(L[+t.dataset.i]); drawVestiaire(); };
  });
  drawVDetail(L[vSel]);
}

/* Une tuile. Même dessin dans les deux vues — c'est un rangement, pas un
   autre écran. */
function tuileV(x, i, sel){
  const S = i === sel ? " sel" : "";
  if (vMode === "roles"){
    const on = activeRole && activeRole.id === x.id;
    return '<div class="tile' + S + '" data-i="' + i + '">'
      + '<div class="hd"><span class="av" style="background:var(--accent-container);'
      + 'color:var(--on-accent-container)">' + esc(x.name[0]) + "</span>"
      + '<span class="tn">' + esc(x.name) + "</span>"
      + '<span class="dot" style="background:' + (on ? "var(--green)" : "var(--grey)")
      + '"></span></div>'
      + '<div class="rl">' + esc(x.role) + "</div>"
      + '<div class="ft"><span class="chip">' + (on ? "cadre actif" : "au repos")
      + "</span></div></div>";
  }
  const off = x.enabled === false;
  return '<div class="tile' + S + '" data-i="' + i + '">'
    + '<div class="hd"><span class="av" style="background:var(--surface-hi);color:var(--muted)">'
    + esc((x.name || "?")[0]) + "</span>"
    + '<span class="tn">' + esc(x.name || "(sans nom)") + "</span>"
    + '<span class="dot" style="background:' + (off ? "var(--grey)" : "var(--green)")
    + '"></span></div>'
    + '<div class="rl">' + esc(shorten(x.description || "", 90)) + "</div>"
    + '<div class="ft"><span class="chip">' + (off ? "désactivée" : "active")
    + "</span></div></div>";
}

/* La maquette montrait SIX agents : une grille suffisait. Hermès en déclare
   99. À plat, sans autre ordre que celui du serveur, on ne cherche plus — on
   fait défiler jusqu'à tomber dessus.

   Les compétences portent déjà leur `provenance` (le champ existe, le volet
   de détail l'affiche). Chaque origine devient une section repliable avec son
   compte, et le nombre de désactivées quand il y en a. Mêmes tuiles, mêmes
   `data-i`, même sélection.

   Les rôles restent à plat : ils sont six, et six choses ne se rangent pas. */
function grilleV(L, sel){
  if (!L.length){
    return '<div class="empty" style="grid-column:1/-1">'
      + '<div class="big">Rien ne correspond.</div>'
      + '<div class="u-vide-sub">Videz le filtre pour tout revoir.</div></div>';
  }
  if (vMode === "roles") return L.map((x, i) => tuileV(x, i, sel)).join("");

  const groupes = new Map();
  L.forEach((x, i) => {
    const g = x.provenance || "sans provenance";
    if (!groupes.has(g)) groupes.set(g, []);
    groupes.get(g).push(i);
  });
  // Une seule provenance : le regroupement n'apprendrait rien.
  if (groupes.size < 2) return L.map((x, i) => tuileV(x, i, sel)).join("");

  let h = "";
  groupes.forEach((idx, g) => {
    const off = idx.filter((i) => L[i].enabled === false).length;
    const replie = vReplies.has(g);
    h += '<div class="u-groupe" data-g="' + esc(g) + '">'
      + '<span class="c' + (replie ? "" : " o") + '">' + svg("chevron", { size: 18 }) + "</span>"
      + '<span class="n">' + esc(g) + "</span>"
      + '<span class="k">' + idx.length
      + (off ? " · " + off + " désactivée" + (off > 1 ? "s" : "") : "") + "</span>"
      + '<span class="l"></span></div>'
      + (replie ? "" : idx.map((i) => tuileV(L[i], i, sel)).join(""));
  });
  return h;
}

/* Le volet de détail a DEUX enfants dans ulysse.css — `.vdet-head` (46 px,
   figée) et `.vdet-body` (le reste, qui défile). Le produit écrivait dans
   `#vdet` lui-même, qui est en `overflow:hidden` : aucun padding, aucun
   défilement, et un `<h2>` que seule `.sheet h2` stylait — hors d'une feuille
   il retombait au défaut du navigateur, 2 em, dans un volet de 330 px. */
function vdetHTML(vt, corps){
  return '<div class="vdet-head"><span class="vt">' + esc(vt) + "</span></div>"
    + '<div class="vdet-body">' + corps + "</div>";
}

function drawVDetail(x){
  if (!x){
    H("vdet", vdetHTML("Détail",
      '<div class="empty"><div class="big">Rien de sélectionné.</div>'
      + "<div>Choisissez une tuile à gauche.</div></div>"));
    return;
  }
  if (vMode === "roles"){
    const on = activeRole && activeRole.id === x.id;
    H("vdet", vdetHTML("Le cadre",
      '<div class="vhero"><span class="av" style="background:var(--accent-container);'
      + 'color:var(--on-accent-container)">' + esc(x.name[0]) + "</span>"
      + '<span><span class="n">' + esc(x.name) + "</span>"
      + '<div class="sub">' + esc(x.role) + "</div></span></div>"
      + "<p>" + esc(x.prompt) + "</p>"
      + '<div class="u-todo">Un rôle <b>cadre</b> la session : il est envoyé en tête du '
      + "premier message. Il ne remplace pas l'agent, il lui dit comment travailler.</div>"
      + '<div class="sheet-acts"><button class="txt-btn" id="vAct">'
      + (on ? "Retirer ce cadre" : "Utiliser ce cadre") + "</button></div>"));
    $("vAct").onclick = () => {
      activeRole = on ? null : x;
      drawVestiaire(); drawRoles(); paintHint();
    };
    return;
  }
  H("vdet", vdetHTML("La compétence",
    '<div class="vhero"><span class="av" style="background:var(--surface-hi);'
    + 'color:var(--muted)">' + esc((x.name || "?")[0]) + "</span>"
    + '<span><span class="n">' + esc(x.name || "(sans nom)") + "</span>"
    + '<div class="sub">' + (x.enabled === false ? "désactivée" : "active")
    + (x.provenance ? " · " + esc(x.provenance) : "") + "</div></span></div>"
    + "<p>" + esc(x.description || "Aucune description.") + "</p>"
    + (x.path ? '<pre class="u-raw">' + esc(x.path) + "</pre>" : "")
    + '<div class="u-pied">Activer ou désactiver une compétence depuis Ulysse passera par '
    + "<code>POST /api/skills/toggle</code>, qui existe déjà. Non branché tant que "
    + "l'effet sur les sessions en cours n'est pas tranché.</div>"));
}

/* ═══ Réglages ═══════════════════════════════════════════════════════════ */

const SETS = ["Général", "Ce qu'Ulysse sait", "Le cerveau", "Sécurité et accords",
              "Connexions", "Dépenses", "Avancé"];
let setSel = 0, memCache = null;

/* Les renvois croisés passent par ici : le Terminal renvoie aux Dépenses,
   Projets à la mémoire. Un renvoi qui ouvre les Réglages sur la mauvaise
   section fait chercher — autant ne pas renvoyer du tout. */
function ouvrirReglages(i){
  setSel = i;
  nav("Reglages");
  drawSet();
}

async function drawSet(){
  drawSetNav(SETS, setSel, (i) => { setSel = i; drawSet(); });
  const b = $("setbody");

  if (setSel === 0){
    b.innerHTML = titre("Général")
      + ligne("Langue", "Celle des textes qu'Ulysse écrit pour vous.",
          '<span class="tag">Français</span>')
      + ligne("Densité d'affichage",
          "Épurée montre moins de matière pour la même information.",
          '<div class="seg" id="densSeg"><button data-d="epure">Épurée</button>'
          + '<button data-d="dense">Dense</button></div>')
      + ligne("Mode sans mémoire",
          "Le fil ne sera pas retrouvé dans les Travaux, et se ferme avec la fenêtre.",
          sw(incognito, "incog"))
      + titre("Où tourne Ulysse")
      + '<dl class="u-kv"><dt>Page servie par</dt><dd>' + esc(CFG.BASE) + "</dd>"
      + "<dt>Secrets</dt><dd>aucun dans le navigateur — serve.py les injecte</dd></dl>";
    const seg = $("densSeg");
    const cur = document.documentElement.getAttribute("data-d");
    seg.querySelectorAll("button").forEach((x) => {
      x.classList.toggle("on", x.dataset.d === cur);
      x.onclick = () => {
        document.documentElement.setAttribute("data-d", x.dataset.d);
        drawSet();
      };
    });
    const s = b.querySelector('[data-sw="incog"]');
    if (s) s.onclick = () => { incognito = !incognito; drawSet(); paintHint(); };
    return;
  }

  if (setSel === 1){
    b.innerHTML = titre("Ce qu'Ulysse sait") + '<div class="u-load">Chargement…</div>';
    try {
      const d = await REST.memory();
      memCache = d;
      const files = (d && d.builtin_files) || [];
      memoireEtat = {
        manquants: files.filter((f) => f.exists === false).map((f) => f.name || f.path)
      };
      majDette();
      b.innerHTML = titre("Ce qu'Ulysse sait")
        + ligne("Fournisseur de mémoire", "Ce qui garde ce qu'Ulysse retient d'une fois sur l'autre.",
            '<span class="tag">' + esc((d && d.active) || "—") + "</span>")
        + titre("Les fichiers de mémoire")
        + files.map((f) => {
            const nom = f.name || f.path || String(f);
            return '<div class="row"><span class="ic">' + svg("fichier", { size: 18 }) + "</span>"
              + '<span class="nm">' + esc(nom) + '</span><span class="sp"></span>'
              + '<span class="chip">' + (f.exists === false ? "absent" : "présent") + "</span></div>";
          }).join("")
        + '<div class="u-todo"><b>Modifier ces fichiers depuis Ulysse</b> passera par '
        + "<code>/api/fs/write-text</code>, qui existe déjà. Non branché tant que les "
        + "garde-fous d'écriture ne sont pas décidés — écraser une mémoire par erreur "
        + "n'est pas rattrapable.</div>";
    } catch (e){
      b.innerHTML = titre("Ce qu'Ulysse sait")
        + '<div class="u-todo">Lecture impossible : ' + esc(e.message) + "</div>";
    }
    return;
  }

  if (setSel === 2){
    // Une section qui ne règle RIEN le dit EN HAUT. On la parcourait en
    // entier avant d'apprendre, dans l'encadré du bas, qu'il n'y avait rien
    // à y faire.
    b.innerHTML = titre("Le cerveau")
      + '<div class="u-lecture">' + svg("point", { size: 12 })
      + "Rien ne se règle ici pour l'instant — cette section montre ce qui est en "
      + "vigueur. Voir plus bas pourquoi.</div>"
      + ligne("Modèle de la session",
          "Vide = celui du profil Hermès. Se règle dans ulysse-config.js (SESSION_MODEL).",
          '<span class="tag">' + esc(CFG.SESSION_MODEL || "profil Hermès") + "</span>")
      + ligne("Modèle du mode Discussion", "Celui du proxy, sans outils.",
          '<span class="tag">' + esc(CFG.PROXY_MODEL) + "</span>")
      + (conv.info && conv.info.model
          ? ligne("Modèle en cours", "Celui que la session vivante utilise réellement.",
              '<span class="tag">' + esc(conv.info.model) + "</span>")
          : "")
      + '<div class="u-todo"><b>Choisir le cerveau depuis Ulysse</b> : '
      + "<code>/api/model/options</code> et <code>/api/model/set</code> existent. "
      + "Reste à décider si un rôle porte son propre modèle ou hérite du profil.</div>";
    return;
  }

  if (setSel === 3){
    b.innerHTML = titre("Sécurité et accords")
      + ligne("Les accords", "Ulysse demande votre permission avant d'écrire, d'envoyer ou de publier.",
          '<span class="tag">demandés à chaque fois</span>')
      + ligne("Ce que la page détient", "Aucun jeton, aucune clé, aucun secret de webhook.",
          '<span class="tag">rien</span>')
      + ligne("Qui peut atteindre Ulysse", "Le serveur n'écoute que sur cette machine.",
          '<span class="tag">127.0.0.1 seulement</span>')
      // Cet avertissement était écrit DEUX FOIS, presque à l'identique — ici
      // et dans le Terminal. Il est trop important pour disparaître d'un des
      // deux endroits, mais un avertissement qu'on a déjà lu ailleurs
      // s'apprend à sauter, et on finit par sauter les deux. Ici la phrase
      // courte et un renvoi ; le texte complet reste là où l'on est sur le
      // point d'agir.
      + '<div class="avert"><span class="pt">' + svg("alerte", { size: 17 }) + "</span>"
      + "<span><b>Les accords donnés dans Ulysse ne s'appliquent pas au Terminal.</b> "
      + '<a id="setVersTerm">Ce que ça veut dire exactement</a></span></div>'
      + '<div class="u-todo"><b>Les 4 sous-modes de permission</b> (Auto / Accept-edit / '
      + "Manuel / Plan) se règlent par <code>config.set</code> sur <code>approvals.mode</code>. "
      + "Non branché tant que le sous-mode Plan n'est pas câblé comme workflow.</div>";
    const t = $("setVersTerm");
    if (t) t.onclick = () => nav("Terminal");
    return;
  }

  if (setSel === 4){
    const plats = (lastStatus && lastStatus.gateway_platforms) || {};
    const noms = Object.keys(plats);
    b.innerHTML = titre("Connexions")
      + '<div class="u-lecture">' + svg("point", { size: 12 })
      + "Rien ne se branche depuis cet écran — il montre ce qui l'est déjà.</div>"
      + ligne("Gateway",
          "Ce qui reçoit les webhooks et les messages venus de l'extérieur.",
          '<span class="tag">' + (lastStatus && lastStatus.gateway_running
            ? "en marche" : "arrêté") + "</span>")
      + (noms.length
          ? noms.map((n) => '<div class="row"><span class="ic">' + svg("prise", { size: 18 })
              + '</span><span class="nm">' + esc(n) + '</span><span class="sp"></span>'
              + '<span class="chip">configurée</span></div>').join("")
          : '<div class="u-load">Aucune plateforme configurée.</div>')
      + '<div class="u-todo"><b>Brancher un serveur MCP ou un canal Telegram</b> : '
      + "<code>/api/mcp/servers</code> et <code>/api/messaging/platforms</code> existent, "
      + "onboarding compris. Non branché : ces écrans demandent des clés, et une clé "
      + "saisie dans une page est une clé qui traîne.</div>";
    return;
  }

  if (setSel === 5){
    b.innerHTML = titre("Dépenses") + '<div class="u-load">Chargement…</div>';
    try {
      const d = await REST.usage(30);
      const totals = (d && d.totals) || {};
      const cles = Object.keys(totals);
      const modeles = (d && d.by_model) || [];
      b.innerHTML = titre("Dépenses sur " + esc(String((d && d.period_days) || 30)) + " jours")
        + (cles.length
            ? '<dl class="u-kv">' + cles.map((k) =>
                "<dt>" + esc(k.replace(/_/g, " ")) + "</dt><dd>"
                + esc(typeof totals[k] === "number"
                    ? totals[k].toLocaleString("fr-FR") : String(totals[k]))
                + "</dd>").join("") + "</dl>"
            : '<div class="u-load">Aucune consommation enregistrée sur la période.</div>')
        + (modeles.length
            ? '<div class="seth">Par modèle<span class="l"></span></div>'
              + modeles.map((m) => '<div class="row"><span class="ic">'
                  + svg("noeuds", { size: 18 }) + '</span><span class="nm">'
                  + esc(m.model || m.name || "—") + '</span><span class="sp"></span>'
                  + '<span class="meta">'
                  + esc(String(m.total_tokens || m.tokens || m.calls || ""))
                  + "</span></div>").join("")
            : "")
        + '<div class="glegend"><i></i>Ce qui est consommé par le Terminal apparaît ici '
        + "au même titre que le reste : c'est le même cerveau, facturé de la même façon.</div>";
    } catch (e){
      b.innerHTML = titre("Dépenses")
        + '<div class="u-todo">Lecture impossible : ' + esc(e.message)
        + ". Hermès expose <code>/api/analytics/usage</code> ; s'il répond 404, "
        + "cette version ne le fournit pas.</div>";
    }
    return;
  }

  b.innerHTML = titre("Avancé")
    + '<dl class="u-kv">'
    + "<dt>Version d'Hermès</dt><dd>" + esc((lastStatus && lastStatus.version) || "—") + "</dd>"
    + "<dt>Sessions actives</dt><dd>"
    + esc(String((lastStatus && lastStatus.active_sessions) !== undefined
        ? lastStatus.active_sessions : "—")) + "</dd>"
    + "<dt>Authentification</dt><dd>"
    + ((lastStatus && lastStatus.auth_required) ? "requise" : "ouverte (loopback)") + "</dd>"
    + "<dt>Lien de l'agent</dt><dd>" + esc(link.state === "open" ? "connecté" : link.reason
        || link.state) + "</dd>"
    + "</dl>"
    + '<div class="seth">Réponse brute de /api/status<span class="l"></span></div>'
    + '<pre class="u-raw">' + esc(JSON.stringify(lastStatus, null, 2)) + "</pre>";
}

/* ═══════════════════════════════════════════════════════════════════════════
   LE TERMINAL — un vrai, désormais
   ---------------------------------------------------------------------------
   `/api/pty` est un WEBSOCKET, pas un POST : tous nos documents disaient le
   contraire, y compris l'audit. Il fait tourner `hermes --tui` derrière un
   pseudo-terminal (web_server.py:15736) et relaie les octets dans les deux
   sens. Le protocole, verbatim :

     · page → serveur : les octets frappés, tels quels ;
       sauf `\x1b[RESIZE:{cols};{rows}]`, que le serveur CONSOMME et n'écrit
       jamais dans le PTY (web_server.py:14513).
     · serveur → page : la sortie du PTY, avec ses séquences ANSI.
     · authentification : `?token=…` en query — c'est serve.py qui l'ajoute,
       la page n'en détient aucun.

   Le rendu est confié à xterm.js, EMPRUNTÉ à l'installation Hermès. C'est la
   bibliothèque avec laquelle le dashboard rend ce même flux ; en écrire une
   autre à la main pour une TUI Ink serait faire semblant.

   ⚠ CE QUE ÇA OUVRE. Le tunnel existait déjà : serve.py relaie tout `/api/`,
   WebSocket compris, et acceptait `/api/pty` bien avant cet écran. Ce qui
   change, c'est qu'on le rend VISIBLE. Ce qui tourne dedans est `hermes
   --tui`, pas un interpréteur quelconque — le même pouvoir que `/api/ws`
   accorde déjà. Mais les accords donnés dans Ulysse ne s'y appliquent pas, et
   l'écran le dit avant, pas après.
   ═══════════════════════════════════════════════════════════════════════════ */

let term = null, termFit = null, termWS = null, termEtat = "repos";

function ptyUrl(){
  const u = new URL(CFG.BASE, location.href);
  return (u.protocol === "https:" ? "wss:" : "ws:") + "//" + u.host + "/api/pty";
}

function termDit(txt, couleur){
  if (term) term.write("\r\n\x1b[" + (couleur || "33") + "m" + txt + "\x1b[0m\r\n");
}

function brancherTerminal(){
  const hote = $("tecran");
  if (!hote) return;

  if (!window.Terminal){
    // xterm.js n'a pas pu être emprunté : on le DIT. Un terminal qui reste
    // blanc sans explication est pire qu'un terminal absent.
    H("tecran", '<div class="u-todo" style="margin:0"><b>Le terminal ne peut pas '
      + "s'afficher.</b> Il emprunte <code>xterm.js</code> à l'installation "
      + "d'Hermès, et <code>/xterm/xterm.js</code> n'a pas répondu. Le reste "
      + "d'Ulysse fonctionne — et la commande reste copiable ci-dessous.</div>");
    return;
  }
  if (term) return;               // déjà branché : on ne rouvre pas un PTY

  const T = TTHEMES.find((x) => x.id === tTheme) || TTHEMES[0];
  term = new window.Terminal({
    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
    fontSize: { petit: 12, moyen: 13, grand: 15 }[tTaille],
    cursorBlink: true,
    // Le fil défile déjà ; 2000 lignes suffisent à remonter une séance sans
    // garder une session entière en mémoire.
    scrollback: 2000,
    theme: { background: T.bg, foreground: T.fg, cursor: T.ac }
  });
  term.open(hote);
  if (window.FitAddon && window.FitAddon.FitAddon){
    termFit = new window.FitAddon.FitAddon();
    term.loadAddon(termFit);
    termFit.fit();
  }
  term.onData((d) => {
    if (termWS && termWS.readyState === 1) termWS.send(d);
  });
  window.addEventListener("resize", ajusterTerm);
  ouvrirPty();
}

function ajusterTerm(){
  if (!term || !termFit) return;
  clearTimeout(ajusterTerm._t);
  ajusterTerm._t = setTimeout(() => {
    try { termFit.fit(); } catch (e){ return; }
    // ⚠ Repeindre, même quand la taille en cellules n'a pas bougé. xterm.js
    // ne redessine pas de lui-même quand son conteneur change de dimensions
    // en pixels ou revient à l'affichage : le contenu reste dans le tampon,
    // invisible. C'était le cas en arrivant directement sur `#Terminal` — la
    // TUI tournait, son texte était bien là, et l'écran restait noir.
    try { term.refresh(0, term.rows - 1); } catch (e){ /* rien à repeindre */ }
    // La séquence de redimensionnement est CONSOMMÉE par le serveur : elle
    // n'atteint jamais le PTY. C'est le contrat d'Hermès, pas une convention
    // qu'on ajoute.
    if (termWS && termWS.readyState === 1){
      termWS.send("\x1b[RESIZE:" + term.cols + ";" + term.rows + "]");
    }
  }, 120);
}

function ouvrirPty(){
  if (!term) return;
  termEtat = "ouverture";
  majTermEtat();
  let ws;
  try { ws = new WebSocket(ptyUrl()); }
  catch (e){ termEtat = "coupe"; majTermEtat(); termDit("Lien impossible : " + e.message, "31"); return; }
  termWS = ws;

  ws.onopen = () => {
    termEtat = "ouvert";
    majTermEtat();
    if (term && termWS === ws){
      ws.send("\x1b[RESIZE:" + term.cols + ";" + term.rows + "]");
      term.focus();
    }
  };
  // Le premier flot de la TUI est le seul moment où l'on sait qu'il y a
  // quelque chose à peindre. Si le terminal a été ouvert avant que son
  // panneau ne soit posé — c'est le cas en arrivant directement sur
  // `#Terminal` — son rendu s'est initialisé sur une boîte sans dimensions
  // et ne s'en remet pas seul : le texte s'empile dans le tampon, et l'écran
  // reste noir. Un ajustement à ce moment-là le remet d'aplomb.
  let premierFlot = true;
  const peindreUneFois = () => {
    if (!premierFlot) return;
    premierFlot = false;
    ajusterTerm();
  };
  ws.onmessage = (e) => {
    if (typeof e.data === "string"){ term.write(e.data); peindreUneFois(); return; }
    // Le pont peut envoyer du binaire : on le décode en UTF-8, sinon les
    // accents et les cadres de la TUI ressortent en losanges.
    new Response(e.data).arrayBuffer().then((buf) => {
      term.write(new TextDecoder("utf-8").decode(buf));
      peindreUneFois();
    });
  };
  ws.onclose = (ev) => {
    if (termWS !== ws) return;
    termWS = null;
    termEtat = "coupe";
    majTermEtat();
    // Les codes viennent d'Hermès (web_server.py:15748) : chacun dit une
    // cause différente, et les confondre ferait chercher au mauvais endroit.
    const pourquoi = { 4401: "l'authentification a été refusée",
                       4403: "l'origine ou l'hôte a été refusé",
                       4404: "la surface intégrée est désactivée côté serveur",
                       4408: "ce client n'est pas autorisé",
                       4410: "la session s'est terminée" }[ev.code];
    termDit(pourquoi ? "Session terminée — " + pourquoi + "."
      : "Session terminée." + (ev.reason ? " " + ev.reason : ""), "33");
  };
}

function fermerPty(){
  if (termWS){ try { termWS.close(); } catch (e){ /* déjà fermé */ } }
  termWS = null;
  termEtat = "repos";
  majTermEtat();
}

/* Les quatre états du terminal, posés en UN SEUL endroit.

   `#pTerminal` reçoit une seule classe `u-term-<état>`, et non deux booléens
   `u-ouvert` / `u-ouverture` : les quatre états s'excluent, et deux booléens
   rendraient représentable un « en ouverture ET ouvert » qui n'existe pas.
   C'est la réponse à la question laissée ouverte au §4 de la passe. Même
   principe que `majEtats()` pour Discuter : une seule chose la pose. */
const TERM_ETATS = ["repos", "ouverture", "ouvert", "coupe"];

/* La ligne d'état de l'écran. Extraite pour pouvoir être réécrite SEULE :
   le panneau se dessine souvent avant que `/api/status` n'ait répondu, et
   elle restait figée sur « Hermès … » pour toute la durée de la visite.
   La réécrire entière passerait par sortir → réécrire → réinstaller, ce qui
   est beaucoup de risque pour un numéro de version. */
function dimTermHTML(){
  return "<span><b>Hermès</b> " + esc((lastStatus && lastStatus.version) || "…") + "</span>"
    + (lastStatus && lastStatus.profiles && lastStatus.profiles.length
        ? "<span><b>profil</b> " + esc(lastStatus.profiles[0]) + "</span>" : "")
    + "<span><b>rendu</b> xterm.js, emprunté à Hermès</span>";
}

function majDimTerm(){
  const d = $("tmain") && $("tmain").querySelector(".dim");
  if (d) d.innerHTML = dimTermHTML();
}

function majTermEtat(){
  const p = $("pTerminal");
  if (p){
    const avant = p.className;
    TERM_ETATS.forEach((e) => p.classList.toggle("u-term-" + e, termEtat === e));
    // La classe d'état change la MISE EN PAGE : les deux pavés se replient et
    // l'écran gagne 80 px. Le terminal doit se réajuster, sinon il garde la
    // taille d'avant et laisse une bande vide. `ajusterTerm` est temporisé,
    // donc l'appeler ici ne coûte rien.
    if (p.className !== avant) ajusterTerm();
  }

  const b = $("tGo");
  if (!b) return;
  b.textContent = termEtat === "ouvert" ? "Fermer la session"
    : termEtat === "ouverture" ? "Ouverture…" : "Ouvrir une session";
  b.disabled = termEtat === "ouverture";
  const s = $("tstate");
  if (s){
    // « coupé » n'est pas « aucune session » : l'un dit qu'on n'a rien
    // ouvert, l'autre que ça s'est interrompu. La pastille les distingue
    // par la couleur ; le texte doit les distinguer aussi.
    s.textContent = termEtat === "ouvert" ? "session ouverte"
      : termEtat === "ouverture" ? "connexion…"
      : termEtat === "coupe" ? "lien coupé"
      : "aucune session";
    s.className = "tmeta u-tstate " + termEtat;
  }
}

/* ═══ Terminal — l'écran, les thèmes, l'aide-mémoire ═════════════════════ */

let tTheme = "nuit", tTaille = "moyen";

// La commande que le bouton copie. Une seule source : l'écran, le bouton et
// l'aide-mémoire la lisent ici, donc ils ne peuvent plus diverger.
const TCMD = "hermes";

const TMEMO = [
  ["hermes", "ouvrir l'agent en ligne de commande"],
  ["hermes dashboard --port 9123 --no-open", "le backend qu'Ulysse enveloppe"],
  ["hermes gateway run", "les webhooks et les canaux distants"],
  ["hermes proxy start --provider nous --port 8645", "le mode Discussion, sans outils"],
  ["hermes webhook subscribe <nom> --prompt \"…\"", "créer une route webhook"],
  ["hermes doctor", "diagnostiquer une installation"]
];

function drawTerm(){
  const T = TTHEMES.find((x) => x.id === tTheme) || TTHEMES[0];
  const px = { petit: 12, moyen: 13, grand: 15 }[tTaille];

  H("tside",
    '<div class="tgrp"><h3>Apparence</h3><div class="tswatch">'
    + TTHEMES.map((t) => '<button class="tsw ' + (t.id === tTheme ? "on" : "") + '"'
        + ' title="' + esc(t.nm) + '" style="background:' + t.bg + '"'
        + ' data-th="' + t.id + '"></button>').join("")
    + '</div><div style="margin-top:14px" class="seg" id="tSize">'
    + ["petit", "moyen", "grand"].map((v) =>
        '<button class="' + (v === tTaille ? "on" : "") + '" data-sz="' + v + '">'
        + v[0].toUpperCase() + v.slice(1) + "</button>").join("")
    + "</div></div>"
    // Chaque ligne devient copiable. Elles sont là pour être tapées ; les
    // faire recopier à la main est le seul usage qu'on n'attendait pas d'elles.
    // Ces six lignes servaient à copier pour aller taper AILLEURS. Il y a
    // maintenant un terminal juste à côté : elles peuvent y être posées.
    // Deux gestes, donc — et jamais l'exécution.
    + '<div class="tgrp"><h3>Aide-mémoire</h3><div class="tmemo">'
    + TMEMO.map(([c, q]) => '<div class="u-cmd" data-cmd="' + esc(c) + '" role="button"'
        + ' tabindex="0" title="Cliquer pour copier"><code>' + esc(c) + "</code><span>"
        + esc(q) + '</span><span class="k">' + svg("copier", { size: 15 }) + "</span>"
        + '<span class="u-poser" data-poser="' + esc(c) + '" role="button" tabindex="0"'
        + ' title="Poser dans le terminal, sans lancer">' + svg("suivant", { size: 15 })
        + "</span></div>").join("")
    + "</div></div>");

  // ⚠ `#tmain` est reconstruit en innerHTML à chaque changement de thème ou
  // de taille. `#tecran` porte un terminal VIVANT, avec sa session ouverte :
  // le laisser dans le gabarit le détruirait, et couperait le PTY sous les
  // doigts de quelqu'un en train de taper. Même séquence que pour `#band` :
  // SORTIR, réécrire, RÉINSTALLER.
  const ecran = $("tecran"), stock = $("uStock");
  if (ecran && stock) stock.appendChild(ecran);

  H("tmain",
    '<div class="tscreen u-tscreen" style="background:' + T.bg + ";color:" + T.fg
    + ";font-size:" + px + 'px">'
    // Les trois pastilles rouge/jaune/verte ont disparu : elles ne fermaient
    // rien, ne réduisaient rien, sur la seule fenêtre qui mène en dehors de
    // l'application. La barre garde son rôle et dit ce qui TOURNE, au lieu
    // du nom du thème — qui nommait la couleur, pas le programme.
    + '<div class="tbar">'
    + '<span class="u-quoi">' + svg("terminal", { size: 14 }) + esc(TCMD)
    + " --tui</span>"
    + '<span class="sp" style="flex:1"></span>'
    + '<span class="tmeta u-tstate repos" id="tstate">aucune session</span></div>'
    // Cette ligne annonçait l'état du GATEWAY, qui n'a rien à voir avec un
    // pseudo-terminal. Elle dit maintenant ce qui concerne CET écran.
    //
    // Cowork demandait aussi le dossier de travail. Il n'est exposé nulle
    // part : /api/status donne `hermes_home`, pas le répertoire où tourne le
    // dashboard — et c'est celui-là qu'hérite le PTY. L'inventer serait de
    // la donnée fictive (règle STU-1) ; la TUI l'imprime elle-même sur sa
    // première ligne, à l'écran juste en dessous.
    + '<div class="dim">' + dimTermHTML() + "</div>"
    // LE VRAI ÉCRAN. `hermes --tui` tourne derrière, et ce qu'on tape lui
    // arrive. xterm.js le rend — celui d'Hermès, emprunté par serve.py.
    + '<div class="u-tecran" id="tecran"></div></div>'

    // L'avertissement était SOUS l'écran. C'était juste quand on lisait avant
    // de copier une commande pour aller ailleurs ; depuis qu'on peut taper
    // directement dans le cadre, il arrivait après le geste qu'il devait
    // précéder. Il passe donc AVANT le bouton d'ouverture. Session ouverte,
    // il se replie en une ligne — le titre reste entier, il ne disparaît
    // jamais. Le texte n'a pas bougé d'un mot : c'était sa place qui était
    // fausse, pas son ton.
    + '<div class="avert" style="margin:18px 0 4px"><span class="pt">'
    + svg("alerte", { size: 17 }) + "</span>"
    + "<span><b>Les accords que vous donnez dans Ulysse ne s'appliquent pas ici.</b>"
    + '<span class="u-long"> Ulysse demande votre permission avant d\'écrire, '
    + "d'envoyer ou de publier ; le terminal, non. Ce qui y est tapé s'exécute. "
    + "C'est la seule fenêtre de l'application qui mène en dehors d'elle — et c'est "
    + "pour ça qu'elle vous le dit avant, et pas après.</span></span></div>"

    + '<div class="tlaunch"><button class="tbtn" id="tGo">'
    + svg("terminal", { size: 20 }) + "Ouvrir une session</button>"
    + '<button class="ghost-btn" data-cmd="' + esc(TCMD) + '">Copier « '
    + esc(TCMD) + ' »</button>'
    + '<span class="tpath">Pour l\'ouvrir hors d\'Ulysse, dans votre console</span></div>'

    + '<div class="cout" style="margin-top:16px">💶 <b>Ce que ça coûte.</b> Le terminal '
    + "appelle le même cerveau, facturé de la même façon. Ce qui s'y consomme apparaît "
    + 'dans <a id="tCout">Dépenses</a>, au même titre que le reste.</div>'

    // Ce qui reste vrai, et qu'il faut dire : ce n'est pas un interpréteur
    // quelconque, c'est `hermes --tui`. Et le pont existait avant cet écran.
    + '<div class="u-todo">Ce qui tourne ici est <b>' + esc(TCMD)
    + " --tui</b>, derrière un pseudo-terminal ouvert par Hermès "
    + "(<code>/api/pty</code>). Le rendu est confié à <code>xterm.js</code>, "
    + "emprunté à votre installation d'Hermès plutôt que recopié — c'est la "
    + "même bibliothèque que celle de son propre tableau de bord.</div>"

    // Ce qui remplace les deux pavés repliés : on dit qu'ils sont repliés et
    // où les retrouver. Replier sans le dire ferait croire à une disparition.
    + '<div class="u-repli">Le coût et le détail technique sont repliés pendant '
    + 'la session. <span id="tRepli" role="button" tabindex="0">Voir les '
    + "dépenses</span></div>");

  $("tside").querySelectorAll("[data-th]").forEach((b) => {
    b.onclick = () => { tTheme = b.dataset.th; drawTerm(); };
  });
  $("tSize").querySelectorAll("[data-sz]").forEach((b) => {
    b.onclick = () => { tTaille = b.dataset.sz; drawTerm(); };
  });
  if (ecran){
    // ⚠ PAS `$("tecran")` ici. Pendant la réécriture, DEUX nœuds portent cet
    // `id` : le vivant, rangé dans `#uStock`, et le neuf, vide, dans `#tmain`.
    // `getElementById` rend le PREMIER dans l'ordre du document — et `#uStock`
    // est déclaré avant le panneau. On récupérait donc le vivant, et
    // `replaceChild(ecran, ecran)` ne faisait rien : le terminal restait caché
    // dans le stock pendant que le panneau affichait un div vide. La recherche
    // doit être limitée au sous-arbre qu'on vient d'écrire.
    const neuf = $("tmain").querySelector("#tecran");
    if (neuf && neuf !== ecran) neuf.parentNode.replaceChild(ecran, neuf);
    // Le thème et la taille s'appliquent au terminal VIVANT : on ne le
    // recrée pas pour changer une couleur.
    if (term){
      term.options.theme = { background: T.bg, foreground: T.fg, cursor: T.ac };
      term.options.fontSize = px;
      ajusterTerm();
    }
  }

  brancherTerminal();
  majTermEtat();
  const c = $("tCout");
  if (c) c.onclick = () => ouvrirReglages(5);
  const r = $("tRepli");
  if (r){
    const voir = () => ouvrirReglages(5);
    r.onclick = voir;
    r.onkeydown = (e) => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); voir(); } };
  }
  $("tGo").onclick = () => {
    if (termEtat === "ouvert"){ fermerPty(); return; }
    if (!term){ brancherTerminal(); return; }
    ouvrirPty();
  };
  $("tside").querySelectorAll("[data-cmd]").forEach((el) => {
    const prendre = () => copier(el.dataset.cmd, "La commande");
    el.onclick = prendre;
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); prendre(); } };
  });
  // Le second geste. Il est DANS la ligne de l'aide-mémoire, qui porte déjà
  // `data-cmd` : sans arrêter la propagation, poser copierait aussi.
  $("tside").querySelectorAll("[data-poser]").forEach((el) => {
    const poser = (e) => { e.stopPropagation(); poserDansTerm(el.dataset.poser); };
    el.onclick = poser;
    el.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); poser(e); }
    };
  });
}

/* Poser une commande dans la ligne du terminal — SANS la lancer.
   On envoie le texte au PTY, pas de retour chariot : il s'affiche dans
   l'invite, et c'est à la personne d'appuyer sur Entrée. « Ulysse n'exécute
   rien que vous n'ayez lancé » est ce que le panneau dit depuis le début, et
   ça doit rester vrai maintenant qu'il en aurait les moyens. */
function poserDansTerm(cmd){
  if (!cmd) return;
  if (termEtat !== "ouvert" || !termWS || termWS.readyState !== 1){
    snack("Ouvrez d'abord une session pour y poser une commande.");
    return;
  }
  termWS.send(cmd);
  if (term) term.focus();
  snack("« " + cmd + " » posé dans la ligne — à vous d'appuyer sur Entrée.");
}

/* ═══ Repères — le glossaire des signes ══════════════════════════════════
   Repris de la maquette : chaque icône porte son nom (`nm`) et sa raison
   d'être (`r`). Un signe qu'on ne sait pas lire n'est pas un signe. */

/* Le titre promettait « chaque signe de l'interface » et la liste n'en
   montrait que 24 sur 41 : les icônes déclarées par une FORME plutôt que par
   un tracé (`regler:{tune:true}`, `equipe:{people:true}`…) n'avaient ni `nm`
   ni `r`, et le filtre les écartait sans le dire. Les dix-sept manquantes ont
   été écrites le 2026-08-08 ; le compte s'affiche pour que l'écart, s'il
   revient, se voie. */
let repQ = "";

function drawGlossary(){
  const tous = Object.keys(I);
  const documentes = tous.filter((k) => I[k].nm || I[k].r);
  const q = repQ.toLowerCase().trim();
  const vus = documentes.filter((k) => !q
    || k.toLowerCase().includes(q)
    || (I[k].nm || "").toLowerCase().includes(q)
    || (I[k].r || "").toLowerCase().includes(q));

  H("glossary",
    '<div class="sub" style="color:var(--muted);margin-bottom:6px">'
    + "Chaque signe de l'interface, son nom, et pourquoi il est là.</div>"
    + '<div class="u-note" style="margin-top:0"><i></i>'
    + documentes.length + " signes sur " + tous.length + " documentés"
    + (documentes.length < tous.length
        ? " — les autres sont déclarés par une forme et n'ont pas encore leur phrase."
        : ". Un signe sans nom ni raison n'apparaîtrait pas ici : c'est ce compte qui le dirait.")
    + "</div>"
    + (vus.length
        ? vus.map((k) => {
            const o = I[k];
            return '<div class="row" style="align-items:flex-start">'
              + '<span class="ic" style="margin-top:2px">' + svg(k, { size: 22, w: 1.7 }) + "</span>"
              + '<span class="nm" style="min-width:150px">' + esc(o.nm || k) + "</span>"
              + '<span class="sp" style="flex:1;color:var(--muted);font-size:var(--font-size-sm)">'
              + esc(o.r || "") + "</span></div>";
          }).join("")
        : '<div class="empty"><div class="big">Aucun signe ne correspond.</div>'
          + '<div class="u-vide-sub">Cherchez le nom du geste plutôt que celui du dessin — '
          + "« supprimer » plutôt que « corbeille ».</div></div>"));
}

/* ═══ Les demandes d'accord deviennent des notifications ═════════════════
   La maquette pose une bulle qui NE part pas toute seule pour une décision.
   C'est exactement ce qu'est une approval.request : l'agent est bloqué tant
   qu'on n'a pas répondu. Elle sonne, elle reste, et elle marque le menu. */

let approvalNid = null;

/* Ce que chaque choix ENGAGE. C'est ça qu'on doit pouvoir lire — pas son nom
   technique. Les quatre valeurs viennent d'Hermès : approval.request porte
   ses `choices`, jusqu'à ["once","session","always","deny"]
   (web_server.py:1826). Ulysse n'en montrait que deux et répondait toujours
   `once` ou `deny` : les deux autres étaient captés puis jetés. */
const PORTEE = {
  once:    ["Autoriser cette fois",
            "Seulement cette action-ci. On vous redemandera à la suivante."],
  session: ["Autoriser pour cette conversation",
            "Jusqu'à ce que ce fil se ferme. Une nouvelle conversation redemandera."],
  always:  ["Autoriser toujours",
            "Pour toutes les conversations à venir, sans limite de temps."]
};

/* La demande résolue, gardée pour l'état d'après : `.ask.done` conserve le
   choix retenu, comme la maquette le prévoit. On ne l'efface qu'à la demande
   suivante ou à la remise à zéro du fil. */
let accordRepondu = null;

function accordQuoi(pl){
  const outil = pl.tool || pl.name || "";
  const cmd = pl.command || pl.path || pl.args || "";
  return (outil && cmd) ? outil + "  ·  " + cmd : (outil || cmd || "une action");
}

/* Le bloc d'accord dans le fil. Il s'adapte à ce qui arrive : si `choices` ne
   porte que ["once","deny"], il n'affiche qu'une option et le bouton Refuser. */
function accordHTML(){
  if (conv.approval){
    const pl = conv.approval;
    const dispo = Array.isArray(pl.choices) && pl.choices.length
      ? pl.choices : ["once", "deny"];
    const opt = (k, fort) =>
      '<button class="opt' + (fort ? " u-fort" : "") + '" data-ch="' + k + '">'
      + '<span class="tick"></span><span class="tx">' + esc(PORTEE[k][0])
      + '<span class="sub">' + esc(PORTEE[k][1]) + "</span></span></button>";

    return '<div class="u-accord"><div class="ask">'
      + '<div class="q">' + svg("alerte", { size: 19 }) + "Votre accord est demandé</div>"
      + '<div class="hint">' + (pl.reason ? esc(pl.reason) + ". " : "")
      + "Rien ne se fait tant que vous n'avez pas répondu.</div>"
      + '<div class="u-quoi">' + esc(accordQuoi(pl)) + "</div>"
      + (dispo.indexOf("once") >= 0 ? opt("once") : "")
      + (dispo.indexOf("session") >= 0 ? opt("session") : "")
      + (dispo.indexOf("always") >= 0 ? '<div class="u-sep"></div>' + opt("always", true) : "")
      + '<div class="u-bas"><span class="l">'
      // Vérifié dans le code source avant de l'écrire : un `always` écrit la
      // clé `command_allowlist` de config.yaml (approval.py:2698), que
      // GET /api/config rend lisible et PUT /api/config remplace. Le retour en
      // arrière existe donc. Voir AUDIT-ENDPOINTS-REEL.md §5 bis.
      + (dispo.indexOf("always") >= 0
          ? "Vous pourrez revenir sur « toujours » dans Réglages · Sécurité et accords."
          : "")
      + '</span><button class="dangerlink" data-ch="deny">Refuser</button></div>'
      + "</div></div>";
  }

  if (accordRepondu){
    const k = accordRepondu.choix;
    if (k === "deny"){
      return '<div class="u-accord"><div class="ask done">'
        + '<button class="opt pick" style="background:#FCE8E6;color:#B3261E">'
        + '<span class="tick" style="border-color:#B3261E;background:#B3261E;color:#fff">'
        + svg("fermer", { size: 14 }) + "</span>"
        + '<span class="tx">Refusé — ' + esc(accordRepondu.quoi)
        + " n'a pas eu lieu.</span></button></div></div>";
    }
    const p = PORTEE[k] || PORTEE.once;
    return '<div class="u-accord"><div class="ask done">'
      + '<button class="opt pick"><span class="tick">' + svg("coche", { size: 14 })
      + "</span>" + '<span class="tx">' + esc(p[0])
      + '<span class="sub">' + esc(accordRepondu.quoi) + "</span></span></button>"
      + "</div></div>";
  }
  return "";
}

/* Répondre depuis le fil. Le protocole ne porte AUCUN identifiant de demande :
   la file est résolue en FIFO par session (tools/approval.py:2506). Inventer
   un request_id serait inventer une API qui n'existe pas. */
function repondreAccord(choix){
  const pl = conv.approval;
  if (!pl) return;
  accordRepondu = { choix: choix, quoi: accordQuoi(pl) };
  conv.approval = null;
  if (approvalNid !== null){ Notifs.drop(approvalNid); approvalNid = null; }
  paintThread();
  respondApproval(choix).catch((e) => {
    // Le serveur a refusé : on remet la demande, sinon l'agent reste bloqué
    // devant une interface qui prétend avoir répondu.
    accordRepondu = null;
    conv.approval = pl;
    paintThread();
    snack("Non transmis : " + e.message);
  });
  snack(choix === "deny" ? "Refusé — l'agent n'a pas agi."
    : "Autorisé : " + (PORTEE[choix] || PORTEE.once)[0].toLowerCase() + ".");
}

function onApproval(pl){
  if (!pl){ return; }
  const quoi = accordQuoi(pl);
  const choices = Array.isArray(pl.choices) && pl.choices.length ? pl.choices : ["once", "deny"];
  accordRepondu = null;
  approvalNid = Notifs.push({
    kind: "decision",
    titre: "Votre accord est demandé",
    txt: pl.reason ? pl.reason + " — " + quoi : quoi,
    obj: conv.info && conv.info.cwd ? conv.info.cwd : "Session en cours",
    panel: "Discuter",
    when: "à l'instant",
    // Le libellé était INVERSÉ : quand Hermès proposait une portée large, le
    // bouton portait le mot le plus vague (« Autoriser ») et faisait l'action
    // la plus étroite (`once`). La bulle dit maintenant ce que son oui vaut.
    oui: "Autoriser une fois",
    non: "Refuser",
    renvoi: choices.length > 2
      ? "Voir la demande dans Discuter — pour autoriser plus largement" : ""
  });
}

Notifs.onAnswer = (n, oui) => {
  if (n.kind !== "decision") return null;
  const choix = oui ? "once" : "deny";
  const pl = conv.approval;
  accordRepondu = pl ? { choix: choix, quoi: accordQuoi(pl) } : null;
  approvalNid = null;
  conv.approval = null;
  return respondApproval(choix).then(() => { paintThread(); });
};

/* ═══════════════════════════════════════════════════════════════════════════
   LE PREMIER LANCEMENT
   ---------------------------------------------------------------------------
   Cinq constats, chacun avec sa source à l'écran. On lance les appels EN
   PARALLÈLE, on affiche la carte immédiatement avec toutes les pastilles en
   attente, et on les résout à mesure : attendre que tout soit revenu pour
   afficher quoi que ce soit ferait un écran blanc pendant deux secondes, sur
   la première seconde d'Ulysse.

   Et dans tous les cas, ON PEUT ENTRER. Un écran d'accueil qui retient n'est
   plus un accueil, c'est une barrière — et la première chose qu'on
   apprendrait d'Ulysse serait qu'il faut le contourner.
   ═══════════════════════════════════════════════════════════════════════════ */

const FIRST = [
  { k: "hermes",  nm: "Hermès répond",              src: "GET /api/status" },
  { k: "agent",   nm: "L'agent est joignable",      src: "handshake /api/ws" },
  { k: "skills",  nm: "Les compétences sont chargées", src: "GET /api/skills" },
  { k: "gateway", nm: "Le gateway",                 src: "GET /api/status · gateway_running" },
  { k: "secret",  nm: "Aucun secret dans cette page", src: "vérifié à la construction" }
];

// null = pas encore demandé · "ok" · "warn" (ça marche sans) · "ko"
const firstEtat = { hermes: null, agent: null, skills: null, gateway: null, secret: null };
let firstTexte = {};

function firstLigne(d){
  const e = firstEtat[d.k];
  const cls = e === "ok" ? "" : e === "warn" ? " f-warn" : e === "ko" ? " f-ko" : " f-att";
  return '<div class="defl"><span class="dd' + cls + '"></span>'
    + '<span><span class="dn">' + esc(d.nm) + "</span>"
    + '<span class="dt">' + esc(firstTexte[d.k] || "on vérifie…") + "</span>"
    + '<span class="f-src">' + esc(d.src) + "</span></span></div>";
}

function drawFirst(){
  const faits = FIRST.filter((d) => firstEtat[d.k] !== null).length;
  const ko = FIRST.filter((d) => firstEtat[d.k] === "ko").length;
  const muet = firstEtat.hermes === "ko";
  const fini = faits === FIRST.length;

  let h = "<h2>" + (muet ? "Hermès ne répond pas."
      : !fini ? "On regarde si tout est en place."
      : ko ? "Presque tout est prêt." : "Tout est prêt.") + "</h2>";

  h += '<div class="lead">' + (muet
    ? "Ulysse enveloppe Hermès ; sans lui, il n'a rien à montrer."
    : "Ulysse ne fait rien qu'Hermès ne sache déjà faire. Il lui donne un visage.")
    + "</div>";

  if (muet){
    // Ulysse NE LANCE PAS Hermès à votre place. Il donne la commande — la
    // même frontière qu'au Terminal. Et elle est écrite avant d'être
    // copiable : on ne copie pas ce qu'on n'a pas vu.
    h += '<div class="q">Lancez-le, puis revenez sur cette page.</div>'
      + '<div class="f-cmd"><code>' + esc(TCMD_LANCEMENT) + "</code>"
      + '<button class="ghost-btn" data-copy="' + esc(TCMD_LANCEMENT)
      + '">Copier</button></div>';
  } else {
    h += '<div class="f-compte">Vérifié : ' + Math.round(faits / FIRST.length * 100)
      + " %</div>"
      + '<div class="defs">' + FIRST.map(firstLigne).join("") + "</div>";
  }

  // La dette de profil. Les fichiers nommés viennent de GET /api/memory
  // (`builtin_files`, `exists === false`) — pas d'une supposition. Et le
  // texte dit « n'existe pas encore », pas « contient l'exemple livré » :
  // c'est ce que l'endpoint permet d'affirmer.
  const manquants = (memoireEtat && memoireEtat.manquants) || [];
  if (manquants.length){
    h += '<div class="avert"><span class="pt">' + svg("alerte", { size: 17 }) + "</span>"
      + "<span><b>Ulysse ne vous connaît pas encore.</b> "
      + esc(manquants.join(", ")) + (manquants.length > 1 ? " n'existent" : " n'existe")
      + " pas encore.</span></div>"
      + '<div class="ex2">'
      + '<div class="exl"><b>Sans vous</b> — « Je mets mon savoir-faire à votre '
      + "service. » <i>Vrai pour tout le monde, donc utile à personne.</i></div>"
      + '<div class="exl on"><b>Avec vous</b> — la même phrase, avec votre métier, '
      + "vos mots, et ce que vous ne voulez pas qu'on écrive à votre place.</div>"
      + "</div>";
  }

  // La seule action mise en avant est celle qui SERT vraiment : écrire son
  // profil quand il manque, ou commencer quand tout va bien.
  h += '<div class="f-pied">'
    + '<button class="validate" data-go="' + (manquants.length ? "profil" : "entrer") + '">'
    + (muet ? "Entrer sans attendre"
       : manquants.length ? "Écrire mon profil"
       : fini && !ko ? "Commencer" : "Entrer quand même") + "</button>"
    + (manquants.length ? '<button class="quiet-link" data-go="entrer">Plus tard, '
        + "je verrai</button>" : "")
    + '<span class="sp"></span></div>';

  h += '<div class="cout">Ulysse tourne <b>sur cette machine</b>. La page ne '
    + "détient aucun jeton, aucune clé : c'est le serveur local qui les porte.</div>";

  H("firstcard", h);
  $("firstcard").querySelectorAll("[data-copy]").forEach((b) => {
    b.onclick = () => copier(b.dataset.copy, "La commande");
  });
  $("firstcard").querySelectorAll("[data-go]").forEach((b) => {
    b.onclick = () => {
      const profil = b.dataset.go === "profil";
      quitterFirst();
      if (profil) ouvrirReglages(1);   // « Ce qu'Ulysse sait »
    };
  });
}

function quitterFirst(){
  const f = $("first");
  if (f) f.classList.remove("on");
  $("app").classList.add("on");
  majEtats();
  setTimeout(() => $("reply").focus(), 320);
  // Le marqueur vit côté serveur, pas dans la page : `localStorage` n'est
  // utilisé nulle part dans le produit, et un marqueur de page ne survivrait
  // ni à un autre navigateur ni à une session privée.
  api("/ulysse/premier-vu", { method: "POST", body: {} }).catch(() => {});
}

async function lancerFirst(){
  $("first").classList.add("on");
  $("app").classList.remove("on");
  // Celui-là ne demande rien à personne : il se lit dans la page elle-même.
  firstEtat.secret = "ok";
  firstTexte.secret = "aucun jeton ni clé n'est écrit dans cette page.";
  drawFirst();

  // EN PARALLÈLE. Chacun se résout pour son compte.
  REST.status().then((d) => {
    lastStatus = d;
    firstEtat.hermes = "ok";
    firstTexte.hermes = "version " + (d.version || "?") + ", sur cette machine.";
    firstEtat.gateway = d.gateway_running ? "ok" : "warn";
    firstTexte.gateway = d.gateway_running
      ? "en marche — il reçoit les webhooks et les canaux distants."
      : "arrêté. Sans lui : pas de webhooks ni de canaux distants. Le reste marche.";
    drawFirst();
  }).catch((e) => {
    firstEtat.hermes = "ko";
    firstTexte.hermes = e.message;
    firstEtat.gateway = "ko";
    firstTexte.gateway = "on ne peut pas savoir : Hermès ne répond pas.";
    drawFirst();
  });

  REST.skills().then((d) => {
    const n = Array.isArray(d) ? d.length : ((d && d.skills && d.skills.length) || 0);
    firstEtat.skills = n ? "ok" : "warn";
    firstTexte.skills = n ? n + " compétences déclarées." : "aucune compétence déclarée.";
    drawFirst();
  }).catch((e) => {
    firstEtat.skills = "ko";
    firstTexte.skills = e.message;
    drawFirst();
  });

  REST.memory().then((d) => {
    const files = (d && d.builtin_files) || [];
    memoireEtat = { manquants: files.filter((f) => f.exists === false)
      .map((f) => f.name || f.path) };
    majDette();
    drawFirst();
  }).catch(() => {});

  // Le lien : c'est le handshake lui-même qui répond, pas un appel de plus.
  link.connect();
}

/* ═══ Amorçage ═══════════════════════════════════════════════════════════ */

// La commande qui lance la pile — écrite à l'écran avant d'être copiable.
const TCMD_LANCEMENT = "lancer_ulysse.bat";

let lastStatus = null;

async function loadStatus(){
  try { lastStatus = await REST.status(); }
  catch (e){ lastStatus = null; }
  paintBand();
  majDimTerm();
}

// Le core prévient la page à chaque changement d'état, plutôt que la page
// n'aille sonder. Un seul repaint par frame : les deltas arrivent par
// centaines pendant une réponse.
let paintQueued = false, lastApproval = null;
coreHooks.onChange = () => {
  // L'accueil s'efface dès que l'agent existe : session ouverte, ou premier
  // mot streamé. Le plus tôt des deux, et sans sondage. Une erreur le lève
  // aussi — `submitPrompt` ne rejette jamais, il pousse un tour d'erreur, et
  // rester à l'accueil cacherait précisément ce qui vient d'échouer.
  if (accueil && attenteEntree
      && (conv.sessionId || conv.turns.some((t) => t.role === "error"
          || (t.role === "assistant" && t.text)))){
    quitterAccueil();
  }
  // Une nouvelle demande d'accord fait sonner la cloche, une seule fois.
  if (conv.approval && conv.approval !== lastApproval){
    lastApproval = conv.approval;
    onApproval(conv.approval);
  }
  if (!conv.approval && lastApproval){
    lastApproval = null;
    if (approvalNid !== null){ Notifs.drop(approvalNid); approvalNid = null; }
  }
  // La pastille « L'agent est joignable » du premier lancement : c'est le
  // handshake lui-même qui répond, pas un appel de plus.
  if ($("first") && $("first").classList.contains("on")){
    const et = link.state === "open" ? "ok"
      : (link.state === "denied" || link.state === "closed") ? "ko" : null;
    if (et !== firstEtat.agent){
      firstEtat.agent = et;
      firstTexte.agent = et === "ok" ? "le lien est ouvert — Cowork fonctionne."
        : et === "ko" ? (link.reason || "le lien a été refusé.") : "on ouvre le lien…";
      drawFirst();
    }
  }

  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    if (current === "Discuter") paintThread();
    if (current === "Plan") drawPlan();
    paintHint();
  });
};
/* Le backend dit ce qui a change : on ne rafraichit que le panneau concerne,
   et seulement s'il est a l'ecran. Redessiner un panneau qu'on ne regarde pas
   coute une requete pour rien. */
coreHooks.onChanged = (quoi) => {
  if (quoi === "sessions"){
    if (current === "Travaux") drawWorks();
    if (current === "Projets") drawProjets();
  }
  if (quoi === "cron" && current === "Automatisations") drawAutos();
  if (quoi === "platforms" && current === "Reglages" && setSel === 4) drawSet();
};

coreHooks.onSystem = (text) => {
  const t = newTurn("system", text);
  t.state = "done";
  paintThread();
};

function boot(){
  initRailHover();
  drawRail();
  drawRoles();
  graph.init();
  graph.state.onFiche = ouvrirFiche;

  $("burger").onclick = pinRail;
  $("bell").onclick = (e) => Notifs.toggle(e);
  // Un seul composeur, désormais : celui de Discuter, qui sert d'accueil.
  $("composer").onsubmit = onSend;
  $("stopBtn").onclick = interruptTurn;
  $("planStop").onclick = interruptTurn;

  H("plus1", svg("plus", { size: 22 }));
  H("mic1", svg("micro", { size: 22 }));
  H("snd1", svg("envoi", { size: 20 }));
  H("stopBtn", svg("fermer", { size: 22 }));
  H("moreBtn", svg("tout", { size: 22 }));
  H("icSearch", svg("recherche", { size: 18 }));

  $("mic1").onclick = (e) => { e.stopPropagation(); basculerDictee(); };

  // Le « + » joint un fichier : c'est le geste attendu là où il est posé.
  // L'Établi (parcourir les fichiers déjà sur la machine) reste dans le
  // menu « ⋯ » — ce n'est pas le même besoin.
  $("plus1").onclick = (e) => { e.stopPropagation(); choisirFichiers(); };

  $("moreBtn").onclick = (e) => {
    e.stopPropagation();
    const p = $("morePop");

    // ⚠ `#morePop` est reconstruit en innerHTML à CHAQUE ouverture. `#band`
    // est un élément du contrat : l'écrire en dur ici le ferait détruire au
    // premier clic. Séquence obligatoire : SORTIR, réécrire, RÉINSTALLER.
    // Le piège s'est déclenché en test, il est réel.
    const band = $("band");
    const stock = $("uStock");
    if (band && stock) stock.appendChild(band);

    p.innerHTML = '<div class="u-popsec">État du réseau</div>'
      + '<div id="uBandHote"></div>'
      + '<div class="u-popsep"></div>'
      + '<button id="mIncog"><span>' + svg("incognito", { size: 20 })
      + "</span><span>" + (incognito ? "Revenir au fil normal" : "Fil sans mémoire")
      + "<span class=\"sub\">" + (incognito
          ? "Le prochain fil sera retrouvable"
          : "Ne sera pas retrouvé dans les Travaux") + "</span></span></button>"
      + '<button id="mEtabli"><span>' + svg("atelier", { size: 20 })
      + "</span><span>" + ($("work").classList.contains("atelier")
          ? "Fermer l'Établi" : "Ouvrir l'Établi")
      + "<span class=\"sub\">Les fichiers déjà sur la machine, à côté du fil</span>"
      + "</span></button>"
      + '<button id="mNew"><span>' + svg("plus", { size: 20 })
      + "</span><span>Nouvelle conversation<span class=\"sub\">La session s'ouvrira au "
      + "prochain message</span></span></button>";

    if (band) $("uBandHote").appendChild(band);
    p.classList.toggle("on");
    $("mEtabli").onclick = () => {
      p.classList.remove("on");
      setMode($("work").classList.contains("atelier") ? "chat" : "atelier");
    };
    $("mIncog").onclick = () => {
      incognito = !incognito;
      p.classList.remove("on");
      paintHint();
      snack(incognito ? "Fil sans mémoire : il ne sera pas conservé."
                      : "Fil normal : il sera retrouvable dans les Travaux.");
    };
    $("mNew").onclick = () => {
      p.classList.remove("on"); resetSession(); accordRepondu = null; paintThread();
    };
  };

  document.querySelectorAll(".u-modeseg button").forEach((b) => {
    b.onclick = () => setMode2(b.dataset.mode);
  });
  setMode2(mode);

  // Le « + » des deux composeurs ouvre le même sélecteur de fichiers.
  $("fileInput").onchange = (e) => surFichiers(e.target.files);

  $("stseg").querySelectorAll("button").forEach((b) => {
    b.onclick = () => setStudio(b.dataset.v);
  });
  $("toutbtn").onclick = () => {
    const steps = etapesReelles();
    if (etapesOuvertes.size >= steps.length) etapesOuvertes.clear();
    else steps.forEach((s) => etapesOuvertes.add(s.n));
    drawPlan();
  };
  $("voirJrn").onclick = () => {
    jrnOuvert = !jrnOuvert;
    majJrnBtn();
    drawPlan();
  };
  majJrnBtn();

  // L'échelle. `#recentrer` s'y range : trois commandes de la même famille au
  // même endroit valent mieux qu'un bouton isolé qui apparaît et disparaît.
  $("recentrer").onclick = () => graph.camReset();
  document.querySelectorAll(".u-echelle [data-z]").forEach((b) => {
    b.onclick = () => graph.camZoom(b.dataset.z === "+" ? 1 : -1);
  });
  graph.state.onCam = (k, repos) => {
    const b = $("recentrer");
    if (!b) return;
    b.textContent = Math.round(k * 100) + " %";
    b.title = repos ? "Déjà rangé" : "Ranger — tout remettre en place";
    b.classList.toggle("u-actif", !repos);
  };

  $("vseg").querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      // Changer de vue change la nature des entrées : l'identité gardée ne
      // correspond plus à rien, et drawVestiaire retombe sur la première.
      vMode = b.dataset.v; vSelId = null;
      $("vseg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      drawVestiaire();
    };
  });
  $("vq").addEventListener("input", () => { vFiltre = $("vq").value; drawVestiaire(); });

  wireCtlEtabli();

  // La gélule « Cadre » : le repli reçoit #roles, l'élément du contrat, par
  // déplacement — ni recréé ni renommé.
  $("cadreBtn").onclick = (e) => {
    e.stopPropagation();
    const p = $("cadrePop");
    if (!p.contains($("roles"))){
      p.innerHTML = "";
      p.appendChild($("roles"));
      const pied = document.createElement("div");
      pied.className = "u-pied";
      pied.textContent = "Un cadre est envoyé en tête du premier message. "
        + "Il ne remplace pas l'agent, il lui dit comment travailler.";
      p.appendChild(pied);
    }
    p.classList.toggle("on");
  };

  // La languette de l'Établi rangé.
  $("languette").onclick = (e) => { e.stopPropagation(); setMode("atelier"); };

  // « Rafraîchir » devient une icône : depuis le jalon 4 les listes écoutent
  // `sessions.changed`. Un bouton plein de 40 px était l'aveu du contraire.
  ["travRefresh", "livRefresh", "projRefresh", "autoRefresh"].forEach((id) => {
    H(id, svg("relancer", { size: 18 }));
  });
  document.querySelectorAll(".u-lo").forEach((el) => {
    el.innerHTML = svg("recherche", { size: 18 });
  });
  $("travRefresh").onclick = drawWorks;
  $("livRefresh").onclick = drawLivrables;
  $("projRefresh").onclick = drawProjets;
  $("autoRefresh").onclick = drawAutos;

  // Travaux charge 50 sessions, Livrables ouvre des dossiers qui en
  // contiennent des centaines. `.search` existait et ne servait qu'au
  // Vestiaire — celui qui en a le moins besoin.
  $("travQ").addEventListener("input", () => {
    travQ = $("travQ").value; drawWorksListe();
  });
  $("livQ").addEventListener("input", () => {
    livQ = $("livQ").value; drawLivListe();
  });
  $("repQ").addEventListener("input", () => {
    repQ = $("repQ").value; drawGlossary();
  });

  // Un clic ailleurs referme les fenêtres volantes. Repris de la maquette.
  document.addEventListener("click", () => {
    document.querySelectorAll(".pop.on").forEach((p) => p.classList.remove("on"));
    Notifs.close();
  });
  document.querySelectorAll(".sheet-bg").forEach((bg) => {
    bg.onclick = (e) => { if (e.target === bg) bg.classList.remove("on"); };
  });

  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (id && id !== current) nav(id);
  });

  loadStatus();
  setInterval(loadStatus, 15000);
  // La mémoire alimente la barre de dette : on la lit une fois au démarrage.
  REST.memory().then((d) => {
    const files = (d && d.builtin_files) || [];
    memoireEtat = { manquants: files.filter((f) => f.exists === false)
      .map((f) => f.name || f.path) };
    majDette();
  }).catch(() => {});

  // On ouvre sur Discuter, à l'accueil : le mot-marque, le champ, rien.
  // Sauf si l'URL désigne déjà une destination — un lien envoyé ne doit pas
  // repasser par la case départ, et il n'y a rien à accueillir dans les
  // Travaux ou les Réglages.
  //
  // Le hash est lu AVANT nav() : nav() l'écrit lui-même, et le relire après
  // ferait croire à un lien profond sur chaque démarrage.
  const demande = location.hash.slice(1);
  nav(demande || "Discuter");
  if (demande && demande !== "Discuter") accueil = false;
  majEtats();
  majInvite();

  /* Comment sait-on que c'est le premier lancement ? Question renvoyée par la
     passe. Tranché : LE MARQUEUR EST CÔTÉ serve.py.

     Les deux autres pistes ne tiennent pas.
     · `localStorage` est exclu — le produit n'en utilise nulle part, et un
       marqueur de page ne survivrait ni à un autre navigateur ni à une
       fenêtre privée : le même poste reverrait l'écran indéfiniment.
     · L'absence des fichiers de mémoire dit AUTRE CHOSE : « le profil n'est
       pas écrit ». La passe s'en sert déjà, et pour un autre cas. Les
       confondre ferait revoir l'accueil à quelqu'un qui garde délibérément un
       profil générique, et le priverait de celui qui a écrit son profil
       depuis la ligne de commande.

     serve.py détient déjà tout ce qui n'appartient pas au navigateur. Le
     marqueur est un fichier à côté de lui, HORS du dossier servi. */
  if (CFG.PREMIER){
    lancerFirst();
  } else {
    link.connect();
    setTimeout(() => $("reply").focus(), 340);
  }
}

boot();
