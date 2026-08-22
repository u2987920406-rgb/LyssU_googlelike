/* Ulysse — LE volet fichier. Un seul ecran pour montrer un fichier.
 *
 * Il y en avait deux, et chacun savait exactement ce que l'autre ignorait :
 *   · `showFile()` ouvrait une MODALE (#sFile) depuis l'Etabli et les
 *     Livrables — elle savait l'image, la taille, le refus au-dela de la
 *     limite, le telechargement ; elle ne savait ni la source ni la copie,
 *     et elle cachait la conversation.
 *   · `openArtifact()` ouvrait un VOLET depuis le fil — il savait la source
 *     et la copie, il ne savait rien du reste.
 * Lequel apparaissait dependait de l'endroit ou l'on avait clique. Pas du
 * fichier, pas de ce qu'on voulait en faire.
 *
 * Il n'en reste qu'un, et c'est le volet : un fichier se lit A COTE de ce qui
 * en parle, la geometrie existe deja (l'Etabli est un volet de droite), et la
 * modale est reservee a ce qui EXIGE une reponse. Lire un document n'exige
 * rien. Voir PASSE-DESIGN-FICHIERS.md §1.
 *
 * La balise `[artifact: <chemin>]` que l'agent pose dans sa reponse devient
 * une carte. Elle designe UN CHEMIN, quel qu'il soit — avant, elle
 * n'acceptait que `/artifacts/…`, c'est-a-dire nulle part ou le travail se
 * fait (§2). Aucune route ne lui est propre : `REST.readFile` lit deja
 * n'importe quel chemin, avec les images, la taille et la limite.
 *
 * Globals empruntes : $ / svg / esc / mdRender / openS (ulysse-view.js),
 * REST / shorten / fmtBytes / decodeDataUrlText / PREVIEW_MAX_BYTES
 * (ulysse-core.js). Ce fichier est charge en dernier dans ulysse.html.
 */

/* La balise designe un chemin — absolu, relatif, avec des espaces, peu
   importe. On s'arrete au premier « ] » et jamais au bout de la ligne : une
   balise non fermee ne doit pas avaler le paragraphe. */
const ARTIFACT_RE = /\[artifact:\s*([^\]\n]+?)\s*\]/g;

/* Ce qu'on sait d'un chemin, garde d'une peinture du fil a l'autre. Le fil se
   repeint souvent ; sans ce cache, chaque peinture redemanderait la taille de
   chaque carte au backend. */
const infoFichiers = new Map();   // chemin -> {ok, size} | "en cours"

function nomDeChemin(p){
  return p.split(/[\\/]/).filter(Boolean).pop() || p;
}

function dossierDeChemin(p){
  const bouts = p.split(/[\\/]/);
  bouts.pop();
  return bouts.join("/");
}

/* Tronque PAR LA TETE. La fin d'un chemin dit ou l'on est ; le debut dit ce
   qu'on savait deja. Un chemin coupe a l'envers ne montre que la partie
   inutile. On coupe sur un separateur pour ne pas coincer un nom en deux. */
function tronqueTete(s, max){
  if (s.length <= max) return s;
  const coupe = s.slice(s.length - max);
  const sep = coupe.indexOf("/");
  return "…/" + (sep >= 0 ? coupe.slice(sep + 1) : coupe);
}

/* Un nom d'icone qui n'existe pas ne leve rien : `svg()` fait `I[k] || {}` et
   rend `<path d="undefined"/>`, soit une pastille vide. C'est arrive ici meme
   — l'icone « table », demandee pour les .csv, n'est pas au registre. On ne
   nomme donc que des icones qui y sont, et test_page.js le verifie maintenant
   sur ce fichier aussi.
   (Le nom est ecrit en toutes lettres, jamais sous la forme d'un appel : le
   garde-fou lit le fichier ENTIER, commentaires compris, et un exemple dans
   une phrase compterait comme un appel.) */
function iconeDe(nom){
  return /\.(md|markdown|mdown|txt|csv)$/i.test(nom) ? "doc" : "fichier";
}

