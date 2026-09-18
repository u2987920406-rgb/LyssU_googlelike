#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_tactile.py — cibles tactiles mobiles >=44px (issue #122).

Script auto-executable (pas pytest) : `python3 test_tactile.py` -> exit 0/1.

Parse web/ulysse.css et verifie, pour un viewport mobile de 360px (donc dans
le perimetre de @media (max-width:720px)), que les regles EFFECTIVES
(respectant la cascade CSS : ordre du fichier, regles de media queries
applicables) donnent au moins 44px :

  - .composer .icon-btn : width >=44px ET height >=44px ;
  - .validate           : height effective >=44px ;
  - .ghost-btn          : height effective >=44px ;
  - .m-languette        : width >=44px ET height >=44px ;
  - .rail-top .icon-btn : width >=44px.

Le bloc @media (max-width:720px) doit exister (c'est lui qui porte les
regles mobiles). Regle WCAG 2.5.5 / Material : cible tactile minimum 44x44px.

Remplace la version « faible » qui cherchait la simple PRESENCE d'une regle
par regex dans le bloc : elle passait alors que .validate/.ghost-btn restaient
a 40px (aucun override mobile), donc le bug de l'issue #122 lui echappait.
"""
import os
import re
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
CSS_PATH = os.path.join(DIR, 'ulysse.css')
VIEWPORT_W = 360          # px — telephone typique, <=720px
MIN_TARGET = 44           # px — minimum WCAG 2.5.5
BLOC_MOBILE = '@media (max-width:720px)'


def parse_rules(css):
    """Retourne [(media, selector, decls)] dans l'ordre du fichier.

    media : None (hors media query) ou la chaine de la condition, ex.
    '(max-width:720px)'. Gere un niveau d'imbrication (blocs @media simples,
    sans @media imbriques ni @supports). Les commentaires CSS sont neutralises
    d'abord : certains contiennent des accolades qui casseraient l'appariement.
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
            # @keyframes, @import, ... : ignore
            pass
        else:
            for part in prelude.split(','):
                sel = part.strip()
                if sel:
                    rules.append((None, sel, body))
        i = j
    return rules


def media_applies(cond):
    """True si la condition media s'applique a un viewport de VIEWPORT_W px.

    Ne gere que max-width (suffisant pour ce fichier) ; conditions sans
    dimension pixel considerees non applicables par prudence.
    """
    if cond is None:
        return True
    for m in re.finditer(r'\(max-width\s*:\s*(\d+(?:\.\d+)?)px\)', cond):
        if float(m.group(1)) >= VIEWPORT_W:
            return True
    return False


def px(value):
    """'44px' -> 44.0 ; None si pas une longueur px."""
    m = re.fullmatch(r'\s*([+-]?\d+(?:\.\d+)?)px\s*', value or '')
    return float(m.group(1)) if m else None


def effective(rules, selector):
    """Calcule width/height/min-height effectifs pour un viewport mobile.

    Cascade simplifiee mais fidele ici : on balaie les regles dans l'ordre du
    fichier ; une regle s'applique si le selecteur correspond exactement (apres
    normalisation d'espaces) et que sa media query couvre le viewport. La
    derniere declaration gagne.
    """
    want = re.sub(r'\s+', ' ', selector).strip()
    eff = {'width': None, 'height': None, 'min-height': None}
    matched = []
    for cond, sel, decls in rules:
        if re.sub(r'\s+', ' ', sel).strip() != want:
            continue
        if not media_applies(cond):
            continue
        matched.append((cond, decls))
        for decl in decls.split(';'):
            if ':' not in decl:
                continue
            prop, _, val = decl.partition(':')
            prop = prop.strip().lower()
            val = val.strip()
            if prop in eff:
                eff[prop] = val
    return eff, matched


def bloc_media_existe(css):
    """True si le bloc @media (max-width:720px) est present (accolades equilibrees)."""
    m = re.search(r'@media\s*\(max-width:720px\)\s*\{', css)
    if not m:
        return False
    i = m.end() - 1
    profondeur = 0
    for j in range(i, len(css)):
        if css[j] == '{':
            profondeur += 1
        elif css[j] == '}':
            profondeur -= 1
            if profondeur == 0:
                return True
    return False


# (selecteur, dimension, libelle) — toutes les cibles de la version faible
# de master, verifiees ici par leur VALEUR EFFECTIVE sur mobile.
CIBLES = [
    ('.composer .icon-btn', 'width', '.composer .icon-btn (largeur)'),
    ('.composer .icon-btn', 'height', '.composer .icon-btn (hauteur)'),
    ('.validate', 'height', '.validate (hauteur)'),
    ('.ghost-btn', 'height', '.ghost-btn (hauteur)'),
    ('.m-languette', 'width', '.m-languette (largeur)'),
    ('.m-languette', 'height', '.m-languette (hauteur)'),
    ('.rail-top .icon-btn', 'width', '.rail-top .icon-btn (largeur)'),
]

DIM_DIM = {'width': 'width', 'height': 'height'}


def main():
    try:
        css = open(CSS_PATH, encoding='utf-8').read()
    except OSError as e:
        print(f'ERREUR: lecture de {CSS_PATH}: {e}')
        return 1
    rules = parse_rules(css)

    failures = []

    # --- le bloc mobile doit exister -------------------------------------
    print(f'test_cibles_tactiles_mobile_44px — viewport {VIEWPORT_W}px, '
          f'minimum {MIN_TARGET}x{MIN_TARGET}px')
    if bloc_media_existe(css):
        print(f'  OK    le bloc {BLOC_MOBILE} existe')
    else:
        print(f'  ECHEC le bloc {BLOC_MOBILE} est absent')
        failures.append(f'le bloc {BLOC_MOBILE} est absent')

    # --- chaque cible : valeur EFFECTIVE >=44px sur mobile ---------------
    for sel, dim, label in CIBLES:
        eff, matched = effective(rules, sel)
        val = px(eff[dim])
        if not matched:
            failures.append(f'{sel}: aucune regle mobile applicable')
            print(f'  ECHEC cible tactile >= {MIN_TARGET}px : {label} '
                  f'— aucune regle mobile applicable')
            continue
        if val is None or val < MIN_TARGET:
            failures.append(
                f'{label}: {dim} effective {eff[dim]!r} < {MIN_TARGET}px '
                f'sur mobile')
            print(f'  ECHEC cible tactile >= {MIN_TARGET}px : {label} '
                  f'— {dim} {eff[dim]!r}')
        else:
            print(f'  OK    cible tactile >= {MIN_TARGET}px : {label} '
                  f'— {dim} {eff[dim]!r}')

    # --- detail des valeurs effectives (aide au diagnostic) --------------
    print('  valeurs effectives sur mobile :')
    for sel, dim, _ in CIBLES:
        eff, matched = effective(rules, sel)
        print(f'    {sel}: width={eff["width"]!r} height={eff["height"]!r} '
              f'min-height={eff["min-height"]!r} '
              f'({len(matched)} regle(s) applicable(s))')

    if failures:
        print('ECHEC:')
        for f in failures:
            print(f'  - {f}')
        print('\n' + '=' * 62)
        print(f'  {len(CIBLES) + 1 - len(failures)} / {len(CIBLES) + 1} '
              f'verifications passees')
        print('=' * 62)
        return 1
    print('OK: toutes les cibles tactiles mobiles >=44px.')
    print('\n' + '=' * 62)
    print(f'  {len(CIBLES) + 1} / {len(CIBLES) + 1} verifications passees')
    print('=' * 62)
    return 0


if __name__ == '__main__':
    sys.exit(main())
