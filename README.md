# 🦆 Canardo

Une application Web d'habitudes et de tâches, hébergée sur **GitHub Pages**, dont
l'élément central est un canard stylisé : **son humeur évolue selon ce que vous faites**.
Cochez une habitude, il s'illumine. Laissez traîner des tâches en retard, il se ternit,
laisse tomber les paupières et finit par pleurer sous un petit nuage de pluie.

Aucun serveur, aucun compte, aucune dépendance à installer : trois fichiers JavaScript,
une feuille de style et une page HTML.

---

## Mise en ligne

1. **Réglages → Pages** du dépôt.
2. Dans **Source**, choisir **GitHub Actions**.
3. Pousser sur `main` : le workflow `.github/workflows/pages.yml` publie le site.

L'application est ensuite disponible à l'adresse
`https://<utilisateur>.github.io/<dépôt>/`.

> Le dépôt fonctionne aussi tel quel avec l'option « Deploy from a branch », puisque
> tous les chemins sont relatifs et qu'un fichier `.nojekyll` est présent.

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

## Les expressions

Rien n'est « par palier » : chaque trait est interpolé, le canard change donc de façon
continue au fil des points.

| Trait | Triste ⟶ Heureux |
|---|---|
| Paupières | tombantes ⟶ grandes ouvertes, puis `^ ^` au-delà de 93 |
| Sourcils | bouts intérieurs relevés ⟶ détendus |
| Bec | pointe vers le bas ⟶ pointe vers le haut, bouche entrouverte |
| Tête | affaissée vers l'avant ⟶ redressée |
| Plumage | terne et désaturé ⟶ vif |
| Flottaison | lente (4,8 s) ⟶ vive (2,1 s) |
| Décor | nuage de pluie ⟶ rougeurs, halo, étincelles |

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
