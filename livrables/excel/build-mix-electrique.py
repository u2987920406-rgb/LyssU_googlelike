#!/usr/bin/env python3
"""Génère excel/mix-electrique-france-2025.xlsx — thème : énergie (mix électrique français 2025).
Données : RTE, Bilan électrique 2025 (25/02/2026) + 2025 Electricity review (15/04/2026)."""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties

OUT = "/home/raf/projets/ulysse/livrables/excel/mix-electrique-france-2025.xlsx"

HDR_FILL = PatternFill("solid", fgColor="1F4E5F")
HDR_FONT = Font(bold=True, color="FFFFFF", size=11)
TITLE_FONT = Font(bold=True, size=14, color="1F4E5F")
BOLD = Font(bold=True)
TOTAL_FILL = PatternFill("solid", fgColor="DCE9EE")
THIN = Side(style="thin", color="B7C9D3")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTER = Alignment(horizontal="center", vertical="center")

wb = Workbook()

# ── Feuille 1 : Mix 2025 ─────────────────────────────────────────────
ws = wb.active
ws.title = "Mix 2025"
ws["A1"] = "Le mix électrique français en 2025"
ws["A1"].font = TITLE_FONT
ws["A2"] = "Production d'électricité en France métropolitaine par filière (TWh)"
ws["A2"].font = Font(italic=True, size=10)

headers = ["Filière", "Production 2025 (TWh)", "Production 2024 (TWh)",
           "Évolution 2025-2024 (TWh)", "Part du mix 2025", "Part du mix 2024"]
for c, h in enumerate(headers, 1):
    cell = ws.cell(row=4, column=c, value=h)
    cell.fill, cell.font, cell.alignment, cell.border = HDR_FILL, HDR_FONT, CENTER, BORDER

# TWh 2025 sourcés (RTE) ; 2024 = 2025 − évolution sourcée, ou « par différence ».
rows = [
    ("Nucléaire",            373.0, 361.7),
    ("Hydraulique",           62.4,  75.3),
    ("Éolien",                49.6,  46.8),
    ("Solaire",               32.9,  24.8),
    ("Autres renouvelables (bioénergies, déchets, marémotrice)", None, None),  # par différence
    ("Thermique fossile (gaz, charbon, fioul)", None, None),                   # par différence
]
r = 5
for name, v25, v24 in rows:
    ws.cell(row=r, column=1, value=name)
    if v25 is not None:
        ws.cell(row=r, column=2, value=v25)
        ws.cell(row=r, column=3, value=v24)
    r += 1
# Autres renouvelables = bas carbone 2025 − (nucl+hydro+éolien+solaire) ; fossiles = total − bas carbone
ws["B9"] = "=521.1-(B5+B6+B7+B8)"
ws["C9"] = "=(547.5-8.2)-((373-11.3)+(62.4+12.9)+(49.6-2.8)+(32.9-8.1))-C10"
ws["B10"] = "=547.5-521.1"
ws["C10"] = "=B10+1.3"
for rr in range(5, 11):
    ws.cell(row=rr, column=4, value=f"=B{rr}-C{rr}")
    ws.cell(row=rr, column=5, value=f"=B{rr}/$B$11")
    ws.cell(row=rr, column=6, value=f"=C{rr}/$C$11")

ws.cell(row=11, column=1, value="TOTAL production métropolitaine")
ws["B11"] = "=SUM(B5:B10)"
ws["C11"] = "=SUM(C5:C10)"
ws["D11"] = "=SUM(D5:D10)"
ws["E11"] = "=SUM(E5:E10)"
ws["F11"] = "=SUM(F5:F10)"

ws["A13"] = "Dont : production bas carbone (nucléaire + renouvelable)"
ws["B13"] = 521.1
ws["C13"] = "=B13/B11"
ws["A14"] = "Soit 95,2 % du mix — record historique (RTE, Bilan électrique 2025)"
ws["A14"].font = Font(italic=True, size=9)

for rr in range(5, 12):
    for cc in range(1, 7):
        c = ws.cell(row=rr, column=cc)
        c.border = BORDER
        if cc >= 2:
            c.number_format = "0.0" if cc == 4 or cc in (2, 3) else "0.0 %"
            c.alignment = Alignment(horizontal="right")
for cc in range(1, 7):
    ws.cell(row=11, column=cc).fill = TOTAL_FILL
    ws.cell(row=11, column=cc).font = BOLD
ws["B13"].number_format = "0.0"
ws["C13"].number_format = "0.0 %"

widths = [62, 20, 20, 24, 16, 16]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.freeze_panes = "A5"

# ── Feuille 2 : Indicateurs clés ─────────────────────────────────────
ws2 = wb.create_sheet("Indicateurs clés")
ws2["A1"] = "Le système électrique français en 2025 — indicateurs clés"
ws2["A1"].font = TITLE_FONT
h2 = ["Indicateur", "Valeur", "Unité", "Comparaison / commentaire"]
for c, h in enumerate(h2, 1):
    cell = ws2.cell(row=3, column=c, value=h)
    cell.fill, cell.font, cell.alignment, cell.border = HDR_FILL, HDR_FONT, CENTER, BORDER

