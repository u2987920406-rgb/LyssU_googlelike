#!/usr/bin/env python3
"""Parse structurel du .xlsx : formules, largeurs, styles d'en-têtes, évaluation des résultats."""
from openpyxl import load_workbook

P = "/home/raf/projets/ulysse/livrables/excel/mix-electrique-france-2025.xlsx"
wb = load_workbook(P)
for ws in wb.worksheets:
    print(f"== {ws.title} | dims={ws.dimensions} | freeze={ws.freeze_panes}")
    widths = {k: v.width for k, v in ws.column_dimensions.items()}
    print("  widths:", widths)
    formulas = []
    for row in ws.iter_rows():
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("="):
                formulas.append(f"{c.coordinate}={c.value}")
    print(f"  formules ({len(formulas)}):", "; ".join(formulas[:20]))
    hdr = [c for c in ws[3] if c.value]
    for c in hdr:
        print(f"  hdr {c.coordinate}: bold={c.font.bold} color={c.font.color.rgb if c.font.color else None} fill={c.fill.fgColor.rgb}")

# Évaluation des résultats avec data_only impossible sans moteur ; recalcul via formules simples :
print("\n-- Contrôles arithmétiques --")
mix25 = [373.0, 62.4, 49.6, 32.9]
autres = 521.1 - sum(mix25)
fossiles = 547.5 - 521.1
mix24 = [361.7, 75.3, 46.8, 24.8]
foss24 = fossiles + 1.3
autres24 = 539.3 - (sum(mix24) + foss24)
print(f"autres renouv. 2025 = {autres:.1f} TWh | fossiles 2025 = {fossiles:.1f} TWh | total = {sum(mix25)+autres+fossiles:.1f} TWh (attendu 547.5)")
print(f"autres renouv. 2024 = {autres24:.1f} TWh | fossiles 2024 = {foss24:.1f} TWh | total = {sum(mix24)+autres24+foss24:.1f} TWh (attendu 539.3)")
print(f"part bas carbone = {521.1/547.5:.3%} (RTE annonce 95,2 %)")
print(f"export/production = {92.3/547.5:.1%}")
