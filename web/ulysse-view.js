/* ============================================================================
 * ulysse-view.js — la machinerie de rendu de la maquette, rendue GÉNÉRIQUE
 * ----------------------------------------------------------------------------
 * La maquette est scriptée : son schéma dessine six étapes écrites en dur
 * (STEPS/EDGES), son Vestiaire douze agents inventés (AGENTS), ses
 * Automatisations trois tâches fictives (AUTOS), sa cloche trois notifications
 * de démonstration (NOTIFS). Copier ces tableaux aurait donné une maquette qui
 * ment, pas un produit.
 *
 * Ce fichier reprend donc le RENDU — la géométrie du schéma, les coudes, la
 * caméra, la cloche, les bulles, les feuilles, les rangées de réglages, la
 * fenêtre du terminal — et en retire les données. Chaque moteur reçoit ce
 * qu'il doit dessiner ; il ne sait pas d'où ça vient.
 *
 * Ce qui est repris tel quel (c'est du dessin, pas de la donnée) :
 *   · layout()      — rangement par couches, la profondeur = plus longue chaîne
 *   · coudeAxe()    — les liens orthogonaux à coudes arrondis
 *   · deuxLignes()  — deux lignes maximum dans une carte
 *   · la caméra     — on tire pour déplacer, on roule pour zoomer, autour du
 *                     pointeur ; seuil de 4 px pour distinguer tirer de cliquer
 *   · NKIND, le vocabulaire visuel des notifications
 *
 * Ce qui a été RETIRÉ, et pourquoi :
 *   · REM / TOG     — la maquette laisse retirer une étape du plan. Hermès
 *                     n'a pas d'API pour éditer le plan d'un agent ; un
 *                     bouton qui ne fait rien est pire qu'un bouton absent.
 *   · DRY           — l'essai à blanc suppose un plan connu d'avance. L'agent
 *                     n'en produit pas : il agit, et on le regarde agir.
 *
 * UNE ADAPTATION NÉCESSAIRE : la maquette interpole ses données directement
 * dans du `innerHTML`. Elle le peut : ses données, c'est elle qui les écrit.
 * Ici elles viennent du backend et du WebSocket — un titre de session
 * contenant `<img onerror=…>` s'exécuterait dans la page, avec accès au proxy
 * authentifié. Tout ce qui vient de l'extérieur passe donc par esc().
 * ========================================================================== */
"use strict";

/* ═══ Échappement — la seule chose ajoutée au rendu ═══════════════════════ */

