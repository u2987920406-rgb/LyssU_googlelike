/* ============================================================================
 * banc_socle.js — monter la VRAIE page contre le VRAI Hermes
 * ----------------------------------------------------------------------------
 * Ce qui est commun aux bancs reels vit ICI, et nulle part ailleurs. La lecon
 * est celle des dix apercus de `ulysse.css` : autant de copies que de fichiers,
 * autant d'occasions de diverger EN SILENCE. Un montage recopie dans chaque
 * banc aurait fini par ne plus monter la meme page selon le banc.
 *
 * Ce que le socle garantit, et qui fait toute la difference avec `test_page.js` :
 *
 *   · la page et ses scripts sont pris SUR LE SERVEUR (http://127.0.0.1:8080),
 *     pas sur le disque — c'est ainsi que `ulysse-config.js` porte ce que
 *     serve.py y ajoute au moment de servir, et pas ce que le disque en dit ;
 *   · `fetch` est le vrai fetch de Node, vers ce meme serveur ;
 *   · le `WebSocket` est celui de jsdom, qui ouvre une VRAIE connexion vers
 *     /api/ws — serve.py rejoue le handshake et injecte le jeton.
 *
 * Aucun faux nulle part : il n'y a plus rien qui puisse mentir differemment du
 * vrai. C'est le seul remede a ce qui s'est repete dix fois sur ce projet — un
 * faux ecrit a la main qui derive de la forme reelle et cache un defaut.
 *
 * Les bancs qui s'en servent :
 *     node banc_reel.js      la demande d'accord (coute de vrais tours)
 *     node banc_ecrans.js    les ecrans et les etats durables
 * ========================================================================== */
"use strict";

const { JSDOM, VirtualConsole } = require("jsdom");

const BASE = "http://127.0.0.1:8080";
const PAGE = BASE + "/ulysse.html";

const results = [];

function check(claim, ok, detail){
  results.push([claim, !!ok, detail || ""]);
  console.log("  " + (ok ? "[ok]   " : "[ECHEC]") + " " + claim
    + (detail ? "  — " + detail : ""));
}

function note(txt){ console.log("       · " + txt); }

function titre(txt){ console.log("\n--- " + txt + " ---"); }

const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

/* Attendre qu'une condition devienne vraie, ou renoncer en le DISANT. Un banc
   qui attend sans borne se fige la nuit et personne ne sait sur quoi. */
async function attendre(cond, msMax){
  const t0 = Date.now();
  while (Date.now() - t0 < msMax){
    let v;
    try { v = cond(); } catch (e){ v = false; }
    if (v) return true;
    await dodo(200);
  }
  return false;
}

/* --- La pile repond-elle ? -----------------------------------------------
   Une pile absente n'est PAS un defaut de la page. Les distinguer par le code
   de sortie evite de chercher un bug la ou il n'y a qu'un serveur eteint. */
async function preflight(){
  let st;
  try {
    const r = await fetch(BASE + "/api/status");
    if (!r.ok) throw new Error("HTTP " + r.status);
    st = await r.json();
  } catch (e){
    console.error("\nLa pile Ulysse ne repond pas sur " + BASE + " (" + e.message + ").");
    console.error("Lancez `lancer_ulysse.bat`, attendez l'ouverture, puis relancez.");
    process.exit(2);
  }
  if (!st.gateway_running){
    console.error("\nLe serveur repond mais la gateway Hermes est a l'arret"
      + " (gateway_state: " + st.gateway_state + ").");
    process.exit(2);
  }
  console.log("Pile en place — Hermes " + st.version + ", gateway "
    + st.gateway_state + ", home " + st.hermes_home + "\n");
  return st;
}

/* --- Monter la page, telle que le navigateur la recoit --------------------
   `avant(win)` permet a un banc d'injecter ce qu'il lui faut AVANT que les
   scripts ne tournent — c'est la seule fenetre ou l'on peut, par exemple,
   faire echouer un endpoint pour eprouver un chemin degrade. */
