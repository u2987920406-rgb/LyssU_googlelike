#!/usr/bin/env python3
"""Build excel/langues-les-plus-parlees.xlsx — Top 10 des langues du monde.

Données : Ethnologue 2026 (via Wikipedia, L1/L2/total), CIA World Factbook 2022,
W3Techs (contenu web, déc. 2025), Ethnologue Insights (pays où la langue est parlée).
"""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

OUT = "/home/raf/projets/ulysse/livrables/excel/langues-les-plus-parlees.xlsx"

# Thème visuel
NAVY = "1F3864"
BLUE = "2E5C8A"
LIGHT = "D9E2F3"
CREAM = "FFF2CC"
GREY = "F2F2F2"

hdr_font = Font(name="Calibri", bold=True, size=11, color="FFFFFF")
title_font = Font(name="Calibri", bold=True, size=16, color=NAVY)
sub_font = Font(name="Calibri", italic=True, size=10, color="555555")
cell_font = Font(name="Calibri", size=11)
bold = Font(name="Calibri", bold=True, size=11)
thin = Side(style="thin", color="B4C6E7")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
wrap = Alignment(wrap_text=True, vertical="top")
center = Alignment(horizontal="center", vertical="center", wrap_text=True)

# Données (millions de locuteurs) — Ethnologue 2026 (Wikipédia, tableau L1/L2)
# nom, L1, L2, pays où parlée (Ethnologue Insights 2025/26), % population mondiale (Factbook 2022), % web (W3Techs déc. 2025)
DATA = [
    ("Anglais",            372, 1121, 188, 18.8, 49.3),
    ("Mandarin (chinois)", 988,  194, 108, 13.8,  1.1),
    ("Hindi",              347,  264, None,  7.5,  None),
    ("Espagnol",           487,   75, None,  6.9,  6.0),
    ("Arabe standard",       0,  335, None,  3.4,  None),
    ("Français",            75,  258, None,  3.4,  4.5),
    ("Bengali",            234,   43, None,  3.4,  0.1),
    ("Portugais",          252,   18, None,  3.2,  4.1),
    ("Indonésien",          78,  177, None,  None, None),
    ("Ourdou",              78,  168, None,  2.9,  None),
]

wb = Workbook()

# ---------------------------------------------------------------- Feuille 1
ws = wb.active
ws.title = "Top 10 langues"

ws["A1"] = "Les 10 langues les plus parlées dans le monde"
ws["A1"].font = title_font
ws["A2"] = "Locuteurs natifs (L1) et seconde langue (L2), en millions — Ethnologue 2026. Population mondiale de référence : 8 300 678 395 hab. (Worldometer, 1er juillet 2026)."
ws["A2"].font = sub_font
ws.merge_cells("A1:I1")
ws.merge_cells("A2:I2")

HEADERS = ["Rang", "Langue", "Locuteurs natifs\nL1 (M)", "Locuteurs seconde\nlangue L2 (M)",
           "Total\nL1+L2 (M)", "% locuteurs\nL2", "Part de la pop.\nmondiale (locuteurs)",
           "Part de la pop.\nmondiale (Factbook 2022)", "Présence\nweb (W3Techs)"]
HROW = 4
for c, h in enumerate(HEADERS, 1):
    cell = ws.cell(row=HROW, column=c, value=h)
    cell.font = hdr_font
    cell.fill = PatternFill("solid", fgColor=NAVY)
    cell.alignment = center
    cell.border = border

