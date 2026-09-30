#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Génère slides/iss-station-spatiale.pptx (8 diapos, thème espace)."""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

NAVY = RGBColor(0x0B, 0x1B, 0x3A)
NAVY2 = RGBColor(0x12, 0x2A, 0x52)
CYAN = RGBColor(0x38, 0xB6, 0xFF)
GOLD = RGBColor(0xFF, 0xC1, 0x4D)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LIGHT = RGBColor(0xD6, 0xE4, 0xFF)
GREY = RGBColor(0x9F, 0xB4, 0xD8)
CARD = RGBColor(0x17, 0x33, 0x63)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]
W = 13.333


def bg(slide, color=NAVY):
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = color


def rect(slide, x, y, w, h, color, line=None):
    from pptx.enum.shapes import MSO_SHAPE
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.fill.solid()
    sh.fill.fore_color.rgb = color
    if line is None:
        sh.line.fill.background()
    else:
        sh.line.color.rgb = line
        sh.line.width = Pt(1.25)
    sh.shadow.inherit = False
    return sh


def txt(slide, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.0):
    """runs = liste de (texte, taille, gras, couleur) ; '\n' géré par paragraphes."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    first = True
    for text, size, bold, color in runs:
        for i, line in enumerate(text.split("\n")):
            p = tf.paragraphs[0] if first else tf.add_paragraph()
            first = False
            p.alignment = align
            p.line_spacing = spacing
            r = p.add_run()
            r.text = line
            r.font.size = Pt(size)
            r.font.bold = bold
            r.font.color.rgb = color
            r.font.name = "Calibri"
    return tb


def header(slide, kicker, title):
    rect(slide, 0, 0, W, 1.32, NAVY2)
    rect(slide, 0, 1.32, W, 0.05, CYAN)
    txt(slide, 0.55, 0.14, 12.2, 0.4, [(kicker, 13, True, CYAN)])
    txt(slide, 0.55, 0.46, 12.2, 0.8, [(title, 30, True, WHITE)])


def bullets(slide, x, y, w, h, items, size=16, color=LIGHT, gap=8):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    for i, it in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(gap)
        p.line_spacing = 1.05
        r = p.add_run()
        r.text = "▪  " + it
        r.font.size = Pt(size)
        r.font.color.rgb = color
        r.font.name = "Calibri"
    return tb


# ───────────────────────── 1. Titre ─────────────────────────
s = prs.slides.add_slide(BLANK)
bg(s)
rect(s, 0, 2.9, W, 0.06, CYAN)
txt(s, 1.0, 1.75, 11.3, 0.5, [("SCIENCES & ESPACE", 16, True, CYAN)], align=PP_ALIGN.CENTER)
txt(s, 1.0, 2.15, 11.3, 0.75, [("La Station spatiale internationale", 42, True, WHITE)], align=PP_ALIGN.CENTER)
txt(s, 1.0, 3.15, 11.3, 1.1,
    [("Le plus grand objet humain en orbite : 400 km d'altitude,", 20, False, LIGHT),
     ("27 600 km/h, habitée en continu depuis novembre 2000", 20, False, LIGHT)],
    align=PP_ALIGN.CENTER, spacing=1.1)
txt(s, 1.0, 6.45, 11.3, 0.5,
    [("Sources vérifiées citées dans chaque diapo · NASA · ESA · ASC · CNES · GAO · Wikipédia", 12, False, GREY)],
    align=PP_ALIGN.CENTER)

# ───────────────────────── 2. Définition ─────────────────────────
s = prs.slides.add_slide(BLANK)
bg(s)
header(s, "DÉFINITION", "Qu'est-ce que l'ISS ?")
bullets(s, 0.7, 1.85, 11.9, 4.6, [
    "Un laboratoire scientifique en orbite terrestre basse (~400 km), assemblé module par module dans l'espace.",
    "Exploitée par 5 agences partenaires : NASA (États-Unis), Roscosmos (Russie), ESA (Europe), JAXA (Japon) et ASC (Canada) — soit 15 pays contributeurs.",
    "Construction assemblée entre 1998 et 2011, mais la station évolue en permanence (nouveaux modules, panneaux, expériences).",
    "Sa mission : mener en micropesanteur des expériences impossibles sur Terre (biologie, physique des matériaux, médecine, astronomie).",
    "Elle sert aussi de banc d'essai pour les futures missions longues vers la Lune et Mars.",
], size=18, gap=12)
txt(s, 0.7, 6.85, 11.9, 0.4, [("Sources : ASC « FAQ – Station spatiale internationale » ; Space.com « Everything you need to know about the ISS » ; CNES « Les stations orbitales ».", 11, False, GREY)])

# ───────────────────────── 3. Chiffres clés ─────────────────────────
s = prs.slides.add_slide(BLANK)
bg(s)
header(s, "EN UN COUP D'ŒIL", "La station en chiffres")
cards = [
    ("≈ 400 km", "altitude moyenne"),
    ("27 600 km/h", "vitesse orbitale"),
    ("≈ 93 min", "un tour de la Terre"),
    ("15,5", "orbites par jour"),
    ("16", "levers de soleil / jour"),
    ("≈ 450 t", "masse totale"),
    ("109 × 73 m", "envergure (truss + panneaux)"),
    ("1 005 m³", "volume pressurisé"),
]
x0, y0, cw, ch, gx, gy = 0.7, 1.8, 2.95, 2.15, 0.18, 0.35
for i, (big, small) in enumerate(cards):
    cx = x0 + (i % 4) * (cw + gx)
    cy = y0 + (i // 4) * (ch + gy)
    rect(s, cx, cy, cw, ch, CARD, line=CYAN)
    txt(s, cx + 0.1, cy + 0.35, cw - 0.2, 0.9, [(big, 26, True, GOLD)], align=PP_ALIGN.CENTER)
    txt(s, cx + 0.1, cy + 1.25, cw - 0.2, 0.75, [(small, 15, False, LIGHT)], align=PP_ALIGN.CENTER)
txt(s, 0.7, 6.85, 11.9, 0.4, [("Sources : NASA « ISS 20 infographic » (vitesse 28 000 km/h, 16 orbites, 16 levers de soleil) ; Wikipédia « Station spatiale internationale » (450 t, 109 × 73 m, 1 005 m³, 7,67 km/s, période 92,9 min) ; CNES.", 11, False, GREY)])

# ───────────────────────── 4. Chronologie ─────────────────────────
s = prs.slides.add_slide(BLANK)
bg(s)
header(s, "REPÈRES", "Chronologie")
rect(s, 1.15, 2.6, 0.06, 3.9, CYAN)
events = [
    ("20 nov. 1998", "Lancement de Zarya, premier module de la station (fusée Proton)."),
    ("2 nov. 2000", "Arrivée de l'Expedition 1 (Shepherd, Krikalev, Gidzenko) : début de l'occupation permanente."),
    ("1998 – 2011", "Assemblage principal : dizaines de modules, truss et panneaux solaires montés en orbite."),
    ("2011", "Fin de la construction avec le dernier vol de la navette spatiale américaine."),
    ("fin 2030 (prévu)", "Retrait de service et désorbitation contrôlée (plan NASA actuel)."),
]
y = 1.75
for date, desc in events:
    rect(s, 1.02, y + 0.14, 0.32, 0.32, GOLD)
    txt(s, 1.6, y, 2.5, 0.55, [(date, 17, True, CYAN)])
    txt(s, 4.15, y, 8.3, 0.95, [(desc, 16, False, LIGHT)], spacing=1.05)
    y += 1.02
txt(s, 0.7, 6.85, 11.9, 0.4, [("Sources : Wikipédia « Station spatiale internationale » (Zarya 20/11/1998, occupation depuis le 02/11/2000) ; ASC FAQ ; Space.com ; GAO-26-107805 (désorbitation fin 2030).", 11, False, GREY)])

# ───────────────────────── 5. Vie à bord ─────────────────────────
s = prs.slides.add_slide(BLANK)
bg(s)
header(s, "AU QUOTIDIEN", "La vie à bord")
bullets(s, 0.7, 1.85, 11.9, 4.6, [
    "Équipage permanent typique : 7 astronautes et cosmonautes de plusieurs nationalités.",
    "Mission habituelle : environ 6 mois en orbite (records : Scott Kelly et Mikhaïl Kornienko, 1 an, 2015-2016).",
    "En 24 h : 16 tours de Terre, donc 16 levers et 16 couchers de soleil — un rythme jour/nuit de 90 minutes.",
    "Les journées sont partagées entre expériences scientifiques, entretien de la station et exercice physique (2 h/jour pour contrer la fonte musculaire et osseuse).",
    "Depuis 2000, plus de 280 personnes ont séjourné à bord (bilan BBC, déc. 2025).",
], size=18, gap=12)
txt(s, 0.7, 6.85, 11.9, 0.4, [("Sources : ASC FAQ (équipage 3-6 puis 7, missions ~6 mois, 16 orbites/jour) ; NASA « ISS 20 infographic » ; BBC Future « 25 years of the ISS in numbers » (23/12/2025, 280+ visiteurs).", 11, False, GREY)])

# ───────────────────────── 6. Coopération ─────────────────────────
s = prs.slides.add_slide(BLANK)
bg(s)
header(s, "ENJEU POLITIQUE", "Une coopération internationale unique")
bullets(s, 0.7, 1.85, 11.9, 4.6, [
    "5 agences et 15 pays : chaque partenaire reste propriétaire des modules qu'il a fournis et les fait fonctionner ensemble 24 h/24.",
    "Coût de construction estimé par le CNES à environ 150 milliards d'euros — le plus cher des objets jamais construits par l'humanité (BBC).",
    "2 500 m² de panneaux solaires fournissent l'électricité ; l'assemblage a duré 13 ans, de 1998 à 2011.",
    "Record d'occupation simultanée : 13 personnes en 2009 lors du relais d'équipage.",
    "La station survole environ 90 % de la population mondiale : elle est visible à l'œil nu au crépuscule.",
], size=18, gap=12)
txt(s, 0.7, 6.85, 11.9, 0.4, [("Sources : CNES « Les stations orbitales » (150 Md€, 2 500 m² de panneaux, 13 ans d'assemblage) ; Space.com (15 pays, survol de 90 % de la population) ; NSSA (record de 13 personnes, 2009) ; BBC Future.", 11, False, GREY)])

# ───────────────────────── 7. Fin de vie ─────────────────────────
s = prs.slides.add_slide(BLANK)
bg(s)
header(s, "PERSPECTIVES", "Sa fin de vie et « l'après »")
bullets(s, 0.7, 1.85, 11.9, 4.6, [
    "La station perd environ 2 km d'altitude par mois (frottement résiduel) et doit être ré-accélérée régulièrement.",
    "Plan NASA (rapport GAO-26-107805, avril 2026) : retrait de service fin 2030, puis désorbitation contrôlée vers fin 2030 / début 2031.",
    "Le véhicule de désorbitation (US Deorbit Vehicle, contrat SpaceX de 843 M$) poussera la station vers une rentrée au-dessus d'une zone océanique inhabitée.",
    "Après l'ISS : des stations spatiales commerciales doivent prendre le relais, la NASA devenant simple cliente (6 entreprises accompagnées).",
    "La NASA estime que la station pourrait techniquement tenir jusqu'à la fin des années 2030 si nécessaire.",
], size=18, gap=12)
txt(s, 0.7, 6.85, 11.9, 0.4, [("Sources : Wikipédia (décroissance orbitale ~2 km/mois) ; GAO-26-107805 (retrait 2030, rentrée fin 2030-début 2031) ; Spaceflight Now (18/07/2024, contrat SpaceX 843 M$) ; blog GAO.", 11, False, GREY)])

# ───────────────────────── 8. Sources ─────────────────────────
s = prs.slides.add_slide(BLANK)
bg(s)
header(s, "RÉFÉRENCES", "Sources consultées")
bullets(s, 0.7, 1.8, 12.0, 5.0, [
    "NASA — « ISS 20 infographic » (vitesse 28 000 km/h, 16 orbites/16 levers de soleil, occupation depuis nov. 2000).",
    "Agence spatiale canadienne (ASC) — « FAQ : Station spatiale internationale » (altitude, équipage, 16 orbites/jour).",
    "Wikipédia — « Station spatiale internationale » (masse 450 t, 109 × 73 m, 1 005 m³, 7,67 km/s, période 92,9 min, 51,64°).",
    "CNES — « Les stations orbitales » (≈150 Md€, 2 500 m² de panneaux solaires, assemblage 1998-2011).",
    "Space.com — « Everything you need to know about the ISS » (15 pays, survol de ~90 % de la population).",
    "BBC Future — « 25 years of the ISS in numbers » (23/12/2025 : plus de 280 visiteurs depuis 2000).",
    "GAO-26-107805 (avril 2026) et Spaceflight Now (18/07/2024) — retrait 2030, US Deorbit Vehicle SpaceX (843 M$).",
], size=15, gap=9)

prs.save("/home/raf/projets/ulysse/livrables/slides/iss-station-spatiale.pptx")
print("OK 8 diapos")