/* ═══ CE QUI A DEUX FAÇONS DE SE REGARDER ═════════════════════════════════
   Le bouton ⟨/⟩ bascule « source / rendu ». Il ne se désactivait que pour un
   fichier binaire — donc devant un CSV il s'allumait, et ne changeait RIEN :
   `renderArtifactBody` ne rendait que le markdown, tout le reste tombait dans
   le même `<pre>`. Un bouton qui s'allume sans agir est exactement ce que ce
   fichier interdit deux lignes plus bas : « un bouton qui ne peut rien faire
   se désactive plutôt que de mentir ». Constaté en ouvrant un CSV produit par
   l'agent, le 2026-08-12.

   Deux corrections, pas une : le CSV gagne son rendu (c'est un tableau, et
   c'est illisible autrement — « ce n'est pas dans le chat qu'il faut les
   développer », kuchu), et le bouton s'éteint pour tout ce qui n'a qu'une
   seule façon d'être lu. */
function aUnRendu(nom){
  return /\.(md|markdown|mdown|csv|tsv)$/i.test(nom || "");
}

/* Le type MIME d'abord — c'est le backend qui l'a lu, pas nous — et le nom en
   secours : `/api/files/read` ne renseigne pas toujours `mime_type`, et un
   fichier sans type reconnu retomberait dans « aperçu impossible » alors que
   ses octets sont bien ceux d'un PDF. */
function estPdf(f){
  return (f.mime || "").indexOf("application/pdf") === 0
    || /\.pdf$/i.test(f.nom || "");
}

/* Le séparateur ne se devine pas au hasard : un export Excel français écrit
   des points-virgules, et lire « a;b;c » comme UNE colonne rendrait un
   tableau d'une seule cellule — pire que le texte brut. On prend celui qui
   découpe le plus régulièrement la première ligne. */
function csvSeparateur(src, nom){
  if (/\.tsv$/i.test(nom || "")) return "\t";
  const tete = src.split(/\r?\n/, 1)[0] || "";
  let best = ",", bestN = -1;
  [",", ";", "\t", "|"].forEach((s) => {
    const n = csvLigne(tete, s).length;
    if (n > bestN){ bestN = n; best = s; }
  });
  return best;
}

/* Une ligne CSV, guillemets compris : « a,"b,c",d » fait TROIS champs, et
   « "il dit ""oui""" » en fait un. Un split() naïf coupe dans le libellé. */
function csvLigne(ligne, sep){
  const out = [];
  let champ = "", dansQuote = false;
  for (let i = 0; i < ligne.length; i++){
    const c = ligne[i];
    if (dansQuote){
      if (c === '"'){
        if (ligne[i + 1] === '"'){ champ += '"'; i++; }
        else dansQuote = false;
      } else champ += c;
    } else if (c === '"'){ dansQuote = true; }
    else if (c === sep){ out.push(champ); champ = ""; }
    else champ += c;
  }
  out.push(champ);
  return out;
}

/* On rend TOUT le fichier — le volet dont le métier est de lire ne cache pas
   la fin (même règle que le markdown, plus bas). Une ligne dont le nombre de
   champs ne colle pas à l'en-tête n'est pas jetée : elle se voit telle
   quelle, sinon le tableau mentirait par omission. */
function csvTableHTML(src, nom){
  const sep = csvSeparateur(src, nom);
  const lignes = src.replace(/\r\n/g, "\n").split("\n")
    .filter((l, i, tab) => l.length || i < tab.length - 1);
  if (!lignes.length) return '<div class="u-art-empty">Fichier vide.</div>';
  const tete = csvLigne(lignes[0], sep);
  let h = '<div class="u-art-tabwrap"><table class="u-art-tab"><thead><tr>'
    + tete.map((c) => "<th>" + esc(c) + "</th>").join("") + "</tr></thead><tbody>";
  for (let i = 1; i < lignes.length; i++){
    if (!lignes[i].length) continue;
    const cs = csvLigne(lignes[i], sep);
    h += "<tr>" + cs.map((c) => "<td>" + esc(c) + "</td>").join("")
      + (cs.length < tete.length
          ? '<td colspan="' + (tete.length - cs.length) + '"></td>' : "")
      + "</tr>";
  }
  return h + "</tbody></table></div>";
}

