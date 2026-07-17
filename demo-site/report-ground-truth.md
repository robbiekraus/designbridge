# Report Dashboard — Ground Truth (Eingabetypen-Breiten-Test)

Testfall: `demo-site/report.html` (+ `report.css`) wird einmal per **URL-Import** und
einmal per **Bild-Import** (Screenshot der gerenderten Seite) durch Designbridge
gejagt. Diese Datei ist die Benotungsgrundlage — was ein perfekter Import finden
müsste, Token für Token, Element für Element.

Fiktive Marke: **ACME Metrics** (B2B-Nachhaltigkeits-Analytics-Dashboard).
Eigene Farbpalette: Teal/Slate (bewusst kein Violett wie im Referenzbild
`Testdaten/Bildschirmfoto 2026-07-15 um 17.48.06.png`).

---

## 1. Design-Tokens (`:root` in `report.css`)

### Farben (12)

| Token | Wert | Verwendung |
|---|---|---|
| `--color-primary` | `#0f766e` | Primärfarbe (Sidebar-Logo, Primär-Button, aktiver Nav-Zustand, Linie 1 im Line-Chart, größtes Donut-Segment, Stacked-Bar-Segment 1) |
| `--color-primary-soft` | `#ccfbf1` | Icon-Hintergrund (KPI-Icons, Avatar-Kreis, Facility-Rank-Kreis) |
| `--color-on-primary` | `#ffffff` | Text auf Primärfarbe |
| `--color-sidebar` | `#0b1220` | Sidebar-Hintergrund |
| `--color-surface` | `#ffffff` | Karten-/Seiten-Oberflächen |
| `--color-surface-alt` | `#f1f5f9` | Seitenhintergrund, Tabellen-Header-Hintergrund |
| `--color-text` | `#0f172a` | Fließtext |
| `--color-text-muted` | `#64748b` | Sekundärtext, Achsenbeschriftung, Legenden |
| `--color-border` | `#e2e8f0` | Rahmen, Trennlinien, Gridlines |
| `--color-success` | `#16a34a` | Positive Trend-Pill, Success-Badge, ein Stacked-Bar-Segment |
| `--color-danger` | `#dc2626` | Negative Trend-Pill, Notification-Badge, ein Donut-Segment |
| `--color-warning` | `#d97706` | Linie 2 im Line-Chart, ein Donut-/Bar-Segment, Warning-Badge |

### Abstände (4)

| Token | Wert |
|---|---|
| `--space-sm` | `8px` |
| `--space-md` | `16px` |
| `--space-lg` | `24px` |
| `--space-xl` | `32px` |

### Radien (3)

| Token | Wert |
|---|---|
| `--radius-sm` | `6px` |
| `--radius-md` | `12px` |
| `--radius-full` | `999px` |

### Schatten (2)

| Token | Wert |
|---|---|
| `--shadow-card` | `0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)` |
| `--shadow-elevated` | `0 12px 32px rgba(15,23,42,0.14)` (Chart-Tooltip) |

### Schriften (2)

| Token | Stack | Verwendung |
|---|---|---|
| `--font-sans` | `-apple-system, "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif` | Fließtext, UI |
| `--font-mono` | `ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace` | KPI-Werte, Tabellen-Zahlenspalte, Chart-Tooltip-Wert, Legenden-Werte |

**Gesamt: 12 Farben, 4 Abstände, 3 Radien, 2 Schatten, 2 Schriftfamilien = 23 Tokens.**

---

## 2. Komponenten-Inventar