POPM = 8300.678395  # millions, Worldometer 1er juillet 2026
for i, (name, l1, l2, pays, factbook, web) in enumerate(DATA):
    r = HROW + 1 + i
    ws.cell(row=r, column=1, value=i + 1)
    ws.cell(row=r, column=2, value=name)
    ws.cell(row=r, column=3, value=l1)
    ws.cell(row=r, column=4, value=l2)
    ws.cell(row=r, column=5, value=f"=C{r}+D{r}")
    ws.cell(row=r, column=6, value=f"=D{r}/E{r}")
    ws.cell(row=r, column=7, value=f"=E{r}/{POPM}")
    if factbook is not None:
        ws.cell(row=r, column=8, value=factbook / 100)
    else:
        ws.cell(row=r, column=8, value="n. c.")
    if web is not None:
        ws.cell(row=r, column=9, value=web / 100)
    else:
        ws.cell(row=r, column=9, value="< 0,1 %")
    fill = PatternFill("solid", fgColor=LIGHT if i % 2 == 0 else "FFFFFF")
    for c in range(1, 10):
        cell = ws.cell(row=r, column=c)
        cell.font = bold if c == 2 else cell_font
        cell.fill = fill
        cell.border = border
        cell.alignment = center if c != 2 else Alignment(vertical="center")
        if c in (6, 7, 8, 9):
            if isinstance(cell.value, str) and cell.value.startswith("="):
                cell.number_format = "0.0 %"
            elif isinstance(cell.value, (int, float)):
                cell.number_format = "0.0 %"
        if c in (3, 4, 5):
            cell.number_format = "# ##0"

tot = HROW + 11
ws.cell(row=tot, column=2, value="TOTAL Top 10")
ws.cell(row=tot, column=3, value=f"=SUM(C{HROW+1}:C{HROW+10})")
ws.cell(row=tot, column=4, value=f"=SUM(D{HROW+1}:D{HROW+10})")
ws.cell(row=tot, column=5, value=f"=SUM(E{HROW+1}:E{HROW+10})")
ws.cell(row=tot, column=6, value=f"=D{tot}/E{tot}")
for c in range(1, 10):
    cell = ws.cell(row=tot, column=c)
    cell.font = Font(name="Calibri", bold=True, size=11, color="FFFFFF")
    cell.fill = PatternFill("solid", fgColor=BLUE)
    cell.border = border
    cell.alignment = center
    if c in (3, 4, 5):
        cell.number_format = "# ##0"
    if c == 6:
        cell.number_format = "0.0 %"

note = tot + 2
ws.cell(row=note, column=1,
        value="Formules : Total = L1 + L2 · % locuteurs L2 = L2 / Total · Part de la population mondiale = Total / 8 300,7 M (Worldometer, 01/07/2026). « n. c. » = non communiqué par la source.")
ws.cell(row=note, column=1).font = sub_font
ws.merge_cells(start_row=note, start_column=1, end_row=note, end_column=9)
ws.cell(row=note, column=1).alignment = wrap

