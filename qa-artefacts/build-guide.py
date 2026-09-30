#!/usr/bin/env python3
"""Convertit les 5 fichiers .excalidraw en PDF via SVG -> PNG -> img2pdf."""
import json
import os
import subprocess
import tempfile
import shutil
from pathlib import Path
import base64, zlib, re

SVG_DIR = Path("/home/raf/projets/ulysse/qa-artefacts")
OUTPUT = SVG_DIR / "guide-hermes-ulysse.pdf"

def _decode_excalidraw(text):
    """Extrait le JSON d'un fichier .excalidraw compressé ou non."""
    text = text.strip()
    # JSON brut
    if text.startswith("{") or text.startswith("["):
        return json.loads(text)
    # JSON → base64 → zlib (format Excalidraw v2)
    if text.startswith("{"):
        d = json.loads(text)
        if d.get("version") == 2 and d.get("source") == "hermes-agent":
            return d
    # Plutôt découper brutalement
    try:
        d = json.loads(text)
        return d
    except Exception:
        pass
    return None

def _svg_interne(elements, app_state=None):
    """Génère un SVG 'propre' (sans viewer Excalidraw) à partir des éléments JSON.

    C'est un rendu approximatif — typographie non fidèle, pointeurs de flèches
    simplifiés — mais suffisant pour un guide pédagogique en noir et blanc.
    """
    # Encodage très approximatif des shapes et du texte
    ink = []
    # fond
    bg = app_state.get("viewBackgroundColor", "#ffffff") if app_state else "#ffffff"
    ink.append(f'<rect width="100%" height="100%" fill="{bg}"/>')
    # éléments
    for el in (elements or []):
        if el.get("type") == "text":
            x, y = el.get("x", 0), el.get("y", 0)
            w, h = el.get("width", 100), el.get("height", 40)
            text = el.get("text", "")
            fs = el.get("fontSize", 16)
            col = el.get("strokeColor", "#1e1e1e")
            al = el.get("textAlign", "left")
            va = el.get("verticalAlign", "top")
            ink.append(
                f'<text x="{x}" y="{y}" width="{w}" height="{h}" '
                f'font-size="{fs}" text-anchor="{al}" '
                f'dominant-baseline="{"middle" if va=="middle" else "hanging"}" '
                f'fill="{col}" font-family="sans-serif">'
                + _escape_svg(text) + "</text>"
            )
        elif el.get("type") in ("rectangle", "ellipse"):
            x, y = el.get("x", 0), el.get("y", 0)
            w, h = el.get("width", 100), el.get("height", 80)
            col_bg = el.get("backgroundColor", "transparent")
            col_st = el.get("strokeColor", "#1e1e1e")
            fill = "none" if col_bg == "transparent" else col_bg
            fact = { "rect": ("rect", x, y, w, h, el.get("roundness", {}).get("type", 0)),
                      "ellipse": ("ellipse", x + w/2, y + h/2, w/2, h/2) }
            tag, *args = fact[el["type"]]
            if tag == "rect":
                rx = args[5] if args else 0
                rx = max(rx, 0) * (args[2]/10) if rx else 0
                attr = f'x="{args[0]}" y="{args[1]}" width="{args[2]}" height="{args[3]}"'
                if rx: attr += f' rx="{rx}" ry="{rx}"'
                ink.append(f'<{tag} {attr} fill="{fill}" stroke="{col_st}" stroke-width="2"/>')
            elif tag == "ellipse":
                ink.append(f'<{tag} cx="{args[0]}" cy="{args[1]}" rx="{args[2]}" ry="{args[3]}" fill="{fill}" stroke="{col_st}" stroke-width="2"/>')
        elif el.get("type") == "arrow":
            pts = el.get("points", [[0,0,0,0]])
            x0,y0 = pts[0]
            x1,y1 = pts[-1]
            x, y = el.get("x", 0), el.get("y", 0)
            ax, ay = x+x0, y+y0
            bx, by = x+x1, y+y1
            col = el.get("strokeColor", "#1e1e1e")
            end = el.get("endArrowhead")
            tip = ""
            if end == "arrow":
                tip = f'<polygon points="{bx},{by} {bx-20},{by-12} {bx-20},{by+12}" fill="{col}"/>'
            elif end == "dot":
                tip = f'<circle cx="{bx}" cy="{by}" r="4" fill="{col}"/>'
            ink.append(f'<line x1="{ax}" y1="{ay}" x2="{bx}" y2="{by}" stroke="{col}" stroke-width="2"/>' + tip)
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500' width='400' height='500'>" + "".join(ink) + "</svg>"

