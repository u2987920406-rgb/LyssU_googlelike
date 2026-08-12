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
  /* ⚠ ON PEUT ÊTRE QUELQUE PART SANS QUE LE MENU LE DISE.
     Si la destination est de niveau 3 et que les coulisses sont repliées,
     AUCUN bouton du rail n'est actif : on est sur un écran que le menu ne
     désigne pas. Quatre chemins y mènent, tous réels — l'ancre d'URL, « Voir
     la mémoire » depuis la dette, « Dépenses » depuis le Terminal, ou les
     avoir refermées à la main. Signalé par Cowork le 2026-08-09.
     La porte s'ouvre donc quand on entre derrière elle. */
  if (p.n === 3) coulisses = true;
  document.querySelectorAll(".panel").forEach((e) => e.classList.remove("on"));
  $("p" + p.id).classList.add("on");
  document.documentElement.style.setProperty("--tint", p.tint);
  drawRail();
  majDette();
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

  /* La porte porte une marque quand le panneau actif est DERRIÈRE elle et
     qu'elle est fermée. `nav()` l'ouvre désormais — mais on peut la refermer
     à la main, et alors le problème revient sans être un bug.

     La marque est `.raildot`, celle des notifications : on ne dessine pas un
     deuxième signe pour dire la même chose, « il y a quelque chose
     là-dedans ». Elle disparaît dès qu'on ouvre — le bouton actif se voit
     alors tout seul. */
  const derriere = !coulisses
    && PANELS.some((p) => p.n === 3 && p.id === current);

  H("railItems",
    PANELS.filter((p) => p.n === 2).map(item).join("")
    + '<div class="rail-div"></div>'
    + '<button class="rail-btn r-porte" id="doorBtn" aria-label="Les coulisses"'
    + ' aria-expanded="' + (coulisses ? "true" : "false") + '"'
    + ' style="color:' + (coulisses ? "var(--muted)" : "var(--faint)") + '">'
    + '<span class="ic" style="transform:rotate(' + (coulisses ? 180 : 0) + "deg);"
    + 'transition:transform .24s cubic-bezier(.2,0,0,1)">' + svg("chevron", { size: 22, w: 1.6 })
    + "</span><span class=\"lbl\">Les coulisses</span>"
    + (derriere ? '<span class="raildot"></span>' : "")
    + "</button>"
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

/* ⚠ `/api/memory` rend `builtin_files` comme un OBJET nom → octets —
   `{"memory": 2263, "user": 1380}` — et NON une liste d'objets
   `[{name, path, exists}]`. Le fixture des tests supposait la seconde forme :
   le code appelait `.filter` sur un objet et levait « files.filter is not a
   function » contre le vrai backend, sans qu'aucun test ne le voie. C'est le
   même défaut que les tests d'apparence sans feuille de style — un faux qui
   ne ment pas comme le vrai ne prouve rien.

   Un fichier VIDE (0 octet) est un fichier non renseigné : c'est ce que la
   dette de profil signale. Un fichier absent du dictionnaire ne s'y distingue
   pas d'un fichier absent du disque — on ne prétend donc pas le savoir. */
function memFichiersApi(d){
  const bf = (d && d.builtin_files) || {};
  if (Array.isArray(bf)) return bf.map((f) => ({ nom: f.name || f.path || String(f),
                                                 octets: f.size, vide: f.exists === false }));
  return Object.keys(bf).map((nom) => ({ nom: nom, octets: bf[nom], vide: !bf[nom] }));
}

function memManquants(d){
  return memFichiersApi(d).filter((f) => f.vide).map((f) => f.nom);
}

/* Où la dette a un objet. Elle vit dans `.stage` : sans ce filtre elle
   s'affiche sur les DIX panneaux et pousse le contenu de chacun. Elle est
   juste — un profil vide rend les réponses vagues — mais dans le Terminal ou
   les Repères, elle parle d'autre chose que ce qu'on est venu faire.
     · Discuter — c'est là qu'on lit la réponse vague ;
     · Réglages — c'est là qu'on la répare.
   Signalé par Cowork le 2026-08-09. */
const DETTE_PANNEAUX = ["Discuter", "Reglages"];

function majDette(){
  const w = $("dettewrap");
  if (!w) return;
  if (current && DETTE_PANNEAUX.indexOf(current) < 0){
    w.innerHTML = "";
    return;
  }
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
/* ═══ LE MODE N'EST PLUS UN MOTEUR, C'EST UNE PERMISSION ════════════════════
   Il valait « pur » (le modèle nu, via /proxy/chat) ou « cowork » (l'agent).
   C'était un détail de transport promu au rang de décision utilisateur — et il
   emportait TOUT au passage : lire un fichier, en écrire un, lancer une
   commande. D'où le constat de kuchu, le 2026-08-12 : *« si l'on ne peut pas
   éditer des fichiers, créer des fichiers, les télécharger, il ne sert à rien,
   strictement à rien. »* Nous étions en train de reconstruire Cowork en moins
   bien.

   Un seul moteur maintenant — Hermès, dans les deux positions. Ce qui change,
   c'est ce que l'agent a le DROIT DE MODIFIER :
     · "plan"  — discuter, lire, chercher, produire. Écrire et exécuter :
                 refusés à la porte d'approbation (voir surApprobation).
     · "build" — tout est autorisé. « Vérif » en est la fin, pas un troisième
                 cran : c'est une phase, pas un choix.

   ⚠ LE MODE NE TOUCHE NI AUX TOOLSETS NI AU SYSTEM PROMPT. Le préfixe pèse
   15 067 tokens (mesuré) et il ne doit pas bouger d'un appel à l'autre, sinon
   le cache saute à chaque bascule — c'est-à-dire à chaque fois qu'on l'utilise.
   Le mode se dit dans le TOUR DE L'UTILISATEUR, après le préfixe.
   Voir PASSE-DESIGN-UN-SEUL-FIL.md §2. */
let mode = "plan";            // plan (Discussion/Plan) | build (Build → Vérif)
let incognito = false;

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

/* Les blocs de code emportables, gardés hors du DOM. Voir turnHTML.
   Clés `<tour>:<rang>` — stables d'une peinture à l'autre. */
const blocsLivrables = new Map();

/* Emporter un livrable. UNE délégation, sur le document — comme pour le volet :
   l'encart vit dans le fil aujourd'hui, il vivra ailleurs demain.

   Les deux espèces réagissent au MÊME geste, et c'est le point : la ligne
   ouvre, le ⤓ emporte. Que les octets soient sur le disque ou dans la réponse
   ne regarde pas la personne qui clique.
     · un fichier du DISQUE — la ligne est prise par ulysse-artifact.js, qui
       écarte `.l-dl` de sa propre délégation ;
     · un bloc de la RÉPONSE — la ligne est prise ici, faute de chemin à lire.
   Seul le ⤓ passe par ce qui suit dans les deux cas. */
document.addEventListener("click", async (e) => {
  if (!e.target.closest) return;
  const item = e.target.closest(".l-item");
  if (!item) return;
  const surDl = e.target.closest(".l-dl");
  if (!surDl){
    // Cliquer la ligne d'un bloc : on le REGARDE. On ne le télécharge pas —
    // un fichier qui arrive sur le disque sans qu'on l'ait demandé est une
    // surprise, et regarder avant d'emporter est l'ordre naturel.
    const f = item.dataset.bloc && blocsLivrables.get(item.dataset.bloc);
    if (f && typeof ouvrirTexteEnMemoire === "function"){
      ouvrirTexteEnMemoire(f.nom, f.contenu);
    }
    return;
  }
  const b = surDl;
  if (item.dataset.bloc){
    const f = blocsLivrables.get(item.dataset.bloc);
    if (f) emporter(f.nom, f.contenu);
  } else if (item.dataset.fichier){
    // Un fichier du disque : on va chercher ses octets là où ils sont.
    const chemin = decodeURIComponent(item.dataset.fichier);
    try {
      const d = await REST.readFile(chemin);
      const txt = decodeDataUrlText(d.data_url || "");
      if (txt === null){
        // Binaire : le data-url est déjà le fichier, on le donne tel quel.
        const a = document.createElement("a");
        a.href = d.data_url; a.download = chemin.split(/[\\/]/).pop();
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        emporter(chemin.split(/[\\/]/).pop(), txt);
      }
    } catch (err){
      snack("Ce fichier n'a pas pu être lu : " + pannePhrase(err));
      return;
    }
  }
  b.classList.add("ok");
  setTimeout(() => b.classList.remove("ok"), 1100);
});

function turnHTML(t){
  // Le refus de mode est un tour système, mais il ne se lit pas comme une
  // note : c'est un geste qui n'a PAS eu lieu, et ça doit se voir d'un coup
  // d'œil quand on remonte le fil pour comprendre pourquoi rien n'a bougé.
  const cls = (t.role === "user" ? "you" : t.role === "assistant" ? "ulysse"
    : t.role === "error" ? "u-err" : "u-sys") + (t.refusMode ? " m-refus" : "");
  let h = '<div class="msg ' + cls + '">';
  if (t.role === "user" || t.role === "assistant"){
    h += '<div class="u-who">' + (t.role === "user"
      ? "Vous" + (t.preamble ? " · cadre « " + esc(t.preamble) + " »" : "")
      : "Ulysse") + "</div>";
  }
  /* ⚠ CE QU'ON A JOINT DOIT RESTER VISIBLE APRÈS L'ENVOI. Les puces vivaient
     au-dessus du composeur et disparaissaient avec lui : une image collée ne
     laissait ensuite AUCUNE trace dans le fil (mesuré : zéro <img>, zéro nom),
     et un `.txt` n'y laissait que sa plomberie, « @file:.hermes/… ».
     Mêmes puces, même forme qu'avant l'envoi — sans le ✕, il n'y a plus rien
     à retirer. Elles viennent AVANT le texte : on a joint, puis on a écrit. */
  if (t.role === "user" && t.jointes && t.jointes.length){
    h += '<div class="u-jointes u-jdit">' + t.jointes.map((j) =>
      '<span class="u-jointe">' + svg("fichier", { size: 15 }) + esc(j.name)
      + '<span class="o">' + esc(j.size ? fmtBytes(j.size) : "joint") + "</span>"
      + "</span>").join("") + "</div>";
  }
  // Les outils AVANT le texte : c'est l'ordre réel d'exécution.
  /* ⚠ LA LIGNE D'OUTIL EST LE LIEN VERS LE FICHIER. Quand `x.path` est là —
     l'agent a lu ou écrit ce fichier, cf. `cheminDeLOutil` — la ligne s'ouvre
     dans le volet. On ne pose PAS de carte en plus : la ligne nomme déjà le
     fichier, et un second signe pour dire la même chose est précisément ce
     qu'on retire partout ailleurs.

     Signalé par kuchu le 2026-08-11 : « montre-moi le contrat d'interface »
     faisait réciter le fichier dans le fil, sans aucun moyen de l'ouvrir —
     « il aurait dû me proposer le lien, c'était plus simple ». La balise
     `[artifact: …]` ne suffit pas : elle dépend de ce que l'agent pense à
     écrire, et il n'y pense pas. */
  if (t.tools && t.tools.length){
    h += '<div class="u-tools">' + t.tools.map((x) =>
      '<div class="u-tool' + (x.state === "done" ? " done" : "")
      + (x.path ? ' ouvrable" data-fichier="' + encodeURIComponent(x.path)
                  + '" role="button" tabindex="0' : "")
      + '"><span class="d"></span>'
      + '<div style="flex:1;min-width:0"><span class="n">' + esc(x.name) + "</span>"
      + (x.path ? '<span class="f-go">Ouvrir ›</span>' : "")
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
  /* ⚠ UN BLOC MUET NE DIT PAS POURQUOI IL SE TAIT. On corrige sa demande en
     plein tour, l'agent repart sur la correction, et le premier bloc « Ulysse »
     reste vide pour toujours. En relisant demain, on voit Ulysse ne rien
     répondre sans savoir que c'est nous qui l'avons coupé.
     La marque se pose tout de suite (tranché par kuchu). Elle ne peut pas
     accuser à tort : une fois la correction envoyée, ce bloc-là ne peut plus
     rien recevoir — voir la note sur `currentAssistantTurn` dans
     ulysse-core.js. */
  /* ⚠ CE N'EST PAS `.u-coupe`. J'avais d'abord écrit cette note avec cette
     classe-là, et elle s'est habillée toute seule en ambre à liseré : `.u-coupe`
     existait déjà pour l'avis de troncature au plafond de tokens — un avis
     RETIRÉ, dont la règle survivait en orphelin. Deux faits différents
     portaient le même habit, et le second héritait du sens du premier.
     Vu à l'écran en éprouvant la correction, pas au banc. */
  if (t.interrompu){
    h += '<div class="u-interrompu">↩ Interrompu par votre correction.</div>';
  }
  if (t.text || t.role !== "assistant" || !(t.tools && t.tools.length)){
    // Catégorie 3 (mauvais affichage) : le markdown de l'agent est rendu
    // (tables, gras, listes...) au lieu d'être affiché en texte brut.
    // Les balises [artifact: ...] y sont remplacées par une carte cliquable
    // (viewer in-app), cf. ulysse-artifact.js.
    /* ⚠ LE CONTENU D'UN FICHIER NE SE DÉROULE PAS DANS LE FIL. « Ça prend de
       la place pour rien, et ce n'est pas là qu'il faut le développer »
       — kuchu, 2026-08-12. Un CSV de 300 lignes enterre la réponse qui
       l'explique ; il se regarde dans le volet, en cliquant sa ligne dans
       l'encart. La MÊME découpe alimente le fil et l'encart : ce qui sort
       d'ici entre forcément là-bas, jamais dans le vide.
       Pendant que ça coule, on ne retire rien — la réponse clignoterait, et
       un bloc encore ouvert n'est pas un fichier. */
    const fini = t.role === "assistant" && t.state !== "streaming"
                 && typeof decouperLivrables === "function";
    let rendu = mdRender(fini ? decouperLivrables(t.text).texte : t.text);
    if (typeof injectArtifacts === "function") rendu = injectArtifacts(rendu);
    /* ⚠ PAS DE CURSEUR SOUS « INTERROMPU ». Le tour reste `streaming` — le
       gateway n'a jamais annoncé sa fin — donc le curseur continuait de
       clignoter JUSTE SOUS la note qui dit qu'on l'a coupé. L'écran disait
       « j'écris » et « je me suis arrêté » l'un au-dessus de l'autre.
       Vu à l'écran en éprouvant la correction. */
    h += "<div class=\"u-md\""
      + (t.state === "streaming" && !t.text && !t.interrompu ? ' data-caret=\"1\"' : "")
      + ">" + rendu + "</div>";
  }
  /* La réponse a été coupée par le plafond. On le dit SOUS le texte, dans la
     bulle : ce n'est pas un événement qui passe, c'est une propriété de cette
     réponse-là, et elle doit rester lisible quand on relit le fil demain.
     En ambre, pas en rouge — ce n'est pas une panne, c'est une limite. Et on
     dit où elle se règle : une limite qu'on ne peut pas trouver est un mur. */
  /* ═══ L'ENCART DES LIVRABLES, À LA FIN DU TOUR ═══════════════════════════
     « J'ai regardé la fin de la discussion, il n'y avait rien. Par contre, en
     plein milieu, il y avait plein de fichiers que je pouvais cliquer. »
     — kuchu, 2026-08-12.

     On lit la réponse en entier, PUIS on veut ce qu'elle a produit. À ce
     moment-là on est en bas. Ce qu'on emporte ne se range donc pas dans la
     phrase qui en parle : ça se range là où on arrive quand on a fini de lire.

     Deux espèces, et elles n'ont pas les mêmes actions :
       · écrit sur le DISQUE (write_file / patch) → Ouvrir dans le volet, ET
         emporter ;
       · écrit dans la RÉPONSE (un bloc de code) → emporter seulement. Il n'y a
         rien à ouvrir tant qu'on ne l'a pas emporté, et un bouton qui n'agit
         pas est pire qu'un bouton absent.

     Voir PASSE-DESIGN-LIVRABLES-DU-TOUR.md. */
  if (t.role === "assistant" && t.state !== "streaming"){
    const surDisque = (t.tools || []).filter((x) => x.path)
      .filter((x, i, tab) => tab.findIndex((y) => y.path === x.path) === i);
    const dansTexte = typeof livrablesDuTexte === "function"
      ? livrablesDuTexte(t.text) : [];
    if (surDisque.length + dansTexte.length){
      const n = surDisque.length + dansTexte.length;
      h += '<div class="l-livrables"><div class="l-titre">' + svg("doc", { size: 15 })
        + "<span>" + n + (n > 1 ? " fichiers produits" : " fichier produit")
        + "</span></div>"
        + surDisque.map((x) => {
            const nom = x.path.split(/[\\/]/).pop();
            const ext = nom.indexOf(".") > 0 ? nom.split(".").pop() : "";
            return '<div class="l-item" data-fichier="' + encodeURIComponent(x.path)
              + '" role="button" tabindex="0">'
              + '<span class="l-type">' + esc((ext || "fic").toUpperCase()) + "</span>"
              + '<span class="l-nom">' + esc(nom) + "</span>"
              + '<span class="l-ou">' + esc(x.path.replace(/[\\/][^\\/]*$/, "")) + "</span>"
              + '<span class="l-actes"><span class="l-ouvrir">Ouvrir</span>'
              + '<button class="l-dl" type="button" title="Télécharger">⤓</button>'
              + "</span></div>";
          }).join("")
        + dansTexte.map((f, k) => {
            /* Le contenu ne passe PAS par un attribut : un CSV de cent lignes
               dans du HTML serait échappé, tronqué à la relecture, et recopié
               à chaque peinture du fil. On le garde ici, et le DOM ne porte
               qu'une clé.
               ⚠ La clé se DÉDUIT du tour et du rang — elle ne se compte pas.
               Un compteur donnerait une clé neuve à chaque peinture, et le fil
               est repeint à chaque frappe : la Map enflerait d'une copie du
               fichier par peinture. `t.key` ne se réutilise jamais, même en
               changeant de conversation. */
            const cle = t.key + ":" + k;
            blocsLivrables.set(cle, f);
            return '<div class="l-item" data-bloc="' + cle + '" role="button" '
              + 'tabindex="0">'
              + '<span class="l-type">' + esc(f.type || "TXT") + "</span>"
              + '<span class="l-nom">' + esc(f.nom) + "</span>"
              + '<span class="l-ou">dans cette réponse · ' + f.lignes + " lignes</span>"
              + '<span class="l-actes"><span class="l-ouvrir">Ouvrir</span>'
              + '<button class="l-dl" type="button" title="Télécharger">⤓</button>'
              + "</span></div>";
          }).join("")
        + "</div>";
    }
  }
  /* ═══ LE PLAN, ET LE BOUTON QUI LE VALIDE ════════════════════════════════
     « Une fois que le plan est établi et que tout paraît cohérent, Hermès de
     lui-même propose un bouton sur lequel l'utilisateur appuierait, ce qui
     validerait aussi que le plan soit bon. » — kuchu, 2026-08-12.

     Appuyer vaut LES DEUX CHOSES : « ce plan me va » et « lance le codage ».
     C'est juste — la validation d'un plan n'a pas d'existence séparée, elle
     se prouve en passant à la suite. Et ce qu'on valide, ce sont les étapes
     AFFICHÉES, pas une intention qu'il aurait fallu croire sur parole.

     Le bouton n'apparaît que si RIEN n'est commencé. Une étape déjà en cours
     ou faite veut dire qu'on n'est plus à valider — proposer de « lancer »
     un travail entamé serait proposer de le recommencer. */
  if (t.plan && t.plan.length){
    const enCours = t.plan.some((e) => e.etat !== "pending" && e.etat !== "cancelled");
    const aValider = !enCours && mode === "plan" && t.state !== "streaming";
    h += '<div class="m-plan"><div class="l-titre">' + svg("noeuds", { size: 15 })
      + "<span>Plan proposé — " + t.plan.length
      + (t.plan.length > 1 ? " étapes" : " étape") + "</span></div>"
      + t.plan.map((e, i) =>
          '<div class="m-etape ' + esc(e.etat) + '"><span class="m-n">'
          + (i + 1) + "</span><span>" + esc(e.contenu) + "</span></div>").join("")
      + (aValider
          ? '<div class="m-pied"><button class="m-bascule" type="button" '
            + 'id="basculeBuild">Build and Vérif ›</button></div>'
          : "")
      + "</div>";
  }
  /* L'avis de troncature `.u-coupe` a été retiré avec le mode pur : il citait
     `PROXY_MAX_TOKENS`, un plafond que seul /proxy/chat appliquait. L'agent,
     lui, ne coupe pas à 4000 tokens — il compacte son contexte et le dit. */
  return h + "</div>";
}

function paintThread(){
  const host = $("thread");
  if (!host) return;
  const scroller = host.closest(".thread") || host;
  const stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 90;

  // UN SEUL FIL. Il y avait deux listes de tours — `pureTurns` et
  // `conv.turns` — et changer de mode changeait de conversation sous les
  // yeux. C'est fini : le mode ne déplace personne.
  const turns = conv.turns;
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
    /* ⚠ « Rien ne sera modifié sur le disque » N'EST JAMAIS VRAI, ET LA PHRASE
       EST PARTIE. Elle s'affichait d'abord sans condition ; on l'a ensuite
       conditionnée à `planGaranti()`, en croyant qu'un réglage « manuel »
       la rendait tenable. Éprouvé le 2026-08-12, accords en manuel : un
       fichier a été écrit et une commande lancée, sans aucune demande
       d'accord (voir `avertissementAccordsHTML` pour les deux lignes du code
       d'Hermès qui l'expliquent). Il n'existe donc aucun réglage sous lequel
       cette promesse soit vraie.
       Une promesse affichée à l'accueil, là où l'on décide de faire confiance,
       doit être vraie ou ne pas être. Celle-là ne pouvait pas être. */
    h += '<div class="u-load">' + (mode === "build"
      ? "Build : l'agent écrit et exécute. La vérification suit le build."
      : "Plan : on discute, on lit, on propose.")
      + "</div>";
  }
  h += turns.map(turnHTML).join("");
  if (conv.status && conv.running){
    h += '<div class="u-load">' + esc(conv.status.text || "…") + "</div>";
  }
  // La demande d'accord se pose EN FIN DE FIL, là où l'agent s'est arrêté.
  // C'est ce qui le bloque : ça ne peut pas vivre seulement dans une cloche.
  h += accordHTML();
  // Et l'avertissement des accords vient APRÈS tout le reste : c'est la
  // dernière chose qu'on lit avant de retaper, donc celle qu'on n'ignore pas.
  h += avertissementAccordsHTML();

  host.innerHTML = h;
  host.querySelectorAll("[data-ch]").forEach((b) => {
    b.onclick = () => repondreAccord(b.dataset.ch);
  });
  /* Le bouton bascule ET relance. Basculer sans rien dire laisserait la
     personne devant un mode changé et un agent qui attend : elle devrait
     retaper « vas-y ». Le message part donc avec, court et explicite. */
  /* Le clic EST l'accord — et il est explicite, parce que ce réglage sort
     d'Ulysse : il vaut pour le terminal d'Hermès et toutes les sessions.
     Ulysse ne l'écrit jamais de lui-même. */
  const am = host.querySelector("#accordsManuel");
  if (am) am.onclick = async () => {
    am.disabled = true;
    try {
      await link.rpc("config.set", { key: "approval_mode", value: "manual" }, 20000);
      await lireModeAccords();
      // Le message disait « le mode Plan tient maintenant sa promesse ». Il ne
      // la tient pas : Hermès ne demande rien pour une écriture ordinaire.
      // On dit ce que le clic a vraiment obtenu, ni plus.
      snack(porteConsultee()
        ? "Accords en manuel — Ulysse est consulté quand Hermès demande."
        : "Le réglage n'a pas pris : les accords restent en « "
          + (modeAccords || "inconnu") + " ».");
    } catch (e){
      am.disabled = false;
      snack("Le réglage des accords n'a pas pu être écrit : " + pannePhrase(e));
    }
  };
  const bb = host.querySelector("#basculeBuild");
  if (bb) bb.onclick = async () => {
    bb.disabled = true;
    setMode2("build");
    await submitPrompt("Le plan est validé. Exécutez-le, puis vérifiez votre "
      + "travail contre le plan.",
      Object.assign({}, roleOpts(), { suffix: ligneDeMode() }));
  };
  if (stick) scroller.scrollTop = scroller.scrollHeight;
  majMention();
  paintHint();
}

function paintHint(){
  /* Une seule occupation, celle de la session. `pureBusy` doublait
     `conv.running` et les deux pouvaient se contredire. Le champ ne se
     verrouille plus : on peut écrire pendant que l'agent travaille — c'est
     `stopBtn` qui prend la main, pas un champ mort. */
  const busy = conv.running;
  $("snd1").style.display = busy ? "none" : "";
  $("stopBtn").style.display = busy ? "" : "none";

  const cadre = activeRole ? " · cadre « " + activeRole.name + " »" : "";
  $("composerHint").textContent = (conv.sessionId
    ? "Session " + conv.sessionId + (conv.info && conv.info.model ? " · " + conv.info.model : "")
    : "Aucune session — elle s'ouvrira au premier message") + cadre;

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

  majLieu();

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
  // Le proxy Hermes (port 8645) : c'est lui que le mode Discussion appelle.
  // Sans lui, Ulysse repond « Le proxy ne repond pas » une fois sur deux.
  const pxKind = proxyState === "ok" ? "ok" : proxyState === "err" ? "err" : "";
  const pxTxt = proxyState === "ok" ? "en marche" : proxyState === "err" ? "arrêté" : "?";
  h += chip(pxKind, "Proxy 8645", pxTxt);

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
let proxyState = "?";       // etat du proxy Hermes (port 8645)
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
  // La classe reste `cowork` : c'est elle que la feuille et les 15 aperçus
  // connaissent, et elle veut toujours dire « l'agent est en jeu ». Il l'est
  // désormais dans les deux modes.
  p.classList.toggle("cowork", true);
  p.classList.toggle("build", mode === "build");
  p.classList.toggle("incog", incognito);
  p.classList.toggle("hs", reseauHS());
}

/* Une brique ne répond plus. Le lien WebSocket est le seul signal qui compte,
   dans LES DEUX modes maintenant : sans lui, l'agent ne reçoit rien. Il n'y a
   plus de mode « le proxy suffit » où son absence serait sans conséquence. */
function reseauHS(){
  if (link.state === "denied" || link.state === "closed") return true;
  return !!(lastStatus && lastStatus.gateway_running === false);
}

/* ═══ Les pièces jointes ═════════════════════════════════════════════════
   Le « + » ouvre le sélecteur du système. Le navigateur n'a pas de chemin
   serveur à donner : il envoie les octets, et le gateway matérialise le
   fichier dans l'espace de la session (file.attach / image.attach_bytes). Ce
   qu'on récupère est une référence « @file:… » que les outils de l'agent
   savent lire — c'est elle qu'on ajoute au message.

   ⚠ UNE SEULE LISTE, DEUX FAÇONS D'EN SORTIR. En Cowork la pièce est
   matérialisée par le gateway et part comme RÉFÉRENCE ; en Discussion il n'y
   a pas de session à nourrir, donc l'image part DANS LE MESSAGE, en contenu
   multimodal — le proxy transmet le corps verbatim
   (`hermes_cli/proxy/server.py`), il ne retire pas un `content` en tableau.
   Ce n'est pas un second chemin pour un même geste : c'est le même geste,
   et ce qu'il y a en face n'est pas la même chose.
   Voir PASSE-DESIGN-CHAT-NON-BLOQUANT.md §4.
   ─────────────────────────────────────────────────────────────────────── */

// {name, ref, image, size, etat:"envoi"|"prete"|"echec", dataUrl}
//   · `ref`     — Cowork : « @file:… », rendu par le gateway ;
//   · `dataUrl` — Discussion : les octets, qui partent dans le message.
// Jamais les deux. Une pièce sait comment elle voyage.
const jointes = [];
// Il n'y a PAS de seconde liste pour les images collees. Elles entrent ici,
// par le meme chemin que le « + » : une image collee est une image jointe.
// Voir PASSE-DESIGN-COLLER-IMAGE.md §1 — le collage avait sa propre mecanique
// (web/captures/ + un marqueur « [capture: chemin] » dans le message), donc
// deux resultats pour un seul geste, et rien a l'ecran pour dire lequel.

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
    // ⚠ DEUX PLAFONDS, PARCE QUE LE GATEWAY EN A DEUX. `image.attach_bytes`
    //    refuse au-delà de 25 Mo (`_ATTACH_BYTES_MAX_BYTES`, server.py:10350)
    //    avec une erreur 4018. Refuser ici à 32 Mo pour une image, c'était
    //    laisser passer une pièce que le gateway allait rejeter — l'écran
    //    aurait dit « envoi… » puis « échec », sans jamais dire pourquoi.
    const image = (f.type || "").indexOf("image/") === 0;
    const plafond = (image ? 25 : 32) * 1024 * 1024;
    if (f.size > plafond){
      snack("« " + f.name + " » fait " + fmtBytes(f.size) + " — au-delà de "
        + fmtBytes(plafond) + (image ? ", la limite des images." : ".")
        + " Passez par les Livrables.");
      continue;
    }
    /* ⚠ UN SEUL CHEMIN POUR JOINDRE. Il y en avait deux : en Discussion les
       octets restaient ici et partaient dans le message, en Cowork ils
       passaient par le gateway. Deux chemins, deux façons d'échouer, et un
       fichier non-image simplement refusé d'un côté.
       Maintenant il y a toujours une session à nourrir : `attacherFichier()`
       fait le travail, image ou pas, dans les deux modes. Joindre n'écrit
       rien dans le projet — c'est une lecture — donc le mode Plan l'autorise
       sans réserve. */
    const j = { name: f.name, ref: "", image: image, size: f.size, etat: "envoi",
                dataUrl: "" };
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

/* ═══ La bascule Plan / Build, sous le composeur ═════════════════════════
   Les deux écrans portent la même, et elles disent la même chose : c'est un
   seul réglage, montré à deux endroits, pas deux réglages à accorder.

   ⚠ « QUASI INVISIBLE », demandé par kuchu le 2026-08-12. On change de mode
   deux fois par heure au plus ; ce qui doit rester sous la main, c'est le
   champ de saisie. Le mode se LIT, il ne s'opère pas. Il ne se montre qu'aux
   trois moments où il compte : quand l'agent propose de basculer, quand un
   refus tombe, et pendant Build → Vérif.
   Voir PASSE-DESIGN-UN-SEUL-FIL.md §5. */

const MODES = { plan: "Plan", build: "Build" };

function setMode2(m){
  if (!MODES[m]) return;
  mode = m;
  document.querySelectorAll(".u-modeseg button").forEach((b) => {
    b.classList.toggle("on", b.dataset.mode === m);
  });
  /* La phase. « Vérif » n'est pas un cran — c'est la fin du build, décidée
     par kuchu : elle s'affiche, elle ne se choisit pas. */
  const mention = $("modeMention");
  if (mention) mention.textContent = mode === "build" ? phaseBuild() : "Plan";
  // Deuxième endroit où la promesse s'écrivait. Même raison de la retirer :
  // aucun réglage ne la rend vraie (voir `avertissementAccordsHTML`).
  const note = mode === "build"
    ? "l'agent écrit et exécute, puis vérifie son travail contre le plan"
    : "on discute, on lit, on propose";
  if ($("modenote1")) $("modenote1").textContent = note;
  majInvite();
  majEtats();
  paintThread();
}

/* Où en est le build. « Vérif » n'est pas un cran du sélecteur — c'est la fin
   du build, et elle s'affiche seule.

   ⚠ ON NE L'INVENTE PAS. Le seul fait qui dise honnêtement « le travail est
   fait, il reste à le contrôler », c'est un plan dont TOUTES les étapes sont
   terminées. Tant qu'il n'y a pas de plan, ou qu'une étape reste ouverte, on
   dit « Build » : une phase inventée serait pire qu'une phase absente. */
function phaseBuild(){
  const p = dernierPlan();
  const fini = p && p.length
    && p.every((e) => e.etat === "completed" || e.etat === "cancelled");
  return fini ? "Vérif" : "Build";
}

/* Le plan le plus récent du fil. C'est celui qui vaut : l'outil `todo` renvoie
   la liste ENTIÈRE à chaque appel, donc le dernier écrase les précédents. */
function dernierPlan(){
  for (let i = conv.turns.length - 1; i >= 0; i--){
    if (conv.turns[i].plan) return conv.turns[i].plan;
  }
  return null;
}

/* La mention suit la phase sans qu'on ait à la rappeler partout : paintThread
   passe ici, et c'est le seul endroit où le fil change. */
function majMention(){
  const m = $("modeMention");
  if (m) m.textContent = mode === "build" ? phaseBuild() : "Plan";
}

/* À l'accueil on demande, ensuite on répond : ce n'est pas la même invite, et
   elle change aux deux moments — au changement de mode ET à la sortie de
   l'accueil. D'où un seul endroit qui l'écrit. */
function majInvite(){
  if (!$("reply")) return;
  $("reply").placeholder = accueil ? "Dites ce que vous aimeriez faire."
    : mode === "build" ? "Répondre…" : "Répondre, ou demander un plan…";
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

/* Collage d'une image dans la box de chat.
   Le presse-papiers ne donne pas de fichier nomme : il donne des octets. On
   les nomme, et on les passe a `surFichiers` — LE MEME chemin que le « + ».
   De la, `attacherFichier` appelle `image.attach`, le gateway materialise
   l'image dans l'espace de la session et rend une reference « @file:… ».

   Ce que ca REMPLACE (PASSE-DESIGN-COLLER-IMAGE.md §1 et §2) : une route
   `/ulysse/capture` qui ecrivait dans `web/captures/` — donc le produit qui
   ecrit dans son propre code — et un marqueur « [capture: C:\chemin ] » qu'on
   ajoutait au message pour le retirer de la bulle a l'affichage. Un texte
   qu'on ajoute et qu'on cache est un texte qui ne devrait pas etre la. */
async function collerCapture(e){
  const items = (e.clipboardData && e.clipboardData.items) || [];
  let blob = null, ext = "png";
  for (const it of items){
    if (it.kind === "file" && it.type && it.type.indexOf("image/") === 0){
      blob = it.getAsFile();
      ext = (it.type.split("/")[1] || "png").replace("+xml", "");
      break;
    }
  }
  if (!blob) return;                 // pas d'image : on laisse le texte passer
  e.preventDefault();                // on gere nous-memes
  /* ⚠ PLUS DE REFUS EN DISCUSSION. Il y en a eu un, le 2026-08-11, justifie
     par « le proxy n'envoie que du texte ». C'ETAIT FAUX : le proxy transmet
     le corps verbatim et ne retire pas un `content` en tableau. Un refus
     preventif interdit un geste qui marche ; `surFichiers` sait maintenant
     garder les octets pour les mettre dans le message.
     Ce que le refus protegeait de vrai — l'ouverture d'une session Cowork
     dans le dos — est traite la-bas, au bon endroit. */
  // Le presse-papiers n'a pas de nom de fichier ; sans nom, la piece jointe
  // s'appellerait « blob ». L'horodatage rend deux collages distinguables.
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  const nom = "capture-" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate())
    + "-" + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + "." + ext;
  await surFichiers([new File([blob], nom, { type: blob.type || ("image/" + ext) })]);
}

async function onSend(ev){
  if (ev) ev.preventDefault();
  const input = $("reply");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  // Le premier message ouvre la session : c'est la seule attente qui soit
  // vraie, et elle a son compteur.
  if (accueil) attendreOuverture();
  /* Le cadre de rôle part vers le moteur, mais le fil affiche ce que la
     personne a RÉELLEMENT écrit : lui relire une consigne qu'elle n'a pas
     rédigée brouille la lecture de son propre fil. `ligneDeMode()` suit la
     même règle — elle part, elle ne s'affiche pas.

     ⚠ CE COMMENTAIRE ÉTAIT FAUX PENDANT UN JOUR. Les deux étaient collés dans
     `text`, donc dans le texte AFFICHÉ : chaque tour montrait une deuxième
     bulle « [Mode Plan : …] », et un fichier joint s'écrivait en clair
     « @file:.hermes/desktop-attachments/note-releve.txt ». Vu en jouant un
     scénario, pas au banc. Ils passent maintenant par `suffix`, qui a le même
     contrat que `preamble` : ça part, ça ne s'affiche pas.
     Ce qu'on a joint se voit — en puces, dans la bulle, comme avant l'envoi. */
  const puces = jointes.map((j) => ({ name: j.name, image: !!j.image, size: j.size }));
  await submitPrompt(text, Object.assign({}, roleOpts(), {
    suffix: refsJointes() + ligneDeMode(),
    jointes: puces
  }));
  viderJointes();
}

/* La ligne de cadre : ce qui dit a lagent ou lon en est.

   ⚠ ELLE PART DANS LE TOUR DE LUTILISATEUR, JAMAIS DANS LE SYSTEM PROMPT.
   Le prefixe pese 15 067 tokens (mesure le 2026-08-12) et le cache ne tient
   que sil ne bouge pas dun appel a lautre. Lecrire dans le system prompt
   serait plus simple et invaliderait le cache A CHAQUE BASCULE — la
   simplicite y serait payee en argent. Un tour utilisateur vient APRES le
   prefixe : il ne casse rien. Cout mesurable : une quinzaine de tokens.

   Elle ne suffit pas, et elle na pas a suffire : la porte dapprobation
   applique le mode meme si le modele oublie la consigne. Une garantie qui
   repose sur la bonne volonte du modele nest pas une garantie.
   Voir PASSE-DESIGN-UN-SEUL-FIL.md §2 et §3. */
function ligneDeMode(){
  return mode === "build"
    ? "\n\n[Mode Build : vous pouvez écrire et exécuter. Vérifiez ensuite votre"
      + " travail contre le plan.]"
    : "\n\n[Mode Plan : ne modifiez rien sur le disque. Lisez, cherchez,"
      + " proposez. Posez le plan avec l'outil todo.]";
}

/* --- L'Établi : les fichiers, à côté du fil ------------------------------ */

let etabliPath = null;

function setMode(m){
  $("work").classList.toggle("atelier", m === "atelier");
  if (m === "atelier") drawEtabli();
}

/* Ouvrir l'Établi SUR un dossier. C'est le retour du fil d'Ariane du volet :
   l'Établi et le volet sont le même volet à deux moments — parcourir, puis
   regarder. On doit pouvoir revenir au dossier sans refermer le fichier. */
function ouvrirEtabliSur(dossier){
  etabliPath = dossier || null;
  setMode("atelier");
  drawEtabli();
}

/* L'en-tête de l'Établi porte un `.ctl` — le bloc de contrôles de volet de la
   maquette, qui apparaît au survol. Il était dans le HTML et VIDE : l'Établi
   ne pouvait se refermer que depuis le kebab, c'est-à-dire ailleurs que là où
   on le regarde. On le remplit de sa croix. */
function wireCtlEtabli(){
  const host = $("ctlEtabli");
  if (!host) return;
  /* ⚠ L'ÉTABLI ÉTAIT LE SEUL PANNEAU SANS BOUTON DE RELECTURE. Les Travaux,
     les Livrables, les Projets et les Automatisations en ont un depuis
     toujours (`travRefresh`, `livRefresh`, `projRefresh`, `autoRefresh`) ;
     lui n'avait qu'une croix. Or c'est le panneau qui vieillit le PLUS VITE :
     l'agent écrit des fichiers pendant qu'on le regarde.
     Signalé par l'usage le 2026-08-11 — kuchu ne voyait pas un fichier que
     je venais d'écrire, et rien à l'écran ne permettait de redemander. */
  host.innerHTML = '<button id="etabliRefresh" aria-label="Relire le dossier" '
    + 'title="Relire le dossier">' + svg("relancer", { size: 17 }) + "</button>"
    + '<button id="etabliClose" aria-label="Fermer l\'Établi" '
    + 'title="Fermer l\'Établi">' + svg("fermer", { size: 18 }) + "</button>";
  $("etabliRefresh").onclick = () => drawEtabli();
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
    H("files", '<div class="u-todo">Lecture impossible : ' + esc(pannePhrase(e)) + "</div>");
  }
}

function wireFileRows(hostId, onDir){
  const host = $(hostId);
  host.querySelectorAll("[data-dir]").forEach((r) => { r.onclick = () => onDir(r.dataset.dir); });
  host.querySelectorAll("[data-file]").forEach((r) => {
    r.onclick = () => showFile(r.dataset.file, r.querySelector(".nm").textContent);
  });
}

/* Montrer un fichier — L'ÉTABLI, LES LIVRABLES ET LE FIL PASSENT TOUS ICI, et
   d'ici dans le volet. Cette fonction ouvrait une modale (#sFile) : le fond
   s'assombrissait et la conversation disparaissait, alors qu'un clic sur une
   carte du fil ouvrait, lui, un volet. Deux écrans pour un seul objet, et
   lequel apparaissait dépendait de l'endroit où l'on avait cliqué.

   Assombrir le fond veut dire « finissez ceci d'abord ». Lire un document
   n'exige rien. Voir PASSE-DESIGN-FICHIERS.md §1.

   `#sFile` / `fileBody` / `fClose` sont SORTIS de ulysse.html le 2026-08-12,
   avec l'accord du contrat. Ils y étaient restés un jour de plus que leur
   utilité : on ne sort pas du contrat au détour d'une passe. */
function showFile(path, name){
  return ouvrirFichier(path, name || (path || "").split(/[\\/]/).pop());
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
/* ⚠ QUAND IL Y A UN PLAN, C'EST LUI QU'ON SUIT — pas la trace des outils.
   « Lorsqu'un plan est lancé, on peut suivre le plan car il apparaît dans
   Plan, on voit le graph node. » — kuchu, 2026-08-12.

   Les deux sont légitimes, mais ils ne disent pas la même chose : le plan dit
   CE QU'ON A DÉCIDÉ DE FAIRE, la liste d'outils dit CE QUI S'EST PASSÉ. Quand
   l'agent a posé un plan avec `todo`, c'est celui-là qu'on veut voir avancer —
   les vingt lectures de fichiers qu'il a fallu pour l'étape 2 sont du bruit à
   cette échelle. Sans plan, on retombe sur la trace : mieux vaut le journal
   que rien.

   La famille (donc la couleur) vient de l'ÉTAT, pas du nom : une étape de plan
   n'est ni une lecture ni une écriture, c'est une intention. */
function etapesReelles(){
  const plan = dernierPlan();
  if (plan && plan.length){
    return plan.map((e, i) => ({
      n: i + 1,
      t: e.contenu,
      d: e.etat === "completed" ? "terminée"
        : e.etat === "in_progress" ? "en cours"
        : e.etat === "cancelled" ? "abandonnée" : "à faire",
      result: "",
      ms: null,
      pct: e.etat === "completed" ? 100 : e.etat === "in_progress" ? 50 : 0,
      team: e.etat === "completed" ? "lire"
        : e.etat === "in_progress" ? "executer" : null
    }));
  }
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
    H("works", '<div class="u-todo">Lecture impossible : ' + esc(pannePhrase(e)) + "</div>");
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
    setMode2("build");
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
    H("livrables", '<div class="u-todo">Lecture impossible : ' + esc(pannePhrase(e)) + "</div>");
  }
}

/* ═══ Où ce fil travaille ════════════════════════════════════════════════
   La barre de titre ne disait RIEN du dossier de travail. « Travailler ici »
   posait `CFG.SESSION_CWD`, affichait un message six secondes, et plus rien
   après — puis le fil annonçait « j'ai écrit dans ulysse.html ». Où ça ?

   ⚠ ET LE CAS QUE PERSONNE N'AVAIT VU. `CFG.SESSION_CWD` est le dossier de la
   PROCHAINE session ; `conv.info.cwd` celui de la session EN COURS. Cliquer
   « Travailler ici » pendant qu'un fil est ouvert change le premier, pas le
   second. On croyait avoir déménagé, on écrivait encore à l'ancienne adresse.

   Ce cas-là ne demande AUCUN appel : c'est une comparaison entre deux
   variables que la page a déjà.
   ─────────────────────────────────────────────────────────────────────── */

function memeChemin(a, b){
  const n = (x) => String(x || "").replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
  return n(a) === n(b);
}

/* ⚠ ON N'APPELLE PAS `projects.for_cwd`, ET C'EST VOULU.
   La passe de design était bâtie autour de lui. Deux mesures contre Hermès en
   marche l'ont écarté, dans cet ordre :

   1. Il NE DIT PAS « je ne sais pas ». Pour un dossier qu'il ne trouve pas —
      ou sans `cwd` du tout — il REMPLACE silencieusement la demande par le
      dossier courant du serveur et répond sur celui-là. Interrogé sur
      « D:/nulle-part-du-tout », il a rendu le projet du dossier d'Ulysse.
      Il fallait donc comparer le `cwd` rendu à celui qu'on avait demandé.

   2. Puis, en vérifiant que `conv.info.cwd` existait vraiment : **`info`
      porte déjà `project`**. La session dit elle-même dans quel projet elle
      est — `{id, slug, name, primary_path}`, ou `null` hors de tout projet.
      Constaté sur trois dossiers.

   Une session ne peut pas se tromper sur elle-même. On lit donc `info`, et
   l'appel — avec son piège, son cache par chemin et sa comparaison — n'a plus
   lieu d'être. Le piège reste épinglé dans `test_reel.py` : il est vrai, et
   il attend quiconque se servira de `for_cwd` un jour.

   Il ne manque que la COULEUR : `info.project` porte l'identité, pas
   l'apparence. Elle vient de `projects.list`, lu une fois. */
const PROJ_COULEURS = new Map();
let projCouleursLues = false;

async function chargerCouleurs(){
  if (projCouleursLues || link.state !== "open") return;
  projCouleursLues = true;
  try {
    const d = await link.rpc("projects.list", {});
    ((d && d.projects) || []).forEach((p) => {
      if (p && p.id) PROJ_COULEURS.set(p.id, { color: p.color, icon: p.icon });
    });
  } catch (e){
    projCouleursLues = false;         // on retentera : une couleur n'est pas
  }                                   // une information, seulement un repère
}

/* Le projet de CE fil, tel que la session le dit — enrichi de sa couleur si
   on la connaît. Aucune supposition : pas de projet, pas de gélule colorée. */
function projetDuFil(){
  const p = (conv.info && conv.info.project) || null;
  if (!p || !p.id) return null;
  const a = PROJ_COULEURS.get(p.id) || {};
  return { id: p.id, name: p.name, color: a.color || null, icon: a.icon || null };
}

function geluleLieu(){
  const enCours = (conv.info && conv.info.cwd) || null;
  const prochain = CFG.SESSION_CWD || null;

  /* Le garde « pas de lieu en mode Chat » a été retiré avec le mode pur.
     Il existait parce que le Chat n'ouvrait aucune session : `conv.info.cwd`
     ne venait jamais et la gélule annonçait indéfiniment un dossier à venir
     (signalé par kuchu le 2026-08-09, capture à l'appui).
     Les deux modes ouvrent maintenant une session, donc le lieu est réel dans
     les deux — et il compte AUTANT en Plan : c'est le dossier qu'on lit pour
     bâtir le plan. */

  // Tant que la session n'est pas ouverte, on ignore où elle ira.
  if (!enCours){
    return '<button class="l-lieu attente" id="lieuBtn">'
      + '<span class="ic"></span><span class="nm">dossier en attente</span></button>';
  }

  const p = projetDuFil();
  const nom = p ? (p.name || nomDeChemin(enCours)) : nomDeChemin(enCours);
  const ic = p && p.color
    ? '<span class="ic" style="background:' + esc(p.color) + '">'
      + svg(p.icon || "dossier", { size: 12 }) + "</span>"
    : '<span class="ic">' + svg("dossier", { size: 12 }) + "</span>";

  // Deux dossiers à la fois : le seul moment où la gélule prend de la place,
  // et le seul où il le faut.
  if (prochain && !memeChemin(prochain, enCours)){
    return '<button class="l-lieu change" id="lieuBtn">'
      + ic + '<span class="nm">' + esc(nom) + "</span>"
      + '<span class="fl">' + svg("suivant", { size: 14 }) + "</span>"
      + '<span class="nm suite">' + esc(nomDeChemin(prochain)) + "</span></button>";
  }
  return '<button class="l-lieu ' + (p ? "projet" : "dossier") + '" id="lieuBtn">'
    + ic + '<span class="nm">' + esc(nom) + "</span></button>";
}

function repliLieu(){
  const enCours = (conv.info && conv.info.cwd) || null;
  const prochain = CFG.SESSION_CWD || null;

  if (!enCours){
    return '<div class="pop l-pop" id="lieuPop">'
      + '<div class="tt">La session s’ouvrira au premier message. Son dossier '
      + "sera celui que vous avez choisi dans Projets, ou celui d’Hermès.</div>"
      + '<div class="acts"><button class="btn-pick" data-lieu="projets">'
      + "Voir les Projets</button></div></div>";
  }
  if (prochain && !memeChemin(prochain, enCours)){
    return '<div class="pop l-pop" id="lieuPop">'
      + '<div class="tt"><b>Ce fil travaille encore ici :</b></div>'
      + '<div class="ch">' + esc(enCours) + "</div>"
      + '<div class="tt" style="margin-top:12px"><b>Le prochain s’ouvrira ici :</b></div>'
      + '<div class="ch">' + esc(prochain) + "</div>"
      + '<div class="tt">Un fil ne change pas de dossier en cours de route — '
      + "l’agent y a déjà lu et écrit.</div>"
      + '<div class="acts"><button class="btn-pick" data-lieu="nouveau">'
      + "Ouvrir un fil là-bas</button>"
      + '<button class="quiet-link" data-lieu="annuler">Rester ici</button></div></div>';
  }
  const p = projetDuFil();
  return '<div class="pop l-pop" id="lieuPop">'
    + '<div class="tt">' + (p
        ? "Ce fil appartient à un projet. Ce qu’Ulysse y écrit reste dans son dossier."
        : "Ce dossier n’est pas rangé en projet. Il n’a ni nom propre, ni couleur.")
    + "</div>"
    + '<div class="ch">' + esc(enCours) + "</div>"
    + '<div class="acts">'
    + (p ? "" : '<button class="btn-pick" data-lieu="ranger">En faire un projet</button>')
    + '<button class="quiet-link" data-lieu="projets">Voir dans Projets</button>'
    + "</div></div>";
}

function majLieu(){
  const hote = $("lieuSlot");
  if (!hote) return;
  const g = geluleLieu();
  if (!g){ H("lieuSlot", ""); return; }   // mode Chat : pas de lieu du tout
  H("lieuSlot", g + repliLieu());
  const pop = $("lieuPop"), bouton = $("lieuBtn");
  if (bouton) bouton.onclick = (e) => {
    e.stopPropagation();
    if (pop) pop.classList.toggle("on");
  };
  hote.querySelectorAll("[data-lieu]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      if (pop) pop.classList.remove("on");
      const q = b.dataset.lieu;
      if (q === "projets") return nav("Projets");
      if (q === "ranger") return ouvrirRanger((conv.info && conv.info.cwd) || "");
      if (q === "annuler"){
        // « Rester ici » remet le dossier de la prochaine session sur celui du
        // fil ouvert : c'est ce que « rester » veut dire, et sans ça le
        // prochain fil partirait quand même ailleurs.
        CFG.SESSION_CWD = (conv.info && conv.info.cwd) || "";
        majLieu();
        return snack("Le prochain fil s’ouvrira dans le même dossier que celui-ci.");
      }
      if (q === "nouveau"){ resetSession(); accordRepondu = null; majLieu(); }
    };
  });

  // Les couleurs arrivent APRÈS le dessin : la barre ne doit pas attendre le
  // réseau pour dire où l'on est. Le nom, lui, est déjà là — il vient de la
  // session. Une couleur qui manque ne cache rien, elle ne décore pas.
  const p = (conv.info && conv.info.project) || null;
  if (p && p.id && !PROJ_COULEURS.has(p.id) && !projCouleursLues){
    chargerCouleurs().then(() => { if (current === "Discuter") majLieu(); });
  }
}