| Bereich | Element | Details |
|---|---|---|
| Sidebar | Logo | Icon-Mark + Wordmark „ACME Metrics" |
| Sidebar | Navigation | 6 Items (Übersicht, **Berichte** aktiv, Standorte, Warnungen, Team, Einstellungen), je mit Inline-SVG-Icon |
| Sidebar | Storage-Karte | Label, Meta-Text, Progress-Bar (52% Fill), Button „Upgrade" (Secondary) |
| Sidebar | User-Row | Avatar-Kreis „PK", Name, Rolle, Settings-Icon |
| Topbar | Begrüßung | H1 + Subline |
| Topbar | Search-Input | `type="search"`, Placeholder |
| Topbar | Notification-Icon | Glocken-SVG + Badge „3" (absolut positioniert) |
| Topbar | Dropdown-Select | Zeitraum-Filter (3 Optionen) |
| Topbar | Primär-Button | „Bericht exportieren" mit Icon |
| KPI | 3 Karten | Carbon (28.410 tCO₂e, −8,2%, positiv), Energie (9.742 MWh, +4,1%, negativ), Wasser (6.203 kL, +19,5%, positiv) — je Icon, Wert+Einheit, Trend-Pill |
| Chart | Line-Chart | Inline-SVG, 2 Polylinien (Teal „Aktueller Zeitraum" / Amber „Vorjahreszeitraum"), 5 Gridlines, 3 Datenpunkt-Marker |
| Chart | Achsenbeschriftung | 5 Y-Labels + 7 X-Labels als **HTML-Text, `position:absolute`** (nicht im SVG) |
| Chart | Tooltip | `.chart-tooltip`, **`position:absolute`**, zeigt „April · 71 tCO₂e" |
| Chart | Stacked Bar | Horizontales Balkendiagramm, 4 Prozent-Breiten-Segmente (42% / 28% / 18% / 12%), Legende mit Swatches |
| Chart | Donut-Chart | Inline-SVG (4 `stroke-dasharray`-Segmente: 41/24/19/16%), Center-Text „84% Bekannte Quelle" **`position:absolute`**, Legende |
| Liste | Top-Standorte | 4 Einträge, Rank-Kreis (Initiale), Name+Ort, Wert+Einheit, Header-Button „Alle anzeigen" (Secondary) |
| Tabelle | Data-Table | 5 Spalten (Standort, Prozess, Kategorie, Emission, Status) × 6 Zeilen, Status-Badges |
| Badge | 2 Varianten | `.badge--success` „Verifiziert" (grün), `.badge--warning` „Ausstehend" (amber) |
| Button | 2 Varianten | `.btn--primary` (gefüllt Teal), `.btn--secondary` (Outline) |
| Tabellen-Footer | Pagination | Zähltext „Zeige 1–6 von 42", 6 Pagination-Buttons (‹, 1, 2, …, 7, ›) |

**Absolut positionierte Elemente (Pflicht-Check für die neue Pipeline):**
1. `.notif-badge` (Notification-Zähler auf Glocken-Icon)
2. 5x `.axis-label` (Y-Achse Line-Chart)
3. 7x `.axis-label-x` (X-Achse Line-Chart)
4. `.chart-tooltip` (Line-Chart)
5. `.donut-center` (Donut-Mitte, Prozent-Text)

---

## 3. Bekannte Abweichungen zum Referenzbild

Bewusst **kein Klon** von `Bildschirmfoto 2026-07-15 um 17.48.06.png` (EcoMetrics):
gleiche Elementklassen/Layout-Idee, aber eigene Marke (ACME Metrics statt
EcoMetrics), eigene Farbpalette (Teal/Slate statt Violett), eigene Datenwerte,
horizontales statt vertikales Segment-Balkendiagramm (Testanforderung), Achsen-
Labels und Tooltip zusätzlich als absolut positionierte HTML-Elemente statt
SVG-`<text>` (testet die neue Absolute-Positioning-Pipeline).

## Hinweis: Tint-Farben außerhalb der Token-Liste

Drei Flächenfarben sind bewusst als statische Hex-Tints gesetzt (KEINE `:root`-Variablen,
ursprünglich `color-mix()`, ersetzt für deterministische serverseitige Extraktion):
`#def2e6` (Success-Tint), `#fae1e1` (Danger-Tint), `#f9e9d7` (Warning-Tint).
Ein Import darf sie zusätzlich zu den 12 Token-Farben finden — sie zählen weder als
Treffer noch als Fehler, sind aber ein interessanter Indikator dafür, ob der Importer
Nicht-Token-Farben sauber von Token-Farben trennt.
