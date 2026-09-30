#!/usr/bin/env python3
"""Génère slides/la-tectonique-des-plaques.pptx (géologie). Sources citées dans le fichier."""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

NAVY = RGBColor(0x14, 0x2A, 0x4F)
TEAL = RGBColor(0x1B, 0x7F, 0x79)
AMBER = RGBColor(0xD9, 0x7A, 0x1B)
GREY = RGBColor(0x44, 0x4B, 0x54)
LIGHT = RGBColor(0xF2, 0xF5, 0xF8)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]
SW, SH = 13.333, 7.5


def box(slide, x, y, w, h, fill=None, line=None):
    from pptx.enum.shapes import MSO_SHAPE
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = fill
    if line is None:
        sh.line.fill.background()
    else:
        sh.line.color.rgb = line
        sh.line.width = Pt(1.25)
    sh.shadow.inherit = False
    return sh


def text(slide, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.0):
    """runs = list of (txt, size, bold, color, space_after_pt)"""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Emu(0)
    tf.margin_top = tf.margin_bottom = Emu(0)
    for i, (txt, size, bold, color, after) in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        p.space_after = Pt(after)
        r = p.add_run()
        r.text = txt
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = "Calibri"
    return tb


def header(slide, kicker, title, sub=None):
    box(slide, 0, 0, SW, 1.35, fill=NAVY)
    box(slide, 0, 1.35, SW, 0.08, fill=AMBER)
    text(slide, 0.7, 0.16, 11.9, 0.35, [(kicker, 13, True, RGBColor(0xF2, 0xC2, 0x7A), 0)])
    text(slide, 0.7, 0.5, 11.9, 0.7, [(title, 28, True, WHITE, 0)], anchor=MSO_ANCHOR.MIDDLE)
    if sub:
        text(slide, 0.7, 1.62, 11.9, 0.45, [(sub, 15, False, GREY, 0)])


def footer(slide, n, src):
    text(slide, 0.7, 6.95, 10.4, 0.4, [(src, 10, False, GREY, 0)])
    text(slide, 11.4, 6.95, 1.2, 0.4, [(f"{n} / 8", 11, True, NAVY, 0)], align=PP_ALIGN.RIGHT)


def card(slide, x, y, w, h, title, body, accent=TEAL):
    box(slide, x, y, w, h, fill=LIGHT, line=accent)
    box(slide, x, y, 0.09, h, fill=accent)
    text(slide, x + 0.28, y + 0.18, w - 0.5, 0.4, [(title, 16, True, NAVY, 4)])
    text(slide, x + 0.28, y + 0.66, w - 0.5, h - 0.85,
         [(b, 13, False, GREY, 4) for b in body], spacing=1.05)


# ---------------------------------------------------------------- 1. Titre
s = prs.slides.add_slide(BLANK)
box(s, 0, 0, SW, SH, fill=NAVY)
box(s, 0, 4.6, SW, 0.1, fill=AMBER)
text(s, 1.0, 2.3, 11.3, 0.5, [("GÉOLOGIE — SCIENCES DE LA TERRE", 15, True, RGBColor(0xF2, 0xC2, 0x7A), 0)])
text(s, 1.0, 2.85, 11.3, 1.4,
     [("La tectonique des plaques", 48, True, WHITE, 6),
      ("Comprendre pourquoi bougent les continents, tremble la Terre et naissent les montagnes", 19, False, RGBColor(0xC9, 0xD6, 0xE4), 0)],
     spacing=1.05)
text(s, 1.0, 5.0, 11.3, 1.4,
     [("8 diapositives · chiffres sourcés et cités (Wikipédia, USGS, Britannica, The Pangea Map)", 13, False, RGBColor(0x9F, 0xB2, 0xC6), 4),
      ("Généré localement — python-pptx", 13, False, RGBColor(0x9F, 0xB2, 0xC6), 0)])