/* ═══ Projets ════════════════════════════════════════════════════════════
   Ce panneau groupait les sessions par `cwd` — il montrait des DOSSIERS, et
   son commentaire disait « Hermès n'a pas de notion de projet ». Ce n'est
   plus vrai : `projects.tree` est la liste qui fait autorité, et c'est elle
   qu'on lit maintenant.

   ⚠ MAIS ELLE MÊLE TROIS ESPÈCES, et deux n'ont ni nom propre, ni couleur,
   ni identifiant à soi. Vérifié contre Hermès en marche le 2026-08-09 :

     · le VRAI projet      — nom, couleur, icône, id ; renommable, archivable.
                             `projects.list` en rendait ZÉRO chez kuchu.
     · le DOSSIER DÉDUIT   — `isAuto`. Son id EST son chemin. Lui proposer
                             « renommer » ou « archiver » afficherait une
                             commande qui n'agit pas (STU-1). Son seul geste
                             propre : en faire un projet.
     · « Home »            — `isNoProject`. Ce n'est pas un lieu, c'est le
                             RESTE. Lui donner l'apparence d'une carte en
                             ferait un projet qu'on ne peut ni régler ni
                             supprimer. D'où une ligne en pied de liste.

   Trois apparences, donc, et non une étiquette sur trois cartes identiques :
   la différence doit se lire AVANT les actions.
   ─────────────────────────────────────────────────────────────────────── */

