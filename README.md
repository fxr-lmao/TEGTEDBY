# 🦆 Canardo

Une application Web d'habitudes et de tâches, hébergée sur **GitHub Pages**, dont
l'élément central est un canard stylisé : **son humeur évolue selon ce que vous faites**.
Cochez une habitude, il s'illumine. Laissez traîner des tâches en retard, il se ternit,
laisse tomber les paupières et finit par pleurer sous un petit nuage de pluie.

Aucun serveur, aucun compte, aucune dépendance à installer : trois fichiers JavaScript,
une feuille de style et une page HTML.

---

## Mise en ligne

> **Une action manuelle est indispensable au préalable.** Le workflow ne peut pas
> activer Pages lui-même : le jeton fourni aux actions n'en a pas le droit
> (`Resource not accessible by integration`). Tant que le réglage n'est pas fait,
> chaque exécution échoue sur `Get Pages site failed`.

1. Ouvrir **Settings → Pages** du dépôt.
2. Dans **Source**, choisir **GitHub Actions**.
3. Relancer le workflow : onglet **Actions** → *Déploiement GitHub Pages* →
   **Run workflow**. Les poussées suivantes publient automatiquement.

L'application est ensuite disponible à l'adresse
`https://<utilisateur>.github.io/<dépôt>/`.

> Le dépôt fonctionne aussi tel quel avec l'option « Deploy from a branch », puisque
> tous les chemins sont relatifs et qu'un fichier `.nojekyll` est présent.

**Branche de publication.** Le dépôt ayant été créé vide, GitHub a fait de la branche
de développement la branche par défaut. Le workflow se déclenche donc sur `main`,
`master` **et** cette branche. Si vous en utilisez une autre, ajoutez-la à la liste
`branches:` de `.github/workflows/pages.yml`, faute de quoi la publication ne partira
jamais.

### En local

Ouvrir `index.html` directement dans le navigateur suffit (les scripts sont chargés en
mode classique, sans modules ES, donc `file://` fonctionne). Pour une exécution plus
proche de la production :

```bash
npx http-server -p 8080 .
```

---

## La sauvegarde

C'était l'exigence centrale, elle est traitée à plusieurs niveaux.

| Mécanisme | Rôle |
|---|---|
| `Store.commit()` | Appelé après **chaque** modification, sans exception. Toute mutation passe par `mutate()`, qui enregistre puis redessine. |
| Regroupement 120 ms | Plusieurs clics rapprochés n'écrivent qu'une fois, sans jamais perdre le dernier état. |
| `Store.flush()` | Écriture immédiate sur `beforeunload` et quand l'onglet passe en arrière-plan. |
| État de secours | La version précédente est conservée sous une seconde clé et sert de repli si la principale est corrompue. |
| Indicateur visible | La pastille en haut à droite affiche « Sauvegarde… », puis « Sauvegardé 14:32 ». |
| Export / import | Fichier `.json` téléchargeable, ou copie dans le presse-papiers, pour changer d'appareil. |

Les données vivent dans le `localStorage` du navigateur : elles ne quittent jamais
l'appareil, mais elles disparaissent si l'historique du site est effacé. D'où l'export.

Si le navigateur refuse le stockage (navigation privée stricte, cookies bloqués),
l'application le détecte au démarrage, le signale et reste utilisable — seule la
persistance manque.

---

## Le moteur d'humeur

L'humeur est un nombre continu de 0 à 100. Elle n'est pas stockée telle quelle : le
fichier retient `moodBase`, l'humeur **figée au début de la journée courante**, et
l'humeur affichée est recalculée en permanence :

```
humeur affichée = moodBase + gains du jour + retards en cours
```

Cette séparation a une conséquence utile : décocher une case ramène l'humeur
**exactement** à sa valeur d'avant. Aucune dérive ne s'accumule au fil des
clics — c'est vérifié par les tests.

### Barème

| Événement | Effet |
|---|---|
| Habitude cochée | **+7**, plus un bonus de série jusqu'à **+3** (+1 tous les 3 jours) |
| Tâche terminée | **+4** / **+6** / **+9** selon la priorité |
| Caresse sur le canard | **+1**, trois fois par jour au maximum |
| Tâche en retard *(pendant la journée)* | **−3** chacune, plafonné à **−12** |
| Habitude manquée *(à la clôture du jour)* | **−9** |
| Tâche en retard *(à la clôture du jour)* | **−5** chacune, plafonné à **−20** |
| Journée sans rien de prévu ni de fait | glissement de **10 %** vers 50 |

