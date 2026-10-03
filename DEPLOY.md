# Deploying Nook

The backend runs on Render's free plan and the frontend on Vercel. An uptime monitor pings the backend's `/health` endpoint so the free service never goes to sleep.

```
Browser ── https ──> Vercel (the React build)
   │
   └── wss://<RENDER_HOST>/socket.io ──> Render web service (Node: Express + Socket.IO)
                                              ▲
Uptime monitor ── GET /health every 5 min ────┘
```

- Render provides HTTPS and WebSockets on its `onrender.com` address. There is no server, firewall or certificate to manage.
- Voice audio goes between the browsers and Agora, not through Render.

Placeholders used below:

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `<RENDER_URL>` | Address Render gives the backend | `https://nook-a1b2.onrender.com` |
| `<VERCEL_URL>` | Address Vercel gives the frontend | `https://nook.vercel.app` |

## Know the free plan before you start

- **It sleeps without traffic.** Render stops a free service after 15 minutes without an HTTP request or WebSocket message, and waking it takes about a minute. The uptime monitor in step 4 prevents this.
- **Saved rooms do not survive.** The free plan's disk is wiped on every deploy and every restart, and Render may restart a free service at any time. After that the world is back to the three starter rooms. Room ownership, chat and voice are unaffected; only rooms people created are lost.
- **750 free hours a month per workspace.** One service running all month uses 720 to 744 of them. A second free service in the same workspace would run both out before the month ends.
- **One instance only.** That is what this backend needs anyway, since the world lives in one process's memory.

## 1. Create the backend on Render

1. Sign up at <https://render.com> with your GitHub account.
2. Choose **New** → **Blueprint**, and connect the `Psquare31/Nook` repository. Render reads `render.yaml` from the repo.
3. It asks for the values marked secret in that file:
   - `CLIENT_ORIGIN`: leave empty for now. Step 3 fills it in.
   - `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE`: your Agora values. Leave both empty to run without voice.
4. Apply. The first build takes a few minutes.

If you would rather not use the Blueprint, choose **New** → **Web Service** instead and enter the same settings by hand:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci && npm run build:server` |
| Start command | `npm start` |
| Instance type | Free |
| Health check path | `/health` (under Advanced) |
| Environment variables | `NODE_VERSION` = `22`, plus the three above |

The region cannot be changed after the service is created. Pick the one closest to your users.

When the deploy finishes, copy the service address from the top of its page. That is `<RENDER_URL>`. Open `<RENDER_URL>/health` in a browser. It should show `{"ok":true,...}`, with `"voice":true` if you entered Agora values.

## 2. Put the frontend on Vercel

1. At <https://vercel.com/new>, import the `Psquare31/Nook` repository. Vercel detects Vite; leave the build settings alone.
2. Before deploying, add an environment variable: `VITE_SERVER_URL` = `<RENDER_URL>`. Then deploy.
3. Copy the address Vercel gives the site. That is `<VERCEL_URL>`.

`VITE_SERVER_URL` is read when the frontend is built, so after changing it, redeploy. `VITE_` variables end up in the JavaScript every visitor downloads, so never put a secret in one.

## 3. Allow only your frontend

In Render, open the service → **Environment**, set `CLIENT_ORIGIN` to `<VERCEL_URL>` and save. Render redeploys with the new value.

It must match the site's address exactly, including `https://`. Vercel preview deployments have other addresses; add them separated by commas if you want them to connect.

## 4. Keep it awake with an uptime monitor

Use any free uptime service, for example UptimeRobot (<https://uptimerobot.com>) or cron-job.org (<https://cron-job.org>).

- **Type:** HTTP(s)
- **URL:** `<RENDER_URL>/health`
- **Interval:** 5 or 10 minutes. Anything shorter than 15 minutes keeps the service awake.

The endpoint answers both GET and HEAD, is never cached, and only reads counters, so pinging it costs nothing. The monitor also tells you by email when the backend is down.

## 5. Check it

Open `<VERCEL_URL>` in two browsers that do not share storage, for example a normal window and an Incognito window.

- The top bar says `2 online`.
- In DevTools → Network → WS there is a `socket.io` row with status 101.
- Chat reaches the other window while both are in the same room.
- With Agora set up, **Join voice** appears in the top bar.

## Updating later

Push to the `main` branch on GitHub. Render rebuilds and redeploys the backend, and Vercel rebuilds the frontend. Browsers reconnect by themselves after the backend restarts, and created rooms are reset (see the free-plan notes above).

## If something fails

| Symptom | Likely cause |
| --- | --- |
| The site says "Offline · retrying" | `VITE_SERVER_URL` is wrong or missing, or the frontend was not redeployed after setting it |
| `/health` works but the site cannot connect | `CLIENT_ORIGIN` does not match `<VERCEL_URL>` exactly |
| The first visit takes about a minute | The service was asleep. Check that the uptime monitor is running and pointed at `/health` |
| "Mixed content" in the browser console | `VITE_SERVER_URL` starts with `http://` instead of `https://` |
| No "Join voice" button | The Agora values are missing in Render's Environment tab |
| Voice button shows an error | The Agora App ID and certificate are not from the same project |
| Deploy fails at the build step | Check the build log in Render; `npm ci` needs `package-lock.json`, which is in the repo |
| Rooms people made have disappeared | The service restarted or was redeployed; the free plan does not keep files |

Render shows the backend's log under the service → **Logs**. On start it prints the allowed origins and whether voice chat is on.