/* La carte : une icone, le nom, OU IL EST, et une seule action.
   Pas de sous-titre « genere · artefact » : il etait vrai de toutes les
   cartes, donc il n'en distinguait aucune. Une ligne qui ne varie jamais
   n'est pas une information. Dans le fil, une carte est une mention — pas un
   panneau de commandes : source, copie et telechargement sont dans le volet. */
function artifactCardHTML(chemin){
  const nom = nomDeChemin(chemin);
  const ou = dossierDeChemin(chemin);
  return '<span class="f-carte" role="button" tabindex="0" data-fichier="'
    + encodeURIComponent(chemin) + '">'
    + '<span class="f-ic">' + svg(iconeDe(nom), { size: 18 }) + '</span>'
    + '<span class="f-txt">'
    +   '<span class="f-nom">' + esc(nom) + '</span>'
    +   '<span class="f-ou">' + esc(tronqueTete(ou, 34)) + '</span>'
    + '</span>'
    + '<span class="f-go">Ouvrir ›</span>'
    + '</span>';
}

/* On agit APRES mdRender pour ne pas casser le markdown. */
function injectArtifacts(renderedHTML){
  if (renderedHTML.indexOf("[artifact:") === -1) return renderedHTML;
  return renderedHTML.replace(ARTIFACT_RE, (_m, chemin) => artifactCardHTML(chemin));
}

/* ─── La carte dit la taille, et dit quand le fichier n'est pas la ─────────
   Une carte qui promet un fichier absent est un bouton mort : on le dit AVANT
   le clic, pas apres. C'est le seul motif pour lequel la carte interroge le
   backend — une fois par chemin, jamais deux. */
async function completerCarte(carte){
  const chemin = decodeURIComponent(carte.dataset.fichier || "");
  if (!chemin) return;
  let info = infoFichiers.get(chemin);
  if (info === "en cours") return;
  if (!info){
    infoFichiers.set(chemin, "en cours");
    try {
      const d = await REST.readFile(chemin);
      info = { ok: true, size: typeof d.size === "number" ? d.size : null };
    } catch (e){
      info = { ok: false, size: null };
    }
    infoFichiers.set(chemin, info);
  }
  peindreCarte(carte, chemin, info);
}

function peindreCarte(carte, chemin, info){
  const ou = tronqueTete(dossierDeChemin(chemin), 34);
  const cible = carte.querySelector(".f-ou");
  if (!cible) return;
  if (!info.ok){
    carte.classList.add("absent");
    cible.textContent = "introuvable — " + ou;
    const go = carte.querySelector(".f-go");
    if (go) go.textContent = "";
    return;
  }
  cible.textContent = info.size === null ? ou
    : ou + " · " + fmtBytes(info.size);
}

/* Le fil est repeint entierement a chaque tour : les cartes sont des noeuds
   NEUFS a chaque fois, et il faut les recompleter. On observe donc #thread
   plutot que de brancher un appel dans paintThread — le fichier reste
   autonome, et aucune peinture ne peut lui echapper.
   `data-vu` fait converger : nos propres ecritures redeclenchent l'observateur,
   la passe suivante ne trouve plus rien a faire et s'arrete. */
function majCartesFichier(){
  const thread = $("thread");
  if (!thread) return;
  thread.querySelectorAll(".f-carte:not([data-vu])").forEach((c) => {
    c.dataset.vu = "1";
    const chemin = decodeURIComponent(c.dataset.fichier || "");
    const info = infoFichiers.get(chemin);
    // Deja connu : on peint tout de suite, sans redemander.
    if (info && info !== "en cours") peindreCarte(c, chemin, info);
    else completerCarte(c);
  });
}

/* ─── Le volet ────────────────────────────────────────────────────────────
   PAS de backdrop. Le script en fabriquait un pendant que la feuille ecrivait
   trois lignes plus haut « Pas de backdrop masquant » — les deux moities se
   contredisaient par ecrit, trace d'un volet qui avait commence sa vie en
   modale. Et PAS de <aside class="u-art-panel"> : cet element n'avait AUCUNE
   regle, donc `.u-art-body{flex:1}` ne s'appliquait a rien et un document de
   six ecrans etait tronque sans barre de defilement. `.u-art-viewer` est deja
   la colonne flex ; le volet EST l'aside. */
