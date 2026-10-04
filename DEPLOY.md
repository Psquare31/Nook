# Deploying Nook

The backend runs on Render's free plan and the frontend on Vercel. People sign in with Google to build rooms. An uptime monitor pings the backend's `/health` endpoint so the free service never goes to sleep.

```
Browser ── https ──> Vercel (the React build) ── "Sign in with Google" ──> Google
   │
   └── wss://<RENDER_HOST>/socket.io ──> Render web service (Node: Express + Socket.IO)
                                              ▲
Uptime monitor ── GET /health every 5 min ────┘
```

- Render provides HTTPS and WebSockets on its `onrender.com` address. There is no server, firewall or certificate to manage.
- Google sign-in happens in the browser. The backend checks the token Google issues and gives the browser its own 30-day session, so no cookies cross between the Vercel and Render domains.
- Voice audio goes between the browsers and Agora, not through Render.

Placeholders used below:

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `<RENDER_URL>` | Address Render gives the backend | `https://nook-a1b2.onrender.com` |
| `<VERCEL_URL>` | Address Vercel gives the frontend | `https://nook.vercel.app` |
| `<CLIENT_ID>` | Google OAuth client id | `1234-abcd.apps.googleusercontent.com` |

## Know the free plan before you start

- **It sleeps without traffic.** Render stops a free service after 15 minutes without an HTTP request or WebSocket message, and waking it takes about a minute. The uptime monitor in step 6 prevents this.
- **Saved rooms do not survive.** The free plan's disk is wiped on every deploy and every restart, and Render may restart a free service at any time. After that the world is back to the three starter rooms. Sign-in sessions, chat and voice are unaffected; only rooms people created are lost.
- **750 free hours a month per workspace.** One service running all month uses 720 to 744 of them. A second free service in the same workspace would run both out before the month ends.
- **One instance only.** That is what this backend needs anyway, since the world lives in one process's memory.

## 1. Create a Google OAuth client

