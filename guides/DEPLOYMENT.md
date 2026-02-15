# Deploying Contextual Clarity for Discussion Refine

This guide gets the app running on the internet so you can do discussion refine sessions from your phone (or any device).

## What you need

- An **Anthropic API key** (`sk-ant-...`) from [console.anthropic.com](https://console.anthropic.com/)
- A **Fly.io account** (free tier works) — [fly.io/app/sign-up](https://fly.io/app/sign-up)
- The `flyctl` CLI installed on your laptop (one-time setup, then you never need the laptop again)

## Option A: Fly.io (Recommended)

Fly.io is ideal because it supports SQLite on a persistent volume, has a generous free tier, and auto-sleeps your app when you're not using it to save costs.

### 1. Install flyctl

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

Then authenticate:

```bash
fly auth login
```

### 2. Launch the app (first time only)

From the repo root:

```bash
fly launch --no-deploy
```

When prompted:
- **App name**: pick something unique (e.g., `my-contextual-clarity`)
- **Region**: choose the closest to you (e.g., `ewr` for US East, `lhr` for London)
- **Database**: say No to all database offerings (we use SQLite)

This creates the app on Fly but doesn't deploy yet.

> **Important**: After `fly launch`, open `fly.toml` and verify the `app` name matches what you chose. If `fly launch` overwrote the file, restore the `[mounts]` section — it's critical for data persistence:
> ```toml
> [mounts]
>   source = 'cc_data'
>   destination = '/data'
> ```

### 3. Create a persistent volume

The SQLite database needs a persistent volume so your data survives deploys:

```bash
fly volumes create cc_data --size 1 --region <your-region>
```

Replace `<your-region>` with your chosen region (e.g., `ewr`). The `1` means 1 GB, which is more than enough.

### 4. Set your API key

```bash
fly secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 5. Deploy

```bash
fly deploy
```

This builds the Docker image, pushes it, runs migrations, seeds the discussion-refine database (all 52 recall sets), and starts the server. First deploy takes a few minutes for the build.

### 6. Open the app

```bash
fly open
```

Or visit `https://<your-app-name>.fly.dev` in your phone's browser.

### Done

Your app is live. The database persists across deploys. The machine auto-sleeps when idle and wakes on the next request (there may be a ~3 second cold start).

### Useful Fly commands

```bash
fly status           # Check app status
fly logs             # View live logs
fly ssh console      # SSH into the running machine
fly deploy           # Redeploy after code changes
fly scale memory 512 # Adjust memory if needed
```

### Updating the deployment

When you make changes (e.g., tweaking prompts):

```bash
git push                    # Push your changes
fly deploy                  # Redeploy
```

Migrations and seeds run automatically on each deploy (both are idempotent).

---

## Option B: Any VPS with Docker

If you prefer a VPS (DigitalOcean, Linode, Hetzner, etc.):

### 1. Set up the VPS

Get any VPS with Docker installed. A $4-6/month instance (1 GB RAM) is sufficient.

### 2. Clone and deploy

SSH into your VPS, then:

```bash
git clone https://github.com/<your-username>/contextual-clarity.git
cd contextual-clarity
git checkout discussion-refine

# Create your environment file
cat > .env.production << 'EOF'
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_TYPE=sqlite
DATABASE_URL=/data/discussion-refine.db
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_MAX_TOKENS=32768
EOF

# Build and run with Docker
docker build -t contextual-clarity .
docker run -d \
  --name contextual-clarity \
  -p 3000:3000 \
  -v cc-data:/data \
  --env-file .env.production \
  --restart unless-stopped \
  contextual-clarity
```

### 3. Access the app

Visit `http://<your-vps-ip>:3000` in your phone's browser.

For HTTPS, put a reverse proxy (Caddy is simplest) in front:

```bash
# Install Caddy
apt-get install caddy

# Caddyfile (auto-HTTPS with Let's Encrypt)
echo 'your-domain.com {
  reverse_proxy localhost:3000
}' > /etc/caddy/Caddyfile

systemctl restart caddy
```

### Updating

```bash
cd contextual-clarity
git pull
docker build -t contextual-clarity .
docker stop contextual-clarity && docker rm contextual-clarity
docker run -d \
  --name contextual-clarity \
  -p 3000:3000 \
  -v cc-data:/data \
  --env-file .env.production \
  --restart unless-stopped \
  contextual-clarity
```

The `-v cc-data:/data` volume persists your database across container rebuilds.

---

## Option C: VPS with bare Bun (no Docker)

The lightest-weight option. No Docker overhead.

### 1. Install Bun on your VPS

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### 2. Clone, install, build

```bash
git clone https://github.com/<your-username>/contextual-clarity.git
cd contextual-clarity
git checkout discussion-refine

# Install dependencies
bun install
cd web && bun install && cd ..

# Build frontend
bun run build
```

### 3. Configure

```bash
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_TYPE=sqlite
DATABASE_URL=./discussion-refine.db
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_MAX_TOKENS=32768
EOF
```

### 4. Set up the database

```bash
bun run db:migrate
bun run db:seed
```

### 5. Run with systemd (persists across reboots)

```bash
sudo tee /etc/systemd/system/contextual-clarity.service << EOF
[Unit]
Description=Contextual Clarity
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(which bun) run src/api/server.ts
Restart=always
RestartSec=5
EnvironmentFile=$(pwd)/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable contextual-clarity
sudo systemctl start contextual-clarity
```

### 6. Add HTTPS with Caddy

Same as Option B — install Caddy and point it at `localhost:3000`.

---

## Cost estimates

| Option | Monthly cost |
|--------|-------------|
| Fly.io (free tier, auto-sleep) | $0 (within free allowances) |
| Fly.io (always-on) | ~$2-4 |
| DigitalOcean / Hetzner VPS | $4-6 |
| Anthropic API (discussion refine sessions) | Varies by usage |

The main ongoing cost is the Anthropic API usage for Claude during sessions.

---

## Troubleshooting

**App won't start / config error:**
Check logs (`fly logs` or `docker logs contextual-clarity`). Most likely `ANTHROPIC_API_KEY` is not set.

**Database is empty after deploy:**
The entrypoint script runs migrations and seeds automatically. Check logs for seed output. You can force a reseed:
```bash
# Fly.io
fly ssh console -C "cd /app && bun run src/storage/seed.ts --force"

# Docker
docker exec contextual-clarity bun run src/storage/seed.ts --force
```

**Cold start is slow on Fly.io:**
The free tier auto-stops your machine after inactivity. First request after sleep takes ~3 seconds. Set `min_machines_running = 1` in `fly.toml` to keep it always-on (costs ~$2-4/month).

**WebSocket disconnects on phone:**
This can happen on unstable mobile connections. The app has keepalive pings (30s) and should reconnect automatically. If issues persist, try switching between WiFi and cellular.