let fichierCourant = null;   // {chemin, nom, texte, dataUrl, mime, size}
let modeSource = false;

function ensureArtifactViewer(){
  const exist = $("artifactViewer");
  if (exist) return exist;
  const host = document.createElement("aside");
  host.id = "artifactViewer";
  host.className = "u-art-viewer";
  host.innerHTML =
    '<header class="u-art-head">'
    +   '<span class="u-art-vic">' + svg("doc", { size: 16 }) + '</span>'
    // Le fil d'Ariane plutot qu'une croix seule : l'Etabli et le volet sont le
    // MEME volet a deux moments — parcourir, puis regarder. On est alle
    // quelque part, on doit pouvoir revenir sans refermer.
    +   '<nav class="f-fil">'
    +     '<button class="f-ici" id="artVOu" title="Revoir ce dossier dans l\'Établi"></button>'
    +     '<span class="f-sep">›</span>'
    +     '<span class="u-art-vname" id="artVName">—</span>'
    +   '</nav>'
    +   '<span class="u-art-vspacer"></span>'
    +   '<span class="f-outils">'
    +     '<button class="u-art-btn" id="artVSource" title="Voir la source">⟨/⟩</button>'
    +     '<button class="u-art-btn" id="artVCopy" title="Copier">' + svg("copier", { size: 15 }) + '</button>'
    +     '<a class="u-art-btn" id="artVDl" title="Télécharger" download>⤓</a>'
    +     '<button class="u-art-btn" id="artVClose" title="Fermer">' + svg("fermer", { size: 15 }) + '</button>'
    +   '</span>'
    + '</header>'
    + '<div class="u-art-body" id="artVBody">'
    +   '<div class="u-art-empty">Sélectionnez un fichier.</div>'
    + '</div>';
  wireArtifactViewer(host);
  const app = $("app");
  if (app) app.appendChild(host); else document.body.appendChild(host);
  return host;
}

/* On cherche les sous-elements DANS host, jamais avec `$` : au moment du
   cablage le host n'est pas encore insere dans le document. */
function wireArtifactViewer(host){
  host.querySelector("#artVClose").onclick = closeArtifactViewer;
  host.querySelector("#artVSource").onclick = () => {
    modeSource = !modeSource;
    renderArtifactBody();
  };
  host.querySelector("#artVCopy").onclick = () => {
    const btn = host.querySelector("#artVCopy");
    if (!fichierCourant || fichierCourant.texte === null) return;
    navigator.clipboard && navigator.clipboard.writeText(fichierCourant.texte);
    btn.classList.add("ok");
    setTimeout(() => btn.classList.remove("ok"), 1100);
  };
  // Revenir au dossier : l'Etabli reprend la main la ou le fichier se trouve.
  host.querySelector("#artVOu").onclick = () => {
    if (!fichierCourant) return;
    const d = dossierDeChemin(fichierCourant.chemin);
    if (typeof ouvrirEtabliSur === "function" && d) ouvrirEtabliSur(d);
  };
}

