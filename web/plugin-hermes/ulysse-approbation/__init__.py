"""ulysse-approbation — fait demander Hermes avant d'ecrire un fichier.

LE TROU QU'IL BOUCHE
--------------------
Mesure sur cette installation le 2026-08-12, accords en ``manual`` :
``write_file`` a ecrit, zero ``approval.request`` dans le journal. Ce n'etait
pas un reglage mal pose. ``approvals.mode`` ne gouverne que le garde du
terminal — *"affects subsequent terminal guard checks"*,
``hermes_cli/approval_mode.py``. Une ecriture de fichier ordinaire ne passe
par aucune porte, a aucun reglage.

Consequence produit : Ulysse pouvait AFFICHER « toujours demander avant de
modifier » sans que rien ne le demande. Pour un utilisateur averti c'est un
detail ; pour le public vise — des debutants qui se mefient — c'est un
mensonge sur la seule chose qui les retenait de partir.

COMMENT
-------
``model_tools.py`` emet ``pre_tool_call`` une fois par appel d'outil. Un
plugin qui repond ``{"action": "approve"}`` escalade vers
``request_tool_approval()`` (``hermes_cli/plugins.py``), c'est-a-dire la MEME
porte que les commandes shell dangereuses : memes choix
``once/session/always/deny``, meme fail-closed, meme file gateway. Et cette
porte-la, Ulysse l'ecoute deja.

⚠ UN HOOK SHELL N'AURAIT PAS SUFFI. ``agent/shell_hooks.py`` ne traduit que
``block`` pour ``pre_tool_call`` : il sait interdire, pas demander. La vraie
question exige un plugin Python. C'est la seule raison d'etre de ce fichier.

LE GRAIN DE « TOUJOURS »
------------------------
``rule_key`` decide de ce qu'un ``[a]lways`` autorise. On le pose sur le
CHEMIN, pas sur le nom de l'outil : repondre « toujours » pour
``notes.md`` ne doit pas ouvrir ``config.yaml``. Sans ``rule_key``, Hermes
derive la cle de ``tool_name`` + un hash du message — comme notre message
contient le chemin, le grain serait deja par fichier, mais par accident.
On l'ecrit, pour que ca ne depende pas d'un detail de formulation.

CE QU'IL NE FAIT PAS
--------------------
Il ne juge pas le contenu. ``security-guidance`` fait ca, avec des motifs et
des faux positifs assumes. Ici la regle est plate : **une ecriture se
demande**. Un plugin qui deciderait tout seul quand demander reintroduirait
exactement le probleme qu'on essaie de retirer — un jugement invisible entre
la personne et ses fichiers.

IL OBEIT A ``approvals.mode``, ET C'EST TOUT L'INTERET
------------------------------------------------------
Constate le 2026-08-23 : ``_run_approval_gate`` ne consulte JAMAIS
``approvals.mode``. Ses seuls court-circuits sont le mode yolo et la memoire
des autorisations (``is_approved``). Le mode est verifie AVANT, par
``check_dangerous_command`` — donc uniquement sur le chemin des commandes.
Une escalade de plugin, elle, passe outre : sans le garde ci-dessous, ce
plugin demanderait meme avec les accords sur ``off``.

On lit donc le mode nous-memes, a CHAQUE appel — comme ``approval.py`` le
fait pour ses propres verifications, pour qu'un changement de reglage prenne
effet sans redemarrer :

  * ``manual``  → on escalade. C'est la position « toujours demander ».
  * ``smart``   → on se tait. Le juge auxiliaire d'Hermes ne sait evaluer que
                  des COMMANDES shell (``_smart_approve`` : *"You assess
                  whether shell commands are safe to execute"*). Lui soumettre
                  « ecrire ce fichier » donnerait un juge qui dit toujours oui
                  — pire qu'une absence de juge, parce que ca en porterait le
                  nom. Les commandes, elles, restent jugees par Hermes.
  * ``off``     → on se tait. Rien ne demande, c'est ce que la position dit.

⚠ NE PAS INVENTER UNE CLE A NOUS. Une clef ``ulysse.*`` aurait fait deux
sources de verite pour une seule question, et la deuxieme aurait menti des
que quelqu'un aurait touche la premiere depuis le terminal Hermes.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# Outils qui ecrivent sur le disque. Releves dans ``toolsets.py`` de cette
# installation, pas devines : ce sont les trois seuls qui y figurent.
#   nom de l'outil -> nom de l'argument qui porte le chemin
_OUTILS_QUI_ECRIVENT: Dict[str, str] = {
    "write_file": "path",
    "patch": "path",
    "skill_manage": "file_path",
}

# Echappatoire pour une session ou l'on ne veut pas etre interrompu (un lot,
# un banc). Vaut ce que vaut une variable d'environnement : elle se pose
# sciemment, elle ne se decide pas toute seule.
_VAR_DESACTIVATION = "ULYSSE_APPROBATION_OFF"


def _desactive() -> bool:
    return os.environ.get(_VAR_DESACTIVATION, "").lower() in {"1", "true", "yes", "on"}


def _mode_accords() -> str:
    """``manual`` / ``smart`` / ``off``, relu a chaque appel.

    ``hermes_cli/approval_mode.py`` importe la meme fonction privee pour la
    meme raison : c'est elle qui dit le mode REELLEMENT applique, y compris
    ses valeurs heritees (``False`` -> ``off``) et son repli sur ``manual``
    quand la cle est absente ou illisible. Refaire la lecture a la main aurait
    reproduit ce demelage, moins bien.
    """
    try:
        from tools.approval import _get_approval_mode

        return _get_approval_mode()
    except Exception:
        # Fail-closed, comme le reste de cette chaine : si l'on ne sait pas,
        # on demande. Se taire par defaut serait laisser passer une ecriture
        # a cause d'un import rate.
        logger.debug("ulysse-approbation : mode illisible, on demande")
        return "manual"


def _chemin(tool_name: str, args: Any) -> str:
    """Le chemin vise, ou "" si l'appel n'en porte pas de lisible."""
    cle = _OUTILS_QUI_ECRIVENT.get(tool_name, "")
    if not cle or not isinstance(args, dict):
        return ""
    valeur = args.get(cle)
    return valeur.strip() if isinstance(valeur, str) else ""


def _on_pre_tool_call(
    tool_name: str = "",
    args: Any = None,
    **_: Any,
) -> Optional[Dict[str, str]]:
    """Escalade toute ecriture de fichier vers la porte d'approbation.

    Retourne ``None`` pour laisser passer, ou une directive ``approve``.
    Ne retourne JAMAIS ``block`` : refuser d'office serait decider a la place
    de la personne, et c'est precisement ce qu'on lui rend.
    """
    if tool_name not in _OUTILS_QUI_ECRIVENT or _desactive():
        return None
    if _mode_accords() != "manual":
        # Voir « IL OBEIT A approvals.mode » en tete : sans ce garde, la
        # position « Accepter les modifications » demanderait quand meme.
        return None

    chemin = _chemin(tool_name, args)
    # Le message est la SEULE chose lisible qui traverse jusqu'a l'ecran :
    # le payload de la file gateway porte un ``command`` synthetique
    # (``<write_file> (plugin approval rule)``) et pas de champ ``path``.
    # Voir ``request_tool_approval`` — ``display_target``. Donc le chemin doit
    # etre ici, sinon la question posee a l'utilisateur ne nomme rien.
    quoi = chemin or "un fichier"
    if tool_name == "patch":
        message = f"Modifier {quoi}"
    elif tool_name == "skill_manage":
        message = f"Modifier la competence {quoi}"
    else:
        message = f"Ecrire {quoi}"

    logger.debug("ulysse-approbation : escalade %s sur %s", tool_name, quoi)
    return {
        "action": "approve",
        "message": message,
        # Par fichier — voir « LE GRAIN DE TOUJOURS » en tete.
        "rule_key": f"{tool_name}:{chemin}" if chemin else tool_name,
    }


def register(ctx) -> None:
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
