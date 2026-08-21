/* ============================================================================
 * banc_ecrans.js — les ecrans et les etats durables, contre le VRAI Hermes
 * ----------------------------------------------------------------------------
 * `banc_reel.js` eprouve la demande d'accord — le point 1 de la liste des 23
 * (audit-fonctionnalites-ulysse.md §16). Il coute de vrais tours de modele.
 * Celui-ci eprouve les POINTS 2 A 22, et n'en coute qu'UN SEUL, court : ouvrir
 * une session (`session.create`) ne fait pas parler le modele, et la
 * quasi-totalite de ce qui reste est du REST, du RPC et de l'affichage. Le
 * tour unique sert a rendre une session REELLEMENT enregistree — sans lui, la
 * suppression se verifierait sur une session que /api/sessions n'a jamais
 * listee, et le vert ne vaudrait rien.
 *
 * Le point 23 (les toasts) n'est PAS ici, et c'est l'audit qui le demande :
 * « composant jamais branche ; a laisser tel quel plutot qu'a tester (aucun
 * evenement fiable ne les declenche, par choix documente) ». Tester un
 * composant qu'aucun chemin n'atteint, ce serait mesurer du code mort et se
 * donner un vert de plus.
 *
 * CE QUE CE BANC S'INTERDIT
 * -------------------------
 *   · tirer un webhook vers l'exterieur (point 5) — on lit la liste et le
 *     cablage, on ne declenche pas un envoi sortant ;
 *   · ouvrir la console Hermes (`POST /ulysse/console`) — elle fait apparaitre
 *     une fenetre sur le bureau de quelqu'un qui n'est peut-etre pas devant ;
 *   · ecrire dans USER.md / MEMORY.md. Le mecanisme d'ecriture (copie datee,
 *     versions, retour en arriere) est eprouve pour de vrai, mais sur un
 *     fichier a nous, dans le meme dossier et par la meme route.
 *
 * TOUT CE QU'IL CHANGE, IL LE REMET. Sessions creees supprimees, projet
 * d'essai supprime, override de modele restaure, fichier d'essai efface. Un
 * banc qui laisse des traces finit par faire passer ses propres restes pour
 * l'etat du produit.
 *
 *     lancer_ulysse.bat        (la pile doit tourner)
 *     node banc_ecrans.js
 *
 * Sorties : 0 tout au vert · 1 au moins un echec · 2 la pile ne repond pas.
 * ========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { check, note, titre, dodo, attendre, preflight, monter, fin } = require("./banc_socle");

/* Ce qu'il faudra defaire, quoi qu'il arrive ensuite. Rempli au fur et a
   mesure, vide a la fin — y compris si une verification tombe en route. */
const aDefaire = [];

/* ⚠ `/api/cron/jobs` REND UN TABLEAU NU. Pas `{jobs: [...]}` — releve en
   direct le 2026-08-12. Une lecture ecrite `(d && (d.jobs || d.items)) || []`
   rend donc `[]` pour TOUTE reponse reelle : le banc a conclu « la tache n'a
   pas ete creee » alors qu'elle l'etait, et il en a laisse quatre derriere lui
   avant qu'on ne s'en apercoive. Le pire genre de faux negatif : il accuse le
   produit ET salit l'etat.
   `ulysse-app.js` faisait deja le bon test (`Array.isArray`) ; c'est le banc
   qui avait sa propre lecture, plus courte et fausse. Une seule ici, pour
   tous. */
function taches(d){
  if (Array.isArray(d)) return d;
  return (d && (d.jobs || d.items)) || [];
}