function renderArtifactBody(){
  const body = $("artVBody");
  const f = fichierCourant;
  if (!f){
    body.innerHTML = '<div class="u-art-empty">Sélectionnez un fichier.</div>';
    return;
  }
  const btnSrc = $("artVSource");
  const btnCopy = $("artVCopy");
  const dl = $("artVDl");
  // Un bouton qui ne peut rien faire se desactive plutot que de mentir : on
  // ne montre pas la source d'une image, on ne copie pas du binaire.
  const texteDispo = f.texte !== null && f.texte !== undefined;
  // Deux façons de lire, ou le bouton n'a rien à basculer : voir `aUnRendu`.
  if (btnSrc) btnSrc.disabled = !texteDispo || !aUnRendu(f.nom);
  if (btnCopy) btnCopy.disabled = !texteDispo;
  if (dl){
    if (f.dataUrl){ dl.href = f.dataUrl; dl.download = f.nom; dl.removeAttribute("aria-disabled"); }
    else { dl.removeAttribute("href"); dl.setAttribute("aria-disabled", "true"); }
  }
  if (btnSrc) btnSrc.classList.toggle("on", modeSource && texteDispo);

  if (f.trop){
    // La modale savait refuser un fichier de 200 Mo — le backend rend le
    // fichier ENTIER en base64 (+33 %) et l'onglet se fige. Le volet le sait
    // maintenant aussi : c'est exactement ce que la fusion devait recuperer.
    body.innerHTML = '<div class="u-todo">Trop volumineux pour un aperçu ('
      + esc(fmtBytes(f.size)) + ", limite " + esc(fmtBytes(PREVIEW_MAX_BYTES))
      + "). Le chemin reste utilisable dans un message à l'agent.</div>";
    return;
  }
  if (f.mime.indexOf("image/") === 0 && f.dataUrl){
    body.innerHTML = '<img src="' + esc(f.dataUrl)
      + '" style="max-width:100%;border-radius:12px" alt="' + esc(f.nom) + '">';
  /* ⚠ UN PDF N'EST PAS « DU BINAIRE QU'ON NE PEUT PAS MONTRER ». Il tombait
     dans la branche d'à côté et le volet répondait « aperçu impossible » —
     alors que le navigateur sait afficher un PDF tout seul, sans bibliothèque.
     kuchu, 2026-08-22 : « je viens de cliquer sur un pdf mais cela ne
     s'affiche pas ». C'est le cas le plus fréquent des Livrables : les veilles
     y sont écrites en PDF.
     `<embed>` plutôt qu'`<iframe>` : c'est ce que le visualiseur intégré de
     Chrome attend, et il ne réclame pas de `sandbox` à régler. La taille est
     déjà bornée plus haut par PREVIEW_MAX_BYTES. */
  } else if (estPdf(f) && f.dataUrl){
    body.innerHTML = '<embed src="' + esc(f.dataUrl) + '" type="application/pdf"'
      + ' style="width:100%;height:100%;min-height:70vh;border:0;border-radius:12px">';
  } else if (!texteDispo){
    body.innerHTML = '<div class="u-art-empty">Fichier binaire — aperçu impossible.</div>';
  /* ⚠ LE DOCUMENT EN ENTIER. Ces deux lignes portaient `shorten(f.texte,
     20000)`, repris de la modale : un fichier de plus de 20 000 caracteres
     perdait sa fin, avec pour tout signal un « … » colle au dernier
     paragraphe. `CONTRAT-INTERFACE.md` en fait 28 683 — on en lisait les deux
     tiers. Trouve parce que la coupe est tombee au milieu d'un `**gras**` et a
     laisse deux asterisques a l'ecran ; sans ce hasard, rien ne l'aurait dit.

     Un volet dont le metier est de LIRE des documents ne peut pas en cacher la
     fin. La limite honnete existe deja et refuse a voix haute :
     PREVIEW_MAX_BYTES (2 Mo), traite plus haut. Entre les deux il n'y avait
     aucune raison de couper — mesure : 2 Mo de markdown se rendent en 282 ms. */
  } else if (modeSource || !aUnRendu(f.nom)){
    body.innerHTML = '<pre class="u-art-raw">' + esc(f.texte) + '</pre>';
  } else if (/\.(csv|tsv)$/i.test(f.nom)){
    body.innerHTML = csvTableHTML(f.texte, f.nom);
  } else {
    body.innerHTML = '<div class="u-md">' + mdRender(f.texte) + '</div>';
  }
  body.scrollTop = 0;
}

/* Ouvrir un contenu QUI N'EST PAS SUR LE DISQUE — un bloc que le modele a
   ecrit dans sa reponse. Meme volet, meme lecture, meme bouton de
   telechargement : c'est le meme geste, et il ne doit pas dependre de l'endroit
   ou les octets se trouvent.

   Demande par kuchu le 2026-08-12 : « Si l'utilisateur souhaite developper ca,
   il cliquera dessus dans l'encart, et la fenetre de browser in-app
   apparaitra. » En Discussion, le modele ne peut RIEN ecrire sur le disque : si
   ce chemin n'existait pas, un CSV produit en Discussion ne pourrait jamais
   etre regarde avant d'etre telecharge a l'aveugle.

   `chemin` reste vide : il n'y en a pas. Le fil d'Ariane le dit avec des mots
   plutot que d'afficher un dossier invente. */
