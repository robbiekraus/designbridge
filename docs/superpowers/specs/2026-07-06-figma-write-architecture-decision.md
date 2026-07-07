# Figma-Schreibrichtung — Architektur-Optionen & Entscheidung

**Datum:** 2026-07-06 (nachmittags/abends)
**Status:** Entscheidungs-Dokument (Recherche + Live-Beweis abgeschlossen; Produkt-Entscheidung offen)
**Anlass:** Rob bestand (korrekt) darauf, dass Schreiben nach Figma ohne eigenes Plugin möglich sein muss. Frühere Behauptung „Plugin zwingend" war FALSCH — hier der verifizierte, vollständige Stand.

## Verifizierte Fakten (Figma-Doku, Juli 2026)

| Weg | schreibt? | Was | Plan | in DesignBridge-App einbettbar? |
|---|---|---|---|---|
| REST-API lesen | nein (nur lesen) | Tokens/Inventar aus Figma | jeder (Pro ✓) | ja — das ist der Figma-**Ingester** (bereits gespec't) |
| REST **Variables** schreiben | ja | nur Variables (Farben/Spacing als Variablen) | **nur Enterprise** | ja, aber nur für Enterprise-Kunden |
| REST Styles/Nodes schreiben | — | existiert nicht | — | — |
| **Figma Remote-MCP** (`mcp.figma.com/mcp`) | **ja** | Frames, Components, Variables, **Styles** | alle Seats/Pläne (Ratenlimits nach Plan) | **NEIN — Scope `mcp:connect` nur für von Figma freigegebene Clients** |
| Eigenes Figma-Plugin | ja | alles | jeder | ja (haben wir gebaut) |

**Kernbefund:** Figmas Remote-MCP kann plugin-frei echte Styles/Components schreiben (LIVE bewiesen 06.07.: Datei `fE1iyfh3nACMao43RnUJY6` in Robs Pro-Account, Tokens als `DesignBridge/Color/*`-Paint- + `DesignBridge/Text/*`-Text-Styles). ABER: Der OAuth-Scope `mcp:connect` ist **nicht** für beliebige Dritt-OAuth-Apps verfügbar — nur freigegebene Clients (VS Code, Cursor, Claude Code, Figma-Agent/Make) dürfen sich verbinden. Der Beweis gelang, WEIL **Claude Code ein freigegebener Client ist**. **DesignBridge-die-App kann sich derzeit NICHT als Figma-MCP-Client registrieren.** (Quelle: Figma Forum „mcp:connect scope isn't available for general third-party OAuth apps"; developers.figma.com/docs/figma-mcp-server.)

## Was das für die Produkt-Optionen heißt

- **Option A — Agent-vermittelt (funktioniert HEUTE, plugin-frei, keine App-Plumbing):** Der Nutzer treibt das Schreiben über einen freigegebenen MCP-Client (Claude Code, Cursor, Figma-Agent/Make) und füttert ihn mit DesignBridges Token-Export (`designbridge-figma.json`). DesignBridges Job = den Export erzeugen (schon gebaut). „Nach Figma schreiben" macht der Agent. **Genau das haben wir demonstriert.** Grenze: nur für Nutzer, die so einen Client haben; kein In-App-Knopf.
- **Option B — Eigenes Plugin (gebaut, Auto-Fetch):** universell (jeder Plan), In-App-nah, aber ein Plugin nötig. Bleibt der einzige *app-eingebettete, universelle* Schreibweg.
- **Option C — REST Variables (nur Enterprise):** app-eingebettet & plugin-frei, aber nur Enterprise-Kunden; nur Variables. Kandidat für ein späteres Enterprise-Feature.
- **Option D — DesignBridge als eigener MCP-Client:** aktuell von Figma blockiert (`mcp:connect` nicht für Dritte). NICHT baubar, bis Figma das öffnet.

## Empfehlung

Kein „entweder/oder", sondern nach Zielgruppe:
1. **Für Robs eigenen Workflow & Power-User (jetzt):** Option A — plugin-frei über einen freigegebenen MCP-Client. Kostet null zusätzliche Bauarbeit; DesignBridges `emitFigma`-Export ist der Input. Anleitung dokumentieren.
2. **Als universelles In-App-Feature:** Option B (Plugin) bleibt der pragmatische Weg — nicht weil MCP „unmöglich" ist, sondern weil Figma Dritt-Apps den MCP-Client-Zugang (noch) verwehrt.
3. **Beobachten:** Sobald Figma `mcp:connect` für Dritte öffnet, wird Option D die sauberste In-App-Lösung → dann Plugin ablösen.
4. **Enterprise-Kunden später:** Option C (REST Variables) als plugin-freier In-App-Weg für Variables.

## Entscheidung (Rob, 06.07.2026) — GETROFFEN

**Gewählt: (a) — Option A als dokumentierten Standard-Flow festschreiben + das gebaute Plugin (Option B) als universellen Fallback behalten.** (Rob wählte zuerst „MCP-Weg umplanen"; nachdem die Recherche Option D als von Figma blockiert zeigte, entschied er sich für a.)

Konsequenzen:
- **Kein Umbau auf einen App-eigenen MCP-Client** (Option D) — von Figma blockiert, bleibt Beobachtungspunkt.
- **Anleitung geschrieben:** `docs/figma-schreiben-anleitung.md` (Weg A agent-vermittelt + Weg B Plugin).
- **Plugin + Auto-Fetch bleiben** wie gebaut (universeller, app-naher Fallback).
- **Kein weiterer Code nötig** — `emitFigma`-Export ist der Input für beide Wege.
- **Beobachten:** Öffnet Figma `mcp:connect` für Dritt-Apps → Option D bauen und Plugin ablösen. Enterprise-Kunden später: Option C (REST-Variables).

## Belege
- REST Variables = Enterprise-only: developers.figma.com/docs/rest-api/variables-endpoints (Full seat, Enterprise org).
- Remote-MCP schreibt native Inhalte, alle Pläne, ohne Desktop-App: developers.figma.com/docs/figma-mcp-server (remote-server-installation, plans-access-and-permissions).
- `mcp:connect` nur für freigegebene Clients: Figma Forum „How to Access MCP OAuth Scope (mcp:connect)?" / „Remote MCP server OAuth client registration".
- Live-Beweis: Figma-Datei `fE1iyfh3nACMao43RnUJY6` (Screenshot im Chat 06.07.).
</content>
