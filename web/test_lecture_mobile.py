#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_lecture_mobile.py — le lecteur de documents reste lisible au doigt (issue #126).

Script auto-executable (pas pytest) : `python3 test_lecture_mobile.py` -> exit 0/1.

Rapport de Raf, 2026-09-25 : « rien n'est responsive et je ne peux même pas
défiler les documents vers le bas ». Cause mesurée en navigateur réel (CDP,
viewport 512x1140 — Pixel 9 Pro XL) : quand un document s'ouvre,
`#artifactViewer` (enfant direct de `#app`) prend tout l'écran et `.stage` est
écrasé à 0 de large ; or `.panel{width:100vw}` du bloc mobile s'échappait de ce
conteneur vide et couvrait le lecteur d'un calque invisible (position:absolute,
z-index:1). Les gestes du doigt atterrissaient sur ce calque
(`elementFromPoint` renvoyait `#pDiscuter`) — le document ne défilait pas.

Ce test garde le CONTRAT CSS qui tient le calque hors du lecteur, sur le même
principe que test_tactile.py : valeurs EFFECTIVES calculées par cascade (ordre
du fichier, media queries applicables) — pas la simple présence d'une règle
(piège de l'issue #122). Le comportement au doigt est éprouvé à part, en
navigateur réel (banc Playwright, décrit dans la PR de l'issue) : la cascade
ne prouve que le contrat, le banc prouve le geste.

Contrat, pour un viewport de téléphone (360px, 512px, 640px) :

  - `#app.artifact-split .u-art-viewer` : width effective 100% — le lecteur
    occupe l'écran ;
  - `#app.artifact-split .stage` : display effective none — le calque des
    panneaux (et ses `.panel` en 100vw) ne peut pas recouvrir le lecteur ;
  - `.u-art-body` : overflow-y effective auto — le document a de quoi défiler ;

Et le contre-garde desktop (1280px) : `#app.artifact-split .stage` n'est PAS
masqué — les panneaux restent à côté du lecteur sur grand écran.
"""
import os
import re
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
CSS_PATH = os.path.join(DIR, 'ulysse.css')
VUEWS_TELEPHONE = (360, 512, 640)   # px — <=720px, dans le bloc mobile
VUEW_DESKTOP = 1280                 # px — le contrat mobile ne doit pas fuir


def parse_rules(css):
    """Retourne [(media, selector, decls)] dans l'ordre du fichier.

    Identique a test_tactile.py : un niveau d'imbrication @media, les
    commentaires neutralises d'abord (certains contiennent des accolades).
    """
    css = re.sub(r'/\*.*?\*/', ' ', css, flags=re.S)
    rules = []
    i, n = 0, len(css)
    while i < n:
        b = css.find('{', i)
        if b == -1:
            break
        prelude = css[i:b].strip()
        depth, j = 1, b + 1
        while j < n and depth:
            if css[j] == '{':
                depth += 1
            elif css[j] == '}':
                depth -= 1
            j += 1
        body = css[b + 1:j - 1]
        if prelude.startswith('@media'):
            cond = prelude[len('@media'):].strip()
            for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', body):
                decls = m.group(2).strip()
                for part in m.group(1).split(','):
                    sel = part.strip()
                    if sel:
                        rules.append((cond, sel, decls))
        elif prelude.startswith('@'):
            pass
        else:
            for part in prelude.split(','):
                sel = part.strip()
                if sel:
                    rules.append((None, sel, body))
        i = j
    return rules


def media_applies(cond, largeur):
    """True si la condition media s'applique a ce viewport (max-width gere)."""
    if cond is None:
        return True
    for m in re.finditer(r'\(max-width\s*:\s*(\d+(?:\.\d+)?)px\)', cond):
        if float(m.group(1)) >= largeur:
            return True
    return False


def effective(rules, selector, prop, largeur):
    """Valeur de `prop` qui gagne pour `selector` a cette largeur.

    Derniere declaration applicable dans l'ordre du fichier (cascade CSS).
    """
    val = None
    for cond, sel, decls in rules:
        if sel != selector or not media_applies(cond, largeur):
            continue
        for d in decls.split(';'):
            if ':' not in d:
                continue
            k, v = d.split(':', 1)
            if k.strip() == prop:
                val = v.strip()
    return val


def main():
    if not os.path.exists(CSS_PATH):
        print('ECHEC : %s introuvable' % CSS_PATH)
        return 1
    with open(CSS_PATH, encoding='utf-8') as fh:
        rules = parse_rules(fh.read())

    echecs = []

    def verifie(libelle, ok, detail):
        print(('  ok   ' if ok else '  ECHEC') + ' ' + libelle + (' — ' + detail if detail else ''))
        if not ok:
            echecs.append(libelle)

    print('Contrat du lecteur de documents (issue #126)')
    for w in VUEWS_TELEPHONE:
        largeur = effective(rules, '#app.artifact-split .u-art-viewer', 'width', w)
        verifie('viewport %dpx : le lecteur occupe tout l\'écran (width:100%%)' % w,
                largeur == '100%', 'width effective = %s' % largeur)

        disp = effective(rules, '#app.artifact-split .stage', 'display', w)
        verifie('viewport %dpx : le calque des panneaux est masqué (display:none)' % w,
                disp == 'none', 'display effective = %s' % disp)

        ov = effective(rules, '.u-art-body', 'overflow-y', w)
        verifie('viewport %dpx : le corps du document peut défiler (overflow-y:auto)' % w,
                ov == 'auto', 'overflow-y effective = %s' % ov)

        # les contrôles du lecteur (source/copier/télécharger/fermer) : plancher WCAG 2.5.5
        laige, haut = None, None
        for cond, sel, decls in rules:
            if sel != '.u-art-btn' or not media_applies(cond, w):
                continue
            for d in decls.split(';'):
                if ':' not in d:
                    continue
                k, v = d.split(':', 1)
                if k.strip() == 'width':
                    laige = v.strip()
                if k.strip() == 'height':
                    haut = v.strip()
        def px(val):
            m = re.fullmatch(r'(\d+(?:\.\d+)?)px', val or '')
            return float(m.group(1)) if m else None
        ok_btn = (px(laige) or 0) >= 44 and (px(haut) or 0) >= 44
        verifie('viewport %dpx : les contrôles du lecteur font >=44px' % w,
                ok_btn, '.u-art-btn = %s x %s' % (laige, haut))

    disp_d = effective(rules, '#app.artifact-split .stage', 'display', VUEW_DESKTOP)
    verifie('desktop %dpx : les panneaux restent à côté du lecteur' % VUEW_DESKTOP,
            disp_d != 'none', 'display effective = %s' % disp_d)

    if echecs:
        print('\n%d echec(s).' % len(echecs))
        return 1
    print('\nTout est au vert.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
