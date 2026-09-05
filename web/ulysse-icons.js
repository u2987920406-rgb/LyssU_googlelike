/* ============================================================================
 * ulysse-icons.js — le jeu d'icones d'Ulysse
 * ----------------------------------------------------------------------------
 * EXTRAIT VERBATIM de maquette-ulysse-google-33.html (table `I` + fonction
 * `svg()`). Chaque icone porte son nom en clair (`nm`) et sa raison d'etre
 * (`r`) : c'est ce qui alimente le panneau Reperes. Ne pas remplacer par un
 * jeu d'icones generique — la maquette est le produit fini.
 * ========================================================================== */

const I={
 menu:{d:'M4 7h16M4 12h16M4 17h16',nm:'menu',
   r:"Épingle le menu ouvert. Le survol du bord gauche suffit à le déplier — l'épingle sert à le garder."},
 fermer:{d:'M6 6l12 12M18 6L6 18',nm:'fermer',
   r:"Fait disparaître. Ne détruit jamais : ce qui est fermé se rouvre depuis le menu."},
 reduire:{d:'M6 12h12',nm:'réduire',r:"Le volet reste là mais cède la place à son voisin."},
 agrandir:{d:'M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5',nm:'agrandir',
   r:"Le volet prend toute la place. Son voisin s'efface, il ne se ferme pas."},
 restaurer:{d:'M4 9h5V4M20 9h-5V4M20 15h-5v5M4 15h5v5',nm:'restaurer',
   r:"Revient au partage d'origine. Remplace « agrandir » quand on y est déjà."},
 chevron:{d:'M6 9l6 6 6-6',nm:'développer / replier',
   r:"Montre ou cache le détail, sur place. La même icône pivote : jamais deux dessins pour un aller-retour."},
 tout:{d:'M4 8h16M4 16h16M8 4l4 4 4-4M8 20l4-4 4 4',nm:'tout replier',
   r:"Applique le repli à toute la liste d'un coup."},
 retour:{d:'M15 6l-6 6 6 6',nm:'retour',r:"Revient d'où l'on vient. Toujours en haut à gauche."},
 suivant:{d:'M9 6l6 6-6 6',nm:'suivant',
   r:"Va vers le détail. Sur une carte, annonce qu'un clic ouvre quelque chose."},
 plus:{d:'M12 5v14M5 12h14',nm:'ajouter',
   r:"Ouvre le choix de ce qu'on ajoute — un fichier, un projet, un agent. Ne crée jamais tout seul."},
 incognito:{raw:`<path d="M4.5 12c0-4 3.3-7 7.5-7s7.5 3 7.5 7"/><path d="M2.5 12h19"/>
   <circle cx="7.4" cy="16.6" r="2.7"/><circle cx="16.6" cy="16.6" r="2.7"/>
   <path d="M10.1 16.2h3.8"/>`,nm:'conversation privée',
   r:"Le fil n'est pas retenu. La fenêtre entière change de teint : on ne peut pas s'y tromper."},
 coffre:{raw:`<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>`,
   nm:'coffre',r:"Le contenu d'un projet. Chaque projet a le sien, aucun ne voit celui d'un autre."},
 bac:{raw:`<path d="M12 3 3 7.5v9L12 21l9-4.5v-9z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>`,
   nm:'bac à sable',r:"L'espace d'exécution d'un projet. Il s'ouvre, il se ferme, il ne déborde pas."},
 auto:{raw:`<path d="M11.5 3 13.3 7.7 18 9.5l-4.7 1.8L11.5 16 9.7 11.3 5 9.5l4.7-1.8z"/>
   <path d="M18.2 15l.85 2.15L21.2 18l-2.15.85L18.2 21l-.85-2.15L15.2 18l2.15-.85z"/>`,
   nm:'se fait tout seul',
   r:"Marque une étape qui n'a besoin de personne : ni vous, ni un agent. Elle se fait, elle ne se décide pas."},
 recherche:{raw:`<circle cx="11" cy="11" r="6"/><path d="M15.6 15.6 21 21"/>`,nm:'filtrer',
   r:"Réduit la grille à ce qui correspond. Ne masque jamais définitivement : videz le champ, tout revient."},
 relancer:{raw:`<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 2.5v5h-5"/>`,
   nm:'relancer',
   r:"Remet un projet en route. Le menu qui l'accompagne dit d'où : de là où ça s'est arrêté, ou du début."},
 alerte:{raw:`<path d="M12 3.9 21.7 20.3H2.3z" fill="#F9AB00" stroke="#F9AB00"
   stroke-width="1.7" stroke-linejoin="round"/>
   <path d="M12 10v3.7" stroke="#3D2B00" stroke-width="1.9" stroke-linecap="round"/>
   <circle cx="12" cy="16.7" r="1.05" fill="#3D2B00" stroke="none"/>`,
   nm:'attention',
   r:"Signale ce qui empêchera quelque chose de bien se passer. Jamais décoratif : s'il est là, il y a une action au bout."},
 prise:{raw:`<path d="M9 2.5v6M15 2.5v6"/><path d="M5.5 8.5h13v3.5a6.5 6.5 0 0 1-13 0z"/>
   <path d="M12 18.5V22"/>`,nm:'connexions',
   r:"Ce à quoi Ulysse a le droit de se brancher. Rien n'est branché sans que vous l'ayez dit."},
 cloche:{raw:`<path d="M18 16.5v-5.2a6 6 0 1 0-12 0v5.2L4.2 19.5h15.6z"/>
   <path d="M9.8 22a2.6 2.6 0 0 0 4.4 0"/>`,nm:'notifications',
   r:"Ce qui attend une réponse s'y compte, et le compteur bat tant qu'on n'a pas répondu."},
 boucle:{raw:`<path d="M17 2.6 20.6 6 17 9.4"/><path d="M20.6 6H8.2A4.6 4.6 0 0 0 3.6 10.6v1.2"/>
   <path d="M7 21.4 3.4 18 7 14.6"/><path d="M3.4 18h12.4a4.6 4.6 0 0 0 4.6-4.6v-1.2"/>`,
   nm:'automatisation',
   r:"Ce qui tourne en boucle, sans agent derrière. Un travail a une fin ; une automatisation, non."},
 corbeille:{raw:`<path d="M4 7h16"/><path d="M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/>
   <path d="M6.5 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>`,
   nm:'supprimer',
   r:"Met à la corbeille. Ne détruit pas : l'objet y reste, et la corbeille vit là où vivent les objets qu'elle recueille."},
 point:{circle:true,nm:"marqueur d'état",
   r:"Vert : terminé. Orange : en cours. Gris : en attente. Trois états, pas plus."},
 /* Deux signes AJOUTÉS à la maquette, parce que le produit a gagné deux
    pouvoirs qu'elle n'avait pas : `PATCH /api/sessions/{id}` sait épingler et
    archiver. Ajouter une icône est sans risque ; en retirer casserait un
    appel svg(). */
 epingle:{raw:`<path d="M9 3h6M12 3v6.2a4 4 0 0 1-1.2 2.9L8.6 14.3h6.8l-2.2-2.2A4 4 0 0 1 12 9.2"/>
   <path d="M12 14.3V21"/>`,nm:'épingler',
   r:"Sort une conversation du fil du temps. Elle reste en tête quel que soit son âge — c'est la seule chose qui empêche une liste de devenir un journal."},
 boite:{raw:`<path d="M3 8.5h18v10.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z"/>
   <rect x="2.2" y="3.8" width="19.6" height="4.7" rx="1.2"/><path d="M10 12.5h4"/>`,
   nm:'archiver',
   r:"Range sans jeter. Une conversation archivée sort de la liste et se retrouve quand on la demande — c'est ce qui permet de ne pas avoir à décider si on supprime."},
 /* service */
 micro:{d:'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v4',
   nm:'parler',
   r:"Dicte à la place d'écrire. Non branché à ce jour : Hermès expose /api/audio/transcribe, l'interface reste à faire — le bouton le dit plutôt que de faire semblant."},
 envoi:{d:'M3 11l18-8-8 18-2-7-8-3z',
   nm:'envoyer',
   r:"Part vers l'agent. C'est le seul geste de l'écran qui engage un tour de travail ; il porte l'accent, et rien d'autre autour du champ ne le porte."},
 coche:{d:'M4 12l6 6L20 6',w:3.4,
   nm:"c’est fait",
   r:"Confirme après coup, jamais avant. Sur un accord donné, il garde la trace de ce qui a été autorisé."},
 chat:{d:'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-5 4v-4H6a2 2 0 0 1-2-2z',
   nm:'discuter',
   r:"La conversation nue — le modèle répond, il n'agit pas. À distinguer de la bulle du menu, qui désigne la destination."},
 atelier:{d:'M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6',
   nm:"l’Établi",
   r:"Les fichiers déjà sur la machine, ouverts à côté du fil. Il s'ouvre à côté, il ne pousse rien."},
 fichier:{d:'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
   nm:'fichier',
   r:"Un fichier ordinaire, dans une liste. Le contour seul : c'est du contenu, pas une destination."},
 lien:{d:'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
   nm:'lien',
   r:"Renvoie ailleurs sans quitter ce qu'on fait. Réservé à ce qui pointe hors d'Ulysse."},
 regler:{tune:true,
   nm:'réglages',
   r:"La destination où l'on change ce qui vaut pour toutes les conversations, pas pour celle-ci."},
 copier:{d:'M9 9h10v10H9zM5 15V5h10',
   nm:'copier',
   r:"Prend une valeur pour la coller ailleurs. Ne modifie rien : c'est le seul geste de la barre d'actions qui ne touche à rien."},
 power:{d:'M12 3v9M6.5 6.5a8 8 0 1 0 11 0',
   nm:'arrêter',
   r:"Coupe pour de bon. Réservé à ce qui ne se rattrape pas par un simple retour."},
 /* destinations */
 bulle:{fillable:'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-5 4v-4H6a2 2 0 0 1-2-2z',
   nm:'Discuter',
   r:"La destination du fil en cours. Pleine quand on y est, en contour sinon — la même règle pour les neuf entrées du menu."},
 eclair:{fillable:'M13 2 4 14h7l-1 8 9-12h-7z',
   nm:'Historique',
   r:"Les conversations déjà menées. L'éclair dit le travail fait, pas la vitesse. "
     + "Ouvre un volet à côté du fil, plus une destination du rail."},
 doc:{fillable:'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
   nm:'Livrables',
   r:"Ce qui a été produit et qu'on peut emporter. Un livrable est un fichier qu'on montre à quelqu'un d'autre."},
 dossier:{fillable:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
   nm:'Projets',
   r:"Le regroupement réel qu'Hermès connaît : le dossier de travail. Il ne prétend pas être autre chose."},
 equipe:{people:true,
   nm:'Vestiaire',
   r:"Les rôles et les compétences — ce qu'on peut endosser. Trois silhouettes, parce qu'aucune n'est la bonne à elle seule."},
 noeuds:{nodes:true,
   nm:'Plan',
   r:"Ce que fait l'agent, étape par étape. Des nœuds reliés : c'est une suite, pas une liste."},
 boussole:{fillable:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3.5 5.5-2 5-5 2 2-5z',
   nm:'Repères',
   r:"Le sens de chaque signe de l'interface. On y vient avec un dessin en tête, pas pour le lire en entier."},
 points:{raw:`<circle cx="12" cy="5.6" r="1.7" fill="currentColor" stroke="none"/>
   <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>
   <circle cx="12" cy="18.4" r="1.7" fill="currentColor" stroke="none"/>`,nm:'agir sur',
   r:"Range les actions d'un élément au lieu de les étaler. Elles ne disparaissent pas : elles attendent qu'on les demande."},
 terminal:{raw:`<rect x="3" y="4.5" width="18" height="15" rx="2.5"/>
   <path d="M7.2 10.2 10 12.6l-2.8 2.4M12.4 15.4h4.4"/>`,nm:'terminal',
   r:"Ouvre la ligne de commande d'Hermès, en dehors d'Ulysse. Ce qui s'y tape ne passe par aucun de vos accords."}
};

