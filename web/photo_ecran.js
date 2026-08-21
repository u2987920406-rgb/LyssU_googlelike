/* photo_ecran.js — une PHOTOGRAPHIE d'un ecran d'Ulysse, avec ses vraies donnees.
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Les bancs verifient ce que la page DIT — le texte, les valeurs, ce qui part
 * vers Hermes. Ils ne verifient pas ce qu'elle a l'AIR. jsdom n'a pas de moteur
 * de mise en page : un bouton de travers, une carte qui deborde, une marge
 * oubliee y passent au vert. Le 2026-08-12, une regle CSS ajoutee a l'aveugle
 * n'a pu etre jugee par personne — l'extension du navigateur ne repondait pas,
 * et 857 verifications ne savaient rien en dire.
 *
 * Ce script monte la page comme le banc reel — scripts pris sur le serveur,
 * vrai Hermes au bout — va sur l'ecran demande, et recopie la page. Le fichier
 * obtenu s'ouvre d'un double-clic, dans n'importe quel navigateur, et montre
 * la mise en page pour de vrai puisque c'est le vrai HTML et la vraie feuille.
 *
 *     node photo_ecran.js                 l'ecran Automatisations
 *     node photo_ecran.js Livrables       un autre ecran
 *     node photo_ecran.js --liste         les ecrans possibles
 *
 * La photo est ecrite dans `../photos-ulysse/` — HORS du dossier servi. Ce
 * n'est pas un detail de rangement : tout ce qui tombe dans `web/` est
 * telechargeable depuis :8080, et une photo porte l'etat reel du poste.
 */
const fs = require("fs");
const path = require("path");
const socle = require("./banc_socle.js");

const ICI = __dirname;
const DOSSIER = path.join(path.dirname(ICI), "photos-ulysse");

function horodatage(){
  const d = new Date(), p2 = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate())
    + "_" + p2(d.getHours()) + p2(d.getMinutes());
}

(async () => {
  const arg = process.argv.slice(2).filter((a) => a !== "--liste")[0];
  const ecran = arg || "Automatisations";

  if (!(await socle.preflight())){
    console.log("La pile ne repond pas. `lancer_ulysse.bat`, puis relancer.");
    process.exit(1);
  }
  const { win } = await socle.monter();
  const doc = win.document;

  const noms = win.eval("PANELS.map(p => p.id)");
  if (process.argv.indexOf("--liste") >= 0){
    console.log("Ecrans : " + noms.join(", "));
    process.exit(0);
  }
  /* ⚠ `nav()` NE SE PLAINT PAS D'UNE DESTINATION INCONNUE : il retombe sur le
     premier panneau, exprès (ulysse-app.js:59), pour ne jamais laisser un
     ecran gris. Excellent dans le produit, piegeux ici : « node photo_ecran.js
     Automatisation » photographierait le fil de discussion sans un mot. On
     verifie donc le nom AVANT de naviguer. */
  const vrai = noms.find((n) => n.toLowerCase() === ecran.toLowerCase());
  if (!vrai){
    console.log("Ecran inconnu : « " + ecran + " ». Ecrans : " + noms.join(", "));
    process.exit(1);
  }

  win.eval("nav(" + JSON.stringify(vrai) + ")");
  await socle.dodo(3000);
  // Ce qui est replie par defaut ne se photographie pas : on ouvre la galerie
  // de modeles quand elle est la, sinon on ne verrait que son bouton.
  const bVoir = doc.querySelector("#autoVoirModeles");
  if (bVoir){ bVoir.click(); await socle.dodo(800); }

  // Un mot DANS la page : sans lui, une capture morte se prend pour
  // l'application, et on clique dans le vide en se demandant pourquoi.
  const mot = doc.createElement("div");
  mot.setAttribute("style",
    "position:fixed;left:0;right:0;top:0;z-index:99;padding:8px 16px;"
    + "background:#7a5cff;color:#fff;font:13px/1.4 system-ui;text-align:center");
  mot.textContent = "Photographie de l'écran " + vrai + " d'Ulysse — pile en "
    + "marche, données réelles. Page morte : aucun bouton n'agit.";
  doc.body.insertBefore(mot, doc.body.firstChild);

  /* ⚠ LA PAGE ENTIERE, PAS LE PANNEAU. Premiere version : on decoupait
     `#pAutomatisations` pour le recoller dans une page a nous. Resultat : une
     page blanche, envoyee telle quelle. La mise en page tient a la coquille —
     rail, barre de titre, `.body` positionne dedans ; un panneau arrache a sa
     coquille n'a plus de hauteur et ne montre rien. On garde tout. */
  let html = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
  /* ⚠ ET ON COUPE TOUS LES <script>. Le socle les a INLINES depuis le serveur :
     une photo qui les garderait emporterait tout le code du produit, et
     surtout un `ulysse-config.js` entier dans un fichier qu'on s'envoie. */
  html = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  if (/<script/i.test(html)){
    console.log("REFUS : il reste un <script> dans la photo."); process.exit(1);
  }

  /* La seconde ceinture, et ce qu'elle vaut VRAIMENT.
     Premiere version : on comparait la photo a `CFG.SESSION_TOKEN`. Elle
     n'aurait jamais rien attrape — `serve.py` vide les cles secretes AVANT de
     servir le fichier (serve.py:1158), donc cette valeur est la chaine vide
     dans le navigateur, et `"" ` ne se cherche pas. Une garde qui ne peut pas
     mordre est pire que pas de garde : elle rassure. Verifie en glissant un
     faux jeton dans la page — elle laissait passer.
     On cherche donc la FORME du jeton, celle que `lancer_ulysse.bat`
     fabrique : `ulysse_` suivi de 32 caracteres hexadecimaux. */
  const suspects = [
    [/ulysse_[0-9a-f]{32}/i, "un jeton de session"],
    [/Bearer\s+[A-Za-z0-9._-]{16,}/, "un en-tete d'autorisation"],
    [/sk-[A-Za-z0-9]{20,}/, "une cle d'API"]
  ];
  for (const [motif, quoi] of suspects){
    const t = html.match(motif);
    if (t){
      console.log("REFUS : " + quoi + " se trouve dans la photo ("
        + t[0].slice(0, 12) + "…).");
      process.exit(1);
    }
  }

  fs.mkdirSync(DOSSIER, { recursive: true });
  const dest = path.join(DOSSIER, vrai.toLowerCase() + "-" + horodatage() + ".html");
  fs.writeFileSync(dest, html, "utf8");

  console.log("Photo : " + dest);
  console.log("  " + Math.round(html.length / 1024) + " ko · "
    + doc.querySelectorAll("#" + "p" + vrai + " *").length + " elements · "
    + "panneau « " + doc.querySelector("#p" + vrai).className + " »");
  process.exit(0);
})();