ind = [
    ("Production d'électricité (métropole)", 547.5, "TWh", "+8,2 TWh (+1,5 %) vs 2024 — proche du niveau d'avant-crise"),
    ("Production bas carbone (record)", 521.1, "TWh", "part bas carbone : 95,2 % du mix (calculs détaillés dans la feuille « Mix 2025 »)"),
    ("Part des renouvelables", 0.270, "du mix", "27,0 % en 2025, contre 27,9 % en 2024 (hydro en repli)"),
    ("Consommation brute française", 446.1, "TWh", "stable en 2025 ; −6 % vs moyenne 2014-2019"),
    ("Solde exportateur net", 92.3, "TWh", "record : 89,0 TWh en 2024 ; ≈ consommation annuelle de la Belgique"),
    ("Puissance installée fin 2025", 164.5, "GW", "inclut Flamanville 3 (1,6 GW), raccordé en décembre 2024"),
    ("Puissance solaire installée", 30.4, "GW", "dont 18 % d'autoconsommation (≈2,9 TWh autoconsommés)"),
    ("Éolien en mer produit", 5.7, "TWh", "+43 % vs 2024 (+1,7 TWh)"),
    ("Prix spot moyen annuel", 61.0, "€/MWh", "58 €/MWh en 2024"),
    ("Modulation solaire/éolien (prix négatifs)", 3.0, "TWh", "doublée vs 2024 : 1,3 éolien terrestre + 1,6 solaire"),
    ("Production thermique fossile", 26.4, "TWh", "plus bas depuis ~75 ans (−1,3 TWh vs 2024)"),
]
rr = 4
for name, val, unit, note in ind:
    ws2.cell(row=rr, column=1, value=name)
    v = ws2.cell(row=rr, column=2, value=val)
    v.number_format = "0.0 %" if unit == "du mix" else "0.0"
    v.alignment = Alignment(horizontal="right")
    ws2.cell(row=rr, column=3, value=unit)
    ws2.cell(row=rr, column=4, value=note)
    for cc in range(1, 5):
        ws2.cell(row=rr, column=cc).border = BORDER
    rr += 1
# Une formule utile : part exportée de la production
ws2.cell(row=rr, column=1, value="Export net / production totale")
ws2.cell(row=rr, column=2, value="=B8/B4").number_format = "0.0 %"
ws2.cell(row=rr, column=3, value="calculé")
ws2.cell(row=rr, column=4, value="≈17 % de l'électricité produite en France est vendue à l'étranger")
for cc in range(1, 5):
    ws2.cell(row=rr, column=cc).border = BORDER
    ws2.cell(row=rr, column=cc).fill = TOTAL_FILL
    ws2.cell(row=rr, column=cc).font = BOLD

for i, w in enumerate([42, 12, 12, 62], 1):
    ws2.column_dimensions[get_column_letter(i)].width = w
ws2.freeze_panes = "A4"

# ── Feuille 3 : Sources ──────────────────────────────────────────────
ws3 = wb.create_sheet("Sources")
ws3["A1"] = "Sources (toutes les valeurs ci-dessus sont sourcées)"
ws3["A1"].font = TITLE_FONT
h3 = ["Source", "Référence / URL", "Données utilisées"]
for c, h in enumerate(h3, 1):
    cell = ws3.cell(row=3, column=c, value=h)
    cell.fill, cell.font, cell.alignment, cell.border = HDR_FILL, HDR_FONT, CENTER, BORDER

srcs = [
    ("RTE — Bilan électrique 2025 (25/02/2026)", "https://analysesetdonnees.rte-france.com/bilan-electrique-2025/production",
     "Production totale 547,5 TWh, nucléaire 373,0 TWh, hydraulique 62,4 TWh, bas carbone 521,1 TWh (95,2 %), parts ENR 27 %"),
    ("RTE — 2025 Electricity review, Key findings (15/04/2026)", "https://analysesetdonnees.rte-france.com/en/annual-review-2025/keyfindings",
     "Évolution 2024→2025 par filière, fossiles au plus bas depuis ~75 ans, export net 92,3 TWh, parc 164,5 GW, modulation prix négatifs ~3 TWh"),
    ("RTE — Bilan électrique 2025, principaux résultats (PDF)", "https://assets.rte-france.com/prod/public/2026-03/Bilan-electrique-2025-principaux-resultats.pdf",
     "Maximum historique bas carbone 521,1 TWh"),
    ("RTE — Bilan électrique 2025, rapport complet (PDF)", "https://assets.rte-france.com/prod/public/2026-03/Bilan-electrique-2025-rapport-complet.pdf",
     "Solaire 30,4 GW installés fin 2025, autoconsommation 2,9 TWh, prix spot 61 €/MWh"),
    ("Connaissance des énergies (fév. 2026)", "https://www.connaissancedesenergies.org/la-production-electrique-bas-carbone-de-la-france-atteint-un-maximum-historique-en-2025",
     "Éolien 49,6 TWh (9,1 %), solaire 32,9 TWh (6 %), évolution nucléaire +11,3 TWh"),
    ("EDF — Production", "https://www.edf.fr/groupe-edf/comprendre/production",
     "547,5 TWh produits en 2025, 95 % décarbonés"),
]
rr = 4
for name, url, used in srcs:
    ws3.cell(row=rr, column=1, value=name)
    ws3.cell(row=rr, column=2, value=url)
    ws3.cell(row=rr, column=3, value=used)
    for cc in range(1, 4):
        c = ws3.cell(row=rr, column=cc)
        c.border = BORDER
        c.alignment = Alignment(vertical="top", wrap_text=True)
    rr += 1
for i, w in enumerate([44, 68, 62], 1):
    ws3.column_dimensions[get_column_letter(i)].width = w

for sh in wb.worksheets:  # impression : paysage, tenir sur une page de large
    sh.page_setup.orientation = "landscape"
    sh.page_setup.fitToWidth = 1
    sh.page_setup.fitToHeight = 0
    sh.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    sh.print_options.horizontalCentered = True

wb.save(OUT)
print("OK", OUT)
