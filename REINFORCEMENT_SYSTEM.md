# Système de Renforcement (Reinforcement System)

## Vue d'ensemble

Le système de renforcement est un système automatisé d'avertissements et de sanctions pour maintenir l'ordre sur le serveur Discord. Il suit les infractions des membres et applique automatiquement des sanctions progressives.

## Fonctionnalités

### 1. Suivi des Avertissements
- Chaque membre peut recevoir des avertissements pour mauvais comportement
- Les avertissements sont stockés en mémoire avec la raison, le modérateur et l'horodatage
- Les avertissements s'accumulent et déclenchent des actions automatiques

### 2. Sanctions Progressives

Le système applique des sanctions automatiques basées sur le nombre d'avertissements :

| Avertissement | Action | Détails |
|---------------|--------|---------|
| 1er | ⚠️ Avertissement | Message DM au membre |
| 2ème | 🔇 Timeout | 10 minutes de timeout |
| 3ème | 🔇 Timeout | 1 heure de timeout |
| 4ème | 💢 Expulsion | Kick du serveur |
| 5ème+ | 🔨 Bannissement | Ban permanent |

### 3. Commandes Slash

#### `/warn`
Ajouter un avertissement à un membre.
- **Permission requise** : `ModerateMembers`
- **Options** :
  - `membre` : Le membre à avertir (requis)
  - `raison` : La raison de l'avertissement (requis)

**Exemple** : `/warn @Utilisateur raison:"Spam dans le chat"`

#### `/warnings`
Voir les avertissements d'un membre.
- **Permission requise** : `ModerateMembers`
- **Options** :
  - `membre` : Le membre à consulter (requis)

**Exemple** : `/warnings @Utilisateur`

#### `/clearwarnings`
Effacer tous les avertissements d'un membre.
- **Permission requise** : `Administrator`
- **Options** :
  - `membre` : Le membre dont effacer les avertissements (requis)

**Exemple** : `/clearwarnings @Utilisateur`

### 4. Intégration Automatique

Le système s'intègre automatiquement avec les fonctionnalités existantes :

#### Détection de Langage Inapproprié
- Un avertissement automatique est donné lors de la détection de mots interdits
- Déclenché par : utilisation de mots de la liste `badwords.json`
- Modérateur : "Système Automatique"

#### Détection de Spam
- Un avertissement automatique est donné après 3 violations de spam
- Déclenché par : envoi de plus de 5 messages en 8 secondes, répété 3 fois
- Modérateur : "Système Automatique"

## Installation et Déploiement

### Prérequis
Les commandes doivent être déployées sur Discord avant utilisation.

### Déploiement des Commandes

1. Assurez-vous que votre `.env` contient :
```env
TOKEN=votre_token_discord
CLIENT_ID=votre_client_id
GUILD_ID=votre_guild_id
```

2. Exécutez le script de déploiement :
```bash
node deploy-commands.js
```

3. Les commandes seront instantanément disponibles sur votre serveur.

## Fonctionnement Technique

### Stockage des Données
- Les avertissements sont stockés en mémoire dans une `Map<userId, Array<Warning>>`
- **Note** : Les avertissements sont perdus au redémarrage du bot
- Pour une persistance permanente, envisagez d'utiliser une base de données

### Structure d'un Avertissement
```javascript
{
  reason: string,      // Raison de l'avertissement
  moderator: string,   // Tag du modérateur ou "Système Automatique"
  timestamp: number    // Timestamp Unix en millisecondes
}
```

### Logs
- Toutes les actions de renforcement sont enregistrées dans le canal `STAFF_LOG_CHANNEL_ID`
- Les logs incluent : membre, nombre d'avertissements, modérateur, raison, et action appliquée

## Personnalisation

### Modifier les Seuils d'Action
Éditez la constante `WARNING_ACTIONS` dans `index.js` :

```javascript
const WARNING_ACTIONS = {
  1: { type: "warn", duration: null },
  2: { type: "timeout", duration: 10 * 60 * 1000 }, // Modifier la durée
  3: { type: "timeout", duration: 60 * 60 * 1000 },
  4: { type: "kick", duration: null },
  5: { type: "ban", duration: null }
};
```

### Modifier le Seuil de Spam
Éditez les constantes dans la section anti-spam :

```javascript
const windowMs = 8000;  // Fenêtre de temps en ms
const maxMsgs = 5;      // Messages maximum dans la fenêtre
```

## Considérations de Sécurité

- Les administrateurs ne peuvent pas recevoir d'avertissements automatiques
- Seuls les modérateurs (`ModerateMembers`) peuvent utiliser `/warn` et `/warnings`
- Seuls les administrateurs peuvent utiliser `/clearwarnings`
- Le bot nécessite les permissions appropriées pour timeout, kick et ban

## Support et Maintenance

En cas de problème :
1. Vérifiez les logs de la console
2. Assurez-vous que le bot a les permissions nécessaires
3. Vérifiez que les commandes sont déployées avec `deploy-commands.js`
4. Vérifiez que le canal de logs staff est correctement configuré

## Améliorations Futures Possibles

- [ ] Persistance des avertissements dans une base de données
- [ ] Expiration automatique des avertissements après X jours
- [ ] Système d'appel pour contester les avertissements
- [ ] Statistiques et rapports sur les avertissements
- [ ] Configurations personnalisables par serveur
