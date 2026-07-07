# Tokens aus DesignBridge nach Figma schreiben

DesignBridge unterstützt zwei Wege, extrahierte Tokens (Farben + Typografie) als echte **Figma-Styles** anzulegen. Beide erzeugen dasselbe Ergebnis: Paint-Styles unter `DesignBridge/Color/*` und Text-Styles unter `DesignBridge/Text/*`.

Warum überhaupt zwei Wege? Figmas REST-API kann Dateien nur *lesen* — Styles/Components schreiben geht nur über (a) einen von Figma freigegebenen **MCP-Client** oder (b) ein **Figma-Plugin**. (Der plugin-freie MCP-Client-Zugang ist Dritt-Apps aktuell nicht direkt erlaubt; Details siehe `docs/superpowers/specs/2026-07-06-figma-write-architecture-decision.md`.)

---

## Weg A — plugin-frei, über einen MCP-Client (empfohlen für Einzelpersonen/Power-User)

Voraussetzung: ein Figma-verbundener MCP-Client (z. B. **Claude Code**, **Cursor**, **VS Code** mit Figma-MCP, oder Figmas eigener Agent/Make), einmalig per Figma-OAuth verbunden.

1. **In DesignBridge:** Quelle importieren (Bild/URL/Repo) → Library → **Export** → Format **„Nach Figma (Plugin)"** → **Kopieren**. Das ist der `designbridge-figma.json`-Payload:
   ```json
   { "designbridge": "figma-import", "version": 1,
     "colors": [{ "name": "primary-button", "hex": "#022d2c" }],
     "text":   [{ "name": "headline", "fontSize": 32, "fontWeight": 700 }] }
   ```
2. **Im MCP-Client:** Payload einfügen und den Agenten bitten, z. B.:
   > „Lege in Figma (neue Datei oder Datei-Key `…`) aus diesem JSON Paint-Styles `DesignBridge/Color/<name>` und Text-Styles `DesignBridge/Text/<name>` an."
   Der Agent nutzt Figmas MCP-Tools (`create_new_file`, `use_figma`) und schreibt die Styles direkt — **ohne Plugin, ohne Desktop-App**.
3. **Ergebnis:** Local Styles in der Figma-Datei, gruppiert unter `DesignBridge/…`.

*Belegt am 06.07.2026: Datei `fE1iyfh3nACMao43RnUJY6` in Robs Pro-Account so erzeugt.*

Grenze: Es gibt (noch) keinen In-App-Knopf dafür, weil DesignBridge sich nicht selbst als Figma-MCP-Client registrieren darf. Sobald Figma den Scope `mcp:connect` für Dritt-Apps öffnet, kann DesignBridge das direkt anbieten (Option D).

---

## Weg B — über das DesignBridge-Plugin (universell, jeder Plan, kein MCP-Client nötig)

1. Plugin einmalig laden: `cd designbridge-plugin && npm run build` → Figma → Plugins → Development → *Import plugin from manifest…* → `designbridge-plugin/manifest.json`.
2. **In DesignBridge:** Export → „Nach Figma (Plugin)" → **„An Figma senden"** (oder JSON kopieren).
3. **Im Plugin** (Karte „Code → Figma"): **„Aus DesignBridge übernehmen"** (holt den Export automatisch vom lokalen Server) — oder JSON manuell einfügen → „In Figma schreiben".
4. **Ergebnis:** dieselben `DesignBridge/…`-Styles.

---

## Kurz-Entscheidung

- Du arbeitest ohnehin mit Claude/Cursor/Figma-Agent → **Weg A** (nichts installieren).
- Du willst es ganz ohne solchen Client, direkt aus der App → **Weg B** (Plugin).
- Enterprise-Org + nur Variables → künftig auch REST-Variables-API (plugin-frei, app-eingebettet) möglich.
</content>