async function monter(avant){
  const prendre = async (rel) => {
    const r = await fetch(BASE + "/" + rel);
    if (!r.ok) throw new Error(rel + " : HTTP " + r.status);
    return r.text();
  };

  let html = await prendre("ulysse.html");

  /* La liste des scripts est LUE DANS LA PAGE. Un fichier ajoute a la page
     entre ici tout seul — un fichier oublie a laisse tourner tout un banc
     contre une page amputee, le 2026-08-11. */
  const SCRIPTS = Array.from(
    html.matchAll(/<script src="(ulysse-[^"]+\.js)"[^>]*><\/script>/g)).map((m) => m[1]);
  if (SCRIPTS.length < 5) throw new Error("la page ne charge que " + SCRIPTS.length + " script(s)");
  note("scripts pris sur le serveur : " + SCRIPTS.join(" → "));

  for (const f of SCRIPTS){
    const code = await prendre(f);
    const tag = new RegExp('<script src="' + f.replace(/[.]/g, "\\$&") + '"[^>]*></script>');
    // Une FONCTION de remplacement, jamais une chaine : « $& » et « $1 » sont
    // des motifs, et un fichier qui en contient un s'inline CORROMPU.
    html = html.replace(tag, () => "<script>\n" + code + "\n</script>");
  }

  const css = await prendre("ulysse.css");
  html = html.replace('<link rel="stylesheet" href="ulysse.css">',
    () => "<style>\n" + css + "\n</style>");

  const vc = new VirtualConsole();
  const erreurs = [];
  vc.on("jsdomError", (e) => erreurs.push("jsdomError: " + e.message));
  vc.on("error", (m) => erreurs.push("console.error: " + m));

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: PAGE,
    virtualConsole: vc,
    beforeParse(win){
      /* Le vrai fetch, avec la seule adaptation necessaire : Node exige une
         URL absolue la ou le navigateur resout contre la page. */
      win.fetch = (input, init) => {
        const u = typeof input === "string" ? input : (input && input.url) || String(input);
        return fetch(new URL(u, PAGE).href, init);
      };
      /* `win.WebSocket` n'est PAS remplace : celui de jsdom ouvre une vraie
         connexion, avec l'Origin de la page — exactement ce que serve.py
         attend avant de rejouer le handshake vers le dashboard. */

      /* ⚠ `Response` MANQUE A JSDOM, ET LA PAGE S'EN SERT. Le pont /api/pty
         envoie du BINAIRE ; `ouvrirPty` le decode par
         `new Response(e.data).arrayBuffer()`. Sans cette ligne, l'appel levait
         dans `onmessage`, plus rien n'etait peint, et le banc concluait « le
         processus distant n'envoie rien » — en accusant Hermes d'un silence
         qui venait du bac a sable. Tout navigateur reel porte `Response` :
         l'ajouter, ce n'est pas simuler le produit, c'est cesser de l'amputer. */
      if (!win.Response) win.Response = Response;
      if (!win.Headers) win.Headers = Headers;

      // xterm arrive par CDN dans un navigateur ; jsdom ne charge pas les
      // ressources externes. Le Terminal se teste par son WebSocket, pas par
      // son emulateur d'affichage.
      /* ⚠ `cols` ET `rows` SONT INDISPENSABLES. Sans eux, la page envoie
         « \x1b[RESIZE:undefined;undefined] » au PTY des l'ouverture — le
         serveur consomme la sequence et n'a plus de taille utile : la session
         s'ouvre et ne peint jamais rien. Le banc accusait alors le PTY de ne
         rien envoyer, alors qu'il attendait une taille que le faux terminal
         ne savait pas dire. Un vrai xterm les porte toujours. */
      win.Terminal = class {
        constructor(){
          this.buffer = { active: {} }; this.ecrit = [];
          this.cols = 100; this.rows = 30;
        }
        open(){} write(t){ this.ecrit.push(String(t)); }
        onData(fn){ this.surTouche = fn; }
        loadAddon(){} focus(){} dispose(){} clear(){}
      };
      win.FitAddon = { FitAddon: class { fit(){} } };
      win.requestAnimationFrame = (fn) => win.setTimeout(fn, 0);
      Object.defineProperty(win.navigator, "clipboard", {
        value: { writeText: () => Promise.resolve() }, configurable: true });
      if (avant) avant(win);
    }
  });

  const win = dom.window;
  await dodo(300);
  check("la page s'amorce sans erreur JavaScript", erreurs.length === 0,
    erreurs.slice(0, 2).join(" | "));
  return { dom, win, erreurs, E: (src) => win.eval(src) };
}

/* Le bilan, et le code de sortie qui va avec : 0 tout au vert, 1 au moins un
   echec. On ne passe JAMAIS ce banc dans un tube (`| tee`) : le shell rendrait
   alors le code du dernier maillon, et un rouge passerait pour un vert. */
function fin(){
  const ko = results.filter((r) => !r[1]);
  console.log("\n" + (results.length - ko.length) + "/" + results.length
    + " verifications au vert contre le vrai Hermes.");
  if (ko.length){
    console.log("\nEchecs :");
    ko.forEach((r) => console.log("  · " + r[0] + (r[2] ? "  — " + r[2] : "")));
  }
  process.exit(ko.length ? 1 : 0);
}

module.exports = { BASE, PAGE, results, check, note, titre, dodo, attendre,
                   preflight, monter, fin };