function esc(s){
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ═══ Le bandeau du bas (snack) ═══════════════════════════════════════════
   Repris verbatim. Une action annulable le dit sur place, et pendant six
   secondes — pas dans une boîte qu'il faut acquitter. */

let snackT = null, undoFn = null;

function snack(msg, undo){
  const el = document.getElementById("snack");
  if (!el) return;
  undoFn = undo || null;
  el.innerHTML = "<span>" + esc(msg) + "</span>"
    + (undo ? '<button id="snack-undo">Annuler</button>' : "");
  if (undo) el.querySelector("#snack-undo").onclick = doUndo;
  el.classList.add("on");
  clearTimeout(snackT);
  snackT = setTimeout(() => el.classList.remove("on"), 6000);
}

function doUndo(){
  if (undoFn) undoFn();
  undoFn = null;
  const el = document.getElementById("snack");
  if (el) el.classList.remove("on");
  clearTimeout(snackT);
}

/* ═══ Les feuilles (sheets) ═══════════════════════════════════════════════ */

function openS(id, html){
  const bg = document.getElementById(id);
  if (!bg) return;
  const body = bg.querySelector(".sheet");
  if (body && html !== undefined) body.innerHTML = html;
  bg.classList.add("on");
}
function closeS(id){
  const el = document.getElementById(id);
  if (el) el.classList.remove("on");
}

/* ═══════════════════════════════════════════════════════════════════════════
   LE SCHÉMA
   ---------------------------------------------------------------------------
   Décision D1 de la maquette, conservée : le schéma dit OÙ ON EN EST et QUI
   TRAVAILLE ; la liste, à droite, dit ce qu'il y a dedans. Deux registres,
   pas deux vues.

   Quatre choses le gouvernent, et elles sont reprises :
     · une COULEUR par équipe, portée à l'identique par le liseré, le nom et
       le flux du lien qui en sort — la couleur n'est pas décorative, c'est
       le seul endroit qui dit qui fait ;
     · des liens ORTHOGONAUX à coudes arrondis, qu'on suit du doigt ;
     · le néon ne s'allume que sur ce qui travaille ;
     · le mouvement ne ment pas : un lien ne coule que si son amont est fini
       ET son aval en cours.

   Ce qui change par rapport à la maquette : les étapes ne sont plus écrites
   d'avance. Elles sont fournies par l'appelant — chez nous, la suite réelle
   des outils appelés par l'agent.
   ═══════════════════════════════════════════════════════════════════════════ */

const NW = 168, NH = 74, RX = 14, NEUTRE = "#9AA0A6";

function Graph(svgId){
  const G = {
    steps: [],        // [{n, t, pct, team, auto}]
    edges: [],        // [[a, b]]
    teams: {},        // {clef: {n:"NOM COURT", c:"#hex"}}
    POS: {},
    VUE: { w: 920, h: 380 },
    CAM: { x: 0, y: 0, k: 1 },
    sel: null,
    RANGE: false,     // une carte a-t-elle été déplacée à la main ?
    onPick: null,     // (n) => void
    onFiche: null,    // (n) => void
    onCam: null       // (k) => void — la caméra a bougé
  };

  const byN = (n) => G.steps.find((s) => s.n === n);
  const coul = (n) => {
    const s = byN(n);
    return (s && s.team && G.teams[s.team]) ? G.teams[s.team].c : NEUTRE;
  };

  function etat(s){
    if (s.pct >= 100) return "done";
    if (s.pct > 0)    return "run";
    return "wait";
  }

  /* Le cadre qui accueille le schéma. On range POUR LUI : un rangement qui
     ignore la forme du volet donne un ruban dans un cadre presque carré. */
  function cadre(){
    const el = document.getElementById(svgId);
    const p = el && el.parentNode;
    const r = p && p.getBoundingClientRect ? p.getBoundingClientRect() : null;
    if (r && r.width > 40 && r.height > 40) return { w: r.width, h: r.height };
    return { w: 920, h: 380 };   // avant la première mise en page
  }

  /* Une chaîne pure : aucune étape n'a plus d'un prédécesseur ni plus d'un
     successeur, et il n'y en a qu'une seule. C'est le cas RÉEL — l'agent
     appelle ses outils l'un après l'autre, et drawPlan() les relie en suite.
     Le rangement par couches, juste pour le plan branchant de la maquette,
     donne alors une couche par étape : douze outils appelés faisaient
     2766 px de large pour 144 de haut. */
  function chainePure(){
    const n = G.steps.length;
    if (n < 3 || G.edges.length !== n - 1) return false;
    const pred = {}, succ = {};
    G.steps.forEach((s) => { pred[s.n] = 0; succ[s.n] = 0; });
    for (const [a, b] of G.edges){
      if (succ[a] === undefined || pred[b] === undefined) return false;
      if (++succ[a] > 1 || ++pred[b] > 1) return false;
    }
    return G.steps.filter((s) => pred[s.n] === 0).length === 1;
  }

  /* Rangement par couches : la profondeur d'une étape est la plus longue
     chaîne qui y mène. Repris verbatim, sans la sortie de flux des étapes
     retirées (elles n'existent plus). Il reste juste pour un vrai graphe ;
     une chaîne pure est repliée en rangées, plus bas. */
  function layout(){
    const L = {};
    G.steps.forEach((s) => { L[s.n] = 0; });
    for (let i = 0; i < G.steps.length; i++){
      G.edges.forEach(([a, b]) => { if (L[b] < L[a] + 1) L[b] = L[a] + 1; });
    }
    if (chainePure()) return replier(L);
    const cols = {};
    G.steps.forEach((s) => { (cols[L[s.n]] = cols[L[s.n]] || []).push(s.n); });
    const ks = Object.keys(cols).map(Number).sort((a, b) => a - b);
    const t = {};
    const large = Math.max(1, ...ks.map((k) => cols[k].length));
    const M = 22, PAS = NW + 62, GY = NH + 38;

    const W = M * 2 + ks.length * NW + (ks.length - 1) * (PAS - NW);
    const H = M * 2 + large * GY - (GY - NH);
    const axe = M + (large * GY - (GY - NH)) / 2;
    ks.forEach((k, ci) => {
      const arr = cols[k].sort((x, y) => x - y), h = (arr.length - 1) * GY;
      arr.forEach((n, i) => { t[n] = { x: M + ci * PAS, y: axe - h / 2 - NH / 2 + i * GY }; });
    });
    G.VUE = { w: Math.max(W, 120), h: Math.max(H, 120) };
    return t;
  }

  /* On replie la chaîne : on remplit une rangée, on revient à gauche, on
     continue. TOUTES les rangées se lisent de gauche à droite. Un serpentin —
     une rangée sur deux à l'envers — économiserait le trait de retour, mais
     il ferait payer cette économie à chaque lecture : il faudrait vérifier le
     sens avant de lire. Un texte ne fait pas ça.

     Combien par rangée ? Pas un nombre fixe : on essaie toutes les largeurs et
     on garde celle dont le schéma ressemble le plus au cadre qui l'accueille.
     L'écart est LOGARITHMIQUE, sans quoi « deux fois trop large » pèserait
     moins que « deux fois trop haut » et on retomberait sur le ruban. */
  function replier(L){
    const M = 22, PAS = NW + 62, GY = NH + 38;
    const ordre = G.steps.map((s) => s.n).sort((a, b) => L[a] - L[b] || a - b);
    const n = ordre.length;
    const C = cadre();
    const larg = (c) => M * 2 + c * NW + (c - 1) * (PAS - NW);
    const haut = (r) => M * 2 + r * GY - (GY - NH);

    let best = n;
    // On ne replie que si la rangée unique NE TIENT PAS. Tant qu'elle tient à
    // sa taille naturelle, la couper en deux ferait payer un retour chariot
    // pour rien : replier est un remède, pas une préférence.
    if (larg(n) > C.w){
      let score = Infinity;
      for (let c = 1; c <= n; c++){
        const e = Math.abs(Math.log((larg(c) / haut(Math.ceil(n / c))) / (C.w / C.h)));
        if (e < score - 1e-9){ score = e; best = c; }
      }
    }

    const t = {};
    ordre.forEach((nn, i) => {
      t[nn] = { x: M + (i % best) * PAS, y: M + Math.floor(i / best) * GY };
    });
    G.VUE = { w: Math.max(larg(best), 120), h: Math.max(haut(Math.ceil(n / best)), 120) };
    return t;
  }

  /* Une polyligne à angles arrondis. Elle sert au retour chariot ; le coude à
     trois segments de la maquette garde sa propre fonction, il est réglé pour
     son cas et il n'y a pas de raison de le refaire. */
  function chemin(pts, r){
    if (pts.length < 2) return "";
    let d = "M" + pts[0][0] + " " + pts[0][1];
    for (let i = 1; i < pts.length - 1; i++){
      const p = pts[i - 1], c = pts[i], q = pts[i + 1];
      const d1 = Math.hypot(c[0] - p[0], c[1] - p[1]);
      const d2 = Math.hypot(q[0] - c[0], q[1] - c[1]);
      const rr = Math.min(r, d1 / 2, d2 / 2);
      if (!(rr > 0.5)){ d += " L" + c[0] + " " + c[1]; continue; }
      d += " L" + (c[0] + (p[0] - c[0]) * rr / d1) + " " + (c[1] + (p[1] - c[1]) * rr / d1)
        + " Q" + c[0] + " " + c[1]
        + " " + (c[0] + (q[0] - c[0]) * rr / d2) + " " + (c[1] + (q[1] - c[1]) * rr / d2);
    }
    const e = pts[pts.length - 1];
    return d + " L" + e[0] + " " + e[1];
  }

  /* Le retour chariot. Quand l'étape suivante est à GAUCHE de la précédente,
     coudeAxe() revient en arrière à la hauteur de la carte de départ : le
     trait traverse toute la rangée par-derrière et on ne sait plus d'où il
     part. On sort donc à droite, on longe la marge, on redescend dans le
     couloir entre les deux rangées, on revient à gauche, et on entre par la
     gauche de la suivante. Un geste que personne n'a besoin d'apprendre. */
  function retourChariot(A, B){
    const xR = A.x + NW + 14, xL = B.x - 14;
    const yA = A.y + NH / 2, yB = B.y + NH / 2;
    const yMid = (A.y + NH + B.y) / 2;
    return chemin([[A.x + NW, yA], [xR, yA], [xR, yMid], [xL, yMid], [xL, yB], [B.x, yB]], 12);
  }

  /* Le coude. Trois segments — sortir dans l'axe, traverser à mi-chemin,
     entrer dans l'axe — avec deux angles arrondis. Aligné, c'est une droite. */
  function coudeAxe(u1, v1, u2, v2, r){
    if (Math.abs(v2 - v1) < 2) return "M" + u1 + " " + v1 + " L" + u2 + " " + v1;
    const mu = (u1 + u2) / 2, dv = v2 > v1 ? 1 : -1;
    const rr = Math.min(r, Math.abs(v2 - v1) / 2, Math.abs(mu - u1), Math.abs(u2 - mu));
    return "M" + u1 + " " + v1
      + " L" + (mu - rr) + " " + v1
      + " Q" + mu + " " + v1 + " " + mu + " " + (v1 + rr * dv)
      + " L" + mu + " " + (v2 - rr * dv)
      + " Q" + mu + " " + v2 + " " + (mu + rr) + " " + v2
      + " L" + u2 + " " + v2;
  }

  /* Deux lignes maximum. Au-delà, la liste est là pour ça. */
  function deuxLignes(t, max){
    const w = String(t || "").split(" "), l = ["", ""];
    let k = 0;
    for (const m of w){
      if ((l[k] + " " + m).trim().length <= max || !l[k]) l[k] = (l[k] + " " + m).trim();
      else if (k === 0){ k = 1; l[1] = m; }
      else { l[1] = l[1].slice(0, max - 1) + "…"; break; }
    }
    return l;
  }

  /* La caméra. Le schéma ne bouge pas : c'est le regard qui se déplace. Tout
     le dessin vit dans un seul groupe transformé, donc déplacer ou zoomer ne
     redessine rien — on écrit un attribut. */
  function camApply(){
    const g = document.getElementById("gzoom");
    if (g) g.setAttribute("transform",
      "translate(" + G.CAM.x + " " + G.CAM.y + ") scale(" + G.CAM.k + ")");
    // Le moteur ne prévenait de rien quand la caméra bougeait : l'échelle
    // devait sonder. Elle est prévenue.
    if (G.onCam) G.onCam(G.CAM.k, G.CAM.k === 1 && !G.CAM.x && !G.CAM.y && !G.RANGE);
  }
  function camReset(){
    G.CAM.x = 0; G.CAM.y = 0; G.CAM.k = 1;
    // « Ranger » remet aussi les cartes déplacées à la main : c'est ce qui
    // rend le déplacement supportable — on peut tout défaire d'un geste.
    if (G.RANGE){ G.RANGE = false; animateTo(layout(), 300); }
    camApply();
  }
  /* Le zoom par pas, pour l'échelle. Il zoome autour du CENTRE de la vue,
     là où la molette zoome autour du pointeur : un bouton n'a pas de
     pointeur, et zoomer sur un coin ferait fuir ce qu'on regarde. */
  function camZoom(sens){
    const cx = (G.VUE.w + 24) / 2, cy = (G.VUE.h + 24) / 2;
    const k2 = Math.min(3, Math.max(0.45, G.CAM.k * (sens > 0 ? 1.18 : 1 / 1.18)));
    G.CAM.x = cx - (cx - G.CAM.x) * (k2 / G.CAM.k);
    G.CAM.y = cy - (cy - G.CAM.y) * (k2 / G.CAM.k);
    G.CAM.k = k2;
    camApply();
  }

  function draw(){
    const el = document.getElementById(svgId);
    if (!el) return;
    if (!G.steps.length){ el.innerHTML = ""; return; }
    if (G.POS[G.steps[0].n] === undefined) Object.assign(G.POS, layout());

    el.setAttribute("viewBox", "-12 -12 " + (G.VUE.w + 24) + " " + (G.VUE.h + 24));
    el.style.aspectRatio = (G.VUE.w + 24) + " / " + (G.VUE.h + 24);
    const p = [];

    /* Les liens d'abord : ils passent derrière les cartes. */
    G.edges.forEach(([a, b]) => {
      const A = G.POS[a], B = G.POS[b];
      if (!A || !B) return;
      const d = B.x < A.x
        ? retourChariot(A, B)
        : coudeAxe(A.x + NW, A.y + NH / 2, B.x, B.y + NH / 2, 14);
      const hot = G.sel !== null && (a === G.sel || b === G.sel);
      const sa = byN(a), sb = byN(b);
      const flow = sa && sb && etat(sa) === "done" && etat(sb) === "run";
      const c = coul(a);
      if (flow){
        /* Trois couches pour un lien qui coule : le halo, les tirets qui
           défilent, et un point qui parcourt réellement le tracé. Le point est
           ce qui fait la différence — des tirets disent « ça bouge », un point
           qui avance dit « ceci est en train d'être porté de là à là ». */
        const pid = "fl" + a + "_" + b;
        p.push('<path id="' + pid + '" class="edgeglow" stroke="' + c + '" d="' + d + '"/>');
        p.push('<path class="edge flow" stroke="' + c + '" d="' + d + '"/>');
        p.push('<circle class="pkh" r="7" fill="' + c + '"><animateMotion dur="2.1s"'
          + ' repeatCount="indefinite" calcMode="linear" keyPoints="0;1" keyTimes="0;1">'
          + '<mpath href="#' + pid + '"/></animateMotion></circle>');
        p.push('<circle class="pk" r="3.2" fill="' + c + '"><animateMotion dur="2.1s"'
          + ' repeatCount="indefinite" calcMode="linear" keyPoints="0;1" keyTimes="0;1">'
          + '<mpath href="#' + pid + '"/></animateMotion></circle>');
      } else {
        p.push('<path class="edge' + (hot ? " hot" : "") + '" d="' + d + '"/>');
      }
    });

    G.steps.forEach((s) => {
      const P = G.POS[s.n];
      if (!P) return;
      const e = etat(s), c = coul(s.n);
      const eq = s.team && G.teams[s.team] ? G.teams[s.team] : null;
      const parts = deuxLignes(s.t, 22);
      const l1 = esc(parts[0]), l2 = esc(parts[1]);
      const bar = NW - 28;
      /* La carte prend SA couleur. La maquette la mettait dans le liseré, dans
         le mot d'équipe et dans le lien — mais la carte restait blanche
         (`.node .b{fill:var(--bg)}`) et les terminées ne recevaient qu'un
         voile à 8 %. Sur une suite d'outils qui lisent tous des fichiers, le
         schéma paraissait monochrome : la couleur était là, elle ne portait
         pas.

         On applique à la carte entière la règle d'origine du jeu d'icônes —
         « un glyphe plein n'est jamais un aplat : c'est sa propre couleur à
         18 % ». Le voile `.tint` disparaît : il s'ajoutait au remplissage et
         rendait le TERMINÉ plus dense que ce qui TRAVAILLE, l'inverse de ce
         qu'on veut. Le liseré s'allège d'autant : il n'a plus à porter la
         couleur seul.

         Ce n'est pas faisable en CSS — la couleur arrive en attribut
         `stroke` et aucune règle ne sait la lire. */
      const dens = e === "run" ? 0.19 : (e === "done" ? 0.12 : 0);
      const trait = e === "run" ? 2 : 1.3;
      p.push('<g class="node st-' + e + (G.sel === s.n ? " sel" : "") + '" data-n="' + s.n + '">'
        + '<rect class="glow" x="' + P.x + '" y="' + P.y + '" width="' + NW + '" height="' + NH
          + '" rx="' + RX + '" stroke="' + c + '"/>'
        // En STYLE et non en attribut : `.node .b{fill:var(--bg)}` est une
        // règle CSS, et une règle bat toujours un attribut de présentation.
        // En attribut, la carte serait restée blanche sans que rien ne le dise.
        + '<rect class="b" x="' + P.x + '" y="' + P.y + '" width="' + NW + '" height="' + NH
          + '" rx="' + RX + '" stroke="' + c + '" style="stroke-width:' + trait
          + (dens ? ";fill:" + c + ";fill-opacity:" + dens : "") + '"/>'
        + '<text class="ti" x="' + (P.x + 14) + '" y="' + (P.y + 25) + '">' + l1 + '</text>'
        + (l2 ? '<text class="ti" x="' + (P.x + 14) + '" y="' + (P.y + 41) + '">' + l2 + '</text>' : "")
        + (eq
            ? '<text class="eq" x="' + (P.x + 14) + '" y="' + (P.y + (l2 ? 59 : 47))
              + '" fill="' + c + '">' + esc(eq.n) + '</text>'
            : '<text class="au" x="' + (P.x + 14) + '" y="' + (P.y + (l2 ? 59 : 47))
              + '">SE FAIT TOUT SEUL</text>')
        + (e === "run"
            ? '<rect class="track" x="' + (P.x + 14) + '" y="' + (P.y + NH - 11) + '" width="'
              + bar + '" height="3.5" rx="2"/>'
              + '<rect class="fill" x="' + (P.x + 14) + '" y="' + (P.y + NH - 11) + '" width="'
              + (bar * s.pct / 100) + '" height="3.5" rx="2" fill="' + c + '"/>'
            : "")
        + (e === "done"
            ? '<path class="ok" d="M' + (P.x + NW - 30) + " " + (P.y + NH - 19)
              + 'l4.5 4.5 8-8" stroke="' + c + '" stroke-width="2.4" fill="none"'
              + ' stroke-linecap="round" stroke-linejoin="round"/>'
            : "")
        + '<g class="nact" transform="translate(' + (P.x + NW - 8) + " " + (P.y + 8) + ')">'
        + '<circle class="nact-bg" r="12"/><circle cx="-4.6" cy="0" r="1.5"/>'
        + '<circle cx="0" cy="0" r="1.5"/><circle cx="4.6" cy="0" r="1.5"/>'
        + "<title>Tout savoir de cette étape</title></g>"
        + "</g>");
    });

    el.innerHTML = '<g id="gzoom" transform="translate(' + G.CAM.x + " " + G.CAM.y
      + ") scale(" + G.CAM.k + ')">' + p.join("") + "</g>";
  }

  function animateTo(target, ms){
    ms = ms || 460;
    const from = {};
    G.steps.forEach((s) => { from[s.n] = { x: G.POS[s.n].x, y: G.POS[s.n].y }; });
    const t0 = performance.now();
    (function frame(t){
      const k = Math.min(1, (t - t0) / ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      G.steps.forEach((s) => {
        const n = s.n;
        if (!target[n] || !from[n]) return;
        G.POS[n] = { x: from[n].x + (target[n].x - from[n].x) * e,
                     y: from[n].y + (target[n].y - from[n].y) * e };
      });
      draw();
      if (k < 1) requestAnimationFrame(frame);
    })(t0);
  }

  /* Nouvelles données : on relaie doucement plutôt que de tout sauter en
     place — une carte qui se téléporte fait perdre le fil de ce qu'on suivait. */
  function setData(steps, edges, teams){
    const nouveau = steps.some((s) => G.POS[s.n] === undefined)
      || G.steps.length !== steps.length;
    const inconnues = steps.filter((s) => G.POS[s.n] === undefined).map((s) => s.n);
    G.steps = steps;
    G.edges = edges || [];
    G.teams = teams || {};
    const t = layout();
    // Un rangement à la main survit à l'arrivée d'une étape : seules les
    // NOUVELLES prennent leur place calculée. Sans ce drapeau, `layout()`
    // écrasait la disposition dès qu'un outil de plus était appelé — et
    // pendant qu'un agent travaille, il en arrive toutes les secondes.
    if (G.RANGE){
      inconnues.forEach((n) => { if (t[n]) G.POS[n] = t[n]; });
      draw();
      return;
    }
    if (nouveau){ Object.assign(G.POS, t); draw(); }
    else animateTo(t, 240);
  }

  /* Deux gestes seulement, et aucun bouton : on tire pour déplacer, on roule
     pour zoomer, AUTOUR DU POINTEUR. Un zoom centré sur la fenêtre fait fuir
     ce qu'on regardait. Un seuil de quatre pixels sépare le déplacement du
     clic : sans lui, toute tentative de tirer ouvrirait une fiche. */
  function init(){
    const el = document.getElementById(svgId);
    if (!el) return;
    let pan = null, bouge = false, prise = null;

    /* On prend une carte, on la pose ailleurs. C'est ce qui sépare un schéma
       qu'on regarde d'une carte dont on se sert : quand douze étapes se
       ressemblent, on écarte celle qu'on surveille et on garde sa disposition
       le temps de comprendre.

       Le moteur écoute déjà `mousedown` sur le SVG pour la caméra : le
       déplacement de nœud s'installe donc EN PHASE CAPTURE, avant lui, et
       arrête la propagation quand le geste part d'une carte — sinon on
       déplacerait la vue en croyant déplacer la carte. Même seuil de 4 px,
       sans quoi tout clic décalerait d'un pixel et on ne pourrait plus
       désigner une carte. */
    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const g = e.target.closest && e.target.closest("g.node");
      if (!g || e.target.closest("g.nact")) return;
      const n = +g.dataset.n;
      if (!G.POS[n]) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      prise = { n: n, x: e.clientX, y: e.clientY,
                px: G.POS[n].x, py: G.POS[n].y,
                u: (G.VUE.w + 24) / r.width / G.CAM.k, bouge: false };
      e.stopPropagation();
      e.preventDefault();
    }, true);

    window.addEventListener("mousemove", (e) => {
      if (!prise) return;
      const dx = e.clientX - prise.x, dy = e.clientY - prise.y;
      if (!prise.bouge && Math.abs(dx) + Math.abs(dy) < 4) return;
      prise.bouge = true;
      G.RANGE = true;
      G.POS[prise.n] = { x: prise.px + dx * prise.u, y: prise.py + dy * prise.u };
      draw();
      camApply();
    });
    window.addEventListener("mouseup", () => { prise = null; });

    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      pan = { x: e.clientX, y: e.clientY, cx: G.CAM.x, cy: G.CAM.y };
      bouge = false;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!pan) return;
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      if (!bouge && Math.abs(dx) + Math.abs(dy) < 4) return;
      bouge = true;
      el.classList.add("pan");
      // Le pointeur bouge en pixels, le dessin vit en unités de viewBox : sans
      // ce rapport, le schéma glisse plus vite que la main et le geste colle.
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const u = (G.VUE.w + 24) / r.width;
      G.CAM.x = pan.cx + dx * u;
      G.CAM.y = pan.cy + dy * u;
      camApply();
    });
    window.addEventListener("mouseup", () => { pan = null; el.classList.remove("pan"); });

    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const u = (G.VUE.w + 24) / r.width;
      const px = (e.clientX - r.left) * u - 12, py = (e.clientY - r.top) * u - 12;
      const k2 = Math.min(3, Math.max(0.45, G.CAM.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      G.CAM.x = px - (px - G.CAM.x) * (k2 / G.CAM.k);
      G.CAM.y = py - (py - G.CAM.y) * (k2 / G.CAM.k);
      G.CAM.k = k2;
      camApply();
    }, { passive: false });

    el.addEventListener("dblclick", (e) => { if (!e.target.closest("g.node")) camReset(); });

    el.addEventListener("click", (e) => {
      if (bouge){ bouge = false; return; }   // on tirait, on ne désignait pas
      const g = e.target.closest("g.node");
      if (!g) return;
      const n = +g.dataset.n;
      if (G.sel !== n){ G.sel = n; draw(); if (G.onPick) G.onPick(n); }
      if (e.target.closest("g.nact") && G.onFiche) G.onFiche(n);
    });

    // Le repliage se règle sur la forme du volet : il se recalcule quand elle
    // change. Pas si l'on a rangé à la main — ce serait défaire le rangement.
    window.addEventListener("resize", () => {
      if (!G.steps.length || G.RANGE) return;
      clearTimeout(init._t);
      init._t = setTimeout(() => animateTo(layout(), 240), 90);
    });
  }

  return { state: G, setData, draw, init, camReset, camZoom, layout,
           etat, byN, coul };
}

