# Configuration du rôle Visitor

Ce script configure automatiquement le rôle "Visitor" pour les utilisateurs dont les applications sont refusées.

## Ce que fait le script

1. ✅ Crée le rôle "Visitor" (s'il n'existe pas)
2. ✅ Configure les permissions sur les 5 salons autorisés:
   - #team-search
   - #clips
   - #screenshots
   - #balance-changes
   - #memes

## Comment l'utiliser

### Exécuter le script

```powershell
node setup-visitor-role.js
```

### Après l'exécution

**Important:** Le script ne peut pas modifier les permissions @everyone automatiquement pour éviter de casser votre configuration existante.

**Vous devez manuellement:**

1. Aller dans les paramètres du serveur Discord
2. Pour CHAQUE salon que vous voulez interdire aux visiteurs:
   - Éditer les permissions
   - Pour le rôle @everyone, définir "Voir le salon" sur ❌ (refusé)
3. Les salons avec permissions Visitor configurées resteront accessibles

### Vérification

Après le script, vérifiez que:
- ✅ Le rôle "Visitor" existe (couleur grise)
- ✅ Les 5 salons mentionnés ont le rôle Visitor avec accès en lecture/écriture
- ✅ Les autres salons ont @everyone bloqué

## Résultat final

- **Utilisateur accepté** → Rôle "𝔵𝔞𝔳𝔦𝔢𝔯 𝑝𝑟𝑜" → Accès complet
- **Utilisateur refusé** → Rôle "Visitor" → Accès limité aux 5 salons uniquement

## Dépannage

Si le rôle n'est pas appliqué:
1. Vérifiez que le nom du rôle est exactement "Visitor"
2. Vérifiez que le bot a les permissions "Gérer les rôles"
3. Vérifiez que le rôle du bot est au-dessus du rôle "Visitor" dans la hiérarchie