/* Ce qui remplace `.warnbox`.

   La maquette y écrivait « ce qu'un projet apprend n'en sort jamais tout
   seul ». C'est FAUX : `agent/learning_mutations.py:30` — les mémoires
   vivent dans `<hermes_home>/memories/MEMORY.md` et `USER.md`, deux fichiers
   globaux, sans aucune dimension projet.

   On ne l'affiche donc pas. Mais SE TAIRE NE SUFFIT PAS : quelqu'un qui voit
   des projets séparés suppose que ce qu'il y dit y reste. Le silence
   laisserait croire exactement ce que la phrase disait. On dit l'inverse. */
function noteProjets(){
  return '<div class="warnbox">' + svg("boussole", { size: 22 })
    + "<span>Un projet range <b>un dossier et ses conversations</b>. "
    + "En revanche, <b>ce qu'Ulysse retient est commun à tous</b> : la mémoire "
    + "est un seul fichier, elle ne se cloisonne pas par projet.</span></div>";
}

/* La couleur d'un vrai projet vient d'Hermès. Celle qu'on invente pour un
   dossier déduit viendrait de nous — donc on n'en invente pas : sa pastille
   reste grise et vide, et c'est ce qui le distingue au premier coup d'œil. */
const PROJ_COL = ["#1A73E8", "#9334E6", "#E8710A", "#00838F", "#D96570", "#188038"];
function teinteProjet(cle){
  let n = 0;
  for (let k = 0; k < cle.length; k++) n = (n * 31 + cle.charCodeAt(k)) >>> 0;
  return PROJ_COL[n % PROJ_COL.length];
}

function nomDeChemin(p){
  return (p || "").split(/[\\/]/).filter(Boolean).pop() || (p || "");
}

/* `b` est-il STRICTEMENT à l'intérieur de `a` ? Les séparateurs se mélangent
   dans les réponses d'Hermès — `C:\…\Desktop` d'un côté, `C:/…/Desktop/freeB`
   de l'autre, dans la MÊME réponse. On normalise avant de comparer. */