/* ═══════════════════════════════════════════════════════════════════════════
   LES NOTIFICATIONS
   ---------------------------------------------------------------------------
   NKIND est repris tel quel : c'est un vocabulaire visuel, pas une donnée.
   Une DÉCISION fait sonner le menu et pose une bulle qui NE part pas toute
   seule ; une information pose une bulle qui s'efface. La différence est le
   fond de l'affaire — on ne peut pas rater ce qui attend son accord.
   ═══════════════════════════════════════════════════════════════════════════ */

const NKIND = {
  decision: { ico: "coffre", col: "var(--accent)", bg: "var(--accent-container)", dur: true },
  panne:    { ico: "eclair", col: "#B3261E",       bg: "#FCE8E6",                 dur: true },
  livrable: { ico: "doc",    col: "var(--green)",  bg: "#C4EED0",                 dur: false },
  auto:     { ico: "boucle", col: "var(--muted)",  bg: "var(--surface-hi)",       dur: false }
};

const Notifs = {
  list: [],
  open: false,
  nid: 0,
  onAnswer: null,        // (notif, oui) => Promise|void

  attente(){ return this.list.filter((n) => NKIND[n.kind] && NKIND[n.kind].dur); },

  drawBell(){
    const ic = document.getElementById("bellIc");
    if (!ic) return;
    const k = this.attente().length;
    const dec = this.list.some((n) => n.kind === "decision");
    // Une PANNE passe le badge en rouge — meme signal, autre gravite. Elle
    // prime sur la decision : quand plus rien ne repond, ce n'est plus le
    // moment d'autoriser quoi que ce soit.
    const panne = this.list.some((n) => n.kind === "panne");
    const cl = panne ? " r-panne" : (dec ? " dec" : "");
    ic.innerHTML = svg("cloche", { size: 22, w: 1.6 })
      + (k ? '<span class="badge' + cl + '">' + k + "</span>" : "");
    // Le menu porte un point sur la fenêtre concernée : on sait où aller sans
    // ouvrir le panneau.
    //
    // ⚠ `[data-nav]` et non `.rail-btn` seul. Cette boucle RETIRE les points
    // qu'elle ne reconnaît pas — et la porte des coulisses en porte un aussi,
    // pour dire « le panneau actif est derrière moi ». Sans ce filtre, la
    // pastille de la porte était effacée aussitôt posée : `drawRail` l'écrit,
    // `drawBell` la reprend. Constaté le 2026-08-09.
    //
    // La règle qui en sort : cette boucle ne gouverne que les DESTINATIONS.
    // La porte n'en est pas une, et ce qu'elle signale ne la regarde pas.
    document.querySelectorAll(".rail-btn[data-nav]").forEach((b) => {
      const l = b.querySelector(".lbl");
      if (!l) return;
      const has = this.attente().some((n) => n.panel === l.textContent.trim());
      let d = b.querySelector(".raildot");
      if (has && !d){ d = document.createElement("span"); d.className = "raildot"; b.appendChild(d); }
      if (!has && d) d.remove();
    });
  },

  toggle(e){
    if (e) e.stopPropagation();
    this.open = !this.open;
    const el = document.getElementById("npanel");
    if (!el) return;
    const rw = document.getElementById("railwrap");
    el.style.left = ((rw ? rw.offsetWidth : 72) + 12) + "px";
    el.classList.toggle("on", this.open);
    if (this.open) this.draw();
  },

  close(){
    this.open = false;
    const el = document.getElementById("npanel");
    if (el) el.classList.remove("on");
  },

  _row(n){
    const K = NKIND[n.kind] || NKIND.auto;
    return '<div class="nrow" data-go="' + esc(n.panel) + '">'
      + '<span class="nic" style="background:' + K.bg + ";color:" + K.col + '">'
      + svg(K.ico, { size: 19 }) + "</span>"
      + '<div style="flex:1;min-width:0">'
      + '<div class="nt">' + esc(n.titre) + "</div>"
      + '<div class="nx">' + esc(n.txt) + "</div>"
      + '<div class="nmeta"><span class="o">' + esc(n.obj) + "</span>·<span>"
      + esc(n.when) + "</span></div>"
      // `K.dur && n.oui` et non `K.dur` seul : `dur` dit qu'une bulle NE PART
      // PAS toute seule ; ça ne veut pas dire qu'on a quelque chose a
      // repondre. Une PANNE ne part pas toute seule et ne s'autorise pas —
      // elle n'a donc pas de boutons. Ajoute le 2026-08-09, quand le genre
      // `panne` est devenu le deuxieme genre reellement pousse.
      + (K.dur && n.oui
          ? '<div class="nacts" data-stop="1">'
            + '<button class="yes" data-yes="' + n.id + '">' + esc(n.oui || "Autoriser") + "</button>"
            + '<button class="no" data-no="' + n.id + '">' + esc(n.non || "Refuser") + "</button>"
            + "</div>"
          : "")
      // Un renvoi, quand la bulle ne porte pas toute la décision. Cliquer la
      // ligne mène déjà au panneau (data-go) ; ceci le rend visible.
      + (n.renvoi ? '<span class="u-lien">' + esc(n.renvoi) + "</span>" : "")
      + "</div></div>";
  },

  draw(){
    const host = document.getElementById("npanel");
    if (!host) return;
    const A = this.list.filter((n) => (NKIND[n.kind] || {}).dur);
    const B = this.list.filter((n) => !(NKIND[n.kind] || {}).dur);
    host.innerHTML =
      (A.length ? '<div class="ngroup">À décider · ' + A.length + '<span class="l"></span></div>'
        + A.map((n) => this._row(n)).join("") : "")
      + (B.length ? '<div class="ngroup">Récent<span class="l"></span></div>'
        + B.map((n) => this._row(n)).join("") : "")
      + (this.list.length ? "" : '<div class="empty" style="padding:40px 20px">'
        + '<div class="big">Rien à signaler.</div><div>On vous préviendra.</div></div>');
    this._wire(host);
  },

  _wire(host){
    host.querySelectorAll("[data-yes]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); this.answer(+b.dataset.yes, true); };
    });
    host.querySelectorAll("[data-no]").forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); this.answer(+b.dataset.no, false); };
    });
    host.querySelectorAll(".nrow").forEach((r) => {
      r.onclick = () => { const p = r.dataset.go; if (p && window.nav){ nav(p); this.toggle(); } };
    });
  },

  answer(id, oui){
    const i = this.list.findIndex((n) => n.id === id);
    if (i < 0) return;
    const n = this.list[i];
    // On retire d'abord pour que l'interface réponde tout de suite, mais on
    // sait remettre : si le serveur refuse, la demande revient à sa place.
    this.list.splice(i, 1);
    this.drawBell(); this.draw();
    const remettre = () => { this.list.splice(i, 0, n); this.drawBell(); this.draw(); };
    let p;
    try { p = this.onAnswer ? this.onAnswer(n, oui) : null; }
    catch (e){ remettre(); snack("Refusé par le serveur : " + e.message); return; }
    if (p && typeof p.then === "function"){
      p.catch((e) => { remettre(); snack("Non transmis : " + e.message); });
    }
    snack("« " + n.titre + " » — " + (oui ? "c'est autorisé." : "refusé."));
  },

  push(n){
    n.id = ++this.nid;
    this.list.unshift(n);
    this.drawBell();
    const b = document.getElementById("bell");
    if (b){ b.classList.add("ring"); setTimeout(() => b.classList.remove("ring"), 760); }

    const K = NKIND[n.kind] || NKIND.auto;
    const host = document.getElementById("toasts");
    if (!host) return n.id;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = '<span class="nic" style="background:' + K.bg + ";color:" + K.col + '">'
      + svg(K.ico, { size: 19 }) + "</span>"
      + '<div style="flex:1;min-width:0"><div class="nt">' + esc(n.titre) + "</div>"
      + '<div class="nx">' + esc(n.txt) + "</div>"
      + '<div class="nmeta"><span class="o">' + esc(n.obj) + "</span></div>"
      + (K.dur && n.oui ? '<div class="nacts">'
          + '<button class="yes" data-yes="' + n.id + '">' + esc(n.oui || "Autoriser") + "</button>"
          + '<button class="no" data-no="' + n.id + '">' + esc(n.non || "Refuser") + "</button>"
          + "</div>" : "")
      + (n.renvoi ? '<span class="u-lien">' + esc(n.renvoi) + "</span>" : "")
      + "</div>";
    el.querySelectorAll("[data-yes]").forEach((x) => {
      x.onclick = () => { this.answer(+x.dataset.yes, true); el.remove(); };
    });
    el.querySelectorAll("[data-no]").forEach((x) => {
      x.onclick = () => { this.answer(+x.dataset.no, false); el.remove(); };
    });
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("on"));
    if (!K.dur){
      setTimeout(() => { el.classList.remove("on"); setTimeout(() => el.remove(), 400); }, 5200);
    }
    return n.id;
  },

  /* Retire une demande sans y répondre — le serveur l'a résolue autrement
     (l'agent a été interrompu, la session est morte). */
  drop(id){
    const i = this.list.findIndex((n) => n.id === id);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.drawBell();
    if (this.open) this.draw();
  }
};