# ---------------------------------------------------------------- 2. Idée-clé
s = prs.slides.add_slide(BLANK)
header(s, "IDÉE-CLÉ", "Une Terre en morceaux, en mouvement permanent",
       "La surface terrestre n'est pas d'un seul bloc : elle est découpée en plaques rigides qui flottent sur le manteau chaud et ductile.")
card(s, 0.7, 2.35, 3.85, 4.1, "15 plaques majeures",
     ["Complétées par une cinquantaine de plaques mineures.",
      "Chaque plaque porte un continent, un océan, ou les deux.",
      "Ex. : plaque Pacifique (océanique), plaque Amérique du Sud (mixte)."])
card(s, 4.75, 2.35, 3.85, 4.1, "≈ 100 km d'épaisseur",
     ["La lithosphère (croûte + manteau supérieur rigide) forme les plaques.",
      "En dessous : l'asthénosphère, ductile, qui les laisse glisser.",
      "Les plaques portent les océans ET les continents."])
card(s, 8.8, 2.35, 3.85, 4.1, "0 à ≈ 16 cm / an",
     ["Vitesse du mouvement relatif entre deux plaques (maximum observé).",
      "Soit à peu près la vitesse à laquelle poussent vos ongles.",
      "Mais sur 100 millions d'années, cela déplace un continent de milliers de km."])
footer(s, 2, "Sources : Wikipédia « Tectonique des plaques » (15 plaques majeures, ~50 mineures, vitesses 0–16 cm/an).")

# ---------------------------------------------------------------- 3. Histoire
s = prs.slides.add_slide(BLANK)
header(s, "HISTOIRE DES SCIENCES", "De la dérive des continents à la tectonique",
       "Trois étapes : une intuition juste (1912), un mécanisme manquant, puis la preuve venue des fonds océaniques.")
