# Configuration automatique des permissions des salons

Ce script configure automatiquement les permissions de tous les salons pour le rôle "𝔵𝔞𝔳𝔦𝔢𝔯 𝑝𝑟𝑭".

## Ce que fait le script

1. ✅ Bloque l'accès @everyone à tous les salons (sauf exceptions)
2. ✅ Autorise le rôle "𝔵𝔞𝔳𝔦𝔢𝔯 𝑝𝑟𝑭" sur tous les salons
3. ✅ Les utilisateurs acceptés voient automatiquement tous les salons

## Salons exclus

Les salons suivants ne seront pas modifiés:
- #rules
- #welcome
- #join-us
- #announcements

## Comment l'utiliser

### Exécuter le script

```powershell
node setup-member-channels.js
```

### Résultat

```
✅ Configured: 15 channels
⏭️  Skipped: 4 channels
```

## Résultat final

Après l'exécution:
- ✅ Utilisateurs **acceptés** (rôle "𝔵𝔞𝔳𝔦𝔢𝔯 𝑝𝑟𝑍") → Voient **tous les salons** 👍
- ✅ Utilisateurs **refusés** (rôle "Visitor") → Voient seulement les 5 salons autorisés
- ✅ Utilisateurs **non vérifiés** → Ne voient aucun salon (sauf rules/welcome)

## ⚠️ Important

Ce script va **modifier les permissions de TOUS les salons texte**. Assurez-vous que:
1. Vous avez sauvegardé vos configurations actuelles
2. Le bot a les permissions "Gérer les rôles" et "Gérer les salons"
3. Le rôle du bot est au-dessus du rôle "𝔵𝔞𝔳𝔦𝔦𝔢𝔯 𝑝𝑟𝑢" dans la hiérarchie
