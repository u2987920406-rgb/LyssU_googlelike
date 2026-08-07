#!/usr/bin/env python3
"""
reprise.py — Déclencheur « reprise » du projet Ulysse.

Comportement (acté avec kuchu, 2026-08-07) :
  Au mot « reprise », Hermès inspecte le GIT du dossier projet pour reconstruire
  le contexte SANS relire toute l'histoire :
    - EN ARRIÈRE 1 jalon  (dernier jalon validé)
    - EN AVANT   2 jalons (ce qui vient, pour anticiper)
  Un « jalon » = un tag git dont le nom contient « jalon » (ex: jalon-1, jalon-2)
  OU un commit dont le message commence par « JALON: ».

Ce script est NON-DESTRUCTIF : il lit seulement (git log / show), n'écrit rien,
ne commit rien. Il s'appuie sur les fichiers du projet (REPRISE.md, plan.md, ADM.md)
pour produire un résumé de reprise.

Usage :
  python reprise.py            -> résumé complet (arrière 1 / avant 2)
  python reprise.py --back 1 --fwd 2
  python reprise.py --check    -> vérifie que le dossier est un repo git et liste les jalons
"""
import argparse
import os
import subprocess
import sys

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))


def run(cmd):
    """Lance une commande git en lecture seule, retourne stdout ou ''."""
    try:
        out = subprocess.run(
            ["git"] + cmd,
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            check=False,
        )
        return out.stdout.strip()
    except FileNotFoundError:
        return ""


def is_git_repo():
    return run(["rev-parse", "--is-inside-work-tree"]) == "true"


def list_jalons():
    """Retourne la liste ordonnée des noms de jalons (tags jalon-* ou commits JALON:)."""
    tags = run(["tag", "--list", "jalon*"]).splitlines()
    jalons = sorted(tags) if tags else []
    # Jalons par commit message
    commits = run(
        ["log", "--pretty=format:%H|%s"]
    ).splitlines()
    for line in commits:
        if "|" in line:
            h, msg = line.split("|", 1)
            if msg.upper().startswith("JALON:"):
                jalons.append(f"commit:{h[:8]} ({msg})")
    return jalons


def read_project_file(name):
    path = os.path.join(PROJECT_DIR, name)
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    return f"(fichier {name} absent)"


def current_context(back=1, fwd=2):
    if not is_git_repo():
        print("⚠️  Ce dossier n'est pas un dépôt git.")
        print("   Lance 'git init' dans le dossier projet pour activer le déclencheur.")
        return

    jalons = list_jalons()
    print("═" * 60)
    print("REPRISE — projet Ulysse")
    print("═" * 60)
    print(f"Jalons connus ({len(jalons)}) :")
    for j in jalons[-back:] if jalons else []:
        print(f"  ← {j}")
    if not jalons:
        print("  (aucun jalon taggé pour l'instant — init le premier avec un tag 'jalon-1')")

    print("\n--- REPRISE.md (avancement) ---")
    print(read_project_file("REPRISE.md"))
    print("\n--- plan.md (jalons restants) ---")
    print(read_project_file("plan.md"))
    print("\n--- ADM.md (décisions) ---")
    print(read_project_file("ADM.md"))
    print("\n═" * 60)
    print(f"Contexte reconstruit : arrière {back} jalon / avant {fwd} jalons.")
    print("═" * 60)


def main():
    p = argparse.ArgumentParser(description="Déclencheur reprise projet Ulysse")
    p.add_argument("--back", type=int, default=1, help="jalons en arrière (défaut 1)")
    p.add_argument("--fwd", type=int, default=2, help="jalons en avant (défaut 2)")
    p.add_argument("--check", action="store_true", help="vérifie repo git + liste jalons")
    args = p.parse_args()

    if args.check:
        print("repo git :", "OUI" if is_git_repo() else "NON")
        print("jalons :", list_jalons() or "(aucun)")
        return

    current_context(back=args.back, fwd=args.fwd)


if __name__ == "__main__":
    main()