1. Open the Google Cloud console at <https://console.cloud.google.com> and create a project (or pick one).
2. Go to **Google Auth Platform** → **Branding** and fill in the app name, support email and developer contact.
3. **Audience:** choose External. While the publishing status is Testing, only the Google accounts listed as test users can sign in. Add the accounts you and your testers will use, or publish the app.
4. **Clients** (<https://console.cloud.google.com/auth/clients>) → **Create client** → application type **Web application**.
5. Under **Authorized JavaScript origins** add:
   - `http://localhost`
   - `http://localhost:5173`

   Step 4 adds the Vercel address once you have it. No redirect URIs are needed.
6. Create it and copy the client id. That is `<CLIENT_ID>`. The client secret is not used.

To use sign-in locally, put the client id in `.env` as `GOOGLE_CLIENT_ID`, next to a `SESSION_SECRET` of 32 or more random characters, and restart `npm run dev`.

## 2. Create the backend on Render

1. Sign up at <https://render.com> with your GitHub account.
2. Choose **New** → **Blueprint**, and connect the `Psquare31/Nook` repository. Render reads `render.yaml` from the repo and generates `SESSION_SECRET` by itself.
3. It asks for the values marked secret in that file:
   - `CLIENT_ORIGIN`: leave empty for now. Step 4 fills it in.
   - `GOOGLE_CLIENT_ID`: `<CLIENT_ID>`. Without it nobody can sign in, so nobody can build. Render does not read your local `.env`; the value has to be entered here.
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
| Environment variables | `NODE_VERSION` = `22`, `SESSION_SECRET` = a random string of 32+ characters, plus the four above |

The region cannot be changed after the service is created. Pick the one closest to your users.

When the deploy finishes, copy the service address from the top of its page. That is `<RENDER_URL>`. Open `<RENDER_URL>/health` in a browser. It should show `{"ok":true,...}`, with `"signIn":true` once the Google client id is set and `"voice":true` with Agora values.

## 3. Put the frontend on Vercel

1. At <https://vercel.com/new>, import the `Psquare31/Nook` repository. Vercel detects Vite; leave the build settings alone.
2. Before deploying, add an environment variable: `VITE_SERVER_URL` = `<RENDER_URL>`. Then deploy.
3. Copy the address Vercel gives the site. That is `<VERCEL_URL>`.

`VITE_SERVER_URL` is read when the frontend is built, so after changing it, redeploy. `VITE_` variables end up in the JavaScript every visitor downloads, so never put a secret in one. The Google client id is not one either: the frontend gets it from the backend.

## 4. Connect the pieces

1. **Google:** in the OAuth client from step 1, add `<VERCEL_URL>` to **Authorized JavaScript origins** and save. Google can take a few minutes to apply it.
2. **Render:** open the service → **Environment**, set `CLIENT_ORIGIN` to `<VERCEL_URL>` and save. Render redeploys with the new value.

`CLIENT_ORIGIN` must match the site's address exactly, including `https://`. Vercel preview deployments have other addresses; to use sign-in and connect from them, add each one in both places, separated by commas in `CLIENT_ORIGIN`.

## 5. Keep the session secret stable

Sessions stay valid for 30 days and survive restarts, as long as `SESSION_SECRET` does not change. Changing it signs everyone out, which is also the way to force that if a secret ever leaks.

## 6. Keep it awake with an uptime monitor

Use any free uptime service, for example UptimeRobot (<https://uptimerobot.com>) or cron-job.org (<https://cron-job.org>).

- **Type:** HTTP(s)
- **URL:** `<RENDER_URL>/health`
- **Interval:** 5 or 10 minutes. Anything shorter than 15 minutes keeps the service awake.

The endpoint answers both GET and HEAD, is never cached, and only reads counters, so pinging it costs nothing. The monitor also tells you by email when the backend is down.

## 7. Check it

Open `<VERCEL_URL>` in two browsers that do not share storage, for example a normal window and an Incognito window.

- The top bar says `2 online`.
- **Sign in with Google** appears in the top bar. After signing in it shows your Google name and a Sign out link.
- In **Edit world**, a signed-in window can create rooms. A guest window sees "Sign in with Google to build rooms".
- In DevTools → Network → WS there is a `socket.io` row with status 101.
- With Agora set up, **Join voice** appears in the top bar.

## Updating later

Push to the `main` branch on GitHub. Render rebuilds and redeploys the backend, and Vercel rebuilds the frontend. Browsers reconnect by themselves after the backend restarts and stay signed in. Created rooms are reset (see the free-plan notes above).

## If something fails

| Symptom | Likely cause |
| --- | --- |
| The site says "Offline · retrying" | `VITE_SERVER_URL` is wrong or missing, or the frontend was not redeployed after setting it |
| `/health` works but the site cannot connect | `CLIENT_ORIGIN` does not match `<VERCEL_URL>` exactly |
| No **Sign in with Google** button, and the editor says "Building is off" | `GOOGLE_CLIENT_ID` is missing in Render's Environment tab, or the backend log says the id or `SESSION_SECRET` was rejected. `<RENDER_URL>/health` shows `"signIn":false` |
| No **Sign in with Google** button, and anyone can build | The backend is running a commit from before sign-in. `<RENDER_URL>/health` has no `"building"` field. Use Manual Deploy → Deploy latest commit |
| Google shows "origin is not allowed" or error 400 | `<VERCEL_URL>` (or `http://localhost:5173` locally) is missing from Authorized JavaScript origins, or was just added and is not active yet |
| Google says access is blocked or the app is in testing | The account is not a test user and the app is not published (step 1.3) |
| Console shows "[GSI_LOGGER]: Failed to open popup window" | The browser blocked the window Google opens. Use a normal Chrome or Edge tab, not an editor's preview pane, and allow pop-ups for the site. In Chrome the button uses the built-in account chooser and needs no pop-up when you are signed in to Google |
| "Google sign-in could not be verified" | The client id in Render is not the one the button was made for |
| Everyone was signed out | `SESSION_SECRET` changed |
| The first visit takes about a minute | The service was asleep. Check that the uptime monitor is running and pointed at `/health` |
| "Mixed content" in the browser console | `VITE_SERVER_URL` starts with `http://` instead of `https://` |
| No "Join voice" button | The Agora values are missing in Render's Environment tab |
| Voice button shows an error | The Agora App ID and certificate are not from the same project |
| Deploy fails at the build step | Check the build log in Render; `npm ci` needs `package-lock.json`, which is in the repo |
| Rooms people made have disappeared | The service restarted or was redeployed; the free plan does not keep files |

Render shows the backend's log under the service → **Logs**. On start it prints the allowed origins and whether voice chat and Google sign-in are on.