function dansLeDossier(a, b){
  const n = (x) => String(x || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const p = n(a), q = n(b);
  return !!p && !!q && q !== p && q.startsWith(p + "/");
}

/* ── LES DOSSIERS DE TRAVAIL D'UN PROJET ────────────────────────────────
   ⚠ CE N'EST PAS `repos`. La passe supposait « repos, ou bien les cwd des
   sessions ». Mesuré contre Hermès en marche le 2026-08-09 : `repos` donne
   les RACINES GIT, pas les dossiers de travail. Il aurait dit « freeB » là
   où kuchu travaille en réalité dans `freeB\hermes-bridge`, et il aurait
   manqué `Projet Ulysse\web` — 58 sessions — entièrement, puisque ce n'est
   pas une racine git.

   C'est donc la seconde branche qui tient : les `cwd` des sessions, que
   `projects.project_sessions` rend en entier pour un projet. */
const PROJ_DEDANS = new Map();
const projDedansEnCours = new Set();

async function chargerDedans(id, chemin){
  if (!id || PROJ_DEDANS.has(id) || projDedansEnCours.has(id)) return false;
  if (link.state !== "open") return false;
  projDedansEnCours.add(id);
  try {
    const d = await link.rpc("projects.project_sessions", { project_id: id });
    // Les sessions sont enfouies dans project → repos → groups → sessions.
    // On descend sans supposer la profondeur : c'est le `cwd` qu'on cherche,
    // pas un chemin d'accès dans l'objet.
    const vus = new Map();
    const creuse = (o) => {
      if (Array.isArray(o)) return o.forEach(creuse);
      if (!o || typeof o !== "object") return;
      if (typeof o.cwd === "string" && o.cwd) vus.set(o.cwd, (vus.get(o.cwd) || 0) + 1);
      Object.keys(o).forEach((k) => creuse(o[k]));
    };
    creuse(d);
    PROJ_DEDANS.set(id, [...vus.entries()]
      .filter(([c]) => dansLeDossier(chemin, c))
      .map(([c, n]) => ({ chemin: c, sessions: n }))
      .sort((a, b) => b.sessions - a.sessions));
  } catch (e){
    // On ne sait pas. La ligne n'apparaîtra pas — et ne rien proposer ne
    // prétend rien, alors qu'annoncer « aucun » serait une affirmation.
    PROJ_DEDANS.set(id, []);
  } finally {
    projDedansEnCours.delete(id);
  }
  return true;
}

function carteProjetVrai(p){
  const col = p.color || teinteProjet(p.id || p.label || "");
  const n = p.sessionCount || 0;
  return '<div class="pcard" data-cle="' + esc(p.path || p.id || "") + '"'
    + ' data-pid="' + esc(p.id || "") + '">'
    + '<div class="top">'
    + '<span class="j-ic" style="background:' + esc(col) + '22;color:' + esc(col) + '">'
    + svg(p.icon || "dossier", { size: 17 }) + "</span>"
    + '<span class="nm">' + esc(p.label || nomDeChemin(p.path)) + "</span>"
    + '<span class="chip">' + n + " session" + (n > 1 ? "s" : "") + "</span>"
    + '<span class="sp"></span>'
    + '<span class="meta">' + esc(fmtWhen(p.lastActive)) + "</span>"
    // Trois actions, et « archiver » n'existe QUE sur un vrai projet : un
    // dossier déduit n'a pas d'identifiant à archiver.
    + '<div class="acts">'
    + '<button data-a="regler" title="Régler la mémoire et les accords">'
    + svg("regler", { size: 19 }) + "</button>"
    + '<button data-a="chemin" title="Copier le chemin du dossier">'
    + svg("copier", { size: 19 }) + "</button>"
    + '<button data-arch-id="' + esc(p.id || "") + '" title="Archiver ce projet">'
    + svg("boucle", { size: 19 }) + "</button></div>"
    + "</div>"
    + '<div class="iso">'
    + "<span>" + svg("bac", { size: 17 }) + " "
    + esc(p.path || "dossier de lancement d'Hermès") + "</span>"
    + '<span class="relaunch"><button class="rbtn" data-cwd="' + esc(p.path || "") + '">'
    + svg("relancer", { size: 18 }) + "Travailler ici</button></span>"
    + "</div>"
    + dedansHTML(p)
    + "</div>";
}

/* Les dossiers absorbés, dans leur parent — c'est là qu'on les cherche.
   Sans cette ligne, ranger un dossier parent serait un aller simple depuis
   l'écran : le sous-dossier disparaît de la liste, donc plus de bouton pour
   le ranger à son tour. Hermès savait défaire ; il ne manquait que ceci. */
const projDeplies = new Set();

/* On repose la ligne DANS la carte existante, sans redessiner le panneau.
   Redessiner referait `projects.list` et `projects.tree` — deux appels pour
   ajouter une ligne, à chaque fois qu'un projet finit de charger, et la
   liste sauterait sous les doigts. */
function majDedans(p){
  const hote = $("projets");
  if (!hote) return;
  const carte = hote.querySelector('.pcard[data-pid="' + (p.id || "") + '"]');
  if (!carte) return;
  const ancien = carte.querySelector(".j-dedans");
  const ancienneListe = carte.querySelector(".j-sous");
  if (ancien) ancien.remove();
  if (ancienneListe) ancienneListe.remove();
  carte.insertAdjacentHTML("beforeend", dedansHTML(p));
  brancherDedans(p);
}

function brancherDedans(p){
  const carte = $("projets").querySelector('.pcard[data-pid="' + (p.id || "") + '"]');
  if (!carte) return;
  const b = carte.querySelector("[data-deplier]");
  if (b) b.onclick = (ev) => {
    ev.stopPropagation();
    if (projDeplies.has(p.id)) projDeplies.delete(p.id); else projDeplies.add(p.id);
    majDedans(p);
  };
  carte.querySelectorAll(".j-sous [data-ranger]").forEach((r) => {
    r.onclick = (ev) => { ev.stopPropagation(); ouvrirRanger(r.dataset.ranger); };
  });
}

function dedansHTML(p){
  const dedans = PROJ_DEDANS.get(p.id);
  if (!dedans || !dedans.length) return "";      // rien dedans, ou on ne sait pas
  const ouvert = projDeplies.has(p.id);
  const n = dedans.length;
  return '<button class="j-dedans' + (ouvert ? " on" : "") + '"'
    + ' data-deplier="' + esc(p.id) + '" aria-expanded="' + (ouvert ? "true" : "false") + '">'
    + '<span class="c">' + svg("chevron", { size: 16 }) + "</span>"
    + "Contient <b>" + n + " dossier" + (n > 1 ? "s" : "") + "</b> où vous avez "
    + "travaillé</button>"
    + (ouvert
        ? '<div class="j-sous">'
          + dedans.map((s) =>
              '<div class="r"><span class="ic">' + svg("dossier", { size: 16 }) + "</span>"
              + '<span class="tx"><span class="nm">' + esc(nomDeChemin(s.chemin)) + "</span>"
              + '<span class="ch">' + esc(s.chemin) + "</span></span>"
              + '<span class="meta">' + s.sessions + " session"
              + (s.sessions > 1 ? "s" : "") + "</span>"
              + '<button class="btn-pick" data-ranger="' + esc(s.chemin) + '">'
              + "En faire un projet</button></div>").join("")
          + '<div class="j-rien" style="padding:8px 2px 2px">Un dossier rangé à '
          + "son tour reprend ses conversations. Rien n’est perdu dans "
          + "l’opération.</div></div>"
        : "");
}

/* ⚠ Aucune action de PROJET ici. Son id est son chemin : « renommer » et
   « archiver » n'auraient rien à quoi s'appliquer, et il faudrait cliquer
   pour comprendre pourquoi. */
function carteProjetDeduit(p){
  const n = p.sessionCount || 0;
  return '<div class="pcard j-auto" data-cle="' + esc(p.path || p.id || "") + '">'
    + '<div class="top">'
    + '<span class="j-ic j-vide">' + svg("dossier", { size: 17 }) + "</span>"
    + '<span class="nm">' + esc(p.label || nomDeChemin(p.path || p.id)) + "</span>"
    + '<span class="chip">' + n + " session" + (n > 1 ? "s" : "") + "</span>"
    + '<span class="sp"></span>'
    + '<span class="meta">' + esc(fmtWhen(p.lastActive)) + "</span>"
    + acts([{ a: "chemin", ic: "copier", t: "Copier le chemin du dossier" }])
    + "</div>"
    + '<div class="iso">'
    + "<span>" + svg("bac", { size: 17 }) + " "
    + esc(p.path || p.id || "") + "</span>"
    + '<span class="relaunch">'
    + '<button class="btn-pick" data-ranger="' + esc(p.path || p.id || "") + '">'
    + svg("plus", { size: 17 }) + "En faire un projet</button>"
    + '<button class="rbtn" data-cwd="' + esc(p.path || p.id || "") + '">'
    + svg("relancer", { size: 18 }) + "Travailler ici</button></span>"
    + "</div></div>";
}

/* ═══ Ranger un dossier en projet ════════════════════════════════════════
   ⚠ `projects.create` N'ÉCRIT RIEN SUR LE DISQUE. Il insère une ligne en
   base et enregistre des chemins (`hermes_cli/projects_db.py:322`). « Créer
   un projet » laissait donc croire qu'on fabrique un dossier : on en DÉSIGNE
   un, qui existe déjà. Tout le vocabulaire suit.

   On n'ouvre cette feuille QUE depuis un dossier déjà connu. Il n'y a donc
   pas de bouton « Choisir… » — il faudrait un explorateur de fichiers, et un
   bouton qui ouvre le vide est un bouton mort (STU-1). Le jour où l'on
   voudra partir d'un dossier quelconque, ce sera une passe à soi.
   ─────────────────────────────────────────────────────────────────────── */

/* ── Choisir un dossier ─────────────────────────────────────────────────
   Il manquait, et son absence bloquait deux choses : « Ranger un dossier en
   projet » depuis la barre, et le rangement d'un dossier IMBRIQUÉ. Ce
   second cas est arrivé pour de vrai : kuchu a rangé `Desktop`, ses
   sous-dossiers ont disparu de la liste (un projet réclame tout son
   sous-arbre), et il n'avait plus aucun moyen de ranger `Projet Ulysse`.
   Hermès le permettait — `project_for_path` prend le plus long préfixe —
   mais l'écran, non.

   On ne dessine RIEN de neuf : c'est le navigateur des Livrables, mêmes
   `.row`, même fil d'Ariane. Un explorateur qui ne ressemble pas à celui
   d'à côté est un second explorateur à apprendre.

   Seule différence, et elle est nécessaire : **les fichiers sont montrés
   mais éteints**. Les cacher ferait croire à un dossier vide ; les rendre
   cliquables proposerait de ranger un fichier en projet, ce qui n'a pas de
   sens. On les montre, en gris, sans action. */
async function feuilleChoisirDossier(depart, choisi){
  let ici = depart || "";

  const dessiner = async () => {
    feuilleProjet("Quel dossier ?",
      '<div class="sub" style="color:var(--muted);margin-bottom:14px">'
      + "Le dossier doit exister. Ulysse n’en crée aucun — il en désigne un."
      + "</div>"
      + '<div class="crumbs" id="ranFil"></div>'
      + '<div class="u-load" id="ranList">Lecture…</div>'
      + '<div class="j-acts"><button class="validate" id="ranPrendre"></button>'
      + '<span class="sp"></span>'
      + '<button class="txt-btn" id="ranAnnuler">Annuler</button></div>');

    H("ranFil", livFil(ici));
    $("ranFil").querySelectorAll("[data-cr]").forEach((b) => {
      b.onclick = () => { ici = b.dataset.cr; dessiner(); };
    });
    const prendre = $("ranPrendre");
    prendre.textContent = "Lecture…";
    prendre.disabled = true;
    $("ranAnnuler").onclick = fermerProjet;

    let d;
    try {
      d = await REST.files(ici || undefined);
    } catch (e){
      H("ranList", '<div class="u-todo">Lecture impossible : ' + esc(pannePhrase(e)) + "</div>");
      prendre.textContent = "Choisissez un dossier";
      return;
    }
    /* ⚠ SANS CHEMIN, `/api/files` NE REND PAS « la racine » : il rend le
       dossier personnel (vérifié — `path` vaut `C:\Users\<vous>`). Le bouton
       doit donc parler du dossier RÉELLEMENT à l'écran, pas d'un chemin vide.
       Sinon il dirait « choisissez un dossier » alors qu'on en regarde un. */
    const reel = (d && d.path) || ici;
    prendre.textContent = reel ? "Ranger « " + nomDeChemin(reel) + " »"
                               : "Choisissez un dossier";
    prendre.disabled = !reel;
    prendre.onclick = () => { if (reel) choisi(reel); };
    H("ranFil", livFil(reel));
    $("ranFil").querySelectorAll("[data-cr]").forEach((b) => {
      b.onclick = () => { ici = b.dataset.cr; dessiner(); };
    });
    const tout = (d && d.entries) || [];
    const haut = (d && d.parent !== null && d.parent !== undefined && d.path)
      ? '<div class="row" data-dir="' + esc(d.parent) + '"><span class="ic">'
        + svg("retour", { size: 18 }) + '</span><span class="nm">.. dossier parent</span>'
        + '<span class="sp"></span></div>'
      : "";
    const lignes = tout.map((f) => {
      const dir = f.is_directory || f.is_dir || f.type === "dir";
      return '<div class="row"' + (dir ? ' data-dir="' + esc(f.path) + '"' : "")
        + (dir ? "" : ' style="opacity:.45"') + ">"
        + '<span class="ic">' + svg(dir ? "dossier" : "fichier", { size: 18 }) + "</span>"
        + '<span class="nm">' + esc(f.name) + "</span>"
        + '<span class="sp"></span>'
        + '<span class="meta">' + (dir ? "dossier" : "fichier") + "</span></div>";
    }).join("");
    H("ranList", haut + (lignes || '<div class="u-load">Aucun sous-dossier ici. '
      + "Vous pouvez ranger ce dossier tel quel.</div>"));
    $("ranList").querySelectorAll("[data-dir]").forEach((r) => {
      r.onclick = () => { ici = r.dataset.dir; dessiner(); };
    });
  };

  await dessiner();
}

function feuilleProjet(titreTxt, corps){
  H("projetBody", "<h2>" + esc(titreTxt) + "</h2>" + corps);
  $("sProjet").classList.add("on");
  return $("projetBody");
}

function fermerProjet(){ $("sProjet").classList.remove("on"); }

function ligneTrois(ic, nom, texte){
  return '<div class="l"><span class="ic">' + svg(ic, { size: 18 }) + "</span>"
    + '<span><span class="nm">' + esc(nom) + "</span>"
    + '<span class="tx">' + esc(texte) + "</span></span></div>";
}

async function ouvrirRanger(chemin){
  let couleur = teinteProjet(chemin);
  const nom = nomDeChemin(chemin);

  const corps = (etat) =>
    '<div class="sub" style="color:var(--muted);margin-bottom:20px">'
    + "Le dossier existe déjà et ne bouge pas. Un projet lui donne un nom, une "
    + "couleur, et rassemble ses conversations.</div>"

    + '<div class="j-champ"><span class="lb">Quel dossier</span>'
    + '<span class="ai">C’est là qu’Ulysse lit et écrit. Rien n’y sera créé ni '
    + "déplacé.</span>"
    + '<div class="j-in"><span class="ic">' + svg("dossier", { size: 18 }) + "</span>"
    + '<span class="j-chemin" style="flex:1">' + esc(chemin) + "</span>"
    // Le bouton n'existait pas tant qu'aucun explorateur ne l'attendait :
    // un bouton qui ouvre le vide est un bouton mort.
    + '<button class="btn-pick" data-jp="choisir">Choisir…</button></div>'
    + etat
    + "</div>"

    + '<div class="j-champ"><span class="lb">Comment l’appeler</span>'
    + '<span class="ai">Par défaut, le nom du dossier. Il se change.</span>'
    + '<div class="j-in"><span class="ic">' + svg("doc", { size: 18 }) + "</span>"
    + '<input id="jNom" value="' + esc(nom) + '" autocomplete="off"></div></div>'

    + '<div class="j-champ"><span class="lb">Sa couleur</span>'
    + '<span class="ai">Pour le reconnaître d’un coup d’œil dans la liste.</span>'
    + '<div class="j-cols">' + PROJ_COL.map((c) =>
        '<button class="j-col' + (c === couleur ? " on" : "") + '"'
        + ' style="background:' + c + '" data-col="' + c + '"'
        + ' aria-label="Couleur ' + esc(c) + '"></button>').join("")
    + "</div></div>"

    // Ce qu'on fabrique — et ce qu'on ne fabrique PAS. La troisième ligne est
    // celle qui manquait : la mémoire n'est pas cloisonnée, et le taire
    // laisserait croire le contraire.
    + '<div class="seth">Ce que ça change<span class="l"></span></div>'
    + '<div class="j-trois">'
    + ligneTrois("bac", "Le dossier devient le sien",
        "L’agent y travaille. Aucun fichier n’est créé, déplacé ni copié.")
    + ligneTrois("chat", "Ses conversations se regroupent",
        "Celles qui ont eu lieu dans ce dossier, et celles à venir.")
    + ligneTrois("boussole", "La mémoire, elle, reste commune",
        "Ce qu’Ulysse retient ici sert partout ailleurs. Elle ne se cloisonne "
        + "pas par projet.")
    + "</div>"

    + '<div class="j-acts">'
    + '<button class="validate" data-jp="creer">Ranger en projet</button>'
    + '<span class="sp"></span>'
    + '<button class="txt-btn" data-jp="fermer">Annuler</button></div>';

  // On ouvre AVANT de savoir ce que le dossier contient : la feuille ne doit
  // pas attendre une lecture de disque pour paraître. L'état arrive après.
  const att = '<div class="j-etat flou"><span class="pt">'
    + svg("points", { size: 16 }) + "</span><span>Lecture du dossier…</span></div>";
  const hote = feuilleProjet("Ranger un dossier en projet", corps(att));

  const brancher = () => {
    hote.querySelectorAll("[data-col]").forEach((b) => {
      b.onclick = () => {
        couleur = b.dataset.col;
        hote.querySelectorAll("[data-col]").forEach((x) =>
          x.classList.toggle("on", x.dataset.col === couleur));
      };
    });
    hote.querySelectorAll("[data-jp]").forEach((b) => {
      b.onclick = () => {
        if (b.dataset.jp === "fermer") return fermerProjet();
        if (b.dataset.jp === "choisir"){
          // On repart du dossier courant : changer d'avis ne doit pas
          // renvoyer à la racine.
          return feuilleChoisirDossier(chemin, (neuf) => ouvrirRanger(neuf));
        }
        rangerEnProjet(chemin, hote, couleur, b);
      };
    });
  };
  brancher();

  // Ce que le dossier contient déjà. On ne le devine pas — et quand on n'a
  // pas pu le lire, on le DIT plutôt que de rassurer à tort.
  let etat;
  try {
    const d = await REST.files(chemin);
    const tout = (d && d.entries) || [];
    const n = tout.length;
    etat = n
      ? '<div class="j-etat plein"><span class="pt">' + svg("alerte", { size: 16 })
        + "</span><span><b>Ce dossier contient déjà " + n + " élément"
        + (n > 1 ? "s" : "") + ".</b> Ulysse pourra les lire, et écrire à côté. "
        + "Rien n’est effacé — mais un dossier occupé est un dossier où une "
        + "erreur se voit moins.</span></div>"
      : '<div class="j-etat vide"><span class="pt">' + svg("coche", { size: 16 })
        + "</span><span>Ce dossier est vide.</span></div>";
  } catch (e){
    etat = '<div class="j-etat flou"><span class="pt">' + svg("alerte", { size: 16 })
      + "</span><span>Le contenu du dossier n’a pas pu être lu ("
      + esc(e.message) + "). Rien n’empêche de le ranger — on ne sait "
      + "simplement pas ce qu’il contient.</span></div>";
  }
  /* ⚠ LE TROISIÈME ÉTAT DU CHAMP, et c'est celui qui manquait à kuchu.
     Un projet réclame tout son SOUS-ARBRE : ranger `Desktop` a fait
     disparaître `Projet Ulysse` et `freeB` de la liste. Rien n'était perdu —
     mais rien ne l'avait dit, et on croit avoir perdu.

     On NOMME donc ceux qui vont être absorbés, et on donne l'issue : la
     dernière phrase n'est pas un adoucissement, c'est ce qui rend
     l'avertissement utile. Elle n'est vraie que grâce à la ligne repliable
     de la carte — les deux tiennent ensemble.

     Les candidats sont les dossiers DÉDUITS de `projects.tree` qui tombent
     à l'intérieur : ce sont exactement ceux qui disparaîtront de la liste. */
  try {
    const arbre = await link.rpc("projects.tree", {});
    const avales = ((arbre && arbre.projects) || [])
      .filter((q) => q.isAuto === true && !q.isNoProject
        && dansLeDossier(chemin, q.path || q.id));
    if (avales.length){
      const noms = avales.map((q) => "<i>" + esc(q.label || nomDeChemin(q.path)) + "</i>");
      etat += '<div class="j-etat plein"><span class="pt">'
        + svg("alerte", { size: 16 }) + "</span><span><b>Ce dossier en contient "
        + (avales.length > 1 ? avales.length + " que vous avez déjà utilisés"
                             : "un que vous avez déjà utilisé")
        + "</b> — " + noms.join(" et ") + ". "
        + (avales.length > 1 ? "Ils rejoindront" : "Il rejoindra")
        + " ce projet, et " + (avales.length > 1 ? "sortiront" : "sortira")
        + " de la liste. <b>Vous pourrez "
        + (avales.length > 1 ? "les" : "l’") + "en ressortir depuis sa carte</b>, "
        + "quand vous voudrez.</span></div>";
    }
  } catch (e){
    // On ne sait pas ce qu'il contient : on n'annonce rien plutôt que de
    // promettre à tort qu'il ne contient rien.
  }

  if (!$("sProjet").classList.contains("on")) return;   // refermée entre-temps
  const garde = hote.querySelector("#jNom");
  const saisi = garde ? garde.value : null;
  H("projetBody", "<h2>Ranger un dossier en projet</h2>" + corps(etat));
  // La feuille est réécrite : on rend ce qui avait déjà été tapé, sinon on
  // efface sous les doigts de quelqu'un en train d'écrire.
  const neuf = hote.querySelector("#jNom");
  if (neuf && saisi !== null) neuf.value = saisi;
  brancher();
}

/* ── Archiver, et non « mettre à la corbeille » ──────────────────────────
   ⚠ `archive` pose un drapeau, `restore` le retire, et **RIEN N'EXPIRE** :
   le drapeau est posé à un seul endroit et retiré à un seul autre, aucune
   tâche ne purge (`projects_db.py:570`). « Trente jours » aurait donc été une
   promesse qu'Hermès ne tient pas — et « corbeille » suggère une échéance
   même sans la nommer.

   `projects.tree` masque les archivés (`project_tree.py:569`) ;
   `projects.list` les rend tous, avec leur drapeau. C'est donc `list` qui
   sert ici, et `tree` pour la liste ordinaire. */
let projArchives = false;

/* La barre du panneau. Le compte n'est affiché QUE s'il y en a : « Archivés
   · 0 » se lit comme un chiffre qu'on aurait oublié de retirer. Et
   « Ranger » disparaît dans la vue des archivés — on n'y range rien. */
function majBarreProjets(combien){
  const t = $("trashBtn");
  if (t){
    H("trashBtn", svg("boucle", { size: 18 }) + " Archivés"
      + (combien ? " · " + combien : ""));
    t.classList.toggle("on", projArchives);
  }
  const n = $("newProj");
  if (n) n.style.display = projArchives ? "none" : "";
}

function feuilleArchiver(p){
  feuilleProjet("Archiver « " + p.name + " » ?",
    '<div class="j-trois" style="margin-top:14px">'
    + ligneTrois("boucle", "Il sort de la liste",
        "Et il revient quand vous voulez, depuis les Archivés. Sans limite de "
        + "temps : rien n’expire.")
    + ligneTrois("dossier", "Votre dossier n’est pas touché",
        (p.primary_path || "Le dossier") + " reste exactement comme il est. "
        + "Ulysse ne supprime aucun de vos fichiers.")
    + ligneTrois("chat", "Les conversations restent dans Travaux",
        "Elles perdent leur rattachement au projet, pas leur contenu.")
    + "</div>"
    + '<div class="j-acts">'
    + '<button class="validate" data-ja="oui">Archiver</button>'
    + '<span class="sp"></span>'
    + '<button class="txt-btn" data-ja="non">Annuler</button></div>');
  brancherArchive(p, "archive");
}

/* Supprimer est DÉFINITIF et en cascade (`delete_project`). On ne le propose
   que depuis les Archivés — après un premier geste, donc — et on redemande. */
function feuilleSupprimer(p){
  feuilleProjet("Supprimer « " + p.name + " » définitivement ?",
    '<div class="j-trois" style="margin-top:14px">'
    + ligneTrois("alerte", "Celui-là ne revient pas",
        "Son nom, sa couleur et ses dossiers sont effacés de la base d’Hermès. "
        + "Archiver se défait ; ceci, non.")
    + ligneTrois("dossier", "Votre dossier n’est toujours pas touché",
        (p.primary_path || "Le dossier") + " reste exactement comme il est.")
    + ligneTrois("chat", "Les conversations restent dans Travaux",
        "Elles ne sont rattachées à plus rien, c’est tout.")
    + "</div>"
    + '<div class="j-acts">'
    + '<button class="dangerlink" data-ja="oui">Supprimer définitivement</button>'
    + '<span class="sp"></span>'
    + '<button class="txt-btn" data-ja="non">Annuler</button></div>');
  brancherArchive(p, "delete");
}

function brancherArchive(p, quoi){
  $("projetBody").querySelectorAll("[data-ja]").forEach((b) => {
    b.onclick = async () => {
      if (b.dataset.ja === "non") return fermerProjet();
      b.disabled = true;
      try {
        if (quoi === "archive") await link.rpc("projects.archive", { id: p.id });
        else await link.rpc("projects.delete", { id: p.id });
        fermerProjet();
        snack(quoi === "archive"
          ? "« " + p.name + " » est archivé. Votre dossier n’a pas bougé."
          : "« " + p.name + " » est supprimé. Votre dossier n’a pas bougé.");
        drawProjets();
      } catch (e){
        snack("Hermès a refusé : " + String(e.message).slice(0, 140));
        b.disabled = false;
      }
    };
  });
}

async function remettreProjet(p){
  try {
    // Le MÊME appel, avec `restore` : le retour en arrière n'est pas une
    // autre route, c'est la même dans l'autre sens.
    await link.rpc("projects.archive", { id: p.id, restore: true });
    snack("« " + p.name + " » est de retour dans la liste.");
    drawProjets();
  } catch (e){
    snack("Hermès a refusé : " + String(e.message).slice(0, 140));
  }
}

async function rangerEnProjet(chemin, hote, couleur, bouton){
  const champ = hote.querySelector("#jNom");
  const nom = (champ && champ.value || "").trim();
  if (!nom){
    snack("Un projet a besoin d’un nom. Hermès refuse un nom vide.");
    if (champ) champ.focus();
    return;
  }
  bouton.disabled = true;
  try {
    // projects.create — tui_gateway/server.py:11388. `primary_path` entre
    // dans l'ensemble des dossiers et devient le principal.
    await link.rpc("projects.create", {
      name: nom, primary_path: chemin, folders: [chemin], color: couleur
    });
    fermerProjet();
    snack("« " + nom + " » est rangé en projet. Le dossier n’a pas bougé.");
    if (current === "Projets") drawProjets();
  } catch (e){
    // On relaie ce qu'Hermès dit — un nom vide, un dossier illisible. Une
    // phrase à nous inventerait une cause.
    snack("Hermès a refusé : " + String(e.message).slice(0, 140));
    bouton.disabled = false;
  }
}

async function drawProjets(){
  H("projets", '<div class="u-load">Chargement…</div>');

  /* `projects.tree` est un RPC sur la WebSocket, pas un appel REST : si le
     lien n'est pas ouvert, on le DIT plutôt que d'afficher une liste vide,
     qui se lirait « vous n'avez aucun projet ». Et on redessine dès qu'il
     s'ouvre, sans que personne ait à recharger. */
  if (link.state !== "open"){
    H("projets", "<div class=\"u-todo\">Le lien avec Hermès n’est pas ouvert ("
      + esc(link.reason || link.state) + "). La liste des projets vient de lui.</div>");
    if (link.state === "connecting" || link.state === "idle"){
      const repasser = (etat) => {
        if (etat !== "open") return;
        link.stateListeners.delete(repasser);
        if (current === "Projets") drawProjets();
      };
      link.onState(repasser);
    }
    return;
  }

  // Les archivés : `projects.tree` ne les montre pas, `projects.list` si.
  let archives = [];
  try {
    archives = (((await link.rpc("projects.list", {})) || {}).projects || [])
      .filter((p) => p && p.archived);
  } catch (e){
    archives = [];                    // on ne sait pas : on n'annoncera aucun
  }                                   // compte plutôt qu'un compte faux

  if (projArchives){
    H("projets", archives.length
      ? '<div class="trashnote">' + svg("boucle", { size: 20 })
        + "<span>Un projet archivé sort de la liste, et <b>rien d’autre</b>. "
        + "Il revient quand vous voulez, <b>sans limite de temps</b> — et son "
        + "dossier n’a jamais été touché.</span></div>"
        + archives.map((p) =>
            '<div class="pcard gone" data-arch="' + esc(p.id) + '"><div class="top">'
            + '<span class="j-ic" style="background:' + esc(p.color || "#9AA0A6") + '22;color:'
            + esc(p.color || "#9AA0A6") + '">' + svg(p.icon || "dossier", { size: 17 })
            + "</span>"
            + '<span class="nm">' + esc(p.name) + "</span>"
            + '<span class="sp"></span>'
            + '<div class="acts" style="opacity:1">'
            + '<button class="dangerlink" data-arch-a="purger">Supprimer définitivement</button>'
            + '<button class="txt-btn" data-arch-a="remettre">Remettre</button></div>'
            + "</div>"
            + '<div class="iso"><span>' + svg("bac", { size: 17 }) + " "
            + esc(p.primary_path || "") + "</span></div></div>").join("")
      : '<div class="empty"><div class="big">Aucun projet archivé.</div>'
        + "<div>Un projet archivé se retrouve ici, sans limite de temps.</div></div>");
    majBarreProjets(archives.length);
    $("projets").querySelectorAll("[data-arch-a]").forEach((b) => {
      b.onclick = () => {
        const carte = b.closest("[data-arch]");
        const p = archives.find((x) => x.id === carte.dataset.arch);
        if (!p) return;
        if (b.dataset.archA === "remettre") return remettreProjet(p);
        feuilleSupprimer(p);
      };
    });
    return;
  }

  try {
    const d = await link.rpc("projects.tree", {});
    const tout = (d && d.projects) || [];

    /* LE TRI QUI PORTE TOUT LE PANNEAU. Deux drapeaux, trois piles — et
       aucune supposition : une entrée qui ne dit rien d'elle-même tombe
       dans « vrai projet », l'espèce qui reçoit le plus d'actions. C'est le
       mauvais défaut. On exige donc `isAuto === false` explicitement. */
    const home = tout.filter((p) => p.isNoProject === true);
    const deduits = tout.filter((p) => !p.isNoProject && p.isAuto === true);
    const vrais = tout.filter((p) => !p.isNoProject && p.isAuto !== true);

    if (!tout.length){
      H("projets", '<div class="empty"><div class="big">Aucun dossier de travail.</div>'
        + "<div>Il s'en créera un dès la première conversation dans un dossier.</div></div>");
      return;
    }

    let h = noteProjets();

    // Section 1 — les vrais projets. Vide chez kuchu aujourd'hui, et c'est le
    // cas que tout le monde verra le premier jour : elle dit comment se remplir.
    h += '<div class="seth">Vos projets<span class="l"></span></div>';
    h += vrais.length
      ? vrais.map(carteProjetVrai).join("")
      : "<div class=\"j-rien\">Aucun pour l’instant. Un projet se fabrique à "
        + "partir d'un dossier où vous avez déjà travaillé — ci-dessous.</div>";

    // Section 2 — les dossiers déduits. La section dit ce qu'ils ne sont pas,
    // AVANT que l'absence d'actions ne le montre.
    if (deduits.length){
      h += '<div class="seth">Dossiers où vous avez travaillé<span class="l"></span></div>'
        + "<div class=\"j-rien\">Ulysse les reconnaît à vos conversations. Ils n’ont "
        + "ni nom, ni couleur, ni réglages tant qu'ils ne sont pas rangés en "
        + "projet.</div>"
        + deduits.map(carteProjetDeduit).join("");
    }

    // « Home » n'est pas une carte : c'est le reste.
    home.forEach((p) => {
      const n = p.sessionCount || 0;
      h += '<div class="j-home">' + svg("chat", { size: 17 })
        + "<span><b>" + n + " conversation" + (n > 1 ? "s" : "") + "</b> "
        + (n > 1 ? "n'appartiennent" : "n'appartient") + " à aucun dossier. "
        + (n > 1 ? "Elles restent" : "Elle reste") + " dans Travaux.</span>"
        + '<button class="quiet-link" data-voir="travaux">Les voir</button></div>';
    });

    H("projets", h);
    majBarreProjets(archives.length);

    // Archiver ne se propose que sur un VRAI projet : un dossier déduit n'a
    // pas d'identifiant à archiver, et « Home » n'est pas un projet.
    $("projets").querySelectorAll("[data-arch-id]").forEach((b) => {
      b.onclick = (ev) => {
        ev.stopPropagation();
        const p = vrais.find((x) => x.id === b.dataset.archId);
        if (p) feuilleArchiver({ id: p.id, name: p.label || nomDeChemin(p.path),
                                 primary_path: p.path });
      };
    });

    /* ⚠ « TRAVAILLER ICI » NE FERME PLUS LE FIL OUVERT.
       Il appelait `resetSession()` d'abord — ce qui vide `conv.turns` : la
       conversation en cours disparaissait de l'écran, **sans un mot**. Et
       comme le fil s'en allait, il ne restait rien dont le dossier puisse
       diverger : l'état « deux dossiers à la fois » était INATTEIGNABLE.

       Signalé par kuchu le 2026-08-09 — la gélule ambre ne venait jamais.
       Mon test la « prouvait » en posant les deux variables à la main : il
       vérifiait le dessin, pas le fait qu'on puisse y arriver. C'est le
       piège que cette session dénonce depuis le matin, et j'y suis tombé.

       On pose donc le dossier, et on garde le fil. L'écart devient visible
       dans la gélule, et « Ouvrir un fil là-bas » — dans son repli — fait la
       fermeture EXPLICITEMENT, comme un choix nommé. */
    $("projets").querySelectorAll("[data-cwd]").forEach((b) => {
      b.onclick = () => {
        const chemin = b.dataset.cwd;
        const filOuvert = !!(conv.info && conv.info.cwd);
        CFG.SESSION_CWD = chemin;
        // Rien à garder : on repart propre, comme avant.
        if (!filOuvert){ resetSession(); accordRepondu = null; }
        nav("Discuter");
        majLieu();
        snack(filOuvert
          ? "Le prochain fil s’ouvrira dans " + (chemin || "le dossier d’Hermès")
            + ". Celui-ci continue là où il est."
          : "Dossier de travail : " + (chemin || "celui d’Hermès")
            + " — la prochaine session s’y ouvrira.");
      };
    });
    $("projets").querySelectorAll("[data-voir]").forEach((b) => {
      b.onclick = () => nav("Travaux");
    });
    $("projets").querySelectorAll("[data-ranger]").forEach((b) => {
      b.onclick = (ev) => { ev.stopPropagation(); ouvrirRanger(b.dataset.ranger); };
    });
    vrais.forEach((p) => brancherDedans(p));

    /* Ce que contient chaque projet se demande APRÈS le dessin : la liste ne
       doit pas attendre autant d'allers-retours qu'elle a de projets. Chaque
       réponse repose SA ligne dans SA carte — pas de redessin du panneau. */
    vrais.forEach((p) => {
      if (p.id && !PROJ_DEDANS.has(p.id)){
        chargerDedans(p.id, p.path).then((eu) => {
          if (eu && current === "Projets") majDedans(p);
        });
      }
    });
    wireActs("projets", (a, carte) => {
      if (a === "chemin") return copier(carte.dataset.cle, "Le chemin");
      ouvrirReglages(1);             // « Ce qu'Ulysse sait » — la mémoire
    });
  } catch (e){
    H("projets", '<div class="u-todo">Lecture impossible : ' + esc(pannePhrase(e)) + "</div>");
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
    corps += '<div class="u-todo">Tâches planifiées illisibles : ' + esc(pannePhrase(e)) + "</div>";
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
    corps += '<div class="u-todo">Webhooks illisibles : ' + esc(pannePhrase(e)) + "</div>";
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
        + esc(pannePhrase(e)) + "</div>");
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
/* ═══ Écrire dans la mémoire ═════════════════════════════════════════════
   « Rien ne disparaît d'un geste » — la doctrine de la maquette, appliquée à
   un geste qu'elle n'avait pas nommé. Trois gestes, trois risques : créer ne
   perd rien, compléter non plus, remplacer perd ce qui était là. */

/* Un vrai diff par lignes, pas une comparaison de longueurs. C'est ce que
   quelqu'un lit AVANT d'écraser une mémoire : s'il est faux, tout le reste
   de cet écran ment.

   Plus longue sous-suite commune, en table. Les fichiers de mémoire font
   quelques centaines de lignes — la table O(n·m) y est instantanée, et sa
   justesse se relit, ce qui vaut mieux qu'une heuristique ici. On borne tout
   de même, et on le DIT plutôt que de rendre un diff faux en silence. */
const DIFF_MAX_LIGNES = 4000;

/* `"".split("\n")` rend `[""]` — UNE ligne vide, pas zéro. Sans ça, remplir
   un fichier vide affichait « 1 ligne retirée », c'est-à-dire une perte qui
   n'a pas lieu. Et `"a\n".split("\n")` rend `["a", ""]` : le saut de ligne
   final n'est pas une ligne de plus, il termine la dernière. */
function enLignes(t){
  if (!t) return [];
  const l = t.split("\n");
  if (l.length && l[l.length - 1] === "") l.pop();
  return l;
}

function diffLignes(avant, apres){
  const a = enLignes(avant), b = enLignes(apres);
  if (a.length > DIFF_MAX_LIGNES || b.length > DIFF_MAX_LIGNES){
    return { trop: true, lignes: [], moins: 0, plus: 0, egales: 0 };
  }
  // c[i][j] = longueur de la plus longue sous-suite commune de a[i:] et b[j:]
  const c = [];
  for (let i = 0; i <= a.length; i++) c.push(new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--){
    for (let j = b.length - 1; j >= 0; j--){
      c[i][j] = a[i] === b[j] ? c[i + 1][j + 1] + 1
        : Math.max(c[i + 1][j], c[i][j + 1]);
    }
  }
  const lignes = [];
  let i = 0, j = 0, moins = 0, plus = 0, egales = 0;
  while (i < a.length && j < b.length){
    if (a[i] === b[j]){ lignes.push(["rien", a[i]]); egales++; i++; j++; }
    else if (c[i + 1][j] >= c[i][j + 1]){ lignes.push(["moins", a[i]]); moins++; i++; }
    else { lignes.push(["plus", b[j]]); plus++; j++; }
  }
  while (i < a.length){ lignes.push(["moins", a[i++]]); moins++; }
  while (j < b.length){ lignes.push(["plus", b[j++]]); plus++; }
  return { trop: false, lignes: lignes, moins: moins, plus: plus, egales: egales };
}

/* On montre ce qui change, et on annonce ce qu'on ne déroule pas. Une longue
   étendue inchangée n'apprend rien ; la cacher sans le dire ferait croire que
   le fichier est court. */
function diffHTML(d){
  if (d.trop){
    return '<div class="u-todo">Ce fichier est trop long pour être comparé ligne '
      + "à ligne ici (plus de " + DIFF_MAX_LIGNES + " lignes). L'écriture reste "
      + "possible, et la version d'avant sera gardée — mais vous ne verriez pas "
      + "ce qui change, alors on ne le prétend pas.</div>";
  }
  const CONTEXTE = 3;
  const garde = d.lignes.map((l, k) => {
    if (l[0] !== "rien") return true;
    for (let v = Math.max(0, k - CONTEXTE); v <= Math.min(d.lignes.length - 1, k + CONTEXTE); v++){
      if (d.lignes[v][0] !== "rien") return true;
    }
    return false;
  });
  let html = "", saut = 0;
  d.lignes.forEach(([k, t], idx) => {
    if (!garde[idx]){ saut++; return; }
    if (saut){
      html += '<div class="coupe">' + saut + " ligne" + (saut > 1 ? "s" : "")
        + " inchangée" + (saut > 1 ? "s" : "") + ", non dépliée"
        + (saut > 1 ? "s" : "") + ".</div>";
      saut = 0;
    }
    html += '<div class="l ' + k + '"><span class="g">'
      + (k === "moins" ? "−" : k === "plus" ? "+" : " ") + "</span>"
      + (t ? esc(t) : " ") + "</div>";
  });
  if (saut){
    html += '<div class="coupe">' + saut + " ligne" + (saut > 1 ? "s" : "")
      + " inchangée" + (saut > 1 ? "s" : "") + " à la fin.</div>";
  }
  return '<div class="u-bilan" style="margin-top:16px">'
    + '<span class="moins">' + d.moins + " ligne" + (d.moins > 1 ? "s" : "")
    + " retirée" + (d.moins > 1 ? "s" : "") + "</span>"
    + '<span class="plus">' + d.plus + " ajoutée" + (d.plus > 1 ? "s" : "") + "</span>"
    + "<span>" + d.egales + " inchangée" + (d.egales > 1 ? "s" : "") + "</span></div>"
    + '<div class="u-diff">' + (html || '<div class="coupe">Aucune différence.</div>')
    + "</div>";
}

/* Les trois fichiers de mémoire. `GET /api/memory` ne rend que des NOMS
   (`["memory", "user"]`) — pas de chemin, pas de taille. Le chemin se
   reconstitue avec `hermes_home`, que `/api/status` expose vraiment ; la
   taille et le nombre de lignes se lisent avec `/api/fs/read-text`.
   Rien n'est supposé : un fichier qu'on n'a pas pu lire le dit. */
const MEM_FICHIERS = [
  { n: "USER.md", quoi: "Qui vous êtes, ce que vous faites, comment vous voulez qu'on vous parle." },
  { n: "MEMORY.md", quoi: "Ce qu'Ulysse a retenu de vos échanges, au fil du temps." },
  { n: "SOUL.md", quoi: "Ce qu'il s'autorise et ce qu'il refuse.", verrou: true }
];

let memLus = {};

function memChemin(nom){
  const home = lastStatus && lastStatus.hermes_home;
  return home ? home.replace(/[\\/]+$/, "") + "\\" + nom : null;
}

async function drawMemFiles(){
  const hote = $("uMemFiles");
  if (!hote) return;
  if (!memChemin("USER.md")){
    hote.innerHTML = '<div class="u-todo">Le dossier d\'Hermès n\'est pas encore '
      + "connu — <code>/api/status</code> n'a pas répondu. Rien n'est affiché "
      + "plutôt qu'un chemin deviné.</div>";
    return;
  }
  await Promise.all(MEM_FICHIERS.map(async (f) => {
    const chemin = memChemin(f.n);
    try {
      const r = await REST.readText(chemin);
      memLus[f.n] = { texte: r.text || "", octets: r.byteSize || 0,
                      lignes: (r.text || "").split("\n").length, existe: true };
    } catch (e){
      // 404 = le fichier n'existe pas encore : c'est une CRÉATION, pas une
      // panne. Toute autre erreur se dit telle quelle.
      memLus[f.n] = { existe: false, souci: /404|not found/i.test(e.message) ? null : e.message };
    }
  }));
  hote.innerHTML = MEM_FICHIERS.map(memFichierHTML).join("");
  hote.querySelectorAll("[data-mf]").forEach((btn) => {
    btn.onclick = () => ouvrirEcriture(btn.dataset.mf, btn.dataset.mode);
  });
}

function memFichierHTML(f){
  const l = memLus[f.n] || {};
  let sous = f.quoi;
  if (l.existe) sous += " · " + fmtBytes(l.octets) + " · " + l.lignes + " lignes";
  else if (l.souci) sous += " · illisible : " + l.souci;
  else sous += " · n'existe pas encore";
  return '<div class="u-mfile' + (f.verrou ? " u-verrou" : "") + '">'
    + '<span class="ic">' + svg(l.existe ? "fichier" : "plus", { size: 20 }) + "</span>"
    + '<span class="tx"><span class="nm">' + esc(f.n) + "</span>"
    + '<span class="sub">' + esc(sous) + "</span></span>"
    + '<span class="act">'
    + (f.verrou
        ? '<span class="u-cadenas">' + svg("coffre", { size: 15 }) + "Protégé</span>"
          + '<button class="btn-pick" data-mf="' + esc(f.n) + '" data-mode="verrou">'
          + "En savoir plus</button>"
        : '<button class="btn-pick" data-mf="' + esc(f.n) + '" data-mode="'
          + (l.existe ? "remplacer" : "creer") + '">'
          + (l.existe ? "Remplacer" : "Créer") + "</button>")
    + "</span></div>";
}

function feuilleEcrire(titreTxt, corps){
  H("ecrireBody", "<h2>" + esc(titreTxt) + "</h2>" + corps);
  $("sEcrire").classList.add("on");
  return $("ecrireBody");
}

function fermerEcriture(){ $("sEcrire").classList.remove("on"); }

function niveauHTML(k, t, texte){
  return '<div class="u-niv-l ' + k + '"><span class="pt">'
    + svg(k === "ok" ? "coche" : "alerte", { size: 17 }) + "</span>"
    + '<span><span class="nm">' + esc(t) + "</span>"
    + '<span class="tx">' + esc(texte) + "</span></span></div>";
}

async function ouvrirEcriture(nom, mode){
  const chemin = memChemin(nom);

  /* ── CE QU'ON REFUSE DE FAIRE DU TOUT ────────────────────────────────
     La première version de cet écran disait « ce fichier n'est modifiable
     que par vous, jamais depuis une conversation ». C'était FAUX, et le
     code source d'Hermès l'a établi. On dit donc les trois niveaux, avec
     trois couleurs : les peindre tous en vert serait plus rassurant et
     moins vrai. Le troisième n'est pas une alerte — c'est une limite. */
  if (mode === "verrou"){
    const b = feuilleEcrire("Ce qu'Ulysse s'autorise",
      '<div class="sub">' + esc(nom) + " · " + esc(chemin) + "</div>"
      + '<div class="irrev" style="margin-top:18px"><span class="pt">'
      + svg("alerte", { size: 19 }) + "</span><span>"
      + "<b>Ce fichier dit ce qu'Ulysse s'autorise et ce qu'il refuse.</b> "
      + "Il n'a pas la même protection selon qui écrit — et mieux vaut le "
      + "savoir que le croire.</span></div>"
      + '<div class="u-niv">'
      + niveauHTML("ok", "Ulysse ne l'écrira jamais",
          "Le serveur refuse ce nom avant toute écriture, quelle que soit la "
          + "casse. Aucun écran, aucun bouton d'ici ne peut le toucher.")
      + niveauHTML("ok", "Cet écran ne vous le propose pas",
          "Il n'y a pas de champ, pas de « écrire quand même ». Ouvrez-le dans "
          + "votre éditeur ; Hermès le relira au prochain lancement.")
      + niveauHTML("warn", "L'agent, lui, en a les moyens",
          "Il écrit avec ses propres outils, sans passer par ce serveur, et "
          + "Hermès n'interdit aucun chemin. Ce qui l'arrête est votre accord : "
          + "une écriture ne s'autorise pas « toujours », donc il devra vous la "
          + "demander — à condition que les accords soient demandés.")
      + "</div>"
      + '<div class="u-macts">'
      + '<button class="btn-pick" data-ea="copier">Copier le chemin</button>'
      + '<span class="sp"></span>'
      + '<button class="txt-btn" data-ea="accords">Voir mes accords</button>'
      + '<button class="txt-btn" data-ea="fermer">Fermer</button></div>');
    b.querySelectorAll("[data-ea]").forEach((x) => {
      x.onclick = () => {
        if (x.dataset.ea === "fermer") return fermerEcriture();
        if (x.dataset.ea === "copier") return copier(chemin, "Le chemin");
        fermerEcriture();
        ouvrirReglages(3);            // Sécurité et accords
      };
    });
    return;
  }

  const lu = memLus[nom] || {};
  /* ⚠ LES FINS DE LIGNE. Sur Windows ces fichiers sont en CRLF ; la valeur
     d'un `<textarea>` est normalisée en LF par le navigateur. Comparer les
     deux telles quelles fait différer TOUTES les lignes : le diff annonçait
     « 5 retirées, 6 ajoutées, 0 inchangée » pour une seule ligne ajoutée.

     On compare donc en LF — c'est le CONTENU qu'on veut montrer — et on
     réécrit avec la fin de ligne d'origine au moment d'écrire. Convertir le
     fichier de quelqu'un en silence serait modifier chacune de ses lignes
     sans le dire, ce qui est exactement ce que cet écran existe pour éviter. */
  const brut = lu.existe ? lu.texte : "";
  const crlf = brut.indexOf("\r\n") >= 0;
  const avant = brut.replace(/\r\n/g, "\n");
  const creation = mode === "creer" || !lu.existe;

  const b = feuilleEcrire(creation ? "Créer " + nom : "Remplacer " + nom,
    '<div class="sub">' + esc(chemin)
    + (creation ? " · ce fichier n'existe pas encore, rien ne sera remplacé"
       : " · " + fmtBytes(lu.octets) + " · " + lu.lignes + " lignes") + "</div>"
    + '<textarea id="uMemTexte" class="u-memtexte" spellcheck="false"'
    + ' aria-label="Nouveau contenu de ' + esc(nom) + '"></textarea>'
    + '<div id="uMemDiff"></div>'
    // La garantie ne s'affiche que quand quelque chose se perd. L'afficher
    // sur une création serait de la prudence gratuite — celle qu'on n'aura
    // plus quand elle comptera.
    + (creation ? ""
       : '<div class="u-garde"><span class="pt">' + svg("coche", { size: 18 })
         + "</span><span><b>La version d'avant sera gardée</b>, datée. Vous "
         + "pourrez y revenir depuis cet écran, sans limite de temps. Et si "
         + "cette copie ne peut pas se faire, <b>rien ne sera écrit</b>.</span></div>")
    + '<div id="uMemVers"></div>'
    + '<div class="u-macts">'
    + '<button class="validate" id="uMemGo">'
    + (creation ? "Créer le fichier" : "Remplacer") + "</button>"
    + '<span class="sp"></span>'
    + '<button class="txt-btn" data-ea="fermer">Annuler</button></div>');

  const zone = $("uMemTexte");
  zone.value = avant;
  const majDiff = () => {
    H("uMemDiff", creation
      ? '<div class="u-bilan" style="margin-top:16px"><span class="plus">'
        + zone.value.split("\n").length + " lignes seront écrites</span>"
        + "<span>rien n'est remplacé</span></div>"
      : diffHTML(diffLignes(avant, zone.value)));
  };
  majDiff();
  zone.oninput = majDiff;

  b.querySelector('[data-ea="fermer"]').onclick = fermerEcriture;

  if (!creation) chargerVersions(chemin);

  $("uMemGo").onclick = async () => {
    const bouton = $("uMemGo");
    bouton.disabled = true;
    try {
      // On rend au fichier ses fins de ligne d'origine.
      const aEcrire = crlf ? zone.value.replace(/\r?\n/g, "\r\n") : zone.value;
      const r = await REST.ecrireMemoire(chemin, aEcrire);
      fermerEcriture();
      snack(r.creation ? "« " + nom + " » créé."
        : "Écrit. La version d'avant est gardée (" + r.versions + " au total).");
      await drawMemFiles();
    } catch (e){
      bouton.disabled = false;
      // Le serveur dit POURQUOI il refuse : on relaie sa phrase, on n'en
      // invente pas une plus vague.
      snack(e.message);
    }
  };
}

/* Les versions gardées, et le retour en arrière. Il garde lui-même ce qu'il
   quitte — sinon revenir serait un aller simple. */
async function chargerVersions(chemin){
  const hote = $("uMemVers");
  if (!hote) return;
  let liste = [];
  try { liste = (await REST.versionsDe(chemin)).versions || []; }
  catch (e){
    // Ne PAS rester muet : l'écran vient de promettre qu'on pourra revenir en
    // arrière. Une zone vide laisserait croire qu'il n'y a rien à retrouver,
    // alors qu'on n'a pas pu le savoir.
    // Un 404 ou un 405 ici veut dire une chose précise : le `serve.py` qui
    // tourne a été lancé avant que ces routes n'existent. On le dit, plutôt
    // que de recracher sa page d'erreur HTML.
    const vieux = /\b(404|405)\b/.test(e.message);
    hote.innerHTML = '<div class="u-todo" style="margin-top:12px">'
      + (vieux
          ? "<b>Le serveur qui tourne ne connaît pas encore les versions.</b> "
            + "Il a été lancé avant ces routes — relancez "
            + "<code>lancer_ulysse.bat</code> pour qu'elles existent. Rien "
            + "n'est perdu : les copies se feront à partir de là."
          : "Les versions gardées n'ont pas pu être lues : "
            + esc(String(e.message).replace(/<[^>]*>/g, " ").slice(0, 120)))
      + "</div>";
    return;
  }
  if (!liste.length){
    hote.innerHTML = '<div class="u-vers"><div class="r"><span class="n">'
      + "Aucune version gardée pour l'instant — la première le sera à la "
      + "prochaine écriture.</span></div></div>";
    return;
  }
  hote.innerHTML = '<div class="u-vers">' + liste.map((v) =>
    '<div class="r"><span class="q">' + esc(fmtWhen(v.horodatage))
    + '</span><span class="n">' + fmtBytes(v.octets) + "</span>"
    + '<button data-rv="' + esc(v.nom) + '">Revenir à celle-ci</button></div>').join("")
    + "</div>";
  hote.querySelectorAll("[data-rv]").forEach((x) => {
    x.onclick = async () => {
      x.disabled = true;
      try {
        await REST.restaurerVersion(chemin, x.dataset.rv);
        fermerEcriture();
        snack("Revenu à la version du " + x.previousElementSibling.previousElementSibling.textContent
          + ". Ce qu'elle remplace est gardé aussi.");
        await drawMemFiles();
      } catch (e){ x.disabled = false; snack(e.message); }
    };
  });
}

function ouvrirReglages(i){
  setSel = i;
  nav("Reglages");
  drawSet();
}

/* Réglages > Le cerveau : peuple les deux sélecteurs de modèles.
   · Discussion → override local PROXY_MODEL (ulysse-config.js), vide = héritage.
   · Cowork → /api/model/set scope main (comme /model dans Hermès).
   Les modèles viennent de /api/model/options (provider courant). */
async function chargerModelesCerveau(){
  const disc = $("setDiscWrap");
  const cow = $("setCoworkWrap");
  const cur = $("setCurModel");
  const opt = (val, lbl, sel) =>
    '<option value="' + esc(val) + '"' + (sel ? " selected" : "") + ">"
      + esc(lbl) + "</option>";

  try {
    const d = await REST.modelOptions();
    const provs = (d && d.providers) || [];
    const prov = provs.find(p => p.is_current) || provs[0] || null;
    const models = (prov && prov.models) || [];
    const slug = prov ? prov.slug : "nous";

    // --- Mode Discussion : override PROXY_MODEL ---
    const discVal = CFG.PROXY_MODEL || "";
    let discHtml = opt("", "Hériter du profil Hermès (défaut)", !discVal);
    discHtml += models.map(m => opt(m, m, m === discVal)).join("");
    disc.innerHTML = '<select id="setDiscModel" class="u-select">' + discHtml
      + "</select>"
      + '<div class="u-meta">Override écrit dans ulysse-config.js (PROXY_MODEL).</div>';
    const selD = $("setDiscModel");
    selD.onchange = async () => {
      const v = selD.value;
      try {
        await REST.setLocalModel("PROXY_MODEL", v);
        CFG.PROXY_MODEL = v;
        snack(v ? "Discussion → " + v : "Discussion : héritage du profil.");
      } catch (e){ snack("Discussion : " + e.message); }
    };

    // --- Session Cowork : model/set scope main ---
    const cowVal = (conv && conv.info && conv.info.model) || "";
    let cowHtml = opt("", "Profil par défaut", !cowVal);
    cowHtml += models.map(m => opt(m, m, m === cowVal)).join("");
    cow.innerHTML = '<select id="setCoworkModel" class="u-select">' + cowHtml
      + "</select>"
      + '<div class="u-meta">Applique /api/model/set (scope main, session Hermès).</div>';
    const selC = $("setCoworkModel");
    selC.onchange = async () => {
      const v = selC.value;
      try {
        if (v) await REST.modelSet(slug, v);
        if (cur) cur.textContent = v || "profil Hermès";
        snack(v ? "Cowork → " + v : "Cowork : profil par défaut.");
      } catch (e){ snack("Cowork : " + e.message); }
    };

    if (cur) cur.textContent = cowVal || "profil Hermès";
  } catch (e){
    const msg = "Impossible de lister les modèles : " + e.message;
    if (disc) disc.innerHTML = '<div class="u-todo">' + esc(msg) + "</div>";
    if (cow) cow.innerHTML = '<div class="u-todo">' + esc(msg) + "</div>";
  }
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
      memoireEtat = { manquants: memManquants(d) };
      majDette();
      b.innerHTML = titre("Ce qu'Ulysse sait")
        + ligne("Fournisseur de mémoire", "Ce qui garde ce qu'Ulysse retient d'une fois sur l'autre.",
            '<span class="tag">' + esc((d && d.active) || "—") + "</span>")
        + titre("Les fichiers de mémoire")
        + '<div id="uMemFiles"><div class="u-load">Lecture des fichiers…</div></div>';
      await drawMemFiles();
    } catch (e){
      b.innerHTML = titre("Ce qu'Ulysse sait")
        + '<div class="u-todo">Lecture impossible : ' + esc(pannePhrase(e)) + "</div>";
    }
    return;
  }

  if (setSel === 2){
    // Avant : section lecture seule avec un « reste à décider ». Désormais
    // réglable : on choisit le modèle du mode Discussion (override local) et
    // de la session Cowork (comme /model dans Hermès). Les deux héritent du
    // profil si on ne choisit rien — LOI-DU-CERVEAU.md : Ulysse n'impose rien.
    b.innerHTML = titre("Le cerveau")
      + '<div class="u-lecture">' + svg("point", { size: 12 })
      + "Ulysse n'impose aucun modèle : par défaut, il suit votre profil "
      + "Hermès. Vous pouvez ici fixer un modèle pour le mode Discussion "
      + "(chat pur) et pour la session Cowork, comme avec <code>/model</code> "
      + "dans Hermès.</div>"
      + ligne("Modèle en cours (session)",
          "Celui que la session Hermès vivante utilise réellement.",
          '<span class="tag" id="setCurModel">'
            + esc((conv && conv.info && conv.info.model) || "profil Hermès")
            + "</span>")
      + '<div class="seth">Mode Discussion (chat pur)<span class="l"></span></div>'
      + '<div id="setDiscWrap" class="u-load">Chargement des modèles…</div>'
      + '<div class="seth">Session Cowork<span class="l"></span></div>'
      + '<div id="setCoworkWrap" class="u-load">Chargement des modèles…</div>'
      + '<div class="u-todo"><b>Pourquoi deux réglages ?</b> Le mode Discussion '
      + "passe par le proxy local : le choix est un override écrit dans "
      + "ulysse-config.js (PROXY_MODEL). La session Cowork utilise le modèle de "
      + "la session Hermès vivante (exactement <code>/model</code>). Les deux "
      + "héritent du profil si vous ne choisissez rien.</div>";
    chargerModelesCerveau();
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
        + '<div class="u-todo">Lecture impossible : ' + esc(pannePhrase(e))
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

/* L'aide-mémoire tient DEUX familles, et ce qui les distingue n'est pas le
   geste : c'est OÙ elles s'exécutent. Les unes se tapent dans une console,
   hors d'Ulysse — on les copie. Les autres sont les commandes de la TUI qui
   tourne dans l'écran — on les pose dans sa ligne. Un seul geste par ligne,
   jamais deux : le mauvais geste n'existe pas là où il serait faux. */
const TMEMO = [
  ["hermes", "ouvrir l'agent en ligne de commande"],
  ["hermes dashboard --port 9123 --no-open", "le backend qu'Ulysse enveloppe"],
  ["hermes gateway run", "les webhooks et les canaux distants"],
  ["hermes proxy start --provider nous --port 8645", "le mode Discussion, sans outils"],
  ["hermes webhook subscribe <nom> --prompt \"…\"", "créer une route webhook"],
  ["hermes doctor", "diagnostiquer une installation"]
];

/* Les six ci-dessous ont été demandées à la complétion d'Hermès elle-même
   (RPC `complete.slash`, sur le gateway qui tourne), et les descriptions sont
   la traduction fidèle de celles qu'il renvoie. Rien n'est supposé : `/theme`
   existe dans le registre de la TUI et n'est PAS exposé par la complétion —
   il n'est donc pas ici. Si la liste doit changer, la redemander plutôt que
   la deviner. */
const TMEMO_TUI = [
  ["/help", "voir toutes les commandes de la session"],
  ["/status", "la session, le modèle, les jetons, le contexte"],
  ["/model", "changer de modèle, le temps de la session"],
  ["/sessions", "parcourir et reprendre une session précédente"],
  ["/compress", "compresser le contexte de la conversation"],
  ["/stop", "arrêter les processus lancés en arrière-plan"]
];

/* Ce qui engage plus que ses voisines, sous un filet — comme « Autoriser
   toujours » dans la demande d'accord. Elle n'est pas interdite, elle est
   distinguée.

   Le libellé peut être rassurant, et ce n'est pas une politesse : c'est
   constaté. `/clear` appelle `session.close` (methods_session.py:2717), qui
   FINALISE la session sans la supprimer — elle reste dans le magasin et
   `GET /api/sessions` la liste (70 y figuraient au moment de la vérification,
   dont des sessions fermées le soir même). La TUI demande en plus
   confirmation avant d'agir (core.ts:206, `danger: true`). */
const TMEMO_TUI_FORT = [
  ["/clear", "ouvrir une nouvelle session à la place de celle-ci — "
    + "celle-ci restera dans /sessions"]
];

/* Le plein écran est APPLICATIF, pas celui du navigateur : Ulysse tourne déjà
   dans une fenêtre, et demander le plein écran du système ferait SORTIR de
   l'application pour agrandir un de ses panneaux. Une classe sur `.term`, et
   c'est réversible sans rien demander à personne. */
let termPlein = false;

function basculerPlein(v){
  const t = $("pTerminal") && $("pTerminal").querySelector(".term");
  if (!t) return;
  termPlein = v === undefined ? !termPlein : !!v;
  t.classList.toggle("u-plein", termPlein);
  // Le panneau doit être levé AUSSI : `.panel` est un contexte d'empilement
  // (`z-index:1`), donc le `z-index:200` de la fenêtre ne peut pas en sortir,
  // et le rail — à 60 dans le contexte parent — passait devant le terminal.
  $("pTerminal").classList.toggle("u-plein-actif", termPlein);
  // On REDESSINE plutôt que de déplacer les replis à la main : les deux
  // groupes ne sont plus dans `#tside` à ce moment-là, ils vivent déjà dans
  // les replis. Les rechercher là où ils ne sont plus les perdrait. `drawTerm`
  // réécrit la colonne, puis `poserOutils` les redéplace vers le bon hôte —
  // et la séquence sortir/réécrire/réinstaller protège l'écran vivant, comme
  // à chaque changement de thème. `ajusterTerm` suit, la fenêtre ayant changé
  // de taille du tout au tout.
  drawTerm();
}

function fermerReplis(){
  let ferme = false;
  ["tPopApp", "tPopMem"].forEach((id) => {
    const p = $(id);
    if (p && p.classList.contains("on")){ p.classList.remove("on"); ferme = true; }
  });
  return ferme;
}

/* Les deux groupes de `#tside` déménagent dans les replis de la barre de
   titre. On les DÉPLACE — `appendChild` sur un nœud déjà écrit — plutôt que
   de les réécrire : c'est le même motif que `#band` vers le kebab, dans
   l'autre sens, et il ne détruit rien.

   Deux boutons, pas deux « ⋯ » : deux kebabs côte à côte sont
   indistinguables, il faudrait les ouvrir pour savoir lequel est lequel. */
function poserOutils(){
  // Les outils vivent dans la barre de titre — ou, en plein écran qui la
  // recouvre, dans la ligne de sortie. C'est là qu'on travaille, donc c'est là
  // qu'on veut poser une commande : en sortir pour la chercher puis y revenir
  // est un aller-retour qu'on ne fait pas, on renonce.
  //
  // UN SEUL JEU, jamais deux : les mêmes replis à deux endroits, ce seraient
  // deux endroits où les chercher. On vide donc l'hôte qu'on quitte.
  const enPlein = termPlein && !!$("tOutils2");
  const hote = enPlein ? "tOutils2" : "tOutils";
  const quitte = enPlein ? "tOutils" : "tOutils2";
  if (!$(hote)) return;
  if ($(quitte)) H(quitte, "");
  H(hote,
    '<span><button class="icon-btn" id="tApp" aria-label="Apparence du terminal"'
    + ' title="Apparence">' + svg("regler", { size: 20 }) + "</button>"
    + '<div class="pop u-pop" id="tPopApp"></div></span>'
    + '<span><button class="icon-btn" id="tMem" aria-label="Aide-mémoire"'
    + ' title="Aide-mémoire">' + svg("doc", { size: 20 }) + "</button>"
    + '<div class="pop u-pop" id="tPopMem"></div></span>'
    // Le bouton d'agrandissement n'existe QUE hors plein écran : dedans, la
    // ligne de sortie porte déjà un bouton NOMMÉ qui fait la même chose. Deux
    // commandes pour un même geste, à deux endroits, c'est une de trop — et
    // c'est celle qui n'a pas de mot qui saute. D'autant qu'Échap appartient
    // au terminal quand on tape dedans : le bouton nommé est le seul chemin
    // de sortie fiable, il ne peut pas être une icône muette.
    + (termPlein ? ""
        : '<button class="icon-btn" id="tFull" aria-label="Plein écran"'
          + ' title="Plein écran">' + svg("agrandir", { size: 20 }) + "</button>"));

  // Le premier groupe est l'apparence ; TOUT le reste est de l'aide-mémoire.
  // Depuis que les familles sont séparées, il y en a deux — « Dans votre
  // console » et « Dans cette session » — et la passe en supposait un seul.
  // On prend donc la suite, quel qu'en soit le nombre : ajouter une famille
  // ne doit pas laisser un groupe orphelin dans une colonne invisible.
  const grp = Array.from($("tside").querySelectorAll(".tgrp"));
  if (grp[0]) $("tPopApp").appendChild(grp[0]);
  grp.slice(1).forEach((g) => $("tPopMem").appendChild(g));

  // Les deux replis s'excluent : ouvrir l'un ferme l'autre.
  const bascule = (bouton, mien, sien) => {
    $(bouton).onclick = (e) => {
      e.stopPropagation();
      $(sien).classList.remove("on");
      $(mien).classList.toggle("on");
    };
  };
  bascule("tApp", "tPopApp", "tPopMem");
  bascule("tMem", "tPopMem", "tPopApp");
  $("tPopApp").onclick = (e) => e.stopPropagation();
  $("tPopMem").onclick = (e) => e.stopPropagation();
  const plein = $("tFull");
  if (plein) plein.onclick = (e) => { e.stopPropagation(); basculerPlein(true); };
}

function ligneTui([c, q]){
  return '<div class="u-cmd" data-poser="' + esc(c) + '" role="button"'
    + ' tabindex="0" title="Poser dans la ligne, sans lancer">'
    + "<code>" + esc(c) + "</code><span>" + esc(q) + "</span>"
    + '<span class="u-poser">' + svg("suivant", { size: 15 }) + "</span></div>";
}

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
    // PREMIÈRE FAMILLE — hors d'Ulysse. Un seul geste : copier.
    + '<div class="tgrp"><h3>Dans votre console</h3><div class="tmemo">'
    + TMEMO.map(([c, q]) => '<div class="u-cmd" data-cmd="' + esc(c) + '" role="button"'
        + ' tabindex="0" title="Cliquer pour copier"><code>' + esc(c) + "</code><span>"
        + esc(q) + '</span><span class="k">' + svg("copier", { size: 15 })
        + "</span></div>").join("")
    + "</div></div>"

    // SECONDE FAMILLE — la TUI qui tourne dans l'écran. Un seul geste : poser.
    // Le bloc n'est visible qu'en session ouverte (`u-tui`, en CSS) : proposer
    // des commandes à une invite qui n'existe pas serait promettre un endroit
    // où les taper. Il est écrit à chaque dessin plutôt que monté et démonté,
    // pour que l'ouverture d'une session ne reconstruise rien.
    + '<div class="tgrp u-tui"><h3>Dans cette session</h3>'
    + '<p class="u-note">La session attend d\'abord une phrase — dites ce que '
    + "vous voulez. Ces commandes-ci sont les raccourcis qu'elle reconnaît.</p>"
    + '<div class="tmemo">'
    + TMEMO_TUI.map(ligneTui).join("")
    // Le filet, puis ce qui engage au-delà de la ligne.
    + '<div class="u-sep"></div>'
    + TMEMO_TUI_FORT.map(ligneTui).join("")
    + "</div></div>");

  // ⚠ `#tmain` est reconstruit en innerHTML à chaque changement de thème ou
  // de taille. `#tecran` porte un terminal VIVANT, avec sa session ouverte :
  // le laisser dans le gabarit le détruirait, et couperait le PTY sous les
  // doigts de quelqu'un en train de taper. Même séquence que pour `#band` :
  // SORTIR, réécrire, RÉINSTALLER.
  const ecran = $("tecran"), stock = $("uStock");
  if (ecran && stock) stock.appendChild(ecran);

  H("tmain",
    // En plein écran, la barre de titre du panneau n'est plus là : cette
    // ligne porte le retour, la touche qui en sort, et ce qu'on regarde.
    // Elle est écrite toujours, montrée seulement en plein écran.
    // La touche EST le bouton. Il y avait un bouton « Quitter le plein écran »
    // et, juste à côté, la mention `Échap` : deux commandes pour un seul geste,
    // et la plus large mangeait la place qu'on venait justement chercher.
    // Survolée, la touche dit ce qu'elle fait ; cliquée, elle le fait.
    // `aria-label` porte la phrase en permanence : elle n'est cachée qu'à
    // l'œil, et personne ne survole au lecteur d'écran.
    '<div class="u-sortie"><button class="u-echap" id="tSortie"'
    + ' aria-label="Quitter le plein écran"><kbd>Échap</kbd>'
    + '<span class="u-dit">Quitter le plein écran</span></button>'
    // L'avertissement ne disparaît pas parce qu'on a agrandi : il monte ici,
    // en une ligne. C'est la seule fenêtre qui mène en dehors de
    // l'application — le taire au moment où elle occupe tout l'écran serait
    // le taire au pire moment.
    + '<span class="u-hors">' + svg("alerte", { size: 15 })
    + "Les accords d'Ulysse ne s'appliquent pas ici</span>"
    + "<span class=\"sp\"></span>"
    + "<span>" + esc(TCMD) + " --tui</span>"
    // Les deux replis viennent ici en plein écran : même ordre, même côté.
    // Les outils ne bougent pas, c'est la barre qui les porte qui change.
    + '<span class="u-outils" id="tOutils2"></span></div>'

    + '<div class="tscreen u-tscreen" style="background:' + T.bg + ";color:" + T.fg
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
    // Celui-ci OUVRE, pour de vrai — une console Windows, hors d'Ulysse.
    // C'est le seul endroit où la page fait lancer un processus sur la
    // machine. Son libellé dit donc exactement ce qui va se passer, et la
    // phrase en dessous dit où ça se passe.
    + '<button class="ghost-btn" id="tConsole">' + svg("lien", { size: 17 })
    + " Ouvrir une console Hermès</button>"
    // Et celui-là copie, pour qui préfère la coller ailleurs — une autre
    // machine, un autre terminal, un raccourci.
    + '<button class="txt-btn" data-cmd="' + esc(TCMD) + '">Copier la commande</button>'
    + '<span class="tpath">Une vraie fenêtre, en dehors d\'Ulysse. Ce qui s\'y '
    + "passe ne passe plus par lui.</span></div>"

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

  // ── Les deux replis, et le plein écran ───────────────────────────────
  // `#tside` a été écrit exactement comme avant : le code qui le remplit n'a
  // rien à savoir de tout ceci. On déplace ses deux groupes ENSUITE, une fois
  // écrits — c'est sortir/réinstaller, dans l'autre sens. Rien n'est
  // reconstruit, donc rien de vivant n'est détruit.
  poserOutils();
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
  const sortie = $("tSortie");
  if (sortie) sortie.onclick = () => basculerPlein(false);

  const cons = $("tConsole");
  if (cons) cons.onclick = async () => {
    cons.disabled = true;
    try {
      await REST.ouvrirConsole();
      snack("Une console Hermès s'est ouverte, hors d'Ulysse.");
    } catch (e){
      // serve.py dit pourquoi — machine non Windows, `hermes` absent du PATH,
      // serveur lancé avant cette route. On relaie sa phrase.
      snack(String(e.message).replace(/<[^>]*>/g, " ").slice(0, 160));
    }
    cons.disabled = false;
  };

  // ⚠ On interroge `#pTerminal`, plus `#tside` : les deux groupes ont déménagé
  // dans les replis, et les chercher dans la colonne ne rendrait plus rien.
  const P = $("pTerminal");
  P.querySelectorAll("[data-th]").forEach((b) => {
    b.onclick = () => { tTheme = b.dataset.th; drawTerm(); };
  });
  P.querySelectorAll("[data-sz]").forEach((b) => {
    b.onclick = () => { tTaille = b.dataset.sz; drawTerm(); };
  });
  // ⚠ Tout le panneau, pas seulement `.tmemo` : le bouton « Copier
  // « hermes » » vit dans `.tlaunch`, sous l'écran. Il n'a JAMAIS été câblé —
  // l'ancien code interrogeait `#tside`, où il ne se trouve pas. Un bouton
  // visible qui n'agit pas est précisément ce que la règle STU-1 interdit, et
  // il aura suffi qu'il soit dans le mauvais sous-arbre pour passer inaperçu
  // à travers deux passes de design.
  P.querySelectorAll("[data-cmd]").forEach((el) => {
    const prendre = () => copier(el.dataset.cmd, "La commande");
    el.onclick = prendre;
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); prendre(); } };
  });
  // Les lignes de la seconde famille ne portent QUE `data-poser` : plus de
  // propagation à arrêter, plus de geste à ne pas déclencher par erreur.
  P.querySelectorAll("[data-poser]").forEach((el) => {
    const poser = () => poserDansTerm(el.dataset.poser);
    el.onclick = poser;
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); poser(); } };
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
    // Le libellé était INVERSÉ : quand Hermès proposait une portée large, le
    // bouton portait le mot le plus vague (« Autoriser ») et faisait l'action
    // la plus étroite (`once`). La bulle dit maintenant ce que son oui vaut.
    oui: "Autoriser une fois",
    non: "Refuser",
    renvoi: choices.length > 2
      ? "Voir la demande dans Discuter — pour autoriser plus largement" : ""
  });
}