Les caresses sont volontairement plafonnées : elles consolent, elles ne remplacent
pas le travail.

### Changement de journée

Au démarrage, `rollForward()` clôture toutes les journées écoulées depuis la dernière
ouverture, une par une : chaque habitude oubliée et chaque tâche en retard est comptée,
et le résultat est inscrit au journal. Revenir après une semaine d'absence trouve donc
un canard sincèrement déprimé, pas un canard figé. La bascule est aussi surveillée
pendant que l'onglet reste ouvert.

Les dates sont manipulées en heure **locale**, ancrées à midi, pour qu'un changement
d'heure saisonnier ne décale jamais un jour.

---

## Le dessin

Style « autocollant » : aplats de couleur sans le moindre dégradé, contours noirs épais,
gros œil, corps d'une seule pièce dont la tête fait partie, houppette sur le crâne. Tout
est en SVG en ligne, manipulé directement par le code.

Deux conséquences de ce parti pris méritent d'être connues :

- La scène reste **claire même en thème sombre**. Un contour noir sur un fond presque
  noir disparaîtrait, et le canard perdrait son trait.
- Le canard **n'a pas d'aile dessinée**. Sur un corps-blob dont le visage occupe presque
  toute la surface, tout arc placé sur le flanc se lit comme une bouche triste — trois
  formes différentes ont été essayées, aucune n'y échappait.

## Les expressions

Rien n'est « par palier » : chaque trait est interpolé, le canard change donc de façon
continue au fil des points.

| Trait | Triste ⟶ Heureux |
|---|---|
| Paupière | lourde, à mi-œil ⟶ relevée, puis `^ ^` au-delà de 93 |
| Regard | pupille contractée et basse ⟶ dilatée |
| Œil éloigné | écrasé ⟶ grand ouvert |
| Sourcils | bouts tournés vers le bec relevés ⟶ détendus et remontés |
| Bec | pointe vers le bas ⟶ vers le haut, puis entrouvert sur l'intérieur |
| Posture | affaissée vers l'avant ⟶ redressée |
| Couleurs | plumage délavé et bec éteint ⟶ teintes franches |
| Flottaison | lente (4,8 s) ⟶ vive (2,1 s) |
| Décor | nuage de pluie et larmes ⟶ rougeurs, halo, étincelles |

La paupière s'arrête volontairement au milieu de l'œil : plus bas, elle masquerait la
pupille et ne laisserait qu'un croissant blanc, qui se lit comme un œil révulsé plutôt
que comme un œil fatigué.

Les paliers nommés (Abattu, Triste, Morose, Neutre, Content, Joyeux, Radieux) ne servent
qu'au texte affiché.

---

## Structure

```
index.html                 page unique
assets/css/style.css       thèmes clair/sombre, mise en page, animations
assets/js/storage.js       persistance, secours, export/import
assets/js/logic.js         humeur, habitudes, tâches, séries, statistiques
assets/js/duck.js          rendu du canard (humeur ⟶ expression)
assets/js/app.js           interface et câblage
.github/workflows/pages.yml
```

Aucune bibliothèque tierce. Les scripts sont des scripts classiques (pas de modules ES),
pour que la page fonctionne aussi bien depuis `file://` que depuis GitHub Pages.

---

## Accessibilité

Navigation complète au clavier, cases exposées comme `aria-pressed`, humeur exposée
comme `role="meter"` avec un libellé lisible, lien d'évitement, contrastes tenus dans
les deux thèmes. Les animations respectent `prefers-reduced-motion`, et un réglage
manuel permet de les couper indépendamment du système.

---

## Ce qui n'est pas fait

- **Pas de synchronisation entre appareils.** Le transfert passe par l'export/import
  manuel. Une synchronisation réelle demanderait un serveur, ce qui sort du cadre d'un
  hébergement GitHub Pages.
- **Pas de mode hors-ligne installable.** Il n'y a pas de *service worker* : rouvrir la
  page sans réseau ne fonctionnera pas, même si les données locales sont intactes.
- **Pas de notifications ni de rappels.**
