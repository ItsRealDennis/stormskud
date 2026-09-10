# STORMSKUD on Railway

`railway.ts` declares one `stormskud` service in Amsterdam, using the root
Dockerfile, port 3000, `/health`, automatic restart on failure, and no sleeping.
Do not add replicas: live rooms are held in one process's memory. A deployment
or restart ends active rooms. No database or volume is required.

## First deployment

Requires an active Railway plan, a signed-in Railway CLI 5.42.1 or newer,
and `npm ci` in the project root. The SDK is a development dependency only.

```sh
railway init --name STORMSKUD --workspace YOUR_WORKSPACE_ID
railway config plan
railway config apply --yes
railway up --service stormskud --detach
railway deployment list --service stormskud
railway domain --service stormskud --port 3000
```

Run `railway whoami --json` to see your workspace ID. If the project already
exists, use `railway link` instead of creating a second project. Apply this
configuration only to the dedicated STORMSKUD project.

`railway up` uploads this directory; no GitHub repository is required. It honors
`.gitignore`, excluding node_modules, local artifacts, logs and .env files.
Wait for a successful deployment and use the actual domain returned by Railway:

```sh
npm run test:public -- https://YOUR_ACTUAL_RAILWAY_DOMAIN
```

The public smoke test creates temporary rooms using actual WebSocket clients
and sends the same Origin header as a browser. It checks HTTP, invitations,
joining, shared rounds, room isolation and leaving. It cleans up its players.
It does not test GPU rendering or replace the detailed local combat tests.

Share the HTTPS address with friends. In-game invitation links automatically
use that address and include the room code. TLS and WebSocket routing are
provided by Railway. For later code updates, run `railway up --service stormskud`.
For service-setting updates, review `railway config plan` before applying it.

## Deployment status, 10 September 2026

The CLI is authenticated, but Railway rejected creation of STORMSKUD with:
"Your trial has expired. Please select a plan to continue using Railway."
The project has not been deployed and no public domain has been generated.
Activate a plan in the existing Railway workspace to continue. The local
configuration imports successfully and passes Railway SDK graph validation;
it has not yet been applied or validated by a cloud deployment.

Reference: https://docs.railway.com/infrastructure-as-code
