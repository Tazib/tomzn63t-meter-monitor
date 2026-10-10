# Deploying on aaPanel with a DuckDNS domain

This guide puts the Energy Tracker on a Linux server that runs **aaPanel**, at a free address like
`https://myhome.duckdns.org`. It takes about an hour the first time.

There are two ways to run it. **Use path A (aaPanel's own Node.js and PostgreSQL, with PM2)**: it fits how
aaPanel works, needs no extra layer and uses the least memory. Path B (Docker) is there if you prefer containers.

What runs:

| Part | What it does |
|---|---|
| Web app | The website (Next.js) on `PORT` (default 3100), reachable only from the server itself |
| Poller | Reads every breaker from Tuya once a minute, stores usage, and stores each bill when a billing cycle ends |
| PostgreSQL | The database |
| Nginx | Public HTTPS entry point (managed by aaPanel), forwards to the web app |

---

## 1. Get a DuckDNS address

1. Go to <https://www.duckdns.org>, sign in, and create a subdomain, e.g. `myhome` → `myhome.duckdns.org`.
2. Set its IP to the server's public IP and click **update ip**.
3. Copy your DuckDNS **token** (top of the page).
4. If the server's public IP can change, keep DuckDNS updated. On the server (aaPanel → **Cron** → *Shell
   Script*, every 5 minutes):

   ```sh
   curl -s "https://www.duckdns.org/update?domains=myhome&token=YOUR_TOKEN&ip=" > /dev/null
   ```

5. If the server sits behind a home router, forward ports **80** and **443** on the router to the server.

Check: `ping myhome.duckdns.org` from your laptop shows the server's public IP.

## 2. Copy the code to the server

In aaPanel → **Terminal** (or SSH):

```sh
cd /www/wwwroot
git clone <your repository URL> energy
cd energy
cp .env.example .env
```

(No Git remote yet? Copy the project folder up with aaPanel's **Files** → Upload, without `node_modules`,
`.next` and `.env`.)

## 3. Fill in `.env`

Edit `/www/wwwroot/energy/.env` (aaPanel **Files** has an editor):

| Setting | Value |
|---|---|
| `BETTER_AUTH_SECRET` | A long random string: run `openssl rand -base64 32` and paste the output |
| `BETTER_AUTH_URL` | `https://myhome.duckdns.org` (your real address, with https) |
| `PORT` | **PM2 only:** a free port for the app, default `3100`. Check with `ss -ltn \| grep :3100` (no output = free) |
| `TUYA_BASE_URL` | `https://openapi.tuyaeu.com` |
| `TUYA_ACCESS_ID` / `TUYA_ACCESS_SECRET` | From the Tuya developer site → Cloud → your project → Overview |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | The first super admin login (password 8+ characters) |
| **Optional:** `DEYE_APP_ID` / `DEYE_APP_SECRET` | Deye inverters: from developer.deyecloud.com → **Application**. Each profile then connects its own Deye login on the Devices page |
| **Docker only:** `POSTGRES_PASSWORD` | A strong password for the database (letters and digits only keep the URL simple) |
| **PM2 only:** `DATABASE_URL` | `postgres://smarthome:<db password>@localhost:5432/smarthome` (set up in B1) |

Keep this file private. It holds the Tuya secret (and the Deye app secret, if set).

---

## Path A: aaPanel Node.js + PM2 (recommended)

### A1. Database

aaPanel → **App Store** → install **PostgreSQL** (version 14 or newer). Then aaPanel → **Databases** →
PgSQL → **Add database**:

- Database name: `smarthome`
- Username: `smarthome`
- Password: a strong password. Put it in `DATABASE_URL` in `.env`.

### A2. Node.js and PM2

aaPanel → **App Store** → install **Node.js version manager**, then install Node **22** from it. In the
terminal:

```sh
node -v          # v22.x
npm install -g pm2
```

### A3. Build

```sh
cd /www/wwwroot/energy
npm ci
npm run build
npm run db:migrate
npm run seed:admin
npm run seed:tariffs
```

### A4. Start and keep it running after reboots

```sh
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # run the command it prints, once
```

Check:

```sh
pm2 status                    # energy-web and energy-poller "online"
pm2 logs energy-poller        # a line every minute (Ctrl+C to stop)
curl -I http://127.0.0.1:3100/login   # your PORT
```

---

## Path B: Docker (optional)

### B1. Install Docker

aaPanel → **App Store** → install **Docker** (it includes Docker Compose). Check in the terminal:

```sh
docker compose version
```

### B2. Build and start

```sh
cd /www/wwwroot/energy
docker compose up -d --build
```

The first build takes a few minutes.

### B3. Create the tables and the first data

```sh
docker compose run --rm app npm run db:migrate
docker compose run --rm app npm run seed:admin
docker compose run --rm app npm run seed:tariffs
```

### B4. Check it's running

```sh
docker compose ps                  # db, app and poller should all be "running"
docker compose logs -f poller      # a line every minute: "polled N devices…"  (Ctrl+C to stop)
curl -I http://127.0.0.1:3000/login   # should print HTTP/1.1 200
```

The poller logs `polled 0 devices` until devices are added in the app. That's expected.

Continue with **step 4 (Nginx + HTTPS)**.

---

## 4. Nginx and HTTPS (both paths)