/* Comment un identifiant de panneau s'écrit à l'écran, pour la ligne « où mène
   ceci ». La source est `PANELS` et elle seule : recopier les dix libellés
   ailleurs, c'est se donner une occasion de divergence dont la première victime
   serait justement celle que `drawBell()` vient de subir — « Reglages » d'un
   côté, « Réglages » de l'autre. */
Notifs.libelle = (id) => {
  const p = PANELS.find((x) => x.id === id);
  return p ? p.lbl : id;
};

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
    memoireEtat = { manquants: memManquants(d) };
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

/* ── UNE PANNE EST UNE NOTIFICATION ─────────────────────────────────────
   `NKIND` définit quatre genres — décision, panne, livrable, auto — et seul
   `decision` était poussé : le vocabulaire existait en entier, le produit en
   employait un quart.

   Or l'état d'Hermès concerne les DIX panneaux. Il n'était lisible que dans
   le bandeau du kebab de Discuter : juste pour Discuter, angle mort pour les
   neuf autres. Depuis le Vestiaire, si le lien tombait, rien ne le disait.

   On ne crée pas un nouveau point qui veille : la cloche EST le lieu de ce
   qui ne va pas, elle est visible de partout, et `NKIND.panne.dur` vaut déjà
   `true` — une panne ne part donc pas toute seule.

   ⚠ On ne pousse rien tant qu'on n'a pas CONSTATÉ la panne : `lastStatus`
   null, c'est-à-dire une requête qui a échoué. Et on ne la pousse qu'UNE
   fois : `loadStatus` tourne en boucle, et une cloche qui sonne toutes les
   dix secondes pour la même panne cesse d'être écoutée. */
