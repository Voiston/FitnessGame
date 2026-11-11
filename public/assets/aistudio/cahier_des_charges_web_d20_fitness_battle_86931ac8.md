# Cahier des Charges & Spécifications Web : D20 Fitness Battle

## 1. Vision du Projet
**D20 Fitness Battle** est une application web (Web App / PWA) conçue pour les coachs sportifs et leurs clients. Le but est d'animer des séances d'entraînement sous forme de jeu de société compétitif et physique en temps réel. Le premier joueur qui complète sa grille de 20 cases gagne la partie.

---

## 2. Core Gameplay & Règle du Jeu

### A. La Grille Athlète (1 à 20)
* Chaque joueur dispose d'une grille personnelle numérotée de 1 à 20 (représentant 210 répétitions cumulées au total).
* Les 20 cases sont divisées en 3 catégories d'exercices/paliers définies par le coach en début de partie :
  * **Vert (Cases 1 à 6) :** Exercice A (Ex: Burpees)
  * **Jaune (Cases 7 à 13) :** Exercice B (Ex: Pompes)
  * **Rouge (Cases 14 à 20) :** Exercice C (Ex: Air Squats)

### B. Déroulement d'un Tour de Jeu
1. **Lancer de Dé :** Le joueur lance son **D20 virtuel** (ou saisit le résultat de son dé physique).
2. **Case libre :** Le joueur doit effectuer le nombre de répétitions égal à la valeur du dé (ex. 14 = 14 répétitions de l'exercice Rouge). Une fois terminées, il valide la case sur l'écran.
3. **Case déjà cochée (Doublon) :** 
   * Le joueur applique la **Règle du Rebond** (glisse vers la case libre supérieure ou inférieure la plus proche).
   * Ou il effectue une **pénalité active** (ex: 5 burpees / 30s gainage) paramétrée dans l'app pour **piocher 1 carte bonus**.

---

## 3. Système de Deck & Cartes Tactiques

Chaque joueur peut stocker maximum **2 cartes en main**. 

### Liste des 10 Cartes du Deck :
1. **Passe-Droit (Joker) :** Coche immédiatement le dé (ou la case libre de son choix si pris) sans exécuter les répétitions.
2. **Demi-Tarif :** Divise par 2 le nombre de répétitions du dé (arrondi à l'inférieur).
3. **Double Dé :** Lance 2 dés ce tour et choisit le meilleur résultat.
4. **Glissade Libératrice :** Glisse librement vers la case libre de son choix et fait ses répétitions.
5. **Gel :** Impose 45 secondes de planche statique à un adversaire au choix pendant sa propre série.
6. **Scission :** Divise le résultat en 2 cases libres dont la somme égale le dé, coche les 2 cases en faisant le total.
7. **Double Mise :** Coche la case du dé ET la suivante (+1) avec cumul des répétitions.
8. **Lest Tactique :** Jouable après le lancer d'un rival : lui ajoute +4 répétitions sur sa série.
9. **Partage Charge :** Effectue 50% des répétitions et transfère les 50% restants à un rival.
10. **Balle de Match :** (Uniquement si ≤ 3 cases restantes) Permet de relancer ou de copier la case cochée d'un adversaire.

---

## 4. Spécifications Techniques & UI/UX

### A. Modes de Jeu requis
1. **Pass & Play (1 seul écran mobile/tablette) :** Le coach ou le groupe se passe le téléphone/tablette pour jouer à tour de rôle.
2. **Mode Multijoueur Local / Salle (Écran Coach + Écrans Athlètes) :** 
   * Connexion via Code de Salle (Room Code) ou QR Code.
   * L'écran du coach/TV affiche le classement en temps réel et la grille globale.
   * L'écran du client affiche sa propre grille et son deck de cartes.

### B. Interface Utilisateur (UI)
* **Design "Athletic / Dark Mode Premium" :** Inspiré de Strava / CrossFit (Noir `#0f172a`, Accent Rouge `#dc2626`, Vert `#16a34a`, Jaune `#d97706`).
* **Grille Dynamique :** Feedback visuel clair sur les cases cochées, libres et suggestions de rebond.
* **Animations :** Lancer de D20 en 3D/CSS, effets visuels lors de l'attaque d'une carte *Gel* ou *Lest*.
* **Boutons Géants :** Adaptés à une utilisation avec les mains moites/en plein effort.

### C. Stack Technique Recommandée
* **Frontend :** React / Next.js avec Tailwind CSS.
* **Gestion d'état / Temps réel :** Supabase Realtime ou Socket.io pour la synchronisation multi-écrans.
* **Audio & Haptique :** Bips sonores de fin de chrono, sons de lancer de dé et de victoire.

---

## 5. MVP (Minimum Viable Product) — Étape 1
Pour la version 1.0, développer :
1. Écran de configuration de séance (saisie des 3 exercices).
2. Grille interactive à 20 cases pour 1 à 4 joueurs sur un même écran.
3. Le lancer de D20 intégré et la pioche/utilisation des 10 cartes bonus.
4. Écran d'affichage du vainqueur avec résumé du volume total de répétitions exécutées.