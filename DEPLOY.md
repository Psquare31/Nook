# Deploying Nook

This puts the backend on an Oracle Cloud Always Free VM and the frontend on Vercel. It assumes no Oracle Cloud experience. Every step has the exact commands.

```
Browser ── https ──> Vercel (the React build)
   │
   └── wss://<DOMAIN>/socket.io ──> Oracle VM (Ubuntu 24.04, Ampere A1)
                                      Nginx on :80 and :443, Let's Encrypt certificate
                                        └─> Node (Express + Socket.IO) on 127.0.0.1:3001, kept alive by PM2
```

- Only ports 22, 80 and 443 are open. Node is never reachable from outside directly.
- WebSockets need no extra port. The connection starts as an HTTPS request on 443 and upgrades.
- HTTPS is not optional. A Vercel page is HTTPS, and browsers refuse insecure sockets and microphone access from a secure page.
- Voice audio goes between the browsers and Agora, not through the VM.

Placeholders used below:

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `<PUBLIC_IP>` | The VM's public IP address | `140.238.12.34` |
| `<DOMAIN>` | Hostname of the backend | `nook-api.duckdns.org` |
| `<VERCEL_URL>` | Address of the frontend | `https://nook.vercel.app` |
| `<EMAIL>` | Your email, for certificate expiry notices | |

Steps 1 to 7 need nothing from this repo beyond a clone. Steps 8 onward bring the app up.

## 1. Oracle account

1. Sign up at <https://www.oracle.com/cloud/free/>. A card is needed for verification. The home region cannot be changed later, so pick the one closest to your users.
2. The Always Free allowance for the Ampere A1 shape is 2 OCPUs and 12 GB of memory in total, plus 200 GB of disk.
3. Oracle may reclaim an Always Free VM that stays idle for 7 days, meaning CPU, network and memory all under 20%. A small project qualifies. Upgrading the account to Pay As You Go (Billing → Upgrade) is the commonly reported way to avoid this; you are still not charged while you stay inside the free limits. Add a budget alert if you do.

## 2. SSH key

On your own computer, in PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh" | Out-Null
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\oracle_nook"
Get-Content "$env:USERPROFILE\.ssh\oracle_nook.pub"
```

Copy the line it prints.

## 3. Create the VM

In the Oracle console: Compute → Instances → Create instance.

- **Image:** Canonical Ubuntu 24.04
- **Shape:** Ampere → `VM.Standard.A1.Flex`, 1 OCPU, 6 GB memory
- **Networking:** create a new virtual cloud network and a new public subnet, and assign a public IPv4 address
- **SSH keys:** choose "Paste public key" and paste the line from step 2

Create it, wait for the state Running, and copy the public IP address.

If you get "Out of host capacity", try another availability domain or try again later.

## 4. Open ports in Oracle's network

Networking → Virtual cloud networks → your network → Security Lists → Default Security List → Add Ingress Rules. Add two rules and leave Stateless unchecked:

| Source CIDR | IP protocol | Destination port range |
| --- | --- | --- |
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

Port 22 is already open. Do not open 3001.

## 5. Connect and open the VM's own firewall

```powershell
ssh -i "$env:USERPROFILE\.ssh\oracle_nook" ubuntu@<PUBLIC_IP>
```

Oracle's Ubuntu image blocks everything except SSH with its own iptables rules. This is separate from step 4, and both are needed:

```bash
sudo apt update && sudo apt upgrade -y
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo iptables -L INPUT -n --line-numbers
```

In the last output, the two ACCEPT lines for ports 80 and 443 must be above the REJECT line. Do not enable `ufw` on this image.

## 6. Install Node, Nginx and PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs nginx git
sudo npm install -g pm2
node -v && nginx -v && pm2 -v
```

Open `http://<PUBLIC_IP>` in a browser. The "Welcome to nginx" page proves both firewalls are open.

## 7. Point a hostname at the VM

Let's Encrypt issues certificates for names, not for bare IP addresses.

- **With your own domain:** add an A record, for example `nook-api` → `<PUBLIC_IP>`.
- **Without one:** create a free subdomain at <https://www.duckdns.org> and set its IP to `<PUBLIC_IP>`.

Check it from the VM:

```bash
getent hosts <DOMAIN>
```

It should print `<PUBLIC_IP>`.

## 8. Get the app and configure it

```bash
cd ~
git clone https://github.com/Psquare31/Nook.git nook
cd nook
npm ci
npm run build:server
mkdir -p ~/nook-data
nano .env
```

Put this in `.env`, then save with Ctrl+O, Enter, Ctrl+X:

```
HOST=127.0.0.1
PORT=3001
DATA_DIR=/home/ubuntu/nook-data
CLIENT_ORIGIN=
AGORA_APP_ID=your-agora-app-id
AGORA_APP_CERTIFICATE=your-agora-app-certificate
```