let pannePoussee = null;

function majPanne(){
  const enPanne = !lastStatus;
  if (enPanne && pannePoussee === null){
    pannePoussee = Notifs.push({
      kind: "panne",
      titre: "Hermès est injoignable",
      txt: "La page ne reçoit plus de réponse. Les panneaux montrent le dernier "
         + "état connu, pas l'état actuel.",
      obj: "Toute l'application",
      // Pas de boutons : une panne ne s'autorise pas. Elle ne part pas toute
      // seule (`dur`), et elle s'en va quand Hermès revient — pas quand on
      // clique.
      //
      // Et pas de `renvoi` non plus : il s'affiche en `.u-lien`, c'est-à-dire
      // avec l'allure d'un lien. Le conseil est désormais porté par `.n-quoi`,
      // en petit et sans rien qui ressemble à un bouton — « on ne déguise pas
      // un conseil en choix » (Cowork, 2026-08-10). Un bouton engage le
      // produit ; ici c'est la personne qui agit, ailleurs.
      panel: "Reglages"
    });
    return;
  }
  // Revenue : on la retire, plutôt que de laisser une panne résolue sonner
  // dans la cloche. `drop` est l'API prévue pour ça.
  if (!enPanne && pannePoussee !== null){
    Notifs.drop(pannePoussee);
    pannePoussee = null;
  }
}

