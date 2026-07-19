# Breiten-Test der Eingabetypen — Ergebnis (20.07.2026)

Robs Wunsch seit 17.07.: qualitativer Vergleich **Bild vs. URL vs. Repo** — dieselbe
bzw. vergleichbare Quelle durch alle drei Import-Wege, Ergebnis nach Tokens,
Bausteinen (Inventar) und Interpretationen verglichen. Claude fuhr alle Imports über
die Live-API, Rob lieferte das Designer-Urteil.

## Aufbau

| Weg | Quelle | Endpunkt |
|---|---|---|
| **Bild** | Vollseiten-Screenshot der ACME-Report-Seite (1× = 1440×1705; 2× brach den Scan) | `POST /api/scan/image` → Gemini Vision (`gemini-3.5-flash`) |
| **URL** | `…/demo/report.html` (self-served von Prod, byte-identisch mit lokal) | `POST /api/scan/url` → deterministischer CSS/DOM-Parser |
| **Repo** | `github.com/robbiekraus/rk-landing` (React 19 + Tailwind 4) | `POST /api/scan/repo` → deterministisches Repo-Inventar |

Kontrollierte Quelle: `demo-site/report.html` (+ `report.css`) mit dokumentierter
Ground Truth in `demo-site/report-ground-truth.md` (23 Tokens, volles Komponenten-
Inventar). Bild & URL laufen beide auf dieser gerenderten Seite (sauberer A/B). Der
Repo-Weg erwartet eine Komponenten-Codebase — dafür rk-landing als realistischer,
ehrlicher Fall (statt demo-site künstlich als Repo zu pushen). Alles lief auf
Prod-Gemini (Paid), ein konsistenter Provider; der lokale Anthropic-Key ist leer.

## Stufe 1 — Tokens & Inventar (gegen Ground Truth benotet)

| | Bild (Vision) | URL (CSS/DOM) | Repo (rk-landing, TW4) |
|---|---|---|---|
| Farben exakt | **2 / 11** (perzeptuell verschoben) | **11 / 11** + 3 Tints | 0 |
| Fremd-/Extra-Farben | 9 (perzeptuelle Näherungen) | 2 (echte Nicht-Token-Farben) | 0 |
| Spacing | 3 | **4 / 4 exakt** | 0 |
| Radius | 3 | 7 (über-extrahiert, GT=3) | 0 |
| Schatten | 1 | 4 (GT=2) | 0 |
| Inventar | **17, semantisch** (ganze Cards, echte Namen) | 14, generisch (aus CSS-Klassen) | 0 |
| Kosten/Zeit | 1 KI-Call, ~15 s, flaky | **0 Credits, ~0,15 s, deterministisch** | 0 Credits, deterministisch |

Kernaussage: **URL = Token-Wahrheit** (exakte Hex/px direkt aus dem CSS, extrahiert
sogar zu viel). **Bild = Struktur-Wahrheit** (semantisch reiches, komplettes Inventar,
aber nur perzeptuelle Farben). **Repo = blinder Fleck bei Tailwind 4** (liefert nichts).

## Stufe 2 — Interpretations-Treue (dieselben 3 Bausteine je Weg)

Renderings unter `Testdaten/breiten-test-2026-07/renderings/`.

- **KPI-Card:** beide sehr gut. Bild trifft das Mint-Icon, dickere Zahl. URL rendert
  die Zahl in **Monospace** (echte `--font-mono` der GT, weil CSS gelesen), rät aber
  ein blaues Icon.
- **Sidebar:** beide nahezu komplett (Logo, 6 Nav-Items, aktiver Zustand, Storage,
  User-Row). URL farblich **exakt** (`#0f172a`); Bild verteilt vertikal originalgetreuer
  (space-between).
- **Tabelle:** schärfster Unterschied. **Bild = ganze Card** (Titel, Dropdown, 6 Zeilen
  mit exakten Daten, Pagination) — pixel- & datengenau. **URL = nur Tabellen-Kern**
  (thead+tbody, exakte Daten, Monospace), **ohne** Card-Chrome — DOM-Erkennung scoped
  aufs `<table>`, nicht auf die umgebende Karte.

Fazit: Beide Wege erzeugen hochwertiges, self-contained HTML. Vision liefert
**vollständigere** Bausteine (sieht visuelle Gruppen), URL **präzisere** Details
(exakte Farben + echte Fonts). Sie sind komplementär — der beste Import würde
URL-Tokens mit Vision-Inventar kombinieren.

## Produkt-Befunde (alle technisch lösbar)

1. **Tailwind-4-blinder-Fleck** — rk-landing → 0 Tokens *und* 0 Komponenten. TW4 verlegt
   die Config aus `tailwind.config.js` in CSS-`@theme`; der Ingester liest das nicht.
   Die 0 Komponenten sind ein zweiter, eigener Decomposer-Gap. *(Repo/Developer-Weg)*
2. **Große Screenshots brechen den Bild-Scan** — 2880px → abgeschnittenes JSON (500);
   erst 1× (1440px) lief. Fix: Bild serverseitig vor Vision herunterskalieren.
3. **Bild-Scan nicht-deterministisch** — ~50% JSON-Parse-Fehler bei diesem Dashboard,
   Retry hilft. Fix: Retry/Backoff bei Parse-Fehler.
4. **Interpretations-Token-Deckel** — >1 schwerer Baustein pro Call (oder allein die
   Sidebar) → 502-Abschnitt. Web-Client chunkt à 4, aber ein einzelner großer Baustein
   kann trotzdem kappen.
5. **URL-Inventar zu eng gescoped** (Tabelle ohne Card-Chrome) + generische Namen; zudem
   Token-Über-Extraktion (17 Farben, Radius 7 statt GT 3).

## Empfohlene Reihenfolge

1. Zuerst **Zuverlässigkeit des Bild-Wegs** (Befund 2 + 3) — kleiner Aufwand, größte
   spürbare Wirkung, macht den überzeugendsten Weg verlässlich.
2. Dann **Tailwind-4-Fix** (Befund 1) zusammen mit der „Developer-Empfangsseite".
3. Befund 4 + 5 als Polish nachziehen.