/* ═══ Réglages — les rangées, reprises telles quelles ═════════════════════ */

const ligne = (nm, sub, ctl) =>
  '<div class="srow2"><span class="txt">'
  + '<span class="nm">' + esc(nm) + "</span>"
  + '<span class="sub">' + esc(sub) + "</span></span>"
  + '<span class="ctlz">' + (ctl || "") + "</span></div>";

const sw = (on, id) =>
  '<div class="sw ' + (on ? "on" : "") + '"' + (id ? ' data-sw="' + esc(id) + '"' : "")
  + "><i></i></div>";

const titre = (t) => '<div class="seth">' + esc(t) + '<span class="l"></span></div>';

function drawSetNav(sections, sel, onPick){
  const host = document.getElementById("setnav");
  if (!host) return;
  host.innerHTML = sections.map((t, i) =>
    '<button class="' + (i === sel ? "on" : "") + '" data-i="' + i + '">' + esc(t) + "</button>"
  ).join("");
  host.querySelectorAll("button").forEach((b) => {
    b.onclick = () => onPick(+b.dataset.i);
  });
}

/* ═══ Terminal — l'apparence de la fenêtre, sans son contenu inventé ══════ */

const TTHEMES = [
  { id: "nuit",   nm: "Nuit",   bg: "#1E1E1E", fg: "#E8EAED", ac: "#8AB4F8" },
  { id: "encre",  nm: "Encre",  bg: "#0B1220", fg: "#CFE0FF", ac: "#7AA2F7" },
  { id: "papier", nm: "Papier", bg: "#FAF8F5", fg: "#2B2A28", ac: "#0B57D0" },
  { id: "foret",  nm: "Forêt",  bg: "#10201A", fg: "#D6F0E2", ac: "#5FD3A0" }
];

const fermer = closeS;   // alias : la maquette nomme ainsi la fermeture

if (typeof module === "object" && module.exports){
  module.exports = { esc, snack, doUndo, openS, closeS, Graph, Notifs, NKIND,
                     ligne, sw, titre, drawSetNav, TTHEMES, NW, NH, RX };
}