/* Teste le proxy Hermes (port 8645) via /proxy/chat. Un 400/422/200 = le
   proxy repond (ok) ; une erreur reseau ou 5xx = il est arrête (err). On
   ne juge pas le modele ici, seulement la presence du moteur. */
async function verifProxy(){
  const old = proxyState;
  try {
    const res = await fetch(CFG.BASE + "/proxy/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
      cache: "no-store"
    });
    // Meme un 400 dit que le proxy est la ; seul un 5xx/network dit qu'il tombe.
    proxyState = (res.status >= 500) ? "err" : "ok";
  } catch (e){
    proxyState = "err";
  }
  if (proxyState !== old) paintBand();
}

async function loadStatus(){
  try { lastStatus = await REST.status(); }
  catch (e){ lastStatus = null; }
  paintBand();
  majPanne();
  majDimTerm();
  verifProxy();
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
  /* ⚠ `requestAnimationFrame` NE SE DÉCLENCHE PAS DANS UN ONGLET CACHÉ.
     Chrome le suspend — c'est voulu, ça économise la batterie. Mais ici
     `paintQueued` restait alors bloqué à `true`, et TOUT changement d'état
     suivant repartait aussitôt par le `return` ci-dessus. Pendant qu'on
     regarde ailleurs, l'agent travaille et l'écran ne bouge plus : le bouton
     d'arrêt reste caché alors que le tour tourne, la flèche d'envoi reste
     offerte alors qu'il n'y a rien à envoyer.

     Constaté le 2026-08-12 en jouant un scénario réel : `conv.running` valait
     `true` et `#stopBtn` était masqué. Un `paintHint()` à la main remettait
     tout d'aplomb — la donnée était juste, seule la peinture manquait.

     On garde le rAF quand l'onglet est visible (un repaint par image, ce que
     les centaines de deltas exigent), et on retombe sur un timer sinon. */
  const peindre = () => {
    paintQueued = false;
    if (current === "Discuter") paintThread();
    if (current === "Plan") drawPlan();
    paintHint();
  };
  if (typeof document !== "undefined" && document.hidden) setTimeout(peindre, 60);
  else requestAnimationFrame(peindre);
};

