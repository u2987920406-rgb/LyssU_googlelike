/* probe-tactile.js — le DOIGT peut-il défiler ? Banc contrôlé.
 *
 * Deux leçons du run précédent :
 *   1. Input.synthesizeScrollGesture (touch) ne défile MÊME PAS un div témoin
 *      → muet, il ne prouve rien. Contrôle obligatoire avant de conclure.
 *   2. Toujours savoir QUI reçoit le touch (elementFromPoint) : un panneau en
 *      position:absolute peut couvrir le document.
 *
 * Ici : drag tactile RÉEL via Input.dispatchTouchEvent (touchStart/Move/End),
 * d'abord sur un témoin nu, puis dans l'app avec un fichier ouvert, plus la
 * molette en comparaison.
 *
 * Usage: node probe-tactile.js <prefixe> <chemin-factice> <fichier-reel> <mime>
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const PREFIXE = process.argv[2] || "tactile";
const FICHIER = process.argv[3];
const CONTENU = process.argv[4];
const MIME = process.argv[5] || "text/html";
const BASE = process.env.BASE || "http://127.0.0.1:8734";
const OUTDIR = __dirname;
const CHROME = "/home/raf/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const INIT = `
window.__FETCHES = [];
window.__FILE = ${JSON.stringify(CONTENU ? {
  name: FICHIER.split(/[\\\\/]/).pop(), path: FICHIER,
  size: fs.statSync(CONTENU).size, mime_type: MIME,
  data_url: "data:" + MIME + ";base64," + fs.readFileSync(CONTENU).toString("base64")
} : null)};
class FakeWS {
  constructor(){ this.readyState = 0; setTimeout(() => { this.readyState = 3;
    if (this.onclose) try { this.onclose({}); } catch (e) {} }, 60); }
  send(){} close(){} addEventListener(){} removeEventListener(){}
}
window.WebSocket = FakeWS;
window.fetch = function(url, opts){
  const p = String(url).replace(/^https?:\\/\\/[^/]+/, "");
  window.__FETCHES.push(p);
  const bare = p.split("?")[0];
  let body = {};
  if (bare === "/api/files/read") body = window.__FILE || {};
  else if (bare === "/api/files") body = { path: "", parent: null, entries: [] };
  else if (bare === "/api/status") body = { ok: true };
  else if (bare === "/api/memory") body = { user: "", memory: "" };
  else if (bare === "/api/cron" || bare === "/api/cron/cibles") body = { jobs: [], targets: [] };
  else body = { ok: true };
  return Promise.resolve(new Response(JSON.stringify(body),
    { status: 200, headers: { "content-type": "application/json" } }));
};
`;

async function dragTactile(cdp, x, y1, y2) {
  const pas = 24;
  const sens = y2 > y1 ? 1 : -1;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y1, id: 1 }] });
  let y = y1;
  while (sens > 0 ? y < y2 : y > y2) {
    y += sens * pas;
    if (sens > 0 ? y > y2 : y < y2) y = y2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
    await new Promise((r) => setTimeout(r, 12));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await new Promise((r) => setTimeout(r, 400));
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625,
    isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const out = { prefixe: PREFIXE };

  /* ---- (a) TÉMOIN : drag tactile sur un div nu ---- */
  await page.setContent('<div id="s" style="width:400px;height:400px;overflow-y:auto">'
    + '<div style="height:8000px">temoin</div></div>');
  await page.waitForTimeout(150);
  await dragTactile(cdp, 200, 320, 120);
  out.temoin_drag_tactile = await page.evaluate(() => document.getElementById("s").scrollTop);
  await page.evaluate(() => { document.getElementById("s").scrollTop = 0; });
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(250);
  out.temoin_molette = await page.evaluate(() => document.getElementById("s").scrollTop);

  /* ---- (b) APP avec fichier ouvert ---- */
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push("pageerror: " + e.message));
  await page.addInitScript(INIT);
  await page.goto(BASE + "/ulysse.html", { waitUntil: "load" });
  await page.waitForTimeout(700);
  if (FICHIER) {
    out.ouvert = await page.evaluate(async (c) => {
      if (typeof window.ouvrirFichier !== "function") return { ok: false, err: "ouvrirFichier absent" };
      try { await window.ouvrirFichier(c); } catch (e) { return { ok: false, err: String(e) }; }
      return { ok: true };
    }, FICHIER);
    await page.waitForTimeout(500);
  }

  const lire = () => page.evaluate(() => {
    const v = document.querySelector(".u-art-viewer");
    const c = v && v.querySelector(".u-art-body");
    return {
      corps_scroll_top: c ? c.scrollTop : null,
      corps_scroll_height: c ? c.scrollHeight : null,
      corps_client_height: c ? c.clientHeight : null,
      corps_scroll_width: c ? c.scrollWidth : null,
      corps_width: c ? Math.round(c.getBoundingClientRect().width) : null,
      page_scroll_top: window.scrollY || document.documentElement.scrollTop
    };
  });
  const cibles = () => page.evaluate(() => {
    const r = [];
    for (const pt of [[206, 300], [206, 500], [206, 760], [380, 600]]) {
      const el = document.elementFromPoint(pt[0], pt[1]);
      let ch = null, n = el, i = 0;
      while (n && n !== document.documentElement && i < 12) {
        const c = getComputedStyle(n);
        const s = n.tagName.toLowerCase() + (n.id ? "#" + n.id : "")
          + (typeof n.className === "string" && n.className ? "." + n.className.trim().split(/\s+/).join(".") : "")
          + "{" + c.position + " ta:" + c.touchAction + " ov:" + c.overflowY + " pe:" + c.pointerEvents + "}";
        ch = (ch ? ch + " > " : "") + s;
        n = n.parentElement; i++;
      }
      r.push({ pt, chaine: ch });
    }
    return r;
  });

  out.avant_geste = await lire();
  out.cibles_avant = await cibles();

  await dragTactile(cdp, 206, 760, 240);          // doigt : swipe haut dans le document
  out.apres_drag_document = await lire();
  await dragTactile(cdp, 380, 760, 240);          // doigt : à droite, hors zone texte
  out.apres_drag_droite = await lire();

  await page.mouse.move(206, 500);
  await page.mouse.wheel(0, 1600);                // molette : comparaison
  await page.waitForTimeout(300);
  out.apres_molette = await lire();

  await page.screenshot({ path: path.join(OUTDIR, PREFIXE + "-412.png"), fullPage: false });

  out.erreurs = erreurs.slice(0, 8);
  fs.writeFileSync(path.join(OUTDIR, PREFIXE + ".json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error("PROBE-CRASH:", e); process.exit(1); });