def _escape_svg(s):
    return (s.replace("&", "&amp;")
              .replace("<", "&lt;")
              .replace(">", "&gt;"))

def svg_to_png(svg_path, png_path):
    """Convertit un SVG en PNG via le rendu headless de `html` + Chrome (`--screenshot`)."""
    # Chrome headless screenshot d'une page HTML avec le SVG inline.
    # On construit une page HTML temporaire et on screenshotte à la résolution voulue.
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body {{ margin:0; background:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh; }}
    svg {{ background:#fff; }}
    </style></head><body>
    {open(svg_path).read()}
    </body></html>"""
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as tmp:
        tmp.write(html)
        tmp_html = tmp.name
    png_out = str(png_path)
    r = subprocess.run(
        ["google-chrome", "--headless=new", "--disable-gpu", "--no-sandbox",
         "--window-size=1200,1500", "--screenshot=" + png_out,
         "--default-background-color=ffffffff", tmp_html],
        capture_output=True, text=True, timeout=30
    )
    os.unlink(tmp_html)
    if r.returncode == 0 and os.path.exists(png_out):
        return True
    print(f"Chrome screenshot échoué pour {svg_path}: {r.stderr[:200]}")
    return False

def excalidraw_to_svg(excalidraw_path, svg_path):
    with open(excalidraw_path, encoding="utf-8") as f:
        data = _decode_excalidraw(f.read())
    if not data:
        print(f"Impossible de décoder {excalidraw_path}")
        return False
    if not isinstance(data, dict) or data.get("type") != "excalidraw":
        print(f"Pas un excalidraw valide: {excalidraw_path}")
        return False
    svg = _svg_interne(data.get("elements", []), data.get("appState"))
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg)
    return True

def main():
    svgs, pngs = [], []
    for i in range(1, 6):
        ex_path = SVG_DIR / f"guide-{i}.excalidraw"
        svg_path = SVG_DIR / f"guide-{i}.svg"
        png_path = SVG_DIR / f"guide-{i}.png"
        if not ex_path.exists():
            print(f"Absent: {ex_path}")
            continue
        if not excalidraw_to_svg(ex_path, svg_path):
            continue
        svgs.append((i, svg_path))
        if svg_to_png(svg_path, png_path):
            pngs.append((i, png_path))
            print(f"Généré: guide-{i}.png")
        else:
            print(f"Échec PNG: guide-{i}")
    if not pngs:
        print("AUCUN PNG — abandon")
        return
    # Assemblage PNG → PDF via img2pdf
    try:
        import img2pdf
        with open(OUTPUT, "wb") as f:
            f.write(img2pdf.convert([p for _, p in pngs]))
        print(f"PDF: {OUTPUT} ({OUTPUT.stat().st_size/1024:.0f} Ko)")
    except Exception as e:
        print(f"img2pdf échoué ({e}) — fallback PIL")
        from PIL import Image
        images = [Image.open(p).convert("RGB") for _, p in pngs]
        images[0].save(OUTPUT, "PDF", save_all=True, append_images=images[1:])
        print(f"PDF (PIL): {OUTPUT} ({OUTPUT.stat().st_size/1024:.0f} Ko)")

if __name__ == "__main__":
    main()