function ouvrirTexteEnMemoire(nom, texte){
  ensureArtifactViewer();
  const app = $("app");
  if (app) app.classList.add("artifact-split");
  modeSource = false;
  const t = String(texte === null || texte === undefined ? "" : texte);
  fichierCourant = {
    chemin: "", nom: nom || "extrait.txt", size: null, mime: "",
    // Le telechargement passe par le meme <a download> que pour un fichier du
    // disque, donc il lui faut une data URL. `encodeURIComponent` + `unescape`
    // pour que les accents survivent a `btoa`, qui ne prend que du latin-1.
    dataUrl: "data:text/plain;charset=utf-8;base64,"
      + btoa(unescape(encodeURIComponent(t))),
    texte: t, trop: false
  };
  $("artVName").textContent = fichierCourant.nom;
  $("artVOu").textContent = "dans cette réponse";
  renderArtifactBody();
}

/* LE point d'entree, pour le fil comme pour l'Etabli et les Livrables. */
async function ouvrirFichier(chemin, nom){
  ensureArtifactViewer();
  const app = $("app");
  if (app) app.classList.add("artifact-split");
  nom = nom || nomDeChemin(chemin);
  modeSource = false;
  fichierCourant = null;
  $("artVName").textContent = nom;
  $("artVOu").textContent = tronqueTete(dossierDeChemin(chemin), 26) || "—";
  const body = $("artVBody");
  body.innerHTML = '<div class="u-art-empty">Lecture…</div>';
  try {
    const d = await REST.readFile(chemin);
    const size = typeof d.size === "number" ? d.size : null;
    const trop = size !== null && size > PREVIEW_MAX_BYTES;
    fichierCourant = {
      chemin: chemin,
      nom: nom,
      size: size,
      mime: d.mime_type || "",
      dataUrl: trop ? "" : (d.data_url || ""),
      texte: trop ? null : decodeDataUrlText(d.data_url || ""),
      trop: trop
    };
    infoFichiers.set(chemin, { ok: true, size: size });
    renderArtifactBody();
  } catch (e){
    infoFichiers.set(chemin, { ok: false, size: null });
    body.innerHTML = '<div class="u-todo">Lecture impossible : ' + esc(e.message) + '</div>';
  }
}

/* Il n'y a plus `openArtifact()` a cote de `showFile()`, ni
   `mountArtifactViewer()` a cote de `ensureArtifactViewer()`. Deux noms pour
   un geste, c'est la meme faute d'un cran plus bas : « les artefacts » d'un
   cote et « les fichiers » de l'autre etaient justement la separation de
   trop. Tout passe par `ouvrirFichier`. */
function closeArtifactViewer(){
  const app = $("app");
  if (app) app.classList.remove("artifact-split");
  fichierCourant = null;
}

/* Delegation : le fil est repeint souvent, la delegation tient.

   On ecoute `[data-fichier]`, PAS `.f-carte` : une carte du fil et une ligne
   d'outil qui a touche un fichier sont deux apparences du meme geste — ouvrir
   ce fichier. Le jour ou un troisieme endroit designe un fichier, il porte
   l'attribut et il marche. */
(function wireArtifactClicks(){
  const thread = $("thread");
  if (!thread) return;
  const depuis = (e) => {
    // Le « ▸ resultat » d'une ligne d'outil se deplie, et le ⤓ d'un livrable
    // emporte : ce sont leurs propres gestes, ils ne doivent pas ouvrir le
    // volet par-dessus.
    if (e.target.closest && (e.target.closest("details")
        || e.target.closest(".l-dl"))) return null;
    const c = e.target.closest && e.target.closest("[data-fichier]");
    return c && c.dataset.fichier && !c.classList.contains("absent") ? c : null;
  };
  thread.addEventListener("click", (e) => {
    const c = depuis(e);
    if (c) ouvrirFichier(decodeURIComponent(c.dataset.fichier));
  });
  thread.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const c = depuis(e);
    if (c){ e.preventDefault(); ouvrirFichier(decodeURIComponent(c.dataset.fichier)); }
  });
  // Chaque peinture du fil apporte des cartes neuves : on les complete.
  if (typeof MutationObserver === "function"){
    new MutationObserver(majCartesFichier).observe(thread, { childList: true, subtree: true });
  }
  majCartesFichier();
})();
