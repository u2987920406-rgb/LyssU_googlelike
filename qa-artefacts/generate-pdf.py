#!/usr/bin/env python3
"""Génère le PDF du guide Hermès Agent via HTML + roughjs -> Chrome headless."""
import subprocess
import os
from pathlib import Path

HOME = Path.home()
OUTPUT_DIR = HOME / "projets" / "ulysse" / "qa-artefacts"
HTML_FILE = OUTPUT_DIR / "guide-hermes.html"
PDF_FILE = OUTPUT_DIR / "guide-hermes.pdf"

# Vérifier que l'HTML existe
if not HTML_FILE.exists():
    print(f"ERREUR: HTML introuvable: {HTML_FILE}")
    print("Fichiers disponibles:", list(OUTPUT_DIR.iterdir()))
    exit(1)

# Lancer Chrome headless en imprimant en PDF
# Utiliser un chemin absolu pour éviter les problèmes de résolution
chrome_cmd = [
    "google-chrome",
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--print-to-pdf=" + str(PDF_FILE),
    "--print-to-pdf-format=A4",
    str(HTML_FILE)
]

print(f"Lancement: {' '.join(chrome_cmd)}")
result = subprocess.run(chrome_cmd, capture_output=True, text=True, timeout=30)

if result.returncode != 0:
    print(f"ERREUR Chrome (exit {result.returncode}):")
    print(result.stderr[-500:] if result.stderr else "pas d'erreur")
else:
    print("Chrome terminé")

# Vérifier le résultat
if PDF_FILE.exists():
    size_kb = PDF_FILE.stat().st_size / 1024
    print(f"\n✓ PDF généré: {PDF_FILE} ({size_kb:.0f} Ko)")
    # Vérifier le nombre de pages avec PyPDF2 si disponible
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(str(PDF_FILE))
        print(f"  Pages: {len(reader.pages)}")
    except Exception:
        print("  (PyPDF2 non disponible pour le comptage de pages)")
else:
    print(f"\n✗ PDF non créé: {PDF_FILE}")
    exit(1)
