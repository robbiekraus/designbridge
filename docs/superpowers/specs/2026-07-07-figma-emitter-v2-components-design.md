# Figma-Emitter v2 — Components/Patterns → Figma-Nodes (Phase 5.2)

**Datum:** 2026-07-07 · **Status:** Entwurf, von Rob im Brainstorm freigegeben (Terminal + Visual Companion)

## Ziel

Das kanonische Inventar (Atomics / Components / Patterns) wird — zusätzlich zu den Token-Styles aus Phase 5 — als **echte Figma-Komponenten** in die Figma-Datei geschrieben. Leitprinzip (Robs Kernanforderung): *beide Repositories (Code & Figma) fußen auf der identischen, technisch abgeglichenen Wahrheit.* Das Template-Wissen lebt genau **einmal** (in der App); das Plugin ist ein dummer Zeichner.

## Entscheidungen (Brainstorm 07.07.)

| Frage | Entscheidung |
|---|---|
| Semantik | **A: echte Component Sets mit Varianten** (`combineAsVariants`, Property „Variant") |
| Anordnung | **A: eigene Seite „🌉 DesignBridge"** als Sticker-Sheet mit Sektionen Atomics → Components → Patterns |
| Bausteine ohne Template | **A: beschriftete Platzhalter-Komponenten** (Name, Varianten, Notizen, Badge „Vorlage fehlt — Platzhalter") |
| Architektur | **Ansatz 2: „dummes Plugin"** — App liefert fertigen visuellen Bauplan, Plugin rendert generisch |
| Styles | Komponenten-Farben **verknüpfen** mit den `DesignBridge/Color/*`-Styles aus Phase 5 (Fallback: Hex) |
| Transport | unverändert Auto-Fetch (`POST /api/figma-export` → Plugin `GET /latest`), Payload wird **version 2** |
| Re-Import | Create-or-Update per Name — keine Duplikate (wie Styles in Phase 5) |

## Datenfluss

```
Quelle (Bild/URL/Repo)
  → kanonisches Modell (raw.tokens + raw.{atomics,components,patterns})   [existiert]
    → emitFigmaComponents(result): Bauplan je Komponente & Variante       [NEU, web]
      → emitFigma v2: Umschlag {colors, text, components}                 [erweitert, web]
        → Auto-Fetch wie heute                                            [existiert]
          → Plugin: parsePayload v2 → renderPlan → buildComponents        [NEU, plugin]
            → upsertPage „🌉 DesignBridge" (Sticker-Sheet)                [NEU, plugin]
```

## Payload v2 (Umschlag)

```jsonc
{
  "designbridge": "figma-import",
  "version": 2,
  "colors": [ { "name": "brand-primary", "hex": "#4263EB" } ],   // wie v1
  "text":   [ { "name": "heading-xl", "fontSize": 28, "fontWeight": 700 } ],  // wie v1
  "components": [                                                 // NEU
    {
      "name": "Button",
      "kind": "atomic",                  // atomic | component | pattern
      "confidence": "high",              // high | medium | low
      "source": "rules+ai",              // durchgereicht aus dem Modell
      "notes": "…",
      "variants": [
        {
          "name": "primary",
          "plan": {                       // Bauplan — nur wenn Template existiert
            "type": "box",
            "layout": "row",             // row | column
            "padding": [8, 16, 8, 16],   // t r b l, px
            "radius": 6,
            "fill": { "token": "brand-primary", "hex": "#4263EB" },
            "stroke": null,              // oder { token, hex }
            "children": [
              { "type": "text", "content": "Button",
                "fontSize": 14, "fontWeight": 500,
                "color": { "token": "on-primary", "hex": "#FFFFFF" } }
            ]
          }
        }
      ],
      "placeholder": false               // true ⇒ keine plans, nur Metadaten
    }
  ]
}
```

- **Element-Typen im Bauplan: nur `box` und `text`.** `box` kann `children` haben (verschachtelt, z. B. Card mit Titel+Text). Das reicht für die 4 Templates; bewusst kein generisches CSS.
- **Farbreferenzen sind Paare `{token, hex}`:** `token` = normalisierter Token-Name (verknüpft mit `DesignBridge/Color/<token>`), `hex` = aufgelöster Wert als Fallback. `token: null` erlaubt (z. B. Weiß, das kein Token ist).
- `placeholder: true` ⇒ `variants` enthält nur Namen (`plan: null`); Plugin baut die Platzhalter-Karte selbst aus den Metadaten (einzige „Template"-Ausnahme im Plugin, da rein generisch).
- v1-Payloads (`version: 1`, ohne `components`) bleiben gültig — Plugin behandelt `components` als leer.

## Web-Seite (alles reine Funktionen, Vitest)

1. **`web/src/lib/emit/pickTokenRefs.js` (NEU):** wie `pickTokens`, liefert aber je Slot `{ value, token }` (Token-Name aus dem normalisierten Token, `token: null` bei Fallback-Werten). `pickTokens` bleibt unangetastet (nicht-brechend; bestehende Konsumenten unverändert).
2. **`web/src/lib/emit/emitFigmaComponents.js` (NEU):** `(result) → components[]`. Läuft über die drei Inventar-Listen (Muster aus `emitComponents.js`: `matchTemplate`, KINDS). Für Template-Treffer: pro Template-Variante einen Bauplan bauen — **je Template eine kleine `planFor(variant, refs)`-Funktion** (Gegenstück zu `styleFor`, gleiche Werte, aber mit Token-Referenzen). Kein Template ⇒ `placeholder: true` + Metadaten.
3. **`web/src/lib/emit/emitFigma.js` (ERWEITERT):** nimmt zusätzlich `components[]`, schreibt `version: 2`. Aufrufer (`buildExports` in `index.js`) reicht `result` durch.
4. **Export-UI:** unverändert (derselbe Knopf, dieselbe Vorschau — nur mehr Inhalt). Anleitungstext um einen Satz ergänzen („… legt jetzt auch Komponenten an").

**Anmerkung zu `planFor`:** lebt in den Template-Dateien (`button.js` etc.) neben `styleFor`, damit Rezept-Wissen pro Template gebündelt bleibt. `styleFor` (HTML-Vorschau) und `planFor` (Figma) teilen sich die Werte über gemeinsame Konstanten je Template — eine Quelle, zwei Serialisierungen.

## Plugin-Seite (TypeScript, seit heute mit echtem Typecheck)

1. **`src/writer/parsePayload.ts` (ERWEITERT):** `ImportPayload` um `components` ergänzen; Validierung (Name vorhanden, plan-Struktur, Farb-Paare); v1-tolerant; deutsche Fehlermeldungen. Bleibt `figma`-frei (unit-testbar).
2. **`src/writer/renderPlan.ts` (NEU):** `plan → FrameNode` — Auto-Layout (`layoutMode` aus `layout`), Padding, Radius, Fills. Farb-Auflösung: lokalen Paint-Style `DesignBridge/Color/<token>` suchen → `setFillStyleIdAsync`; nicht gefunden oder `token: null` → Hex-Fill. Text: Font laden (Inter + `nearestWeightStyle` aus Phase 5 wiederverwenden), Fallback Inter Regular + Eintrag in `skipped`.
3. **`src/writer/buildComponents.ts` (NEU):**
   - Template-Komponenten: je Variante Frame via `renderPlan` → `createComponentFromNode` → `combineAsVariants` ⇒ Component Set `<Name>` mit Property „Variant".
   - Platzhalter: eine einzelne Komponente — Karte mit Name, Variantenliste, Notizen, gelbem Badge „Vorlage fehlt — Platzhalter".
   - **Re-Import:** existiert auf der DesignBridge-Seite schon ein Component Set / eine Komponente gleichen Namens ⇒ Inhalt ersetzen (Kinder neu aufbauen), Node-Identität erhalten (Instanzen in Arbeitsdateien brechen nicht). Nur bei Strukturwechsel (Set ↔ Einzel) löschen + neu.
4. **`src/writer/upsertPage.ts` (NEU):** Seite `🌉 DesignBridge` finden/anlegen; drei Sektions-Frames (Auto-Layout, Spaltenstapel) mit Überschriften **Atomics / Components / Patterns**; Komponenten einsortieren nach `kind`; leere Sektionen ausblenden.
5. **`src/main.ts` / `ui.ts`:** `IMPORT`-Zweig ruft nach den Styles (Phase 5) den Komponenten-Bau auf. `ImportSummary` erweitert: `componentsCreated`, `componentsUpdated`, `placeholders`. Statuszeile: „Fertig — N Komponenten neu, M aktualisiert, K Platzhalter (+ Styles wie gehabt)".

## Fehlerbehandlung

- Kaputter/fehlender Einzel-Bauplan ⇒ Baustein überspringen, `skipped`-Eintrag („Komponente X: ungültiger Bauplan") — nie der ganze Import.
- Font nicht ladbar ⇒ Inter Regular + `skipped`-Hinweis.
- Style-Verknüpfung schlägt fehl ⇒ stiller Hex-Fallback (kein Fehler).
- v1-Payload ⇒ verhält sich exakt wie Phase 5 (nur Styles).

## Tests & Verifikation

- **Web (Vitest):** `pickTokenRefs` (Namen + Fallbacks), `emitFigmaComponents` (Template→Plan-Snapshots, Platzhalter, leeres Inventar), `emitFigma` v2 (Umschlag, v1-Kompatibilität der Reihenfolge `colors`/`text` unverändert).
- **Plugin:** Verifikation wie in Phase 5 = `npm run typecheck` (0 Fehler) + esbuild-Build. `parsePayload`-Erweiterung und Plan-Validierung bleiben reine, `figma`-freie Funktionen — damit sind sie später testbar, falls das Plugin einen Testrunner bekommt (v1 setzte dieselbe Messlatte).
- **Figma-Laufzeit (Rob, 1 Klick):** bekannter Ablauf — „An Figma senden" → „Aus DesignBridge übernehmen" → Erwartung: Seite „🌉 DesignBridge" mit Button-Set (3 Varianten umschaltbar), Card/Badge/Input, Platzhalter-Karten mit Badge; Farben zeigen Style-Verknüpfung (Style ändern ⇒ Komponente folgt).

## Bewusst NICHT in v1 (Scope-Grenze)

- Keine neuen Templates (bleibt bei Button/Card/Badge/Input)
- Keine Radius/Spacing/Shadow-**Variables** (eigener Schritt)
- Kein Zurücklesen/Diff aus Figma (Phase 6)
- Keine Pattern-Layout-Rekonstruktion — Patterns ohne Template sind Platzhalter wie alle anderen
