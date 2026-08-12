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
/* ═══ Rendu markdown léger et sûr (offline, sans dépendance) ════════════
   Le texte de l'agent arrive en markdown brut. On l'échappe d'abord
   (esc) pour neutraliser tout HTML, PUIS on reconstruit du HTML sûr.
   Ordre des passes : blocs (code, tableaux, listes, citations, HR, titres)
   avant l'inline (gras/italique/code) qui opère sur chaque fragment.

   ── QUATRE DÉFAUTS CORRIGÉS LE 2026-08-11 ────────────────────────────────
   Ils vivaient déjà dans les bulles ; le volet, qui rend des documents
   ENTIERS, les a rendus impossibles à ignorer.

   1. UNE LIGNE ÉTAIT UN PARAGRAPHE. Chaque ligne devenait son propre <p>.
      Nos fichiers sont coupés à 78 colonnes : chaque paragraphe arrivait
      donc en escalier, une ligne par bloc. Et comme l'inline s'appliquait
      ligne par ligne, un `**gras**` à cheval sur deux lignes restait
      littéral, astérisques comprises.
      En markdown, un retour à la ligne simple est un RETOUR DE MISE EN
      PAGE : les lignes consécutives forment un seul paragraphe. C'est ce
      qu'on fait — et le gras traverse le retour tout seul.

   2. LES BLOCS INDENTÉS N'ÉTAIENT PAS VUS. `/^>\s?/` exigeait la colonne
      zéro : une citation dans une liste s'affichait avec son chevron en
      clair. On enlève l'indentation avant de reconnaître le bloc.

   3. AUCUN BLOC DE CODE. Les ``` n'existaient pas dans ce fichier. Ça
      passait tant qu'une ligne valait un paragraphe ; en joignant les
      lignes (défaut 1), un bloc de code serait devenu UNE SEULE LIGNE.
      Corriger le premier obligeait donc à écrire le troisième.

   4. Le CSS était écrit `.msg .u-md` — voir ulysse.css. Dans le volet, le
      markdown n'avait aucun style. Les règles suivent maintenant la
      classe, pas l'endroit.
   ────────────────────────────────────────────────────────────────────── */
/* Les langues qui font d'un bloc un FICHIER. Fermée, et volontairement.

   ⚠ UN BLOC DE CODE N'EST PAS TOUJOURS UN LIVRABLE. Une URL dans un
   ` ```texte `, une commande d'exemple en ` ```bash `, trois lignes citées :
   ce sont des ILLUSTRATIONS. Le 2026-08-12, un bloc contenant une seule URL
   s'est vu proposer au téléchargement — du bruit, et une liste qui contient
   du bruit cesse d'être lue.
   On préfère oublier un livrable que d'en inventer trois. */
const LANGUES_FICHIER = {
  csv: 1, json: 1, md: 1, markdown: 1, html: 1, css: 1, js: 1, javascript: 1,
  py: 1, python: 1, sql: 1, xml: 1, yaml: 1, yml: 1, svg: 1, ts: 1,
  typescript: 1
};

/* Ce qui suit la clôture d'un bloc — « ```csv », « ```csv ventes.csv », rien.
   On en tire un NOM DE FICHIER et une étiquette.

   ⚠ JAMAIS UN NOM INVENTÉ QUI RESSEMBLE À UN VRAI. Mieux vaut « extrait.csv »
   qu'un « rapport-final.csv » que personne n'a demandé : un nom plausible fait
   croire à une intention qui n'existe pas. Et on n'accepte comme nom que ce
   qui EST un nom — pas de chemin, pas de « .. », rien qui puisse viser
   ailleurs que le dossier de téléchargement. */
