# Le plugin qui rend « Manuel » vrai

## Pourquoi ce dossier existe

Ulysse n'installe rien dans Hermès : il l'enveloppe. C'est la règle du projet,
et elle tient — sauf pour **une** pièce, qui doit vivre du côté d'Hermès parce
qu'elle s'accroche à son cycle d'appel d'outil.

Sans elle, Ulysse démarre sur la position **Manuel**, affiche « Toujours
demander avant d'apporter des modifications »… et **rien ne demande**. Les
fichiers sont écrits sans un mot.

C'est exactement la promesse creuse que ce produit a retirée de cinq endroits.
La laisser réapparaître sur une machine neuve serait la réintroduire là où elle
fait le plus de dégâts : chez quelqu'un qui installe Ulysse pour la première
fois et qui n'a aucune raison de faire confiance.

**Ces fichiers sont donc une copie versionnée de ce qui tourne.** Ils ne sont
pas lus depuis ce dossier.

## Le trou qu'il bouche

`approvals.mode = manual` ne couvre **que le garde du terminal** — « affects
subsequent terminal guard checks », `hermes_cli/approval_mode.py`. Un
`write_file` ordinaire ne passe par aucune porte, à aucun réglage. Mesuré sur
l'installation, pas déduit.

Le plugin répond `{"action": "approve"}` au hook `pre_tool_call`, ce qui
escalade vers `request_tool_approval()` — la porte qu'Ulysse écoute déjà.
Mêmes choix `once/session/always/deny`, même fail-closed, même file.

⚠ Un hook shell de `config.yaml` **n'aurait pas suffi** : `agent/shell_hooks.py`
ne traduit que `block` pour `pre_tool_call`. Il sait interdire, pas demander.
La vraie question exige un plugin Python.

## Installer

Copier le dossier `ulysse-approbation/` dans les plugins d'Hermès :

- **Windows** — `%LOCALAPPDATA%\hermes\plugins\`
- **Linux / macOS** — `~/.hermes/plugins/`

Puis l'activer :

```bash
hermes plugins enable ulysse-approbation
```

**Répondre non** à la question sur le remplacement des outils intégrés : le
plugin n'a pas besoin de ce privilège, il n'override aucun outil. Sans ce
privilège, `plugins.entries.ulysse-approbation.allow_tool_override` reste à
`false` — c'est ce qu'on veut.

Vérifier :

```bash
hermes plugins list
```

La ligne doit dire `enabled`, source `user`. Le chargement prend effet à la
session suivante : relancer `lancer_ulysse.bat`.

## Vérifier qu'il fait son travail

En position **Manuel**, demander à Ulysse d'écrire un fichier d'essai. Une
demande d'accord doit apparaître dans le fil, et le fichier **ne doit pas
exister** tant qu'on n'a pas répondu. Si le fichier apparaît sans question, le
plugin n'est pas chargé — et l'écran ment.

## Arrêter

```bash
hermes plugins disable ulysse-approbation
```

Ou, pour une seule session sans toucher au réglage : `ULYSSE_APPROBATION_OFF=1`.

## Portée

Le plugin vaut pour **tout Hermès**, pas seulement Ulysse : le terminal et les
autres sessions demanderont aussi. C'est voulu — une garantie qui s'arrête à
une fenêtre n'en est pas une — mais il faut le savoir avant de l'installer.

Il obéit à `approvals.mode` : il n'escalade qu'en `manual`, et se tait en
`smart` comme en `off`. C'est ce qui rend réelles les quatre positions de la
feuille, sous le champ de saisie.
