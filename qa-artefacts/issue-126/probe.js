/* probe.js — banc de mesure mobile 412x915 pour l'issue #126.
 *
 * Usage: node probe.js <prefixe-sortie> <chemin-factice> <fichier-reel> <mime>
 *   ex: node probe.js avant D:/faux-home/revolution-francaise.html \
 *           /home/raf/projets/ulysse/livrables/html/revolution-francaise.html text/html
 *
 * Charge ulysse.html (serveur local sur le worktree) dans Chromium avec la
 * config appareil RÉELLE (Pixel 9 Pro XL : 412x915 CSS px, DPR 2.625,
 * isMobile + hasTouch), en stubbant fetch/WebSocket comme web/test_page.js,
 * ouvre UN VRAI fichier dans le volet .u-art-viewer et mesure la géométrie.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const PREFIXE = process.argv[2] || "avant";
const FICHIER = process.argv[3] || "D:/faux-home/livrable.html";
const CONTENU = process.argv[4];
const MIME = process.argv[5] || "text/html";
const BASE = process.env.BASE || "http://127.0.0.1:8734";
const OUTDIR = __dirname;
const CHROME = "/home/raf/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const buf = fs.readFileSync(CONTENU);
const dataUrl = "data:" + MIME + ";base64," + buf.toString("base64");
const fichier = {
  name: FICHIER.split(/[\\/]/).pop(),
  path: FICHIER,
  size: buf.length,
  mime_type: MIME,
  data_url: dataUrl
};

const INIT = `
window.__FETCHES = [];
window.__FILE = ${JSON.stringify(fichier)};
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
  if (bare === "/api/files/read") body = window.__FILE;
  else if (bare === "/api/files") body = { path: "", parent: null, entries: [] };
  else if (bare === "/api/sessions") body = [];
  else if (bare === "/api/skills") body = [];
  else if (bare === "/api/status") body = { ok: true };
  else if (bare === "/api/memory") body = { user: "", memory: "" };
  else if (bare === "/api/cron" || bare === "/api/cron/cibles") body = { jobs: [], targets: [] };
  else if (bare === "/api/config") body = { command_allowlist: [], gemini: {} };
  else if (bare === "/api/models" || bare === "/api/model-options") body = { providers: [] };
  else body = { ok: true };
  return Promise.resolve(new Response(JSON.stringify(body),
    { status: 200, headers: { "content-type": "application/json" } }));
};
`;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true
  });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") erreurs.push("console: " + m.text()); });
  await page.addInitScript(INIT);
  await page.goto(BASE + "/ulysse.html", { waitUntil: "load" });
  await page.waitForTimeout(800);

  // Ouvre le VRAI chemin d'ouverture de fichier (ulysse-artifact.js).
  const ouvert = await page.evaluate(async (chemin) => {
    if (typeof window.ouvrirFichier !== "function") return { ok: false, err: "ouvrirFichier absent" };
    try { await window.ouvrirFichier(chemin); }
    catch (e) { return { ok: false, err: String(e) }; }
    return { ok: true };
  }, FICHIER);
  await page.waitForTimeout(600);

  const mes = await page.evaluate(() => {
    const app = document.getElementById("app");
    const v = document.getElementById("artifactViewer")
      || document.querySelector(".u-art-viewer");
    const corps = v && v.querySelector(".u-art-body");
    const r = (el) => el ? el.getBoundingClientRect() : null;
    // scroll réel : on pose scrollTop = scrollHeight puis on relit
    let scrollTopMax = null, sh = null, ch = null, corpsW = null, corpsScrollW = null;
    if (corps) {
      sh = corps.scrollHeight;
      ch = corps.clientHeight;
      corpsW = r(corps).width;
      corpsScrollW = corps.scrollWidth;
      corps.scrollTop = sh;
      scrollTopMax = corps.scrollTop;
      corps.scrollTop = 0;
    }
    // élément le plus à droite (débordement horizontal éventuel)
    let widestRight = 0, widestSel = null;
    document.querySelectorAll("#app *").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width && b.right > widestRight) {
        widestRight = b.right;
        widestSel = el.tagName.toLowerCase()
          + (el.id ? "#" + el.id : "")
          + (el.className && typeof el.className === "string"
              ? "." + el.className.trim().split(/\s+/).join(".") : "");
      }
    });
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      doc_scroll_width: document.documentElement.scrollWidth,
      body_scroll_width: document.body.scrollWidth,
      app_classes: app ? app.className : null,
      viewer_present: !!v,
      viewer_width: r(v) ? r(v).width : null,
      viewer_height: r(v) ? r(v).height : null,
      viewer_display: v ? getComputedStyle(v).display : null,
      viewer_width_css: v ? getComputedStyle(v).width : null,
      corps_width: corpsW,
      corps_scroll_width: corpsScrollW,
      scroll_height: sh,
      client_height: ch,
      scroll_top_max: scrollTopMax,
      widest_right: widestRight,
      widest_sel: widestSel,
      inner_html_head: corps ? corps.innerHTML.slice(0, 300) : null
    };
  });

  await page.screenshot({ path: path.join(OUTDIR, PREFIXE + "-412.png"), fullPage: false });

  /* GESTE RÉEL : le scroll au doigt (pas seulement programmatique). Un
     scrollTop posé en JS prouve la géométrie, pas que le doigt peut défiler.
     Input.synthesizeScrollGesture avec gestureSourceType 'touch' rejoue le
     même chemin d'événements qu'un pouce sur l'écran. */
  const cdp = await ctx.newCDPSession(page);
  const geste = {};
  async function defilerAuDoigt(x, y, dist, cle) {
    await cdp.send("Input.synthesizeScrollGesture", {
      x: x, y: y, xDistance: 0, yDistance: dist, speed: 1800,
      gestureSourceType: "touch"
    });
    await page.waitForTimeout(350);
    geste[cle] = await page.evaluate(() => {
      const v = document.querySelector(".u-art-viewer");
      const c = v && v.querySelector(".u-art-body");
      return { corps_scroll_top: c ? c.scrollTop : null,
               page_scroll_top: window.scrollY || document.documentElement.scrollTop };
    });
  }
  await defilerAuDoigt(206, 500, -1200, "corps_apres_swipe_1");
  await defilerAuDoigt(206, 500, -2400, "corps_apres_swipe_2");
  // geste sur la zone du contenu lui-même (hors marges du corps)
  await defilerAuDoigt(206, 300, -2400, "contenu_apres_swipe");
  geste.styles = await page.evaluate(() => {
    const g = (el) => el ? getComputedStyle(el).touchAction + " | overscroll:"
      + getComputedStyle(el).overscrollBehavior : null;
    return {
      corps: g(document.querySelector(".u-art-body")),
      contenu: g(document.querySelector(".u-art-raw, .u-md, .u-art-body > *")),
      embed: g(document.querySelector(".u-art-body embed"))
    };
  });

  const fetches = await page.evaluate(() => window.__FETCHES || []);
  const rapport = { prefixe: PREFIXE, fichier: FICHIER, mime: MIME, ouvert, mes, geste,
    erreurs: erreurs.slice(0, 12), fetches: fetches.slice(0, 30) };
  fs.writeFileSync(path.join(OUTDIR, PREFIXE + ".json"), JSON.stringify(rapport, null, 2));
  console.log(JSON.stringify(rapport, null, 2));
  await browser.close();
})().catch((e) => { console.error("PROBE-CRASH:", e); process.exit(1); });