widths = [6, 22, 14, 16, 12, 12, 16, 18, 12]
for i, w in enumerate(widths, 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.row_dimensions[HROW].height = 34
ws.freeze_panes = f"A{HROW+1}"
ws.sheet_properties.pageSetUpPr.fitToPage = True
ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0

# ---------------------------------------------------------------- Feuille 2
ws2 = wb.create_sheet("Analyse")
ws2["A1"] = "Ce que montrent ces chiffres"
ws2["A1"].font = title_font
ws2.merge_cells("A1:D1")

BLOCKS = [
    ("Indicateur", "Valeur (formule)", "Lecture"),
    ("Total de locuteurs du Top 10",
     "='Top 10 langues'!E15",
     "Le Top 10 couvre une part massive de l'humanité, mais les locuteurs se cumulent (bilingues comptés deux fois)."),
    ("Part du Top 10 dans la population mondiale",
     "='Top 10 langues'!E15/8300.678395",
     "Ratio à lire avec prudence : un bilingue anglais+français entre dans deux lignes."),
    ("Moyenne de locuteurs par langue du Top 10",
     "='Top 10 langues'!E15/10",
     "Moyenne très tirée vers le haut par l'anglais et le mandarin."),
    ("Langue la plus parlée en natif",
     "='Top 10 langues'!C6",
     "Le mandarin domine largement en locuteurs natifs (988 M)."),
    ("Langue la plus parlée toutes catégories",
     "='Top 10 langues'!E5",
     "L'anglais passe devant grâce à ses 1 121 M de locuteurs L2."),
    ("Part de locuteurs L2 (anglais)",
     "='Top 10 langues'!F5",
     "3 locuteurs de l'anglais sur 4 le parlent en seconde langue : effet de la diffusion mondiale."),
    ("Part de locuteurs L2 (mandarin)",
     "='Top 10 langues'!F6",
     "À l'inverse, le mandarin est surtout une langue maternelle, concentrée en Asie."),
    ("Présence web de l'anglais",
     "='Top 10 langues'!I5",
     "Près de la moitié des sites web sont en anglais (W3Techs, déc. 2025)."),
    ("Présence web du mandarin",
     "='Top 10 langues'!I6",
     "1,1 % du web pour 1,2 Md de locuteurs : très fort décalage entre audience et contenu."),
]
start = 3
for i, row in enumerate(BLOCKS):
    r = start + i
    for c, val in enumerate(row, 1):
        cell = ws2.cell(row=r, column=c, value=val)
        cell.border = border
        if i == 0:
            cell.font = hdr_font
            cell.fill = PatternFill("solid", fgColor=NAVY)
            cell.alignment = center
        else:
            cell.font = bold if c == 1 else cell_font
            cell.fill = PatternFill("solid", fgColor=LIGHT if i % 2 == 0 else "FFFFFF")
            cell.alignment = wrap
            if c == 2 and isinstance(val, str) and val.startswith("="):
                cell.number_format = "0.0 %"
                if "E15" in val and "/8300" not in val or val == "='Top 10 langues'!C6" or val == "='Top 10 langues'!E5":
                    cell.number_format = "# ##0"
for i, w in enumerate([36, 18, 62], 1):
    ws2.column_dimensions[get_column_letter(i)].width = w
ws2.freeze_panes = "A4"
ws2.sheet_properties.pageSetUpPr.fitToPage = True
ws2.page_setup.orientation = "landscape"
ws2.page_setup.fitToWidth = 1
ws2.page_setup.fitToHeight = 0

# ---------------------------------------------------------------- Feuille 3
ws3 = wb.create_sheet("Sources")
ws3["A1"] = "Sources — chaque chiffre du classeur est traçable ici"
ws3["A1"].font = title_font
ws3.merge_cells("A1:D1")
SH = ["Chiffre utilisé", "Source", "Référence / URL", "Date de la donnée"]
for c, h in enumerate(SH, 1):
    cell = ws3.cell(row=3, column=c, value=h)
    cell.font = hdr_font
    cell.fill = PatternFill("solid", fgColor=NAVY)
    cell.alignment = center
    cell.border = border

SRC = [
    ("Locuteurs L1, L2 et total (millions), Top 10",
     "Ethnologue 2026 (tableau « List of languages by total number of speakers »)",
     "https://en.wikipedia.org/wiki/List_of_languages_by_total_number_of_speakers",
     "édition Ethnologue 2026"),
    ("Classement Top 10 (total de locuteurs)",
     "Ethnologue — « The Ethnologue 200 »",
     "https://www.ethnologue.com/insights/ethnologue200/",
     "2026"),
    ("Nombre de pays où la langue est parlée (anglais 188, mandarin 108)",
     "Ethnologue — « What is the most spoken language? »",
     "https://www.ethnologue.com/insights/most-spoken-language/",
     "2025"),
    ("Part de la population mondiale par langue",
     "CIA World Factbook (relevé Wikipédia)",
     "https://en.wikipedia.org/wiki/List_of_languages_by_total_number_of_speakers",
     "2022"),
    ("Présence sur le web (% de sites par langue de contenu)",
     "W3Techs — Usage statistics of content languages for websites",
     "https://w3techs.com/technologies/overview/content_language",
     "3 décembre 2025"),
    ("Population mondiale de référence (8 300 678 395 hab.)",
     "Worldometer — « Population mondiale »",
     "https://www.worldometer.fr/world-population/population-mondiale",
     "1er juillet 2026"),
]
for i, row in enumerate(SRC):
    r = 4 + i
    for c, val in enumerate(row, 1):
        cell = ws3.cell(row=r, column=c, value=val)
        cell.font = cell_font
        cell.fill = PatternFill("solid", fgColor=LIGHT if i % 2 == 0 else "FFFFFF")
        cell.border = border
        cell.alignment = wrap
for i, w in enumerate([42, 44, 62, 22], 1):
    ws3.column_dimensions[get_column_letter(i)].width = w
ws3.freeze_panes = "A4"
ws3.sheet_properties.pageSetUpPr.fitToPage = True
ws3.page_setup.orientation = "landscape"
ws3.page_setup.fitToWidth = 1
ws3.page_setup.fitToHeight = 0

wb.save(OUT)
print("OK", OUT)
