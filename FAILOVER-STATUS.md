# Failover-Status — Zweit-Account als Assistenzsystem

**Zweck:** Dieser Cloudcode-Account (Branch `claude/cloudcode-account-failover-rp0pr8`) soll
stellvertretend an derselben Datenstruktur weiterarbeiten können, wenn der Haupt-Account
ausfällt (z. B. Token-Burn). Diese Datei hält fest, was übernommen werden kann und was nicht.

_Letzter Check: 20.07.2026 — Basis-Commit `f523c6c`._

## Übernahme-Bereitschaft

| Bereich | Stand |
|---|---|
| Repo / Datenstruktur (`robbiekraus/designbridge`) | ✅ voll synchron — Branch == `origin/main`, sauberer Baum |
| Kontext-Dokumente (`CLAUDE.md`, `RESUME.md`, `RESUME-ARCHIVE.md`) | ✅ im Repo, vollständig lesbar |
| Methodik „Superpowers" (`docs/superpowers/specs` + `plans`) | ✅ im Repo — kein Plugin, sondern Spec→Plan→Code-Doku |
| Git-Push/Pull über Proxy | ✅ funktioniert |
| Figma / Miro / Notion / GitHub (MCP) | ✅ verbunden |
| Composio (MCP) | ⚠️ braucht Autorisierung über claude.ai-Connector-Einstellungen (nicht in dieser Session möglich) |
| `.claude/skills/figma-e2e-test` | ❌ **nicht im Repo** — lebt nur lokal auf dem Haupt-Account. Failover kann den autonomen Figma-E2E-Testlauf NICHT ausführen, bis die Skill eingecheckt ist. |

## So übernimmt dieser Account (Handoff-Prozedur)

1. `git fetch origin && git log --oneline -10` — neuesten Stand ziehen.
2. `RESUME.md` lesen → aktueller Ist-Stand + „Aktives Ziel / Nächste Schritte".
3. `git status` prüfen — nur was **committed + gepusht** ist, ist übernehmbar.
   Uncommittete Arbeit des Haupt-Accounts ist für diesen Account unsichtbar und verloren.
4. Zwei-Stränge-Regel beachten: `main` = Präsentation (Push = Auto-Deploy auf Railway),
   `experiment/rekursive-zerlegung` = Sandbox (kein Deploy).
5. Arbeitsmodus/Regeln aus `CLAUDE.md` + `RESUME.md` gelten unverändert (keine PRs, direkt auf
   main; Modell bewusst wählen; nie ohne Briefing designen).

## Damit Failover verlustfrei bleibt (Empfehlungen)

- **Häufig committen + pushen.** Für Failover gilt: nach jedem verifizierbaren Schritt pushen,
  nicht erst am Session-Ende bündeln. Was nicht in Git steht, kann der Zweit-Account nicht sehen.
- **`.claude/` einchecken** (mind. `skills/figma-e2e-test/`), damit lokale Skills failover-fähig sind.
  Falls bewusst lokal: hier notieren, was verloren geht.
- **`RESUME.md` als lebendes Handoff-Dokument** führen — bei jedem Checkpoint aktualisieren,
  nicht nur am Schluss.

## Bekannte Lücke: Railway (geprüft 21.07.2026)

- **Kein direkter Railway-Zugang** vom Failover-Account: keine Railway-CLI, kein `RAILWAY_TOKEN`
  in der Umgebung, kein Railway-Connector.
- **Prod-URL nicht erreichbar:** Die Netzwerk-Policy der Cloud-Umgebung blockt
  `designbridge-production.up.railway.app` (Proxy 403 auf CONNECT). Kein Healthcheck,
  kein Live-Smoke-Test, keine Logs von hier aus.
- **Deployen geht trotzdem:** Push auf `main` = Auto-Deploy (Git-Push funktioniert nachweislich).
  Der Arbeits-Workflow ist voll intakt — nur die Prod-Beobachtung fehlt.
- **Fix, falls gewünscht (Rob):**
  1. Netzwerk-Policy der Claude-Code-Web-Umgebung um `*.up.railway.app` erweitern
     (→ Healthchecks/Smoke-Tests möglich).
  2. Optional `RAILWAY_TOKEN` als Env-Var im Environment hinterlegen
     (→ Logs/Deploy-Status über die Railway-API abfragbar).
- Bis dahin: Nach jedem Deploy aus dieser Umgebung muss Rob (oder der Haupt-Account) kurz
  selbst prüfen, ob die App oben ist.
