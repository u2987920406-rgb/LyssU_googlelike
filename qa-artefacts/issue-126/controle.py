#!/usr/bin/env python3
"""Controle du banc de geste : la meme synthese de swipe doit defiler un div
temoin. Si elle ne le defile pas, le banc est muet et ne prouve rien."""
import subprocess, json, os, sys
D = "/home/raf/projets/ulysse/qa-artefacts/issue-126"
with open(os.path.join(D, "controle.js"), "w") as f:
    f.write(r'''
"use strict";
const { chromium } = require("playwright-core");
const CHROME = "/home/raf/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const BASE = process.env.BASE || "http://127.0.0.1:8734";
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625,
    isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const out = {};

  // (a) TEMOIN : div scrollable nu, meme config, meme geste
  await page.setContent('<div id="s" style="width:400px;height:400px;overflow-y:auto">'
    + '<div style="height:8000px">temoin</div></div>');
  await page.waitForTimeout(200);
  await cdp.send("Input.synthesizeScrollGesture", { x: 200, y: 300, xDistance: 0,
    yDistance: -1200, speed: 1800, gestureSourceType: "touch" });
  await page.waitForTimeout(300);
  out.temoin_geste = await page.evaluate(() => document.getElementById("s").scrollTop);

  // (b) TEMOIN 2 : la meme chose mais avec la molette
  await page.evaluate(() => { document.getElementById("s").scrollTop = 0; });
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(300);
  out.temoin_molette = await page.evaluate(() => document.getElementById("s").scrollTop);

  // (c) APP : qui recoit reellement le touch a (206,500) ?
  await page.goto(BASE + "/ulysse.html", { waitUntil: "load" });
  await page.waitForTimeout(600);
  out.cible = await page.evaluate(() => {
    const el = document.elementFromPoint(206, 500);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const ch = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n);
      ch.push(n.tagName.toLowerCase() + (n.id ? "#" + n.id : "")
        + (typeof n.className === "string" && n.className ? "." + n.className.trim().split(/\s+/).join(".") : "")
        + " [pos:" + c.position + " ta:" + c.touchAction + " pe:" + c.pointerEvents + "]");
      n = n.parentElement;
    }
    return { tag: el.tagName, style: cs.position + " " + cs.touchAction, chaine: ch.slice(0, 10) };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error("CRASH:", e); process.exit(1); });
''')
r = subprocess.run(["node", "controle.js"], cwd=D, capture_output=True, text=True)
print(r.stdout)
print(r.stderr[:800])
sys.exit(r.returncode)
