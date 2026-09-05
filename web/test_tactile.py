#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_tactile.py — cibles tactiles mobiles >=44px (issue #122).

Script auto-executable (pas pytest) : `python3 test_tactile.py` -> exit 0/1.

Parse web/ulysse.css et verifie, pour un viewport mobile de 360px (donc
dans le perimetre de @media (max-width:720px)), que les regles EFFECTIVES
(respectant la cascade CSS : ordre du fichier, regles de media queries
applicables) donnent :

  - .composer .icon-btn : width >=44px ET height >=44px (les deux
    dimensions sont explicites dans le CSS) ;
  - .validate           : height effective >=44px ;
  - .ghost-btn          : height effective >=44px.

Regle WCAG 2.5.5 / Material : cible tactile minimum 44x44px.
"""
import re
import sys

CSS_PATH = 'ulysse.css'
VIEWPORT_W = 360          # px — telephone typique, <=720px
MIN_TARGET = 44           # px — minimum WCAG 2.5.5


def parse_rules(css):
    """Retourne [(media, selector, decls)] dans l'ordre du fichier.

    media : None (hors media query) ou la chaine de la condition, ex.
    '(max-width:720px)'. Gere un niveau d'imbrication (blocs @media
    simples, sans @media imbriques ni @supports). Les commentaires CSS
    sont neutralises d'abord : certains contiennent des accolades qui
    casseraient l'appariement des blocs.
    """
    css = re.sub(r'/\*.*?\*/', ' ', css, flags=re.S)
    rules = []
    i, n = 0, len(css)
    while i < n:
        # prochain '{' et le texte qui le precede
        b = css.find('{', i)
        if b == -1:
            break
        prelude = css[i:b].strip()
        # trouver l'accolade fermante correspondante
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

    Ne gere que max-width (suffisant pour ce fichier) ; conditions
    sans dimension pixel considerees non applicables par prudence.
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

    Cascade simplifiee mais fidele ici : on balaie les regles dans
    l'ordre du fichier ; une regle s'applique si le selecteur correspond
    exactement (apres normalisation d'espaces) et que sa media query
    couvre le viewport. La derniere declaration gagne.
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


def main():
    try:
        css = open(CSS_PATH, encoding='utf-8').read()
    except OSError as e:
        print(f'ERREUR: lecture de {CSS_PATH}: {e}')
        return 1
    rules = parse_rules(css)

    failures = []

    # --- .composer .icon-btn : width ET height explicites >=44px ---------
    sel = '.composer .icon-btn'
    eff, matched = effective(rules, sel)
    w, h = px(eff['width']), px(eff['height'])
    if not matched:
        failures.append(f'{sel}: aucune regle mobile applicable')
    else:
        if w is None or w < MIN_TARGET:
            failures.append(f'{sel}: width effective {eff["width"]!r} < {MIN_TARGET}px')
        if h is None or h < MIN_TARGET:
            failures.append(f'{sel}: height effective {eff["height"]!r} < {MIN_TARGET}px')

    # --- .validate / .ghost-btn : height effective >=44px ----------------
    for sel in ('.validate', '.ghost-btn'):
        eff, matched = effective(rules, sel)
        h = px(eff['height'])
        minh = px(eff['min-height'])
        ok = (h is not None and h >= MIN_TARGET) or \
             (h is None and minh is not None and minh >= MIN_TARGET)
        if not ok:
            failures.append(
                f'{sel}: height effective {eff["height"]!r} '
                f'(min-height {eff["min-height"]!r}) < {MIN_TARGET}px sur mobile')

    # --- rapport ----------------------------------------------------------
    print(f'test_cibles_tactiles_mobile_44px — viewport {VIEWPORT_W}px, '
          f'minimum {MIN_TARGET}x{MIN_TARGET}px')
    for sel in ('.composer .icon-btn', '.validate', '.ghost-btn'):
        eff, matched = effective(rules, sel)
        print(f'  {sel}: width={eff["width"]!r} height={eff["height"]!r} '
              f'min-height={eff["min-height"]!r} '
              f'({len(matched)} regle(s) applicable(s))')
    if failures:
        print('ECHEC:')
        for f in failures:
            print(f'  - {f}')
        return 1
    print('OK: toutes les cibles tactiles mobiles >=44px.')
    return 0


if __name__ == '__main__':
    sys.exit(main())