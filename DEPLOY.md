# Deployment — Designbridge auf Railway

Stand: Vorbereitet am 2026-07-14. Die App ist deploy-fertig; die Schritte unten
brauchen deinen Railway-Login und macht daher Rob selbst.

## Architektur in Produktion

Ein einziger Service: der Express-Server (`server/index.js`) liefert sowohl die
API (`/api/*`) als auch das gebaute Web-Frontend (`web/dist`) aus — same-origin,
kein CORS-Problem. Railway injiziert `PORT` automatisch, der Server liest ihn.

```
Railway-Service
├── Build:  npm install && npm run build   (baut web/dist via Vite)
└── Start:  npm start                       (NODE_ENV=production node server/index.js)
             └── Express :PORT
                  ├── /api/*        → Scan / Figma-Export / Interpret
                  └── /*            → web/dist (SPA)
```

## Was ohne API-Key läuft

- ✅ URL-Import, Repo-Import, Figma-Export, Library, Export (CSS/Tailwind/tokens.json)
- ⚠️ Bild-Import (Auto-Scan) & „Mit KI vertiefen" brauchen EINEN KI-Key:
  - **`GEMINI_API_KEY` (empfohlen): GRATIS** — Key auf https://aistudio.google.com
    erstellen (Google-Login, keine Kreditkarte, kein Guthaben nötig).
  - oder `ANTHROPIC_API_KEY`: pay-per-use, braucht Guthaben auf console.anthropic.com.
  - ganz ohne Key: `DEMO_FALLBACK=1` (Bild-Scan & Interpretation liefern Demo-Daten).

## Schritte (Rob, im Railway-Dashboard)

1. **railway.app** → einloggen (GitHub-Login) → **New Project**.
2. **Deploy from GitHub repo** → das Designbridge-Repo wählen → Branch `main`.
3. Railway erkennt `railway.json` automatisch (Build/Start/Healthcheck stehen drin).
4. **Variables** (Tab im Service) setzen:
   - `NODE_ENV=production`  *(falls Railway es nicht schon selbst setzt)*
   - empfohlen `GEMINI_API_KEY=AIza…`  *(GRATIS — Bild-Import/KI-Vertiefen laufen echt)*
   - optional `ANTHROPIC_API_KEY=sk-ant-…`  *(Alternative, pay-per-use)*
   - optional `DEMO_FALLBACK=1`  *(ganz ohne Key — Bild-Import/Interpretation als Demo)*
   - `PORT` **nicht** setzen — Railway vergibt den selbst.
5. **Deploy** starten. Railway baut (`npm run build`) und startet (`npm start`).
6. **Generate Domain** (Settings → Networking) → öffentliche URL.
7. **Live-Smoke-Test** auf der URL: `/api/health` muss `{"status":"ok"}` liefern;
   dann in der App URL-Import + Export durchklicken.

## Lokaler Prod-Test (optional, vor dem Deploy)

```bash
npm run build                 # baut web/dist
PORT=3047 npm start           # startet im Prod-Modus, serviert web/dist + /api
# → http://localhost:3047 öffnen: App + API auf EINEM Port
```

## Env-Variablen (Übersicht)

| Variable | Pflicht | Zweck |
|---|---|---|
| `PORT` | nein (Hoster injiziert) | Server-Port |
| `NODE_ENV=production` | ja (für Static-Serving) | aktiviert web/dist-Auslieferung |
| `GEMINI_API_KEY` | nein | Bild-Import & KI-Vertiefen — GRATIS-Tier |
| `GEMINI_MODEL` | nein | Gemini-Modell (Default `gemini-2.5-flash`) |
| `ANTHROPIC_API_KEY` | nein | Alternative zu Gemini, pay-per-use |
| `AI_PROVIDER` | nein | `gemini`/`anthropic` erzwingen (bei beiden Keys) |
| `DEMO_FALLBACK=1` | nein | Bild-Scan & Interpretation als Demo statt API |
| `CORS_ORIGIN` | nein | nur bei getrennten Domains |
