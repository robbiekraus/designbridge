# UIPrism — Orchestrierter Test-Leitfaden (Presentation-Readiness)

**Zweck:** Haarklein, was **Rob** durchklicken muss, um zu bestätigen, dass die App
für die Live-Demo (28./29.07.) bereit ist — vom Import bis zum Export, beide Ausgänge
(Figma + Developer-Code). Jeder Schritt: *was tun* → *was erwartet* → *🚩 Red Flag*.

Stand 20.07. nachts: Rebrand-Skin + Bild-Zuverlässigkeit gebaut, getestet (Server 289,
Web 584 grün), auf Prod deployt. Was hier **maschinell** verifiziert ist, ist markiert;
der Rest ist dein manueller Real-Smoke.

---

## 0 · Vorbereitung
- Prod-URL: `https://designbridge-production.up.railway.app` (heißt noch „designbridge",
  Umbenennung bewusst zuletzt — kein Test-Blocker).
- Figma Desktop offen, das DesignBridge-Dev-Plugin geladen (für den Figma-Ast).
- Ein **großer** Dashboard-Screenshot bereit (genau der Fall, der früher brach —
  testet den Zuverlässigkeits-Fix). Zusätzlich eine **URL** als deterministischer
  Fallback (z. B. `…/demo/report.html`).

## 1 · App-Smoke (Branding) — ✅ maschinell vorgeprüft
- **Tun:** Prod-URL öffnen.
- **Erwartet:** Header zeigt UIPrism-Mark + Wortmarke „UIPrism" in **Schwarz**, Tab-Titel
  „UIPrism", darunter eine **schlichte graue Linie** (Header-Border, kein Farbspektrum),
  „Neuer Import" **schwarz**, aktive Nav **grau** (zink) hinterlegt.
- **🚩** Noch „Designbridge"-Wortmarke sichtbar → Deploy nicht durch / Cache (hart neu laden).
- **🚩** Indigo-Buttons / Flieder-Nav / bunte Spektrum-Leiste sichtbar → alter Skin, Deploy
  `c63114c` nicht durch (hart neu laden).
- *Hinweis:* Farb-/Spektrum-Rollback auf zink (Robs Feedback 20.07.), Web 584/584 grün,
  Browser-verifiziert.

## 2 · Bild-Import — der Live-Demo-Kern (Zuverlässigkeits-Fix)
- **Tun:** „Neuer Import" → Bild → den **großen** Screenshot hochladen.
- **Erwartet:** Scan läuft durch (evtl. kurzer Retry im Hintergrund), Erfolgs-State mit
  Kategorien + Counts (Colors/Typography/Spacing/Radius/Shadows + Inventar).
- **🚩** „am Token-Limit abgeschnitten" / „kein gültiges JSON" **trotz** mehrerer Versuche
  → notieren (Bildgröße, Motiv); der Downscale+Retry sollte das gerade abfangen.
- *Hinweis:* Downscale (>1500px) + 3× Retry/Backoff sind **unit-verifiziert**; dieser
  Schritt ist die reale Bestätigung an echtem Material.

## 3 · Library durchklicken
- **Tun:** Tokens → Atoms → Molecules → Organisms → Templates.
- **Erwartet:** Bausteine mit interpretierten Referenzen, Counts in der Nav.
- **🚩** Leere Bausteine ohne Interpretation (falls, im Export als Platzhalter markiert).

## 4 · Ausgang A — Figma (der bewiesene Ast)
- **Tun:** Export → „An Figma senden" → in Figma das Plugin „Aus DesignBridge übernehmen".
- **Erwartet:** Paint-/Text-Styles + erkannte Komponenten/Templates werden in Figma angelegt,
  proportionsgetreu (1:1-Skalierung).
- **🚩** Vor dem Senden: Platzhalter-Warnung („X Bausteine ohne Interpretation") → betroffene
  erst neu interpretieren, dann senden.

## 5 · Ausgang B — Developer/Code (Storybook-Substitut)
- **Tun:** Export-Seite → Format zwischen CSS / Tailwind-Config / tokens.json / Komponenten-
  Code umschalten; „Ganze Library exportieren" (ZIP).
- **Erwartet:** Live-Code-Vorschau der shadcn/Tailwind-Komponenten (token-treue Klassen wie
  `bg-primary`, `p-card-padding`), ZIP lädt herunter.
- *Erzählung für die Demo:* „ein kanonisches Modell → zwei Ausgänge (Figma + echter Code)";
  „Storybook-Export ist der nächste Roadmap-Schritt" (ehrlich, guide-konform).

## 6 · URL-Import als Demo-Fallback (deterministisch, gratis)
- **Tun:** „Neuer Import" → URL → die Demo-Report-URL.
- **Erwartet:** exakte Token (Farben/Spacing aus CSS), sofort, ohne KI-Kosten.
- *Warum:* Falls der Bild-Ast in der Live-Demo zickt, ist der URL-Ast der sichere,
  sofortige Beweis derselben Pipeline.

---

## Presentation-Ready-Gate (wann „fertig")
Bereit für die Live-Demo, wenn **1–6 grün** durchlaufen — insbesondere **2** (großer
Screenshot verlässlich) und **4+5** (beide Ausgänge). Danach: sauberen Take als
Recording-Fallback aufnehmen (Proben 24.–27.07.). UI-Layout-Redesign bleibt bewusst
Post-Präsentation.

## Bekannte, bewusst offene Punkte (kein Blocker)
- Repo/URL heißen noch „designbridge" (Umbenennung zuletzt; URL im Plugin hartkodiert).
- Rest-Fidelity-Themen (SVG-Trend-Linie skaliert nicht, Margins, Clipping) — dokumentiert,
  betreffen Output-Feinschliff, nicht die Wege.
- Import-Modal-interne Tabs nutzen noch das alte Aktiv-Muster (Follow-up-Kandidat).