/* Et au retour sur l'onglet, on repeint une fois : entre le dernier timer et
   le premier rAF, l'état a pu bouger. */
if (typeof document !== "undefined"){
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) coreHooks.onChange();
  });
}
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

/* ═══ CE QUI MODIFIE, ET CE QUI SE CONTENTE DE LIRE ══════════════════════════
   La liste des outils d'ÉCRITURE, telle qu'Hermès les nomme. Elle décide seule
   de ce que le mode Plan refuse.

   ⚠ ON NOMME CE QU'ON REFUSE, JAMAIS CE QU'ON AUTORISE. Une liste blanche
   laisserait passer tout outil ajouté demain par Hermès — et un outil inconnu
   qui écrit dans un mode qui promet de ne rien toucher, c'est la promesse
   rompue en silence. Ici, un outil inconnu n'est pas refusé : il demande
   l'accord, comme avant. C'est le comportement d'origine, pas une régression.

   `terminal` et `execute_code` y sont : on ne peut pas savoir ce qu'une
   commande va faire, et « lancer les tests » et « rm -rf » ont la même forme
   vue d'ici. En Plan on ne lance rien. */
const OUTILS_QUI_MODIFIENT = {
  write_file: 1, patch: 1, edit_file: 1, str_replace: 1, create_file: 1,
  delete_file: 1, move_file: 1, terminal: 1, process: 1, execute_code: 1,
  shell: 1, bash: 1
};

/* ═══ ⚠ CE QUI REND LA PORTE INOPÉRANTE, ET QU'IL FAUT DIRE ═════════════════
   Trouvé le 2026-08-12 en jouant un scénario réel, PAS au banc : en mode Plan,
   l'agent a lancé `terminal` trois fois et rien ne l'a arrêté.

   La porte ci-dessous ne se déclenche que sur `approval.request`. Or
   `approvals.mode` valait **« smart »** sur l'installation de kuchu : Hermès
   s'auto-autorise ce qu'il juge sans danger et **n'émet aucune demande**. La
   porte n'a donc jamais été appelée — et le mode Plan promettait « rien ne
   sera modifié sur le disque » sans pouvoir le tenir.

   Une promesse qu'on ne tient pas est pire qu'une absence de promesse : elle
   fait baisser la garde. Ulysse ne peut pas réparer ça tout seul — le réglage
   est GLOBAL, il vaut pour le TUI et toutes les sessions. Alors Ulysse fait la
   seule chose honnête : il regarde, il le DIT, et il propose de le changer.
   Le clic est l'accord ; sans clic, rien n'est écrit.
   Voir PASSE-DESIGN-UN-SEUL-FIL.md §3. */
let modeAccords = null;          // "manual" | "smart" | "off" | null (inconnu)

async function lireModeAccords(){
  try {
    const r = await link.rpc("config.get", { key: "approval_mode" }, 15000);
    modeAccords = (r && r.value) || null;
  } catch (e){ modeAccords = null; }
  paintThread();
}

/* ═══ ⚠ « MANUEL » N'EST PAS « ON VOUS DEMANDE » ════════════════════════════
   Éprouvé le 2026-08-12, après que kuchu a cliqué « Passer les accords en
   manuel » — donc dans les conditions mêmes que cet écran réclamait :

     · `write_file` sur essai-refus.txt : le fichier est écrit. ZÉRO
       `approval.request` dans le journal des événements.
     · `terminal echo essai-porte` : exécuté en 185 ms. Zéro demande.

   Le code source d'Hermès dit pourquoi, et c'est structurel :
     · `tools/approval.py:3938` — `if not warnings: return {"approved": True}`,
       AVANT toute lecture du mode. Une commande qui ne déclenche aucun motif
       de danger est auto-approuvée dans TOUS les modes, manuel compris.
       `approvals.mode` ne dit pas SI l'on demande : il dit quoi faire quand un
       motif a DÉJÀ mordu.
     · `tools/file_tools.py:706` — la seule porte toujours-demander sur une
       écriture couvre quatre noms : agents.md, claude.md, soul.md,
       .cursorrules. Un `write_file` ordinaire ne passe par aucune porte, à
       aucun réglage.

   `planGaranti()` valait donc « modeAccords === manual » et en tirait une
   GARANTIE qui n'existe nulle part. Pire : en passant en manuel, l'écran
   cessait d'avertir — le trou restait, l'avertissement partait. On était
   moins protégé qu'avant le clic, et on le croyait davantage.

   Ce qui retient vraiment l'agent en Plan, c'est la ligne de mode — la
   consigne. C'est réel : on l'a vu refuser `write_file` sur instruction
   directe. Mais `ligneDeMode()` le dit lui-même : « une garantie qui repose
   sur la bonne volonté du modèle n'est pas une garantie. »

   Alors on ne promet plus. On dit ce qui est vrai, dans les deux réglages. */
function porteConsultee(){ return modeAccords === "manual"; }

function avertissementAccordsHTML(){
  if (mode !== "plan" || modeAccords === null) return "";
  /* Accords en manuel : Ulysse EST consulté — mais seulement sur ce qu'Hermès
     lui soumet, et il ne lui soumet pas une écriture ordinaire. Plus de
     bouton : il n'y a plus rien à basculer. Plus de rouge non plus — ce n'est
     pas une alarme, c'est la portée exacte de ce qu'on a. */
  /* `m-portee` : ce n'est PAS un message de panne. Rien n'est cassé, rien à
     relancer — c'est la portée de ce que le mode retient. Sans cette marque,
     le garde « chaque message de panne dit quoi faire » l'attrape et réclame
     une consigne qui n'aurait aucun sens ici. */
  if (porteConsultee()){
    return '<div class="msg u-sys m-portee"><div class="u-md">'
      + "<strong>Ce que le mode Plan retient, et ce qu'il ne retient pas.</strong> "
      + "Les accords sont en manuel : quand Hermès demande, Ulysse refuse ici. "
      + "Mais Hermès ne demande pas pour tout — un fichier écrit ou une "
      + "commande sans motif de danger passent sans question, à tout réglage. "
      + "Ce qui retient l'agent en Plan, c'est la consigne qu'il reçoit, et "
      + "il peut l'oublier."
      + "<div class=\"u-meta\">Mesuré sur cette installation, pas déduit : "
      + "un fichier écrit et une commande lancée, aucune demande d'accord.</div>"
      + "</div></div>";
  }
  return '<div class="msg u-sys m-refus"><div class="u-md">'
    + "<strong>Le mode Plan ne peut rien garantir pour l'instant.</strong> "
    + "Les accords d'Hermès sont réglés sur « " + esc(modeAccords) + " » : "
    + "l'agent s'autorise lui-même ce qu'il juge sans danger, et Ulysse n'est "
    + "jamais consulté. Il peut donc écrire et exécuter, même ici."
    + '<div class="m-pied"><button class="m-bascule" type="button" '
    + 'id="accordsManuel">Passer les accords en manuel</button></div>'
    + "<div class=\"u-meta\">Ce réglage est global : il vaut aussi pour le "
    + "terminal d'Hermès et les autres sessions. Il élargit ce qu'Ulysse peut "
    + "refuser — il ne couvre pas les écritures de fichier.</div>"
    + "</div></div>";
}

/* La porte, côté écran. Rend la phrase du refus, ou "" pour laisser passer. */
coreHooks.refusDeMode = (pl) => {
  if (mode !== "plan") return "";
  const outil = String((pl && (pl.tool || pl.name)) || "").toLowerCase();
  if (!OUTILS_QUI_MODIFIENT[outil]) return "";
  /* ⚠ LE REFUS DIT SA CAUSE ET LA SORTIE. Un refus qui s'arrête à « non » est
     un mur poli : la personne voit l'agent s'interrompre sans savoir que le
     mode en est la raison, ni que la sortie tient en un clic. */
  /* ⚠ QUATRIÈME ENDROIT OÙ LA PROMESSE VIVAIT, trouvé le 2026-08-12 en relisant
     ce fichier pour planifier la suite. Il disait « nous sommes en Plan, où
     rien n'est modifié sur le disque » — la même affirmation que celle retirée
     de l'accueil, de la note et de l'encart, à un temps de verbe près, ce qui
     lui a permis de passer sous le garde.
     Ce qui est vrai ici, et qui suffit : Ulysse REFUSE ce qu'on lui soumet.
     Il ne prétend plus que rien ne peut passer. */
  const quoi = accordQuoi(pl);
  return "Refusé : nous sommes en Plan, où Ulysse refuse ce qui modifierait "
    + "le disque. L'agent a demandé « " + quoi + " ». Passez en Build pour "
    + "l'autoriser — le mode se change sous le champ de saisie.";
};

function boot(){
  /* On lit le mode d'accords d'Hermès dès le départ — c'est lui qui décide si
     le mode Plan garantit quelque chose ou se contente de le dire. Sans
     réponse, `modeAccords` reste nul et on n'affirme rien : on ne remplace pas
     une promesse fausse par une accusation fausse. */
  link.ready().then(lireModeAccords).catch(() => {});
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

  // Coller une image dans la box : elle rejoint les pieces jointes, comme par
  // le « + ». Le texte, lui, passe normalement.
  const replyEl = $("reply");
  if (replyEl) replyEl.addEventListener("paste", collerCapture);

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

  /* La mention ouvre les deux positions ; choisir referme. Le repli suit le
     langage de `#cadrePop` — `.pop.on` — parce qu'un deuxième mécanisme de
     repli dans le même composeur serait un dialecte de plus à apprendre. */
  document.querySelectorAll(".u-modeseg button").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      setMode2(b.dataset.mode);
      const p = document.querySelector(".u-modeseg");
      if (p) p.classList.remove("on");
    };
  });
  if ($("modeMention")){
    $("modeMention").onclick = (e) => {
      e.stopPropagation();
      const p = document.querySelector(".u-modeseg");
      if (p) p.classList.toggle("on");
    };
  }
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
  // Il n'existait pas tant qu'aucun explorateur ne l'attendait. Il part du
  // dossier du fil en cours quand il y en a un : on range presque toujours
  // là où l'on travaille.
  H("newProj", svg("plus", { size: 18 }) + " Ranger un dossier en projet");
  $("newProj").onclick = () => feuilleChoisirDossier(
    (conv.info && conv.info.cwd) || "", (neuf) => ouvrirRanger(neuf));
  $("trashBtn").onclick = () => { projArchives = !projArchives; drawProjets(); };
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

  // Échap sort du plein écran du Terminal — mais ferme D'ABORD un repli s'il
  // y en a un d'ouvert : on ne perd jamais deux choses d'un coup. Un plein
  // écran dont on ne sait pas sortir n'est pas un agrandissement, c'est un
  // piège ; c'est pourquoi la touche est écrite à l'écran, en plus.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // ⚠ Échap APPARTIENT au terminal quand on tape dedans. C'est une touche
    // de travail dans une TUI — elle sort d'un mode, ferme une complétion,
    // annule une saisie. La confisquer pour replier une fenêtre rendrait le
    // terminal inutilisable en plein écran, précisément là où on y travaille.
    // Le chemin de sortie reste : le bouton, qui est toujours visible — c'est
    // exactement la raison pour laquelle la passe exigeait qu'il le soit.
    const ecran = $("tecran");
    if (ecran && ecran.contains(document.activeElement)) return;
    if (fermerReplis()) return;
    if (termPlein) basculerPlein(false);
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
    memoireEtat = { manquants: memManquants(d) };
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