rows = [
    ("1912", "Alfred Wegener publie la théorie de la dérive des continents : les continents se seraient déplacés à la surface du globe.", AMBER),
    ("1912-1950", "L'idée est rejetée faute de mécanisme : aucun continent ne peut « labourer » la croûte océanique.", GREY),
    ("1960", "Harry Hess propose l'expansion des fonds océaniques : la croûte naît aux dorsales et s'écarte — le moteur est trouvé.", TEAL),
    ("années 1960", "Sismologie, paléomagnétisme et âge des fonds convergent : la synthèse « tectonique des plaques » s'impose.", NAVY),
]
y = 2.4
for date, desc, col in rows:
    box(s, 0.7, y, 2.1, 0.95, fill=col)
    text(s, 0.8, y, 1.9, 0.95, [(date, 18, True, WHITE, 0)], align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    box(s, 2.9, y, 9.7, 0.95, fill=LIGHT)
    text(s, 3.15, y, 9.25, 0.95, [(desc, 14, False, GREY, 0)], anchor=MSO_ANCHOR.MIDDLE, spacing=1.02)
    y += 1.12
footer(s, 3, "Sources : Wikipédia « Dérive des continents », « Harry Hess », « Expansion des fonds océaniques », « Tectonique des plaques ».")

# ---------------------------------------------------------------- 4. Limites
s = prs.slides.add_slide(BLANK)
header(s, "MÉCANISME", "Trois types de limites entre plaques",
       "Tout l'activité sismique et volcanique majeure se concentre aux frontières des plaques.")
card(s, 0.7, 2.35, 3.85, 4.1, "Divergentes — écartement",
     ["Les plaques s'écartent : le manteau remonte et crée une croûte neuve.",
      "Dorsales océaniques (ex. dorsale médio-atlantique).",
      "Rifts continentaux (ex. rift est-africain)."], accent=TEAL)
card(s, 4.75, 2.35, 3.85, 4.1, "Convergentes — chevauchement",
     ["Subduction : une plaque plonge sous l'autre → fosses, volcans, grands séismes.",
      "Collision : deux continents s'empilent → chaînes de montagnes (Alpes, Himalaya).",
      "Ex. : la fosse des Mariannes (plaque Pacifique sous plaque Mariannes)."], accent=AMBER)
card(s, 8.8, 2.35, 3.85, 4.1, "Transformantes — coulissement",
     ["Les plaques glissent latéralement l'une contre l'autre.",
      "Ni croûte créée, ni croûte détruite.",
      "Séismes brutaux, sans volcan : faille de San Andreas (Californie)."], accent=NAVY)
footer(s, 4, "Sources : Wikipédia « Tectonique des plaques » et « Faille transformante » ; USGS « Plate tectonics ».")

# ---------------------------------------------------------------- 5. Pangée
s = prs.slides.add_slide(BLANK)
header(s, "DANS LE TEMPS PROFOND", "Pangée : le supercontinent et sa rupture",
       "Les plaques rassemblent puis dispersent les continents selon un cycle long de plusieurs centaines de millions d'années.")
box(s, 0.7, 2.35, 5.75, 4.1, fill=LIGHT, line=NAVY)
box(s, 0.7, 2.35, 0.09, 4.1, fill=NAVY)
text(s, 1.0, 2.6, 5.2, 3.6,
     [("Repères chiffrés", 17, True, NAVY, 8),
      ("≈ 335 Ma : assemblée de Pangée (Carbonifère) — Wikipédia « Pangée »", 14, False, GREY, 6),
      ("≈ 175 Ma : début de la fragmentation (Jurassique) — Wikipédia « Pangée »", 14, False, GREY, 6),
      ("≈ 160 Ma : durée de vie du supercontinent — Wikipédia « Pangée » (en)", 14, False, GREY, 6),
      ("≈ 15 cm/an : dérive de l'Inde vers le nord, l'un des mouvements les plus rapides connus — The Pangea Map", 14, False, GREY, 6),
      ("400 à 600 Ma : période du cycle de Wilson (assemblage / rupture des supercontinents) — The Pangea Map", 14, False, GREY, 0)],
     spacing=1.05)
box(s, 6.8, 2.35, 5.8, 4.1, fill=LIGHT, line=AMBER)
box(s, 6.8, 2.35, 0.09, 4.1, fill=AMBER)
text(s, 7.1, 2.6, 5.2, 3.6,
     [("À retenir", 17, True, NAVY, 8),
      ("Pangée (du grec « toutes les terres ») était entourée de l'océan Panthalassa.", 14, False, GREY, 6),
      ("Elle s'est d'abord scindée en deux : Laurasia au nord, Gondwana au sud.", 14, False, GREY, 6),
      ("Puis l'Atlantique sud s'est ouvert — l'Amérique du Sud s'écartant de l'Afrique.", 14, False, GREY, 6),
      ("Pangée n'est pas le premier supercontinent : Rodinia (≈ 1,1 Ga) l'a précédé.", 14, False, GREY, 6),
      ("Les Alpes et l'Himalaya sont les « coutures » encore actives de ces mouvements.", 14, False, GREY, 0)],
     spacing=1.05)
footer(s, 5, "Sources : Wikipédia « Pangée » et « Rodinia » ; The Pangea Map (thepangeamap.com).")

# ---------------------------------------------------------------- 6. Risques
s = prs.slides.add_slide(BLANK)
header(s, "ENJEUX", "Séismes et volcans : la ceinture de feu",
       "Les frontières de plaques concentrent l'essentiel des risques géologiques sur la Terre.")
card(s, 0.7, 2.35, 3.85, 4.1, "452 volcans",
     ["La ceinture de feu du Pacifique en compte 452, soit 75 % des volcans émergés de la planète (actifs ou éteints).",
      "Un anneau de 40 000 km autour de l'océan Pacifique.",
      "De l'arc japonais aux Andes chiliennes."], accent=AMBER)
card(s, 4.75, 2.35, 3.85, 4.1, "≈ 90 % des séismes",
     ["Environ 90 % des tremblements de terre mondiaux y sont enregistrés.",
      "La subduction produit les plus grands séismes : Japon 2011, Chili 1960.",
      "Conséquence directe des limites convergentes."], accent=NAVY)
card(s, 8.8, 2.35, 3.85, 4.1, "10 935 m de profondeur",
     ["Le Challenger Deep (fosse des Mariannes) est le point le plus bas de la Terre.",
      "Creusé par la subduction de la plaque Pacifique sous la plaque Mariannes.",
      "Plus profond que l'Everest n'est haut."], accent=TEAL)
footer(s, 6, "Sources : Wikipédia « Ceinture de feu du Pacifique » (452 volcans, 75 %, ~90 % des séismes) ; Encyclopædia Britannica « Challenger Deep » (10 935 m).")

# ---------------------------------------------------------------- 7. Synthèse
s = prs.slides.add_slide(BLANK)
header(s, "SYNTHÈSE", "Ce qu'il faut retenir en 5 points")
pts = [
    "La lithosphère est découpée en 15 plaques majeures et une cinquantaine de mineures, qui bougent de 0 à ≈ 16 cm/an.",
    "Trois types de limites : divergentes (création de croûte), convergentes (destruction, subduction), transformantes (coulissement).",
    "Pangée s'est assemblée vers 335 Ma puis fragmentée vers 175 Ma ; les continents poursuivent leur dérive.",
    "Ceinture de feu du Pacifique : 452 volcans (75 % des volcans émergés) et ≈ 90 % des séismes mondiaux.",
    "La tectonique des plaques relie en une seule théorie montagnes, séismes, volcans et forme des continents.",
]
y = 2.15
for i, p in enumerate(pts, 1):
    box(s, 0.7, y, 0.55, 0.75, fill=TEAL if i % 2 else NAVY)
    text(s, 0.7, y, 0.55, 0.75, [(str(i), 20, True, WHITE, 0)], align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    box(s, 1.35, y, 11.25, 0.75, fill=LIGHT)
    text(s, 1.6, y, 10.8, 0.75, [(p, 14, False, GREY, 0)], anchor=MSO_ANCHOR.MIDDLE, spacing=1.0)
    y += 0.92
footer(s, 7, "Synthèse — chiffres sourcés et cités sur les diapositives 2 à 6.")

# ---------------------------------------------------------------- 8. Sources
s = prs.slides.add_slide(BLANK)
header(s, "RÉFÉRENCES", "Sources (toutes citées dans le corps du document)")
srcs = [
    "Wikipédia, « Tectonique des plaques » — 15 plaques majeures, ~50 plaques mineures, vitesses 0 à ≈ 16 cm/an.",
    "Wikipédia, « Pangée » — assemblage ≈ 335 Ma, fragmentation ≈ 175 Ma, durée ≈ 160 Ma ; « Rodinia » (≈ 1,1 Ga).",
    "Wikipédia, « Dérive des continents » (Wegener, 1912) ; « Expansion des fonds océaniques » / Harry Hess (1960).",
    "Wikipédia, « Ceinture de feu du Pacifique » — 452 volcans (75 % des volcans émergés), ≈ 90 % des séismes mondiaux.",
    "Encyclopædia Britannica, « Challenger Deep » — 10 935 m, fosse des Mariannes, subduction plaque Pacifique.",
    "The Pangea Map (thepangeamap.com) — cycle de Wilson 400–600 Ma, dérive de l'Inde ≈ 15 cm/an, Panthalassa.",
    "USGS, « Plate Tectonics » — cadre général des limites de plaques et de l'activité sismique et volcanique.",
    "Consultation des sources : 25/09/2026. Génération locale (python-pptx), sans API tierce de production.",
]
y = 2.2
for sline in srcs:
    box(s, 0.7, y, 0.16, 0.16, fill=AMBER)
    text(s, 1.05, y - 0.06, 11.5, 0.5, [(sline, 13, False, GREY, 0)], spacing=1.0)
    y += 0.58
footer(s, 8, "Fin — 8 diapositives.")

prs.save("/home/raf/projets/ulysse/livrables/slides/la-tectonique-des-plaques.pptx")
print("OK pptx écrit")