function svg(k,{size=24,fill=false,w=2}={}){
  const o=I[k]||{}, sw=o.w||w;
  /* Un glyphe « plein » n'est jamais un aplat : c'est sa propre couleur
     à 18 %. Le contour reste net, la masse reste légère. */
  const wrap=(inner,f)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24"
    fill="${f||'none'}" fill-opacity="${f&&f!=='none'?'.12':'1'}"
    stroke="currentColor" stroke-width="${sw}" stroke-linecap="round"
    stroke-linejoin="round">${inner}</svg>`;
  if(o.circle) return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" fill="currentColor"/></svg>`;
  if(o.people) return wrap(`<circle cx="9" cy="8" r="3.2"/>
    <path d="M3 19a6 6 0 0 1 12 0"/><circle cx="17" cy="9.5" r="2.4"/>
    <path d="M15.5 19h5.5a4.5 4.5 0 0 0-3-4.2"/>`, fill?'currentColor':'none');
  /* ⚠ LES LIAISONS SUIVENT LES CENTRES, ELLES NE SONT PAS APPROXIMEES.
     Ecrites a la main, elles etaient a cote : le trait vers le noeud du bas
     partait de x=7.4 la ou le bord du cercle est a x=6.43 — presque une unite
     sur vingt-quatre. Les deux traits ne pointaient donc pas vers les centres
     qu'ils relient, et le glyphe paraissait de travers dans le rail, penche a
     gauche. Signale par kuchu le 2026-08-12, capture a l'appui.
     Chaque extremite est maintenant le point exact ou la droite centre-a-centre
     coupe le cercle : centre + r x le vecteur unitaire. Le garde de
     `test_page.js` le REMESURE sur le glyphe rendu, pour qu'une retouche a la
     main ne puisse plus les desaligner en silence. */
  if(o.nodes) return wrap(`<circle cx="6" cy="6" r="2.6"/><circle cx="18" cy="10" r="2.6"/>
    <circle cx="8" cy="18" r="2.6"/><path d="M8.47 6.82 15.53 9.18M6.43 8.56 7.57 15.44" fill="none"/>`,
    fill?'currentColor':'none');
  if(o.tune) return wrap(`<path d="M4 7h6M15 7h5M4 12h11M4 17h3M12 17h8" fill="none"/>
    <circle cx="12.5" cy="7" r="2.3"/><circle cx="17.5" cy="12" r="2.3"/>
    <circle cx="9.5" cy="17" r="2.3"/>`, fill?'currentColor':'none');
  if(o.raw) return wrap(o.raw);
  if(o.fillable) return wrap(`<path d="${o.fillable}"/>`,fill?'currentColor':'none');
  return wrap(`<path d="${o.d}"/>`);
}
