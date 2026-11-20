# ValueConvert

Convertisseur Pi ⇄ monnaies fiat (30 devises). Application indépendante, non affiliée à Pi Network. *Pi Network is a trademark of PI Community Company.*

## Principes
- **Page de bienvenue** : message de bienvenue et bouton « Se connecter avec Pi » (jeton vérifié côté serveur). « Continuer sans me connecter » permet d'entrer sans compte.
- **Valeur du Pi « à venir »** : tant que `PI_VALUE_AVAILABLE=0` (défaut), l'application affiche que la valeur du Pi n'est pas encore disponible ; aucune source de prix n'est interrogée et aucun chiffre n'est présenté.
- **Aucun prix inventé.** Aucune clé dans le navigateur ni dans le dépôt. Aucune demande de phrase secrète, clé privée, e-mail ou téléphone.
- **Pass payant (fermé par défaut)** : paiement unique en Pi, montant fixé par le serveur (`PASS_PRICE_PI`, `PASS_DAYS`), vérifié puis enregistré dans Supabase. L'application n'envoie jamais de Pi : ni route de test, ni portefeuille, ni clé secrète de portefeuille.
- **Connexion** : `Pi.authenticate(["username"])` dans Pi Browser ; le serveur envoie le jeton uniquement à `https://api.minepi.com/v2/me` (`Authorization: Bearer`).

## Lancer
```
npm install
npm run dev     # serveur :3000 + client Vite
npm test
npm run build && npm start
```
Node 22 requis.

## Variables (serveur)
`APP_ENV=mainnet`, `PI_VALUE_AVAILABLE` (0|1, défaut 0), `PI_SANDBOX` (0), `PI_VALIDATION_KEY` (clé du portail Pi, app Mainnet), `PI_API_KEY` (clé API de l'app Mainnet, pass uniquement), `PASS_ENABLED`/`PASS_PRICE_PI`/`PASS_DAYS`/`SUPABASE_URL`/`SUPABASE_SERVICE_KEY` (pass), `COINGECKO_API_KEY` (facultative), `PORT`, `FRAME_ANCESTORS`, `RENDER_EXTERNAL_URL` (fournie par Render : auto-appel de `/api/health` toutes les 5 minutes). Voir `server/src/config.ts`.

## Déploiement sur Render
1. Service web `valueconvert` : build `npm ci && npm run build`, start `npm start`, `NODE_VERSION=22`, `NPM_CONFIG_INCLUDE=dev` (sinon le build échoue), health check `/api/health`.
2. Les secrets (`PI_VALIDATION_KEY`, `COINGECKO_API_KEY`) se saisissent dans Render, jamais dans le dépôt ni dans un chat.
3. Le déploiement automatique ne se déclenche pas toujours : lancer un déploiement manuel après chaque push.
4. Ne confirmez jamais un écran « Rollback » de Render.
5. L'offre gratuite s'endort : l'auto-appel ne suffit pas seul ; prévoir UptimeRobot puis l'offre payante avant l'ouverture au public.