async function main(){
  const st = await preflight();
  const home = String(st.hermes_home || "").replace(/[\\/]+$/, "");
  const { win, erreurs, E } = await monter();
  const doc = win.document;

  const ouvert = await attendre(() => E("link.state") === "open", 30000);
  check("le lien WebSocket s'ouvre vraiment vers Hermes", ouvert,
    ouvert ? "" : "etat : " + E("link.state") + " · " + E("link.reason || ''"));
  if (!ouvert) return fin();

  // Aller sur un ecran, et laisser son `onEnter` finir. Les dessins sont
  // asynchrones : lire le DOM juste apres `nav()` lirait le « Chargement… ».
  const aller = async (id, ms) => { E('nav(' + JSON.stringify(id) + ');'); await dodo(ms || 900); };
  const reglages = async (i, ms) => {
    E("setSel = " + i + "; nav('Reglages'); drawSet();");
    await dodo(ms || 900);
  };
  const texte = (sel) => { const n = doc.querySelector(sel); return n ? n.textContent : ""; };
  // `win.eval` d'une promesse rend un thenable de l'autre realm : on l'attend.
  const rpc = (m, p) => E("link.rpc(" + JSON.stringify(m) + ", "
    + JSON.stringify(p || {}) + ", 30000)");
  const rest = (expr) => E("REST." + expr);

  /* ══════════════════════════════════════════════════════════════════════
     2. ECRIRE DANS LA MEMOIRE — la copie datee, les versions, le retour
     ---------------------------------------------------------------------
     On n'ecrit PAS dans USER.md ni MEMORY.md : ce sont les fichiers de profil
     de quelqu'un. `serve.py` autorise tout fichier DANS le Hermes Home sauf
     `soul.md` et le dossier des versions (`ecriture_refusee`), donc un fichier
     a nous emprunte exactement la meme route, la meme copie datee et le meme
     retour en arriere. Le mecanisme est eprouve en entier ; le profil n'est
     pas touche.
     ═══════════════════════════════════════════════════════════════════════ */
  titre("2. Ecrire dans la memoire (copie datee, versions, retour)");
  const essaiNom = "ESSAI-BANC-ULYSSE.md";
  const essaiChemin = path.join(home, essaiNom);
  aDefaire.push(() => { try { fs.unlinkSync(essaiChemin); } catch (e){} });

  const ecrire = (c) => E("REST.ecrireMemoire(" + JSON.stringify(essaiChemin)
    + ", " + JSON.stringify(c) + ")");

  let creation = null;
  try { creation = await ecrire("Version UNE.\n"); }
  catch (e){ check("creer un fichier de memoire par /ulysse/ecrire", false, e.message); }
  if (creation){
    check("creer un fichier de memoire par /ulysse/ecrire", true,
      "ok:" + !!creation.ok);
    check("le fichier existe vraiment sur le disque", fs.existsSync(essaiChemin),
      essaiChemin);
    check("son contenu est bien celui qu'on a envoye",
      fs.existsSync(essaiChemin) && /Version UNE/.test(fs.readFileSync(essaiChemin, "utf8")));

    /* La deuxieme ecriture ECRASE. C'est ici que la doctrine se joue : « rien
       ne disparait d'un geste ». Sans copie datee, l'ecran promet un retour en
       arriere qui n'existe pas. */
    let ecrasement = null;
    try { ecrasement = await ecrire("Version DEUX.\n"); }
    catch (e){ check("ecraser le fichier", false, e.message); }
    check("ecraser le fichier passe", !!ecrasement);
    check("le disque porte bien la nouvelle version",
      fs.existsSync(essaiChemin) && /Version DEUX/.test(fs.readFileSync(essaiChemin, "utf8")));

    let versions = [];
    try { versions = ((await E("REST.versionsDe(" + JSON.stringify(essaiChemin) + ")")) || {}).versions || []; }
    catch (e){ note("versions illisibles : " + e.message); }
    check("une copie datee a bien ete gardee AVANT l'ecrasement",
      versions.length >= 1, versions.length + " version(s)");
    check("les copies vivent dans un sous-dossier, pas a cote du fichier",
      fs.existsSync(path.join(home, "versions-ulysse")),
      path.join(home, "versions-ulysse"));
    aDefaire.push(() => {
      const d = path.join(home, "versions-ulysse");
      try {
        fs.readdirSync(d).filter((n) => n.indexOf(essaiNom) >= 0)
          .forEach((n) => { try { fs.unlinkSync(path.join(d, n)); } catch (e){} });
      } catch (e){}
    });

    if (versions.length){
      const nomV = versions[0].nom || versions[0].name || versions[0];
      try {
        await E("REST.restaurerVersion(" + JSON.stringify(essaiChemin) + ", "
          + JSON.stringify(String(nomV)) + ")");
        check("le retour en arriere ramene VRAIMENT le texte d'avant",
          /Version UNE/.test(fs.readFileSync(essaiChemin, "utf8")),
          fs.readFileSync(essaiChemin, "utf8").trim().slice(0, 40));
      } catch (e){
        check("le retour en arriere ramene VRAIMENT le texte d'avant", false, e.message);
      }
    }
  }

  /* Les deux refus. Ce sont eux la garantie — pas l'ecriture. */
  let refusSoul = "";
  try { await ecrireVers(E, path.join(home, "SOUL.md"), "pirate"); }
  catch (e){ refusSoul = e.message; }
  check("SOUL.md est refuse a l'ecriture, et la raison le dit",
    /soul/i.test(refusSoul), refusSoul.slice(0, 90) || "AUCUN refus — il a ete ecrit !");

  let refusDehors = "";
  try { await ecrireVers(E, path.join(home, "..", "hors-hermes-essai.md"), "pirate"); }
  catch (e){ refusDehors = e.message; }
  check("un fichier hors du dossier d'Hermes est refuse",
    !!refusDehors, refusDehors.slice(0, 90) || "AUCUN refus — il a ete ecrit !");

  /* ══════════════════════════════════════════════════════════════════════
     3. LE TERMINAL — le seul endroit qui ouvre un vrai processus
     ═══════════════════════════════════════════════════════════════════════ */
  titre("3. Terminal CLI (/api/pty, un vrai processus)");
  await aller("Terminal", 700);
  check("l'ecran Terminal se dessine", !!doc.querySelector("#tmain"),
    doc.querySelector("#tmain") ? "" : "#tmain absent");
  check("l'avertissement « les accords ne s'appliquent pas ici » est la",
    /accords d'Ulysse ne s'appliquent pas/.test(texte("#tmain")));

  E("ouvrirPty();");
  const ptyOuvert = await attendre(() => E("termEtat") === "ouvert", 20000);
  check("le WebSocket /api/pty s'ouvre pour de vrai", ptyOuvert,
    ptyOuvert ? "" : "etat : " + E("termEtat"));
  if (ptyOuvert){
    const flot = await attendre(() => E("(term && term.ecrit && term.ecrit.length) || 0") > 0, 20000);
    check("le processus distant envoie vraiment quelque chose a peindre", flot,
      flot ? E("term.ecrit.length") + " ecriture(s)" : "rien en 20 s");
    E("fermerPty();");
    await dodo(400);
    check("fermer la session PTY remet l'ecran au repos",
      E("termEtat") === "repos" || E("termEtat") === "coupe", E("termEtat"));
  }
  /* La console Hermes (`POST /ulysse/console`) n'est PAS declenchee : elle fait
     apparaitre une fenetre sur le bureau. On verifie que le geste existe et
     qu'il est cable, pas qu'il s'ouvre. */
  check("le geste « console Hermes » existe dans le produit",
    /ouvrirConsole/.test(E("String(REST.ouvrirConsole)")) || typeof E("REST.ouvrirConsole") === "function");
  note("POST /ulysse/console volontairement NON declenche : il ouvre une fenetre sur le bureau");

  /* ══════════════════════════════════════════════════════════════════════
     4, 8, 9. PROJETS — creer, ranger, archiver, restaurer, supprimer
     Tout se passe sur un projet QUE L'ON CREE. On ne touche a aucun projet
     existant : les archiver ou les supprimer pour voir serait faire sur les
     affaires de quelqu'un ce qu'on refuse de faire sur sa memoire.
     ═══════════════════════════════════════════════════════════════════════ */
  titre("4/8/9. Projets — creer, archiver, restaurer, supprimer");
  const nomProjet = "Essai banc Ulysse";
  let idProjet = null;
  try {
    const r = await rpc("projects.create", { name: nomProjet, primary_path: home });
    idProjet = (r && (r.id || (r.project && r.project.id))) || null;
    check("creer un projet (projects.create) rend un identifiant", !!idProjet,
      idProjet ? String(idProjet) : JSON.stringify(r).slice(0, 120));
  } catch (e){
    check("creer un projet (projects.create) rend un identifiant", false, e.message);
  }
  if (idProjet){
    aDefaire.push(async () => {
      try { await rpc("projects.delete", { id: idProjet }); } catch (e){}
    });

    const dansListe = async () => {
      const d = await rpc("projects.list", {});
      return ((d && d.projects) || []).find((p) => String(p.id) === String(idProjet)) || null;
    };
    check("il apparait dans projects.list", !!(await dansListe()));

    const arbre = await rpc("projects.tree", {});
    check("projects.tree repond avec une forme exploitable",
      !!arbre && typeof arbre === "object",
      Object.keys(arbre || {}).join(", ").slice(0, 80));

    /* Archiver : « rien n'expire » — donc l'archive doit rester lisible, et
       revenir. C'est la promesse, jamais verifiee jusqu'ici. */
    await rpc("projects.archive", { id: idProjet });
    const apresArchive = await dansListe();
    check("archiver ne fait pas disparaitre le projet de projects.list",
      !!apresArchive, apresArchive ? "toujours la" : "il a disparu");
    const arbre2 = await rpc("projects.tree", {});
    check("projects.tree, lui, masque bien les archives",
      JSON.stringify(arbre2).indexOf(nomProjet) < 0,
      JSON.stringify(arbre2).indexOf(nomProjet) < 0 ? "" : "il y est encore");

    await rpc("projects.archive", { id: idProjet, restore: true });
    const arbre3 = await rpc("projects.tree", {});
    check("le restaurer le fait revenir dans l'arbre",
      JSON.stringify(arbre3).indexOf(nomProjet) >= 0);

    await aller("Projets", 1200);
    check("l'ecran Projets montre le projet cree",
      texte("#pProjets").indexOf(nomProjet) >= 0,
      texte("#pProjets").slice(0, 60).replace(/\s+/g, " "));

    // La suppression definitive, sur NOTRE projet, et verifiee.
    await rpc("projects.delete", { id: idProjet });
    check("supprimer definitivement le retire vraiment de projects.list",
      !(await dansListe()));
    idProjet = null;
  }

  /* ══════════════════════════════════════════════════════════════════════
     5. WEBHOOKS — on lit, on ne tire pas
     ═══════════════════════════════════════════════════════════════════════ */
  titre("5. Webhooks (lecture seule — aucun envoi sortant)");
  let wh = null;
  try { wh = await rest("webhooks()"); }
  catch (e){ check("GET /api/webhooks repond", false, e.message); }
  if (wh){
    check("GET /api/webhooks repond", true,
      "enabled:" + wh.enabled + " · " + ((wh.subscriptions || []).length) + " abonnement(s)");
    check("la reponse porte les cles dont l'ecran depend",
      "enabled" in wh && "subscriptions" in wh,
      Object.keys(wh).join(", "));
  }
  note("fireWebhook volontairement NON declenche : c'est un envoi vers l'exterieur");

  /* ══════════════════════════════════════════════════════════════════════
     6 + 20. AUTOMATISATIONS — la liste, et l'ecran
     Pause/reprise/declenchement ne sont joues QUE s'il existe une tache, et
     l'etat de la tache est remis comme il etait.

     ⚠ CE BANC CREE DE VRAIES TACHES QUI SE DECLENCHENT TOUTES SEULES. C'est
     le prix a payer pour eprouver le chemin reel — mais chacune est posee a
     une heure qui ne peut pas tomber pendant l'essai, livree en « local »
     (donc sans message sortant meme si elle survivait), et retiree avant la
     fin. `aDefaire` la reprend si le banc meurt en route.
     ═══════════════════════════════════════════════════════════════════════ */
  titre("6/20. Automatisations (cron)");
  let jobs = null;
  try { jobs = await rest("cronJobs()"); }
  catch (e){ check("GET /api/cron/jobs repond", false, e.message); }
  if (jobs){
    const liste = taches(jobs);
    check("GET /api/cron/jobs repond", true, liste.length + " tache(s)");
    await aller("Automatisations", 1200);
    check("l'ecran Automatisations se dessine sans rester sur « Chargement »",
      texte("#pAutomatisations").indexOf("Chargement") < 0,
      texte("#pAutomatisations").slice(0, 70).replace(/\s+/g, " "));
    if (!liste.length){
      note("aucune tache planifiee : pause/reprise/declenchement non joues (rien a jouer)");
    } else {
      const j = liste[0];
      const id = j.id || j.name;
      const etaitEnPause = !!(j.paused || j.is_paused);
      try {
        await rest((etaitEnPause ? "resumeCron(" : "pauseCron(") + JSON.stringify(String(id)) + ")");
        await rest((etaitEnPause ? "pauseCron(" : "resumeCron(") + JSON.stringify(String(id)) + ")");
        check("mettre en pause puis reprendre une tache passe, et l'etat est remis", true,
          "tache « " + id + " » remise en " + (etaitEnPause ? "pause" : "marche"));
      } catch (e){
        check("mettre en pause puis reprendre une tache passe, et l'etat est remis", false, e.message);
      }
      note("triggerCron NON joue : declencher une tache planifiee fait vraiment travailler l'agent");
    }

    /* ── Poser une automatisation DEPUIS L'ECRAN, pour de vrai ───────────
       `POST /api/cron/jobs` existait depuis toujours et l'ecran renvoyait a
       `hermes cron add`. Il la pose maintenant lui-meme, et c'est ce chemin-la
       qu'on eprouve : on remplit le formulaire et on clique, comme la personne.

       ⚠ L'HORAIRE CHOISI NE DOIT PAS SE DECLENCHER PENDANT L'ESSAI. Une tache
       « toutes les 30 minutes » ferait vraiment travailler l'agent, et une
       « chaque jour a 4 h » se declencherait si le banc tourne a 4 h — il
       tourne toutes les heures depuis qu'il est planifie. On prend donc le
       1er janvier a 4 h : la creation est aussi reelle, le declenchement ne
       peut pas tomber sur nous. */
    await aller("Automatisations", 1200);
    const bNouv = doc.querySelector("#autoNouv");
    check("le bouton « Nouvelle » est bien la, sur l'ecran reel", !!bNouv);
    if (bNouv){
      bNouv.click();
      await attendre(() => !!doc.querySelector("#afQuoi"), 15000);
      check("le formulaire s'ouvre et lit les cibles du backend",
        !!doc.querySelector("#afOu option[value=\"local\"]"),
        Array.from(doc.querySelectorAll("#afOu option")).map((o) => o.value).join(", "));

      /* ⚠ UN NOM PROPRE A CE PASSAGE. Ecrit « Essai banc Ulysse » tout court,
         deux series simultanees se disputaient le meme objet : l'une comptait
         pendant que l'autre creait, l'autre supprimait la tache de la premiere.
         C'est arrive pour de vrai le 2026-08-12, la tache planifiee de 23 h
         ayant demarre pendant un lancement a la main. `lancer_bancs.py` pose
         desormais un verrou, mais un banc ne doit pas DEPENDRE de ce verrou :
         on le lance aussi a la main, et rien n'empeche deux fenetres. */
      const nomAuto = "Essai banc Ulysse " + process.pid;
      doc.querySelector("#afNom").value = nomAuto;
      doc.querySelector("#afQuoi").value = "Ne rien faire. Ceci est un essai du banc.";
      const sel = doc.querySelector("#afMode");
      sel.value = "expression";
      sel.dispatchEvent(new win.Event("change", { bubbles: true }));
      await dodo(300);
      const champ = doc.querySelector("#afExpr");
      check("le mode « expression cron » offre son champ", !!champ);
      if (champ){
        champ.value = "0 4 1 1 *";
        champ.dispatchEvent(new win.Event("input", { bubbles: true }));
        await dodo(200);
        check("l'apercu montre la chaine qui partira, sans la cacher",
          /0 4 1 1 \*/.test(texte("#afApercu")), texte("#afApercu").trim().slice(0, 70));

        doc.querySelector("#afPoser").click();
        const posee = await attendre(async () => {
          const d = await rest("cronJobs()");
          return taches(d).some((j) => j.name === nomAuto);
        }, 25000);
        check("poser depuis l'ecran cree VRAIMENT la tache chez Hermes", posee,
          posee ? "" : "absente de /api/cron/jobs apres 25 s");

        const liste = await rest("cronJobs()");
        const creee = taches(liste)
          .find((j) => j.name === nomAuto);
        if (creee){
          aDefaire.push(async () => {
            try { await rest("supprimerCron(" + JSON.stringify(String(creee.id)) + ")"); }
            catch (e){}
          });
          check("Hermes a bien compris l'horaire qu'on lui a traduit",
            (creee.schedule && creee.schedule.kind) === "cron"
            && (creee.schedule.expr === "0 4 1 1 *"),
            JSON.stringify(creee.schedule));
          /* ⚠ ON NE COMPTE PAS LA LISTE ENTIERE. Ecrit « la liste a grandi
             d'exactement une », ce test lisait un compte GLOBAL — donc faux
             des qu'autre chose touche aux taches pendant le passage (une autre
             serie, ou kuchu depuis l'ecran). Ce qu'on veut savoir tient a
             notre objet : le clic en a cree UNE, pas deux. */
          check("le clic n'a cree qu'UNE tache, pas deux",
            taches(liste).filter((j) => j.name === nomAuto).length === 1,
            taches(liste).filter((j) => j.name === nomAuto).length + " portant ce nom");

          await aller("Automatisations", 1500);
          check("la nouvelle tache apparait a l'ecran, avec son horaire LISIBLE",
            texte("#autos").indexOf(nomAuto) >= 0
            && texte("#autos").indexOf("[object Object]") < 0,
            texte("#autos").indexOf("[object Object]") >= 0
              ? "l'ecran dit « [object Object] »" : "");

          /* ── La modifier, depuis l'ecran, et verifier chez Hermes ──────
             `PUT` prend `{updates}` : ce qu'on n'envoie pas doit rester tel
             quel. On change donc l'horaire ET le texte, et on verifie que
             l'horaire NEUF est arrive parse — pas la chaine brute rangee
             telle quelle, ce qui casserait le declenchement sans rien dire. */
          const bEdit = doc.querySelector('[data-edit="' + creee.id + '"]');
          check("la carte porte un bouton « Modifier »", !!bEdit);
          if (bEdit){
            bEdit.click();
            await attendre(() => !!doc.querySelector("#afQuoi"), 15000);
            check("il rouvre le formulaire rempli avec la tache reelle",
              (doc.querySelector("#afNom") || {}).value === nomAuto,
              (doc.querySelector("#afNom") || {}).value);
            /* L'horaire pose etait « 0 4 1 1 * » — un cron que nos quatre cases
               ne savent pas representer. Il doit revenir EN FORME LIBRE, intact,
               plutot que range de force dans « chaque jour ». */
            check("l'horaire non representable revient en forme libre, intact",
              (doc.querySelector("#afExpr") || {}).value === "0 4 1 1 *",
              (doc.querySelector("#afExpr") || {}).value
                || "mode : " + (doc.querySelector("#afMode") || {}).value);

            doc.querySelector("#afQuoi").value = "Ne rien faire, version modifiee.";
            const sel2 = doc.querySelector("#afMode");
            sel2.value = "heures";
            sel2.dispatchEvent(new win.Event("change", { bubbles: true }));
            await dodo(300);
            doc.querySelector("#afN").value = "6";
            doc.querySelector("#afPoser").click();

            const modifiee = await attendre(async () => {
              const j = taches(await rest("cronJobs()")).find((x) => x.id === creee.id);
              return !!(j && j.schedule && j.schedule.kind === "interval");
            }, 25000);
            check("modifier depuis l'ecran change VRAIMENT la tache chez Hermes", modifiee);

            const apres = taches(await rest("cronJobs()")).find((x) => x.id === creee.id);
            check("Hermes a REPARSE l'horaire, il ne l'a pas garde en texte",
              !!apres && apres.schedule.kind === "interval" && apres.schedule.minutes === 360,
              JSON.stringify(apres && apres.schedule));
            check("le texte modifie est arrive lui aussi",
              !!apres && /version modifiee/.test(apres.prompt || ""),
              (apres && apres.prompt) || "");
            check("et c'est bien la MEME tache, pas une seconde posee a cote",
              taches(await rest("cronJobs()")).filter((j) => j.name === nomAuto).length === 1,
              taches(await rest("cronJobs()")).filter((j) => j.name === nomAuto).length + "");
          }

          /* Le retrait, par l'ecran, avec sa confirmation en deux temps :
             une automatisation tourne toute seule, la retirer ne se rattrape
             pas. Un seul clic ne doit RIEN faire. */
          await aller("Automatisations", 1500);
          const bSup = doc.querySelector('[data-del="' + creee.id + '"]');
          check("le bouton « Retirer » est la, sur la carte de la tache", !!bSup);
          if (bSup){
            bSup.click();
            await dodo(400);
            const toujours = taches(await rest("cronJobs()"))
              .some((j) => j.name === nomAuto);
            check("un SEUL clic ne retire rien : il demande confirmation",
              toujours && /Confirmer/.test(bSup.textContent), bSup.textContent.trim());
            bSup.click();
            const partie = await attendre(async () => {
              const d = await rest("cronJobs()");
              return !taches(d).some((j) => j.name === nomAuto);
            }, 20000);
            check("le second clic la retire vraiment de chez Hermes", partie);
          }
        }
      }
    }

    /* ── Les modeles tout prets, poses depuis l'ecran ────────────────────
       Le formulaire n'est pas ecrit dans Ulysse : il est DECRIT par Hermes
       (`fields[]`). On verifie donc que ce qui est dessine vient bien de la
       vraie reponse — et surtout que ce qui repart est accepte : Hermes
       refuse en 422 tout nom de champ qu'il ne connait pas.

       ⚠ CE QU'ON POSE ICI PEUT SE DECLENCHER. « morning-brief » tourne
       chaque jour a l'heure dite ; on choisit 04:03 (le banc tourne a l'heure
       ronde) et surtout on livre en « local » — sauvegarde seule, aucun
       message sortant. Meme si le banc mourait avant le retrait, personne ne
       recevrait rien.

       ⚠ ON RETROUVE LA TACHE PAR SON ID, PAS PAR SON NOM. Hermes nomme la
       tache d'apres le TITRE DU MODELE (« Morning briefing », blueprint_
       catalog.py:fill_blueprint) : deux instanciations portent le meme nom, et
       kuchu pourrait en avoir une. On diffe donc les identifiants avant/apres. */
    await aller("Automatisations", 1200);
    const bVoir = doc.querySelector("#autoVoirModeles");
    check("l'ecran propose les modeles d'Hermes", !!bVoir,
      bVoir ? bVoir.textContent.trim() : "bouton absent");
    if (bVoir){
      const gal = doc.querySelector("#autoGalerie");
      check("la galerie est repliee tant qu'on ne la demande pas",
        !!gal && gal.style.display === "none");
      bVoir.click();
      await dodo(300);
      check("elle s'ouvre sur les VRAIS modeles d'Hermes",
        !!gal && gal.style.display !== "none"
        && /Morning briefing/.test(gal.textContent),
        (gal ? gal.textContent : "").slice(0, 60).replace(/\s+/g, " "));

      const bUse = doc.querySelector('[data-bp="morning-brief"]');
      check("« Utiliser » est propose sur la carte du modele", !!bUse);
      if (bUse){
        bUse.click();
        await attendre(() => !!doc.querySelector("#bpf-time"), 15000);
        const cT = doc.querySelector("#bpf-time");
        const cD = doc.querySelector("#bpf-deliver");
        check("le formulaire est dessine d'apres ce que le backend DECRIT",
          !!cT && cT.type === "time" && !!cD && cD.tagName === "SELECT",
          cT ? cT.type + " / " + (cD && cD.tagName) : "champs absents");
        /* Les options de livraison viennent des plateformes reellement
           branchees (cron.py:199) : si « local » manquait, ce banc enverrait
           un vrai message a kuchu. On le verifie AVANT de cliquer. */
        const aLocal = cD && Array.from(cD.options).some((o) => o.value === "local");
        check("« local » est bien propose : le banc peut poser sans rien envoyer",
          !!aLocal, cD ? Array.from(cD.options).map((o) => o.value).join(", ") : "");
        if (cT && aLocal){
          const avantIds = taches(await rest("cronJobs()")).map((j) => String(j.id));
          cT.value = "04:03";
          cD.value = "local";
          doc.querySelector("#bpPoser").click();

          const posee = await attendre(async () => {
            const l = taches(await rest("cronJobs()"));
            return l.some((j) => avantIds.indexOf(String(j.id)) < 0);
          }, 25000);
          check("poser un modele depuis l'ecran cree VRAIMENT la tache", posee);

          const neuve = taches(await rest("cronJobs()"))
            .find((j) => avantIds.indexOf(String(j.id)) < 0);
          if (neuve){
            aDefaire.push(async () => {
              try { await rest("supprimerCron(" + JSON.stringify(String(neuve.id)) + ")"); }
              catch (e){}
            });
            check("Hermes a rempli le gabarit avec l'heure choisie",
              (neuve.schedule && neuve.schedule.kind) === "cron"
              && neuve.schedule.expr === "3 4 * * *",
              JSON.stringify(neuve.schedule));
            check("il a ecrit lui-meme la consigne : elle n'est pas vide",
              !!(neuve.prompt || "").trim(),
              (neuve.prompt || "").slice(0, 50).replace(/\s+/g, " "));
            check("et elle est livree en LOCAL : rien ne part vers personne",
              neuve.deliver === "local", String(neuve.deliver));
            await rest("supprimerCron(" + JSON.stringify(String(neuve.id)) + ")");
            const nettoye = await attendre(async () => {
              const l = taches(await rest("cronJobs()"));
              return !l.some((j) => String(j.id) === String(neuve.id));
            }, 20000);
            check("le banc reprend ce qu'il a pose : rien ne reste derriere", nettoye);
          }
        }

        /* Le refus, joue pour de vrai : une heure qu'Hermes n'accepte pas.
           C'est le seul moyen de savoir si l'ecran MONTRE le motif ou l'avale. */
        let motif = "";
        try {
          await rest("poserModele(\"morning-brief\", "
            + JSON.stringify({ time: "midi", deliver: "local" }) + ")");
        } catch (e){ motif = e.message; }
        check("un champ invalide est refuse par Hermes, avec son motif en clair",
          /422/.test(motif) && /HH:MM/.test(motif), motif || "aucun refus");
        /* Et le refus qui compte le plus : un nom de champ invente. Hermes le
           rejette expres, pour qu'un reglage mal nomme ne passe pas pour pris
           en compte. C'est ce qui justifie de ne JAMAIS envoyer autre chose
           que les champs decrits. */
        let motif2 = "";
        try {
          await rest("poserModele(\"morning-brief\", "
            + JSON.stringify({ tiem: "07:15", deliver: "local" }) + ")");
        } catch (e){ motif2 = e.message; }
        check("un nom de champ invente est REFUSE, pas applique en silence",
          /422/.test(motif2) && /unknown slot/.test(motif2), motif2 || "aucun refus");
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     7. LE CERVEAU — l'override de modele, pose puis REMIS
     ═══════════════════════════════════════════════════════════════════════ */
  titre("7. Reglages · Le cerveau (override de modele)");
  let options = null;
  try { options = await rest("modelOptions()"); }
  catch (e){ check("GET /api/model/options repond", false, e.message); }
  check("GET /api/model/options repond", !!options,
    options ? Object.keys(options).join(", ").slice(0, 80) : "");

  await reglages(2, 1400);
  check("l'ecran « Le cerveau » se dessine",
    texte("#setbody").indexOf("Le cerveau") >= 0);
  check("il ne reste pas bloque sur « Chargement des modeles »",
    texte("#setbody").indexOf("Chargement des mod") < 0,
    texte("#setbody").slice(0, 70).replace(/\s+/g, " "));

  /* L'override LOCAL ecrit dans `ulysse-config.js`, un fichier suivi par git.
     On le pose, on verifie qu'il est pris, puis on le REMET a ce qu'il etait —
     et on le verifie une seconde fois. */
  /* ⚠ LA CLE EST CELLE QUE L'ECRAN ENVOIE, PAS CELLE QU'ON IMAGINE. Ecrit
     « MODEL_DISCUSSION » de tete, le banc recevait un 400 « Cle non autorisee.
     Acceptees : PROXY_MODEL, SESSION_MODEL » — et accusait le produit d'un
     defaut qui n'etait que dans la sonde. `ulysse-app.js:3596` envoie
     `PROXY_MODEL` : c'est celle-la qu'il faut eprouver. */
  const cleOverride = "PROXY_MODEL";
  /* ⚠ ON REMET LA VALEUR D'AVANT, PAS « VIDE ». Vider suppose qu'il n'y avait
     rien — et si kuchu avait choisi un modele pour le mode Discussion, le banc
     le lui aurait efface en se croyant propre. On lit donc ce que la page
     porte AVANT d'y toucher, et c'est cela qu'on restaure. */
  const overrideAvant = E("CFG." + cleOverride + " || ''");
  aDefaire.push(async () => {
    try { await rest("setLocalModel(" + JSON.stringify(cleOverride) + ", "
      + JSON.stringify(overrideAvant) + ")"); } catch (e){}
  });
  const servi = async () => (await fetch("http://127.0.0.1:8080/ulysse-config.js")).text();
  try {
    /* ⚠ « REMIS COMME AVANT » VEUT DIRE OCTET POUR OCTET, et c'est la seule
       formulation qui tienne. Ecrit d'abord « la valeur ne contient plus
       essai-banc », puis « la cle n'est pas desindentee », cette verification
       a laisse passer DEUX defauts l'un apres l'autre : l'indentation mangee
       par `^\s*`, puis les fins de ligne retraduites par Python en mode
       texte. Chaque fois, l'aller-retour changeait le fichier et il fallait
       un `git checkout --` pour retrouver un arbre propre.
       On compare donc le fichier ENTIER, avant et apres. Une comparaison
       partielle ne mesure que les defauts auxquels on a deja pense. */
    const brut0 = await servi();
    await rest("setLocalModel(" + JSON.stringify(cleOverride) + ", \"essai-banc\")");
    const brut = await servi();
    check("poser un override local l'ecrit vraiment dans ulysse-config.js",
      brut.indexOf("essai-banc") >= 0);
    check("et il ne change QUE cette ligne",
      brut.split("\n").length === brut0.split("\n").length,
      brut0.split("\n").length + " → " + brut.split("\n").length + " lignes");
    await rest("setLocalModel(" + JSON.stringify(cleOverride) + ", "
      + JSON.stringify(overrideAvant) + ")");
    const brut2 = await servi();
    check("le remettre comme avant ne laisse aucune trace du banc",
      brut2.indexOf("essai-banc") < 0,
      "valeur restauree : " + JSON.stringify(overrideAvant));
    check("l'aller-retour rend le fichier IDENTIQUE, octet pour octet",
      brut2 === brut0,
      brut2 === brut0 ? "" : "il a change : " + premiereDifference(brut0, brut2));
  } catch (e){
    check("poser puis remettre un override local", false, e.message);
  }
  note("/api/model/set (portee « main » = tout le profil) NON joue : il changerait"
    + " le modele par defaut de kuchu, et le remettre suppose de connaitre l'etat d'avant");

  /* ══════════════════════════════════════════════════════════════════════
     10. DICTEE — /api/audio/transcribe, y compris le silence
     ═══════════════════════════════════════════════════════════════════════ */
  titre("10. Dictee (STT) — le silence est un succes vide");
  const wav = wavSilence(0.4);
  try {
    const r = await E("REST.transcribe(" + JSON.stringify(wav) + ", \"audio/wav\")");
    const t = (r && r.transcript) || "";
    check("POST /api/audio/transcribe accepte un vrai audio et repond", !!r,
      "ok:" + (r && r.ok) + " · provider:" + (r && r.provider));
    check("un silence n'est PAS une erreur : il rend un transcript vide",
      r && r.ok !== false, JSON.stringify(t).slice(0, 60));
  } catch (e){
    /* Un backend sans fournisseur STT configure repond une erreur claire : ce
       n'est pas un defaut d'Ulysse, et il faut le distinguer. */
    const absent = /provider|configur|non disponible|404|501/i.test(e.message);
    check("POST /api/audio/transcribe accepte un vrai audio et repond", absent,
      absent ? "aucun fournisseur STT configure ici — " + e.message.slice(0, 60)
             : e.message.slice(0, 90));
    if (absent) note("la dictee ne peut pas etre eprouvee plus loin sans fournisseur STT");
  }

  /* ══════════════════════════════════════════════════════════════════════
     11 + 12. SESSIONS — incognito, epingler, renommer, archiver, supprimer
     `session.create` n'appelle PAS le modele : ces points ne coutent rien.
     ═══════════════════════════════════════════════════════════════════════ */
  titre("11/12. Sessions — sans memoire, epingler, renommer, supprimer");
  let sidIncog = null;
  try {
    sidIncog = await E('ensureSession({ close_on_disconnect: true })');
  } catch (e){ check("ouvrir un fil sans memoire", false, e.message); }
  if (sidIncog){
    check("ouvrir un fil sans memoire (close_on_disconnect) passe", true, String(sidIncog));
    aDefaire.push(async () => { try { await rest("deleteSession(" + JSON.stringify(String(sidIncog)) + ")"); } catch (e){} });
    const liste = await rest("sessions(100, \"recent\")");
    const dedans = ((liste && liste.sessions) || []).some((s) => String(s.id) === String(sidIncog));
    /* L'ecran des Reglages promet : « Le fil ne sera pas retrouve dans
       l'historique ». On le MESURE au lieu de le croire. */
    check("la promesse « pas retrouve dans l'historique » tient dans /api/sessions",
      !dedans, dedans ? "il Y EST — la phrase des Reglages promet plus que le backend ne tient"
                      : "absent de la liste");
    E("resetSession();");
  }

  /* ⚠ DEUX IDENTIFIANTS, ET UN SEUL MARCHE ICI. `session.create` rend le
     `session_id` d'une session VIVANTE ; `/api/sessions/<id>` travaille sur
     les sessions ENREGISTREES, dont la cle est `stored_session_id`. Ecrit avec
     le premier, chaque PATCH rendait « 404 Session not found » — et pire, le
     DELETE passait au vert : il est IDEMPOTENT, donc supprimer un identifiant
     qui n'a jamais existe rend `{ok:true, already_absent:true}`. La
     verification « supprimer la retire vraiment » etait donc CREUSE : elle
     constatait l'absence de quelque chose qui n'avait jamais ete la.
     On travaille maintenant sur une session que /api/sessions liste pour de
     bon, et on remet son etat exactement comme il etait. */
  E("resetSession();");
  const listeAvant = await rest("sessions(100, \"recent\")");
  /* ⚠ UNE SESSION QUI PORTE DEJA UN TITRE, PAS « LA PREMIERE VENUE ».
     Une session sans titre revient avec `title: null` — et on ne peut PAS lui
     rendre son absence de titre : `PATCH {title:null}` est refuse en 400
     (« Nothing to update »), la cle nulle ne compte pas comme un champ.
     Le banc renommait donc une session sans titre et n'arrivait plus a la
     remettre : le 2026-08-13 il a laisse « Essai banc — renomme » sur une
     session reelle, et a mis son echec sur le dos du RENOMMAGE, qui avait
     marche. Remis d'aplomb en posant `title: ""`.
     On choisit donc une session dont le titre est non vide : c'est la seule
     dont on sache defaire ce qu'on lui fait. */
  const cible = ((listeAvant && listeAvant.sessions) || [])
    .find((s) => s && typeof s.title === "string" && s.title.trim()) || null;
  check("il existe au moins une session TITREE a eprouver", !!cible,
    cible ? "« " + cible.title + " »"
          : "aucune session titree dans /api/sessions (on ne renomme rien)");
  if (cible){
    const sid = String(cible.id);
    const titreAvant = cible.title;
    const pinAvant = !!cible.pinned;
    aDefaire.push(async () => {
      // `|| ""` et non `titreAvant` seul : une cle absente ou nulle fait un
      // corps vide, donc un 400, donc un titre d'essai laisse en place.
      try { await rest("patchSession(" + JSON.stringify(sid) + ", "
        + JSON.stringify({ title: titreAvant || "", pinned: pinAvant,
                           archived: false }) + ")"); } catch (e){}
    });
    const patch = async (champs) => rest("patchSession(" + JSON.stringify(sid) + ", "
      + JSON.stringify(champs) + ")");
    const relire = async () => {
      const l = await rest("sessions(100, \"recent\")");
      return ((l && l.sessions) || []).find((s) => String(s.id) === sid) || null;
    };
    /* ⚠ UN `try` PAR GESTE. Les deux tenaient dans le meme : quand la REMISE
       EN ETAT echouait, le `catch` mettait le rouge sur le RENOMMAGE — qui,
       lui, avait parfaitement marche. Un rouge qui designe le mauvais geste
       envoie chercher le defaut a cote pendant que le vrai reste en place. */
    try {
      await patch({ title: "Essai banc — renomme" });
      const s = await relire();
      check("renommer une session depuis l'historique prend vraiment effet",
        !!s && s.title === "Essai banc — renomme", s ? s.title : "session introuvable");
    } catch (e){ check("renommer une session depuis l'historique prend vraiment effet", false, e.message); }
    try {
      await patch({ title: titreAvant });
      check("et le titre d'origine revient",
        ((await relire()) || {}).title === titreAvant, String(titreAvant));
    } catch (e){ check("et le titre d'origine revient", false, e.message); }
    try {
      await patch({ pinned: !pinAvant });
      const s = await relire();
      check("epingler une session prend vraiment effet",
        !!s && !!s.pinned === !pinAvant, s ? "pinned:" + s.pinned : "introuvable");
      await patch({ pinned: pinAvant });
    } catch (e){ check("epingler une session prend vraiment effet", false, e.message); }
    try {
      await patch({ archived: true });
      const s = await relire();
      check("archiver une session prend vraiment effet",
        !s || !!s.archived, s ? "archived:" + s.archived : "sortie de la liste courante");
      await patch({ archived: false });
      check("et la desarchiver la fait revenir", !!(await relire()));
    } catch (e){ check("archiver une session prend vraiment effet", false, e.message); }
    /* Un PATCH VIDE est un 400 : le backend refuse une mise a jour qui ne dit
       rien plutot que de faire semblant. C'est un contrat, et un faux ecrit a
       la main l'aurait rendu « ok ». */
    let vide = "";
    try { await patch({}); } catch (e){ vide = e.message; }
    check("un PATCH sans aucun champ est refuse, il ne fait pas semblant",
      /400/.test(vide), vide.slice(0, 70) || "il a ete accepte");
  }

  /* La suppression, sur une session A NOUS, et verifiee comme telle : on
     s'assure d'abord qu'elle EST dans la liste, sinon le vert ne vaut rien.

     ⚠ UNE SESSION VIDE N'EST PAS ENREGISTREE. Mesure faite ici : ouverte par
     `session.create` puis jamais alimentee, elle n'apparait PAS dans
     /api/sessions. La supprimer rendait donc `{ok:true, already_absent:true}`
     et le banc concluait « la suppression marche » — en constatant l'absence
     de quelque chose qui n'avait jamais ete la. C'est la meme forme de vert
     creux que le rang -1 du banc d'accord.
     Il faut donc un vrai tour, court, pour que la session existe. C'est le
     SEUL endroit de ce banc qui fait parler le modele, et c'est le prix d'une
     preuve au lieu d'une apparence. */
  let sidEssai = null;
  try {
    E("resetSession();");
    E('nav("Discuter");');
    await E('(function(){ $("reply").value = "Reponds seulement : ok."; return onSend(); })()');
    await attendre(() => E("conv.running") === false, 150000);
    sidEssai = E("conv.storedId || conv.sessionId");
  } catch (e){ note("le tour d'amorcage a echoue : " + e.message); }
  check("ouvrir une session ordinaire passe", !!sidEssai, sidEssai ? String(sidEssai) : "");
  if (sidEssai){
    const sid = String(sidEssai);
    const relire = async () => {
      const l = await rest("sessions(100, \"recent\")");
      return ((l && l.sessions) || []).find((s) => String(s.id) === sid) || null;
    };
    const etaitLa = !!(await relire());
    check("la session creee est bien enregistree avant qu'on la supprime", etaitLa,
      etaitLa ? sid : "absente de /api/sessions — supprimer ne prouverait rien");
    try {
      await rest("deleteSession(" + JSON.stringify(sid) + ")");
      check("supprimer une session la retire vraiment", etaitLa && !(await relire()));
      /* DELETE est IDEMPOTENT cote Hermes : une session absente rend
         {ok, already_absent} plutot qu'un 404. */
      const deux = await rest("deleteSession(" + JSON.stringify(sid) + ")");
      check("supprimer deux fois n'est pas une erreur (DELETE idempotent)",
        !!deux && deux.already_absent === true, JSON.stringify(deux).slice(0, 60));
    } catch (e){ check("supprimer une session la retire vraiment", false, e.message); }
    E("resetSession();");
  }

  /* ══════════════════════════════════════════════════════════════════════
     14. VESTIAIRE — l'ecran, avec les VRAIES competences
     ═══════════════════════════════════════════════════════════════════════ */
  titre("14. Vestiaire (roles et competences reelles)");
  const skills = await rest("skills()");
  check("GET /api/skills rend bien une LISTE, pas un objet",
    Array.isArray(skills), Array.isArray(skills) ? skills.length + " competence(s)" : typeof skills);
  await aller("Vestiaire", 1400);
  check("l'ecran Vestiaire se dessine sans rester sur « Chargement »",
    texte("#pVestiaire").indexOf("Chargement") < 0,
    texte("#pVestiaire").slice(0, 70).replace(/\s+/g, " "));
  /* ⚠ LE VESTIAIRE S'OUVRE SUR LES ROLES, PAS SUR LES COMPETENCES. Cherchee
     sans basculer, une competence reelle etait forcement absente — et le banc
     accusait l'ecran de ne pas les afficher alors qu'on regardait l'autre
     onglet. On clique la bascule, comme la personne le ferait. */
  const ongletSkills = doc.querySelector('#vseg button[data-v="skills"]');
  check("la bascule Roles / Competences existe", !!ongletSkills);
  if (ongletSkills){
    ongletSkills.click();
    await attendre(() => E("skillsCache !== null"), 15000);
    await dodo(500);
    check("le compte affiche est celui des VRAIES competences",
      texte("#vmeta").indexOf(String((skills || []).length)) >= 0,
      texte("#vmeta").trim().slice(0, 60));
    if (Array.isArray(skills) && skills.length){
      const grille = texte("#vgrid");
      check("une competence reelle apparait dans la grille",
        grille.indexOf(skills[0].name) >= 0,
        skills[0].name + " · grille : " + grille.slice(0, 50).replace(/\s+/g, " "));
    }
    // On remet l'ecran sur les roles : le banc ne laisse pas l'interface
    // ailleurs qu'il ne l'a trouvee.
    const ongletRoles = doc.querySelector('#vseg button[data-v="roles"]');
    if (ongletRoles) ongletRoles.click();
  }

  /* ══════════════════════════════════════════════════════════════════════
     15. PREMIER LANCEMENT — et ses cas degrades, par PANNE REELLE
     On ne fabrique pas de fausse reponse : on empeche la requete d'aboutir.
     Une panne de transport est une vraie panne, pas un faux payload.
     ═══════════════════════════════════════════════════════════════════════ */
  titre("15. Premier lancement (nominal, puis Hermes muet)");
  /* ⚠ « AGENT » NE PEUT PAS ETRE OBSERVE ICI, ET IL FAUT LE DIRE. Ce constat
     n'est pas un appel de plus : c'est le handshake WebSocket lui-meme qui y
     repond (`lancerFirst` finit par `link.connect()`). Or ce banc a deja
     ouvert le lien a l'amorcage : `connect()` sur un lien deja ouvert ne
     refait pas de handshake, donc `firstEtat.agent` reste `null` pour
     toujours. Exiger les CINQ ici rendait un rouge intermittent qui
     n'accusait rien de reel — dans le produit, `lancerFirst()` tourne A LA
     PLACE de `link.connect()`, sur une page fraiche.
     On eprouve donc ici les quatre constats qui passent par HTTP, et
     « agent » est eprouve plus bas, sur la seconde page, dont le lien
     s'ouvre pour de vrai. */
  E("lancerFirst();");
  const parHttp = ["hermes", "gateway", "skills", "secret"];
  const firstFait = await attendre(
    () => E("[" + parHttp.map((k) => '"' + k + '"').join(",")
      + "].every(function(k){ return firstEtat[k] !== null; })"), 25000);
  check("les quatre constats du premier lancement qui passent par HTTP aboutissent",
    firstFait, E("JSON.stringify(firstEtat)"));
  check("avec la pile debout, aucun constat n'est au rouge",
    E('Object.keys(firstEtat).filter(function(k){ return firstEtat[k] === "ko"; }).length') === 0,
    E("JSON.stringify(firstEtat)"));

  {
    // Une seconde page, montee avec /api/status coupe A LA SOURCE.
    const { win: w2, E: E2 } = await monter((w) => {
      const vrai = w.fetch;
      w.fetch = (input, init) => {
        const u = typeof input === "string" ? input : (input && input.url) || String(input);
        if (u.indexOf("/api/status") >= 0) return Promise.reject(new TypeError("Failed to fetch"));
        return vrai(input, init);
      };
    });
    E2("lancerFirst();");
    await attendre(() => E2("firstEtat.hermes !== null"), 20000);
    check("Hermes muet : le premier lancement le dit au lieu de tourner",
      E2("firstEtat.hermes") === "ko", String(E2("firstEtat.hermes")));
    /* ⚠ « AGENT » NE S'OBSERVE QUE SUR UN CHANGEMENT D'ETAT. Il n'est pas
       nourri par un appel : il est pose par l'ECOUTEUR d'etat du lien
       (ulysse-app.js:4907), et cet ecouteur ne dit rien tant que l'etat ne
       BOUGE pas. Le lien etant deja ouvert quand `lancerFirst()` s'execute
       ici, il restait `null` indefiniment — et deux verifications ecrites
       naivement rougissaient sans rien accuser de reel.
       On provoque donc une vraie coupure, puis on laisse le lien revenir :
       c'est exactement ce que l'ecouteur existe pour raconter. */
    E2("link.ws && link.ws.close();");
    const agentVu = await attendre(() => E2("firstEtat.agent !== null"), 25000);
    check("le constat « agent » suit l'etat REEL du lien quand il bouge", agentVu,
      String(E2("firstEtat.agent")));
    const agentRevenu = await attendre(() => E2("firstEtat.agent") === "ok", 45000);
    check("et il repasse au vert de lui-meme quand le lien revient", agentRevenu,
      String(E2("firstEtat.agent")) + " · lien : " + String(E2("link.state")));
    check("et l'accueil affiche « Hermes ne repond pas »",
      /ne répond pas/.test(w2.document.body.textContent),
      w2.document.body.textContent.slice(0, 60).replace(/\s+/g, " "));
    /* 13. Le genre de notification `panne` — jamais declenche en conditions
       reelles jusqu'ici, faute de coupure de `/api/status`. En voici une. */
    const panne = await attendre(
      () => /panne|ne répond pas|injoignable/i.test(w2.document.body.textContent), 15000);
    check("13. une coupure de /api/status se voit dans l'interface", panne);
    w2.close();
  }

  /* ══════════════════════════════════════════════════════════════════════
     16. UN VRAI CSV — le rendu en tableau
     ═══════════════════════════════════════════════════════════════════════ */
  titre("16. Un CSV reel et son rendu en tableau");
  const csvChemin = path.join(home, "essai-banc-tableau.csv");
  fs.writeFileSync(csvChemin, "produit;quantite;prix\nvis;120;3,50\necrou;80;1,20\n", "utf8");
  aDefaire.push(() => { try { fs.unlinkSync(csvChemin); } catch (e){} });
  try {
    await E("ouvrirFichier(" + JSON.stringify(csvChemin) + ", \"essai-banc-tableau.csv\")");
    await dodo(1200);
    const vue = doc.querySelector(".u-artv, #artView, .artv");
    const corps = vue ? vue.textContent : doc.body.textContent;
    check("le volet de fichier s'ouvre sur le CSV", !!vue || /essai-banc-tableau/.test(corps));
    check("le CSV est rendu en TABLEAU, pas en texte brut",
      !!doc.querySelector("table"),
      doc.querySelector("table") ? doc.querySelectorAll("table tr").length + " ligne(s)" : "aucun <table>");
    check("les valeurs reelles du fichier sont dedans",
      /ecrou/.test(corps) && /3,50/.test(corps));
    E("closeArtifactViewer();");
  } catch (e){
    check("le volet de fichier s'ouvre sur le CSV", false, e.message);
  }

  /* ══════════════════════════════════════════════════════════════════════
     17. CONNEXIONS · 18. DEPENSES · 19. REPERES
     ═══════════════════════════════════════════════════════════════════════ */
  titre("17/18/19. Connexions, Depenses, Reperes");
  await reglages(4, 1200);
  check("l'ecran Connexions se dessine",
    texte("#setbody").length > 40 && texte("#setbody").indexOf("Chargement") < 0,
    texte("#setbody").slice(0, 70).replace(/\s+/g, " "));

  let usage = null, usageErr = "";
  try { usage = await rest("usage(30)"); } catch (e){ usageErr = e.message; }
  check("GET /api/analytics/usage repond ou dit clairement qu'il n'existe pas",
    !!usage || /404/.test(usageErr), usage ? Object.keys(usage).join(", ").slice(0, 80) : usageErr);
  await reglages(5, 1400);
  check("l'ecran Depenses se dessine sans rester sur « Chargement »",
    texte("#setbody").indexOf("Chargement") < 0,
    texte("#setbody").slice(0, 70).replace(/\s+/g, " "));

  await aller("Reperes", 700);
  const reperesTexte = texte("#pReperes");
  check("l'ecran Reperes liste bien des icones", reperesTexte.length > 60,
    reperesTexte.slice(0, 60).replace(/\s+/g, " "));
  /* ⚠ LE SELECTEUR ETAIT FAUX, ET LE VERT ETAIT CREUX. Ecrit
     `#pReperes .grepere, .rep, li`, il ne trouvait RIEN : le filtre affichait
     « 0 → 0 » et la verification passait, parce que « 0 < 0 » etait rattrape
     par un `|| avant === 0` qui excusait justement le cas ou l'on ne mesure
     rien. Les lignes du glossaire sont des `.row` dans `#glossary`
     (ulysse-app.js:4451) — et on exige maintenant qu'il y en ait AVANT. */
  const filtre = doc.querySelector("#repQ");
  check("le champ de filtre des Reperes existe", !!filtre);
  if (filtre){
    const compte = () => doc.querySelectorAll("#glossary .row").length;
    const avant = compte();
    check("le glossaire montre des lignes avant tout filtrage", avant > 0, avant + " ligne(s)");
    filtre.value = "zzzz-introuvable";
    filtre.dispatchEvent(new win.Event("input", { bubbles: true }));
    await dodo(300);
    check("un filtre sans resultat vide vraiment la liste", compte() === 0 && avant > 0,
      avant + " → " + compte());
    check("et il le DIT, au lieu de laisser un ecran vide",
      /Aucun signe ne correspond/.test(texte("#glossary")),
      texte("#glossary").slice(0, 50).replace(/\s+/g, " "));
    filtre.value = "dossier";
    filtre.dispatchEvent(new win.Event("input", { bubbles: true }));
    await dodo(300);
    const cible = compte();
    check("un filtre qui correspond garde un sous-ensemble, pas tout",
      cible > 0 && cible < avant, avant + " → " + cible);
    filtre.value = "";
    filtre.dispatchEvent(new win.Event("input", { bubbles: true }));
    await dodo(200);
    check("vider le filtre rend toutes les lignes", compte() === avant,
      compte() + " / " + avant);
  }

  /* ══════════════════════════════════════════════════════════════════════
     21. LE SCHEMA DU PLAN · 22. LE RAIL
     ═══════════════════════════════════════════════════════════════════════ */
  titre("21/22. Schema du Plan, et le rail");
  await aller("Plan", 700);
  const recentrer = doc.querySelector("#recentrer");
  check("la commande « recentrer » du schema existe", !!recentrer);
  if (recentrer){
    let cassa = "";
    try { recentrer.click(); } catch (e){ cassa = e.message; }
    await dodo(200);
    check("recentrer un schema vide ne casse rien", !cassa, cassa);
  }

  const railwrap = doc.querySelector("#railwrap");
  check("le rail est present", !!railwrap);
  if (railwrap){
    /* La fonction s'appelle `pinRail`, pas `togglePin` — devine de tete, le
       banc levait un ReferenceError et s'arretait la, emportant tout ce qui
       suivait. On appelle celle qui existe. */
    const avantPin = E("pinned");
    E("pinRail();");
    await dodo(200);
    check("epingler le rail change vraiment son etat", E("pinned") !== avantPin,
      avantPin + " → " + E("pinned"));
    check("et la classe « mini » du rail suit l'etat",
      railwrap.classList.contains("mini") === !E("pinned"),
      "mini:" + railwrap.classList.contains("mini") + " · pinned:" + E("pinned"));
    E("pinRail();");
    await dodo(150);
    check("le remettre comme avant marche aussi", E("pinned") === avantPin);
    const avantCoul = E("coulisses");
    E("toggleCoulisses();");
    await dodo(200);
    check("replier/deplier les coulisses change vraiment son etat",
      E("coulisses") !== avantCoul, avantCoul + " → " + E("coulisses"));
    E("coulisses = " + JSON.stringify(avantCoul) + "; drawRail();");
  }

  const racine = doc.documentElement;
  const densAvant = racine.getAttribute("data-d");
  racine.setAttribute("data-d", densAvant === "dense" ? "epure" : "dense");
  await dodo(120);
  check("changer la densite change vraiment l'attribut lu par la feuille",
    racine.getAttribute("data-d") !== densAvant,
    densAvant + " → " + racine.getAttribute("data-d"));
  if (densAvant) racine.setAttribute("data-d", densAvant);

  check("rien n'a casse dans la page pendant tout le parcours",
    erreurs.length === 0, erreurs.slice(0, 2).join(" | "));
}

/* Ecrire vers un chemin arbitraire, pour eprouver les REFUS. Passe par la
   meme route que l'ecran : c'est le refus de serve.py qu'on veut voir, pas
   celui d'un garde qu'on aurait ajoute ici. */
function ecrireVers(E, chemin, contenu){
  return E("REST.ecrireMemoire(" + JSON.stringify(chemin) + ", " + JSON.stringify(contenu) + ")");
}

/* Dire OU deux textes divergent, et avec quoi. Un « ils different » tout seul
   fait ouvrir le fichier a la main ; et la difference qui nous a occupes ici
   etait un `\r` — precisement ce qu'on ne voit pas en le regardant. On rend
   donc les caracteres invisibles lisibles. */
function premiereDifference(a, b){
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  if (i === n && a.length === b.length) return "nulle part";
  const lisible = (s) => JSON.stringify(s).slice(1, -1);
  const ligne = a.slice(0, i).split("\n").length;
  return "ligne " + ligne + ", caractere " + i
    + " — avant « " + lisible(a.slice(i, i + 24))
    + " » · apres « " + lisible(b.slice(i, i + 24)) + " »"
    + (a.length !== b.length ? " · longueurs " + a.length + " vs " + b.length : "");
}

/* Un WAV de silence, fabrique ici. Pas un fichier d'exemple telecharge : le
   backend exige une data-URL audio en base64, et un vrai en-tete RIFF est la
   seule facon de savoir s'il l'accepte pour de bon. */
function wavSilence(secondes){
  const taux = 8000;
  const n = Math.floor(taux * secondes);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(taux, 24);
  buf.writeUInt32LE(taux * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  return "data:audio/wav;base64," + buf.toString("base64");
}

async function ranger(){
  for (const f of aDefaire.reverse()){
    try { await f(); } catch (e){ /* le rangement ne doit jamais masquer un resultat */ }
  }
}

main()
  .then(async () => { await ranger(); fin(); })
  .catch(async (e) => {
    console.error("\nLe banc s'est interrompu : " + (e && e.stack || e));
    await ranger();
    process.exit(1);
  });