`CLIENT_ORIGIN` stays empty until step 13. Leave the two Agora lines out to run without voice.

```bash
chmod 600 .env
```

`.env` is ignored by git and exists only on the VM. The Agora certificate is a secret: it belongs in this file and nowhere else.

## 9. Run it with PM2

```bash
pm2 start ecosystem.config.cjs
pm2 status
curl http://127.0.0.1:3001/health
pm2 startup
```

`pm2 startup` prints a line that starts with `sudo env PATH=`. Copy that line, run it, then:

```bash
pm2 save
sudo reboot
```

Connect again after a minute and run `pm2 status`. `nook` should be `online`. PM2 now restarts the backend after a crash and after a reboot.

## 10. Nginx reverse proxy

```bash
cd ~/nook
sudo cp deploy/nginx.conf /etc/nginx/sites-available/nook
sudo sed -i 's/YOUR_DOMAIN/<DOMAIN>/' /etc/nginx/sites-available/nook
sudo ln -s /etc/nginx/sites-available/nook /etc/nginx/sites-enabled/nook
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
curl http://<DOMAIN>/health
```

The last command should print `{"ok":true,...}`.

## 11. HTTPS with Let's Encrypt

```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d <DOMAIN> -m <EMAIL> --agree-tos --no-eff-email --redirect
sudo certbot renew --dry-run
```

Certbot adds the certificate to the Nginx site, redirects HTTP to HTTPS, and renews the certificate on its own.

## 12. Check WebSockets through Nginx

```bash
curl https://<DOMAIN>/health
curl -i -N --http1.1 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://<DOMAIN>/socket.io/?EIO=4&transport=websocket"
```

The second command should start with `HTTP/1.1 101 Switching Protocols`. Press Ctrl+C to leave it.

## 13. Put the frontend on Vercel

1. At <https://vercel.com/new>, import the `Psquare31/Nook` repository. Vercel detects Vite; leave the build settings alone.
2. Before deploying, add an environment variable: `VITE_SERVER_URL` = `https://<DOMAIN>`. Then deploy.
3. Note the address Vercel gives the site. That is `<VERCEL_URL>`.
4. On the VM, set that address as the only allowed origin and restart:

```bash
cd ~/nook
sed -i 's|^CLIENT_ORIGIN=.*|CLIENT_ORIGIN=<VERCEL_URL>|' .env
pm2 restart nook
pm2 logs nook --lines 6 --nostream
```

The log should show `allowed origins: <VERCEL_URL>` and, with Agora set up, `voice chat: on`.

Open `<VERCEL_URL>` in two browsers. The top bar should say `2 online`. In DevTools → Network → WS there is a `socket.io` row with status 101.

Things to know:

- `VITE_SERVER_URL` is read when the frontend is built. After changing it in Vercel, redeploy.
- `VITE_` variables are public. They are baked into the JavaScript every visitor downloads, so never put a secret in one.
- `CLIENT_ORIGIN` must match the site's address exactly, including `https://`. Vercel preview deployments have other addresses and are refused unless you add them, separated by commas.

## Updating later

After pushing new commits to GitHub, Vercel rebuilds the frontend by itself. For the backend, on the VM:

```bash
cd ~/nook && bash deploy/update.sh
```

That pulls, installs, rebuilds, restarts under PM2 and prints the health check. The restart takes a second or two. Browsers reconnect on their own, and rooms come back from `~/nook-data/world.json`.

## Day to day

| Task | Command |
| --- | --- |
| Is it running? | `pm2 status` |
| Recent log lines | `pm2 logs nook --lines 50 --nostream` |
| Restart | `pm2 restart nook` |
| Back up the world | `cp ~/nook-data/world.json ~/world-backup.json` |
| Reset the world | `pm2 stop nook && rm ~/nook-data/world.json && pm2 start nook` |

## If something fails

| Symptom | Likely cause |
| --- | --- |
| `http://<PUBLIC_IP>` does not load | A rule is missing in step 4 or step 5 |
| `502 Bad Gateway` | Node is not running. Check `pm2 logs nook` |
| Site says "Offline · retrying" | `VITE_SERVER_URL` is wrong or missing, or the frontend was not redeployed after setting it |
| Socket fails with 400, or DevTools shows no 101 | The three WebSocket lines are missing from the Nginx site |
| Health check works but the site cannot connect | `CLIENT_ORIGIN` does not match the Vercel address |
| "Mixed content" in the browser console | `VITE_SERVER_URL` is not `https://` |
| Certbot fails | The hostname does not point at the VM yet, or port 80 is closed |
| No "Join voice" button | The Agora values are missing from `.env`, or the backend was not restarted |
| Voice button shows an error | The Agora App ID and certificate do not belong to the same project |