function nomDeBloc(info){
  const bouts = String(info || "").trim().split(/\s+/).filter(Boolean);
  const langue = (bouts[0] || "").toLowerCase().replace(/[^a-z0-9+#-]/g, "");
  const propose = bouts.slice(1).join(" ").trim();
  if (propose && /^[^\\/:*?"<>|]+\.[A-Za-z0-9]{1,8}$/.test(propose)
      && propose.indexOf("..") < 0){
    return { nom: propose, etiquette: propose, explicite: true };
  }
  const EXT = { js: "js", javascript: "js", json: "json", csv: "csv", md: "md",
                markdown: "md", html: "html", css: "css", py: "py",
                python: "py", sql: "sql", xml: "xml", yaml: "yaml", yml: "yaml",
                svg: "svg", sh: "sh", bash: "sh", txt: "txt" };
  const ext = EXT[langue] || "txt";
  /* `explicite` dit si le NOM vient de l'agent ou de moi. La différence n'est
     pas cosmétique : elle décide seule si le bloc entre dans l'encart de fin.
     Sans elle, on lisait « le nom deviné n'est pas extrait.txt donc c'est un
     fichier » — et ` ```bash `, qui donne extrait.sh, passait. */
  return { nom: "extrait." + ext, etiquette: langue || "texte", explicite: false };
}

function mdRender(src, prof){
  if (src === null || src === undefined) return "";
  const lines = String(src).split(/\r?\n/);
  const out = [];
  let i = 0;
  let inUl = false, inOl = false;
  // Les lignes du paragraphe en cours. Elles attendent d'être jointes : un
  // bloc qui commence les fait sortir d'abord.
  let para = [];
  const videPara = () => {
    if (!para.length) return;
    out.push("<p>" + inline(para.join(" ")) + "</p>");
    para = [];
  };
  // Le texte BRUT du point de liste en cours — il sert à le redécorer en
  // entier quand une ligne de continuation s'y ajoute. `null` = pas de point
  // ouvert, donc rien à prolonger.
  let liTexte = null;
  const closeLists = () => {
    videPara();
    liTexte = null;
    if (inUl){ out.push("</ul>"); inUl = false; }
    if (inOl){ out.push("</ol>"); inOl = false; }
  };
  // inline : reçoit du TEXTE BRUT, échappe d'abord (sécurité) puis décore.
  const inline = (s) => {
    let x = esc(s);
    x = x.replace(/`([^`]+)`/g, '<code>$1</code>');
    /* ⚠ `[^*]+` ne pouvait pas franchir une asterisque — donc un gras qui en
       contient une echouait, et laissait ses quatre asterisques a l'ecran.
       Le cas reel : `**Les `apercu-*.html` RECOPIENT la feuille**`, ou
       l'asterisque est dans un `code`, deja transforme en <code> juste
       au-dessus. Vu dans CONTRAT-INTERFACE.md.
       Motif paresseux : il s'arrete au `**` le PLUS PROCHE, donc deux gras
       cote a cote restent deux gras. `(?=\S)` et le `\S` final exigent que le
       contenu ne commence ni ne finisse par une espace — sans quoi
       « a ** b ** c » deviendrait du gras. */
    x = x.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
    x = x.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    x = x.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return x;
  };
  const splitRow = (r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "")
    .split("|").map((c) => c.trim());
  while (i < lines.length){
    const brut = lines[i].replace(/\s+$/, "");
    // On reconnaît le bloc SANS son indentation : une citation ou une liste
    // dans un point de liste est indentée, et elle reste une citation.
    const line = brut.replace(/^\s+/, "");
    const indente = line !== "" && brut !== line;

    // --- Bloc de code ``` ou ~~~ ---
    // Le contenu se prend sur les lignes BRUTES : son indentation EST le
    // code. Et il se prend en premier — à l'intérieur d'un bloc de code,
    // rien n'est du markdown, surtout pas un « # » ou un « - » en tête.
    const cloture = line.match(/^(```+|~~~+)(.*)$/);
    if (cloture){
      closeLists();
      const marque = cloture[1][0] === "`" ? "```" : "~~~";
      const code = [];
      i++;
      while (i < lines.length
             && !new RegExp("^\\s*" + marque).test(lines[i])){
        code.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;   // la ligne de fermeture
      /* Un bloc jamais fermé n'est pas une raison de perdre le texte : on le
         rend quand même, jusqu'à la fin.

         ⚠ ET ON PEUT L'EMPORTER. Un bloc de code EST un fichier qui s'ignore :
         il a un contenu, souvent une langue, parfois un nom. On lui ajoute
         donc de quoi partir sur le disque — et rien d'autre.
         PAS DE CARTE : la carte de fichier désigne un fichier qui EXISTE et
         qu'on va lire ; ici il n'y a rien à ouvrir, il y a un texte à
         emporter. Deux choses différentes, deux apparences.
         La règle NE DÉPEND PAS DU MODE : un bloc s'emporte en Discussion
         comme en Cowork. La rendre valable d'un seul côté serait une seconde
         mécanique pour la même chose.
         Voir PASSE-DESIGN-CHAT-NON-BLOQUANT.md §3. */
      /* ⚠ PAS DE BOUTON ICI. Il y en a eu un — un ⤓ au coin du bloc, construit
         le 2026-08-12 à 1 h. Il était NOYÉ : gris sur gris, au milieu du
         texte, visible au survol seulement. kuchu a lu la réponse en entier,
         regardé la fin, et n'a rien vu — alors que trois fichiers
         l'attendaient au milieu.
         Ce qu'on emporte ne se range pas dans la phrase qui en parle : ça se
         range À LA FIN, là où on arrive quand on a fini de lire. L'encart des
         livrables (`l-livrables`, ulysse-app.js) le remplace — il ne s'y
         ajoute pas, sinon le même fichier porterait deux boutons.
         Voir PASSE-DESIGN-LIVRABLES-DU-TOUR.md §1 et §2. */
      out.push('<pre class="u-md-c"><code>' + esc(code.join("\n")) + "</code></pre>");
      continue;
    }
    // --- Tableau : | en-tête |, ligne |---|, lignes corps | ... | ---
    if (/^\|/.test(line) && /\|$/.test(line) && lines[i + 1]
        && /^[\s|]*-+[\s|:-]*$/.test(lines[i + 1].trim())
        && lines[i + 1].includes("-")){
      closeLists();
      const head = splitRow(line);
      i += 2; // saute en-tête + séparateur
      let body = "";
      while (i < lines.length && /^\s*\|/.test(lines[i])){
        const cells = splitRow(lines[i].trim());
        body += "<tr>" + cells.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>";
        i++;
      }
      out.push('<table class="u-md-t"><thead><tr>'
        + head.map((c) => "<th>" + inline(c) + "</th>").join("")
        + '</tr></thead><tbody>' + body + "</tbody></table>");
      continue;
    }
    // --- Séparateur horizontal ---
    if (/^(\*\*\*|---|___)\s*$/.test(line)){
      closeLists();
      out.push("<hr>");
      i++;
      continue;
    }
    /* --- Citation > ---
       Le contenu d'une citation est du markdown : elle peut porter du gras,
       une liste, un titre. On retire le chevron et on RELANCE le rendu
       dessus. Avant, chaque ligne était collée à la suivante par un <br>,
       donc une citation coupée à 78 colonnes arrivait en escalier elle
       aussi, et son gras ne franchissait pas plus le retour.
       `prof` borne la récursion : une citation dans une citation est
       normale, cinquante ne le sont pas. */
    if (/^>/.test(line)){
      closeLists();
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])){
        buf.push(lines[i].replace(/\s+$/, "").replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push("<blockquote>"
        + ((prof || 0) < 4 ? mdRender(buf.join("\n"), (prof || 0) + 1)
                           : "<p>" + inline(buf.join(" ")) + "</p>")
        + "</blockquote>");
      continue;
    }
    // --- Titre # ## ### ---
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h){
      closeLists();
      const lvl = h[1].length;
      out.push("<h" + lvl + ' class="u-md-h">' + inline(h[2]) + "</h" + lvl + ">");
      i++;
      continue;
    }
    // --- Liste non ordonnée - * + ---
    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul){
      videPara();
      if (inOl){ out.push("</ol>"); inOl = false; }
      if (!inUl){ out.push("<ul class=\"u-md-l\">"); inUl = true; }
      liTexte = ul[1];
      out.push("<li>" + inline(liTexte) + "</li>");
      i++;
      continue;
    }
    // --- Liste ordonnée 1. 2. ---
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol){
      videPara();
      if (inUl){ out.push("</ul>"); inUl = false; }
      if (!inOl){ out.push("<ol class=\"u-md-l\">"); inOl = true; }
      liTexte = ol[1];
      out.push("<li>" + inline(liTexte) + "</li>");
      i++;
      continue;
    }
    // --- Ligne vide : sépare paragraphes, ferme listes ---
    if (line === ""){
      closeLists();
      i++;
      continue;
    }
    /* --- La suite d'un point de liste ---
       Un point coupé à 78 colonnes continue INDENTÉ sous sa puce. Sans ce
       cas, la suite sortait de la liste et devenait un paragraphe à elle
       seule : c'est l'escalier, et il frappait d'abord les listes, dont ces
       documents sont faits.

       ⚠ ON RECONSTRUIT LE POINT ENTIER, on ne colle pas la ligne décorée à
       la précédente. Écrit d'abord en `inline(line)` puis concaténé, ce cas
       redécorait CHAQUE LIGNE SÉPARÉMENT — donc un `**gras**` à cheval sur
       le retour restait littéral, à l'intérieur des listes, alors qu'il
       venait d'être réparé pour les paragraphes. Trouvé le soir même en
       ouvrant PASSE-DESIGN-CHAT-NON-BLOQUANT.md dans le volet : le premier
       point de la page montrait ses astérisques.
       Le texte BRUT du point est donc gardé, et l'inline s'applique une
       seule fois, sur le point complet. */
    if ((inUl || inOl) && indente && !para.length && liTexte !== null
        && out.length && /<\/li>$/.test(out[out.length - 1])){
      liTexte += " " + line;
      out[out.length - 1] = "<li>" + inline(liTexte) + "</li>";
      i++;
      continue;
    }
    // --- Paragraphe : on ACCUMULE, on ne pousse pas ---
    if (inUl || inOl) closeLists();
    para.push(line);
    i++;
  }
  closeLists();
  return out.join("");
}


/* Emporter un bloc de code. UNE SEULE délégation, sur le document : un bloc
   est rendu dans le fil, dans le volet, et partout où `.u-md` apparaîtra
   demain. Brancher le geste par endroit, c'est le même piège que les deux
   visualiseurs — il finirait par marcher ici et pas là.

   Rien ne touche le disque tant que la personne ne clique pas, et ce clic EST
   son accord : il n'y a rien à approuver parce qu'il n'y a rien à risquer.
   Voir PASSE-DESIGN-CHAT-NON-BLOQUANT.md §1.

   `Blob` + `createObjectURL` plutôt qu'une data URL : le contenu peut peser,
   et une data URL le recopierait en base64 dans le DOM (+33 %). L'URL est
   révoquée juste après — un objet non révoqué reste en mémoire jusqu'au
   rechargement de la page. */
function emporter(nom, contenu){
  const url = URL.createObjectURL(new Blob([contenu],
    { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nom || "extrait.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Sépare un texte d'agent en DEUX : ce qui se lit, et ce qui s'emporte.

   ⚠ UNE SEULE FONCTION POUR LES DEUX, et c'est le point. Le fil affiche
   `texte`, l'encart liste `livrables` : s'ils étaient calculés séparément, un
   bloc pourrait un jour disparaître du fil sans arriver dans l'encart — et il
   serait perdu sans que rien ne le dise.

   Pourquoi le contenu quitte le fil (kuchu, 2026-08-12) : « Les fichiers CSV
   ne doivent pas être développés dans le chat. Ça prend de la place pour rien,
   et ce n'est pas là qu'il faut les développer. » Un CSV de 300 lignes déroulé
   dans la conversation enterre la réponse qui l'explique. Le fichier se
   regarde dans le volet, en cliquant — pas en faisant défiler.

   On travaille sur la SOURCE, pas sur le HTML : le rendu échappe et décore,
   alors qu'un fichier doit partir avec les octets que l'agent a écrits. */
function decouperLivrables(src){
  const lignes = String(src || "").split(/\r?\n/);
  const out = [];
  const reste = [];
  let i = 0;
  while (i < lignes.length){
    const brut = lignes[i];
    const m = brut.replace(/\s+$/, "").replace(/^\s+/, "")
      .match(/^(```+|~~~+)(.*)$/);
    if (!m){ reste.push(brut); i++; continue; }
    const marque = m[1][0] === "`" ? "```" : "~~~";
    const info = String(m[2] || "").trim();
    const corps = [];
    const cloture = i;
    i++;
    while (i < lignes.length && !new RegExp("^\\s*" + marque).test(lignes[i])){
      corps.push(lignes[i]);
      i++;
    }
    /* Un bloc NON CLOS n'est pas un fichier : c'est un bloc qui coule encore.
       Le retirer du fil pendant qu'il arrive ferait clignoter la réponse, et
       le proposer à l'emport livrerait un fichier tronqué. */
    const clos = i < lignes.length;
    if (clos) i++;
    const langue = (info.split(/\s+/)[0] || "").toLowerCase();
    const nomme = nomDeBloc(info);
    // Une langue de fichier, OU un nom donné par l'agent. Et au moins deux
    // lignes : une URL seule, un nom de commande, un chiffre — pas un fichier.
    // `texte`, `bash`, `console`, ou rien du tout : ça reste un extrait.
    const estFichier = clos && (!!LANGUES_FICHIER[langue] || nomme.explicite)
                       && corps.filter((l) => l.trim()).length >= 2;
    if (estFichier){
      out.push({ nom: nomme.nom, contenu: corps.join("\n"),
                 lignes: corps.length,
                 type: (nomme.nom.split(".").pop() || "").toUpperCase() });
    } else {
      // Un extrait reste où il est, tel qu'il est — clôtures comprises.
      for (let k = cloture; k < i; k++) reste.push(lignes[k]);
    }
  }
  return { texte: reste.join("\n"), livrables: out };
}

/* Les seuls livrables — pour qui n'a pas besoin du texte restant. */
function livrablesDuTexte(src){ return decouperLivrables(src).livrables; }

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

/* « depuis 20 min » se lit sans calcul ; « 14:32 » demande de savoir quelle
   heure il est. Pour ce qui dure, on dit la DURÉE.

   Signalé par Cowork le 2026-08-10 : `when` était une chaîne posée une fois à
   la création — `"à l'instant"` — et jamais recalculée. Une panne qui durait
   depuis vingt minutes disait encore « à l'instant », alors que « depuis
   quand » est la seule chose qu'on veuille savoir d'une panne. Vingt secondes,
   c'est un hoquet ; vingt minutes, c'est qu'il faut faire quelque chose. */
function depuis(t){
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return "depuis " + m + " min";
  return "depuis " + Math.round(m / 60) + " h";
}

const Notifs = {
  list: [],
  open: false,
  nid: 0,
  onAnswer: null,        // (notif, oui) => Promise|void

  /* Comment un identifiant de panneau s'écrit à l'écran.
     Ce fichier ne connaît pas `PANELS` — il rend, il ne sait pas d'où vient ce
     qu'il rend. L'appelant pose la traduction ; à défaut, l'identifiant fait
     l'affaire. Une table recopiée ici serait une seconde source de vérité pour
     les dix libellés, et la première divergence ne se verrait qu'à l'écran. */
  libelle: (id) => id,

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
    //
    // ⚠ On compare sur `data-nav` — l'IDENTIFIANT — et non sur le libellé
    // affiché. `n.panel` est un identifiant : c'est lui que `nav()` reçoit
    // quand on clique la ligne. Or l'identifiant et le libellé ne coïncident
    // que par hasard : « Discuter » oui, mais « Reglages » s'affiche
    // « Réglages », et « Plan » s'affiche « Ce que fait l'agent ». Une
    // notification rangée sur l'un de ces deux panneaux n'aurait jamais eu son
    // point, en silence. Constaté le 2026-08-10 en donnant enfin une
    // destination à la panne.
    document.querySelectorAll(".rail-btn[data-nav]").forEach((b) => {
      const has = this.attente().some((n) => n.panel === b.dataset.nav);
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

  /* Ce que la bulle DEMANDE, et non ce qu'elle dure.

     `K.dur && n.oui` est répété tel quel depuis `_row` ci-dessous : c'est le
     fond du §1 de la passe — si le groupe se décidait sur autre chose que
     l'affichage, l'écran rangerait sur un critère et montrerait l'autre. Une
     seule expression, employée aux deux endroits, ne peut pas diverger. */
  aBoutons(n){
    const K = NKIND[n.kind] || NKIND.auto;
    return !!(K.dur && n.oui);
  },

  _row(n){
    const K = NKIND[n.kind] || NKIND.auto;
    // `n.t` est l'horodatage posé par `push`. `n.when` reste le repli pour une
    // bulle fabriquée à la main (les tests, un appel direct) : on ne rend pas
    // « depuis 57 ans » parce qu'un appelant a oublié la date.
    const quand = n.t ? depuis(n.t) : (n.when || "");
    return '<div class="nrow" data-go="' + esc(n.panel) + '">'
      + '<span class="nic" style="background:' + K.bg + ";color:" + K.col + '">'
      + svg(K.ico, { size: 19 }) + "</span>"
      + '<div style="flex:1;min-width:0">'
      + '<div class="nt">' + esc(n.titre) + "</div>"
      + '<div class="nx">' + esc(n.txt) + "</div>"
      + '<div class="nmeta n-meta-va"><span class="o">' + esc(n.obj) + "</span>·<span"
      + (n.kind === "panne" ? ' class="n-depuis"' : "") + ">"
      + esc(quand) + "</span>"
      // Où mène la ligne. `data-go` est là depuis toujours et rien ne le
      // disait. Le LIBELLÉ, jamais l'identifiant : c'est exactement la
      // confusion que `drawBell()` vient de corriger, et il aurait été
      // dommage de la réintroduire dans l'écran d'à côté.
      + (n.panel
          ? '<span class="n-va">' + esc(this.libelle(n.panel))
            + svg("suivant", { size: 13 }) + "</span>"
          : "")
      + "</div>"
      // `K.dur && n.oui` et non `K.dur` seul : `dur` dit qu'une bulle NE PART
      // PAS toute seule ; ça ne veut pas dire qu'on a quelque chose a
      // repondre. Une PANNE ne part pas toute seule et ne s'autorise pas —
      // elle n'a donc pas de boutons. Ajoute le 2026-08-09, quand le genre
      // `panne` est devenu le deuxieme genre reellement pousse.
      + (this.aBoutons(n)
          ? '<div class="nacts" data-stop="1">'
            + '<button class="yes" data-yes="' + n.id + '">' + esc(n.oui || "Autoriser") + "</button>"
            + '<button class="no" data-no="' + n.id + '">' + esc(n.non || "Refuser") + "</button>"
            + "</div>"
          : "")
      // Une bulle sans boutons n'est pas une bulle ratée : c'est une bulle qui
      // n'a rien à demander. Mais alors rien ne dirait ce qu'il y a à faire.
      // Une ligne, sans bouton — on ne déguise pas un conseil en choix : un
      // bouton engage le produit, ici c'est la personne qui agit, ailleurs.
      + (n.kind === "panne"
          ? '<div class="n-quoi">Si ça dure, fermez la fenêtre « Ulysse-Serve » et '
            + "relancez <code>lancer_ulysse.bat</code>.</div>"
          : "")
      // Un renvoi, quand la bulle ne porte pas toute la décision. Cliquer la
      // ligne mène déjà au panneau (data-go) ; ceci le rend visible.
      + (n.renvoi ? '<span class="u-lien">' + esc(n.renvoi) + "</span>" : "")
      + "</div></div>";
  },

  /* Trois groupes, séparés sur ce que la bulle DEMANDE.

     `dur` veut dire « ne part pas toute seule », pas « il faut répondre ».
     Tant que `decision` était le seul genre poussé, les deux se confondaient.
     Depuis qu'une panne entre ici, grouper sur `dur` mettait dans « À
     décider » une chose qu'on ne décide pas. Signalé par Cowork le
     2026-08-10, en écho à la correction des boutons de la veille.

     L'ordre n'est pas un détail : ce qui bloque l'agent passe devant ce qui
     ne bloque personne. */
  draw(){
    const host = document.getElementById("npanel");
    if (!host) return;
    const rep = this.list.filter((n) => this.aBoutons(n));
    const mal = this.list.filter((n) => !this.aBoutons(n) && (NKIND[n.kind] || {}).dur);
    const res = this.list.filter((n) => !(NKIND[n.kind] || {}).dur);
    // `enTete` et non `titre` : `titre` est déjà une fonction GLOBALE de ce
    // fichier. La masquer ici marcherait, et piégerait le prochain qui
    // l'appellerait depuis `draw`.
    const enTete = (cl, txt, k) =>
      '<div class="n-groupe' + (cl ? " " + cl : "") + '">' + txt
      + (k ? '<span class="k">' + k + "</span>" : "") + '<span class="l"></span></div>';
    host.innerHTML =
      (rep.length ? enTete("", "Votre réponse est attendue", rep.length)
        + rep.map((n) => this._row(n)).join("") : "")
      + (mal.length ? enTete("panne", "Ce qui ne va pas", mal.length)
        + mal.map((n) => this._row(n)).join("") : "")
      + (res.length ? enTete("", "Récent", 0)
        + res.map((n) => this._row(n)).join("") : "")
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
    // Répondu depuis le panneau : le bandeau flottant tombe aussi. Sans ça, on
    // répond dans la cloche et la question reste posée à l'écran.
    this.dropToast(id);
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
    // L'horodatage, et non une phrase : c'est lui qui permet au panneau de
    // dire « depuis 20 min » à l'ouverture plutôt que « à l'instant » pour
    // toujours. Posé ici, au seul endroit par lequel toute bulle passe.
    if (!n.t) n.t = Date.now();
    this.list.unshift(n);
    this.drawBell();
    const b = document.getElementById("bell");
    if (b){ b.classList.add("ring"); setTimeout(() => b.classList.remove("ring"), 760); }

    const K = NKIND[n.kind] || NKIND.auto;
    const host = document.getElementById("toasts");
    if (!host) return n.id;
    const el = document.createElement("div");
    el.className = "toast";
    /* ⚠ LE BANDEAU DOIT POUVOIR ÊTRE RETROUVÉ. Il vivait sans identité : `drop`
       ne connaissait que `this.list`, donc il retirait la demande de la cloche
       et laissait le bandeau flotter — avec ses deux boutons. Vu le 2026-08-12,
       la première fois que la porte d'accord s'est ouverte pour de vrai : après
       un refus donné DANS LE FIL, « Autoriser une fois » restait à l'écran.
       Le clic ne réautorisait rien (`answer` sort si l'entrée a disparu) : il
       ne faisait RIEN, sans un mot. Un bouton vivant sur une décision déjà
       prise est pire qu'un bouton absent. */
    el.dataset.nid = n.id;
    el.innerHTML = '<span class="nic" style="background:' + K.bg + ";color:" + K.col + '">'
      + svg(K.ico, { size: 19 }) + "</span>"
      + '<div style="flex:1;min-width:0"><div class="nt">' + esc(n.titre) + "</div>"
      + '<div class="nx">' + esc(n.txt) + "</div>"
      + '<div class="nmeta"><span class="o">' + esc(n.obj) + "</span></div>"
      + (this.aBoutons(n) ? '<div class="nacts">'
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

  /* Le bandeau flottant est le TROISIÈME endroit où vit une demande — après la
     cloche et le fil. Les trois doivent tomber ensemble : une décision prise
     quelque part est prise partout. */
  dropToast(id){
    const el = document.querySelector('#toasts .toast[data-nid="' + id + '"]');
    if (!el) return;
    /* Les boutons partent TOUT DE SUITE, la carte s'efface ensuite. L'inverse
       — laisser vivre les boutons pendant les 400 ms du fondu — rouvrirait la
       fenêtre qu'on vient de fermer, en plus petit. */
    const actes = el.querySelector(".nacts");
    if (actes) actes.remove();
    el.classList.remove("on");
    setTimeout(() => el.remove(), 400);
  },

  /* Retire une demande sans y répondre — le serveur l'a résolue autrement
     (l'agent a été interrompu, la session est morte). */
  drop(id){
    const i = this.list.findIndex((n) => n.id === id);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.dropToast(id);
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