1. aaPanel → **Website** → **Add site**
   - Domain: `myhome.duckdns.org`
   - PHP: **Pure static** (no PHP), no database
2. Open the new site → **SSL** → **Let's Encrypt** → tick the domain → **Apply**.
   Then turn on **Force HTTPS**.
3. Open the site → **Reverse proxy** → **Add reverse proxy**
   - Name: `energy`
   - Target URL: `http://127.0.0.1:3100` (your `PORT`; Docker uses `3000`)
   - Sent domain: `$host`
4. In the reverse proxy's **Config file**, make sure the `location /` block contains these lines. Add
   the missing ones; the last line lets pages stream instead of waiting for the whole page:

   ```nginx
   proxy_set_header Host $host;
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Proto $scheme;
   proxy_buffering off;
   ```

5. Open `https://myhome.duckdns.org` and log in with the `SEED_ADMIN_*` account.

aaPanel renews the Let's Encrypt certificate automatically.

## 5. First-time setup in the app

1. **Profiles**: create a profile (e.g. "Home") and paste the Smart Life account UID. All current breakers
   are on `eu1771925359819HEIWY`. For a second Smart Life account, link it under Tuya developer site → Cloud
   → project → Devices → **Link App Account**, then copy its UID from there.
2. **Users**: create logins for the family and add them to the profile.
3. **Tariffs**: check the BERC LT-A rates are right. When BERC changes them, use **Add new rates** with the
   start date; don't edit old rates, because past bills were made with them.
4. **Meters**: add each utility meter with its tariff plan, sanctioned load (on the electricity bill),
   meter rent, prepaid rebate % and the day the billing cycle starts.
5. **Devices**: add each 63T breaker to its meter. For the solar breaker, pick type **Solar** and choose
   the grid breaker that feeds the inverter as its **Inverter input**. All of this can be changed later
   under the breaker's **Settings** on the Devices page.
6. **Solar inverters (Deye)**: with `DEYE_APP_ID` / `DEYE_APP_SECRET` set, each profile's member opens
   Devices → **Solar inverters**, connects their own Deye Cloud login (checked with Deye; only a hash is
   stored), and links their station. Pick the meter it draws grid power through, and say whether a tracked
   breaker already measures its grid input. If not, the app adds Deye's "bought from grid" figure to that
   meter. The home page then gets a **Solar** tab; no solar breaker is needed (Deye's figures replace any
   solar breaker on the same meter). The poller loads the last year of daily history on its next run.

Usage counts from the moment a breaker is added. When adding a meter partway through a month, fill in
**Units used this cycle so far** from the meter so the first bill is complete. For prepaid meters, open the
meter and enter the **balance** the meter shows, then log each **recharge** as you make it.

## 6. Install it on phones

The site can be installed like an app (opens full screen, own icon):

- **Android (Chrome)**: open the site, tap the ⋮ menu → **Install app** (or **Add to Home screen**).
- **iPhone (Safari)**: open the site, tap **Share** → **Add to Home Screen**.

This needs the HTTPS address from step 4; it doesn't work over plain `http://`.

---

## Updating to a new version

**Docker**

```sh
cd /www/wwwroot/energy
git pull
docker compose up -d --build
docker compose run --rm app npm run db:migrate
```

**PM2**

```sh
cd /www/wwwroot/energy
git pull
npm ci
npm test            # optional: checks the bill maths before going live
npm run build
npm run db:migrate
pm2 restart all
```

## Backups

The database holds everything. Back it up daily with aaPanel → **Cron** → *Shell Script*, daily at 03:00:

```sh
# Docker
docker compose -f /www/wwwroot/energy/docker-compose.yml exec -T db \
  pg_dump -U smarthome smarthome | gzip > /www/backup/energy-$(date +\%F).sql.gz
# PM2 / aaPanel Postgres
# PGPASSWORD='<db password>' pg_dump -h localhost -U smarthome smarthome | gzip > /www/backup/energy-$(date +\%F).sql.gz
find /www/backup -name 'energy-*.sql.gz' -mtime +30 -delete
```

Restore (Docker): `gunzip -c energy-DATE.sql.gz | docker compose exec -T db psql -U smarthome smarthome`

## Troubleshooting

| Symptom | Check |
|---|---|
| Site shows **502 Bad Gateway** | The web app isn't running: `docker compose ps` / `pm2 status`, then its logs |
| Login works on `127.0.0.1` but not on the domain | `BETTER_AUTH_URL` must be exactly `https://myhome.duckdns.org`. Restart after changing `.env` |
| Dashboard says "No readings yet today" | Poller logs. `Tuya token: …` errors mean the access ID/secret are wrong or the Tuya cloud trial expired (renew it on the Tuya developer site → Cloud → project → **Service API** → IoT Core) |
| "permission deny" when adding devices | The profile's UID isn't linked to the Tuya project, or it's on a different data centre |
| A breaker shows "Offline" | The breaker lost Wi-Fi; check it in the Smart Life app. Usage while offline is counted when it comes back |
| Disk filling up | Per-minute readings are kept `READINGS_RETENTION_DAYS` (default 180) days; lower it in `.env` |

Tuya's free cloud plan has to be renewed periodically on the developer site. If the poller suddenly logs
token or permission errors, check that first.
