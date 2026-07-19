# Architektur: Der `plan` wird das kanonische Komponenten-Modell

**Datum:** 2026-07-19
**Status:** Entscheidung getroffen (mit Rob durchgebrainstormt). Richtungsdokument über mehrere Scheiben. Noch KEIN Code.
**Betroffen:** `web/` (Konverter/Emitter). Server-Prompt-Änderung (jsx abschalten) = späterer Mini-Schritt.

## Was aufgedeckt wurde

Rob deckte beim Skalierungs-Thema einen These-Ebenen-Bruch auf: Die Interpretation erzeugt pro
Baustein **zwei parallele, frei geschriebene Serialisierungen** —
- `interp.html` (Inline-**px**, KEIN Tailwind) → geht nach **Figma** (`emitFigmaComponents` → `htmlToPlan` → `plan`)
- `interp.jsx` (shadcn/**Tailwind**) → geht in den **Code-Export** (`emitComponents.js:65`)

Beide aus EINER Gemini-Antwort, aber zwei getrennte Wahrheiten. Der Figma-Weg läuft damit **an der
Design-System-/Token-Schicht vorbei**. Das widerspricht der Produktvision „**model in the middle**"
(ein quellen-neutrales kanonisches Modell → pluggable Emitter für Code UND Figma).

Nur die **Tokens** (Farben/Textstile) sind heute schon kanonisch/geteilt. Der Bruch sitzt auf der
**Komponenten-Struktur-Ebene**.

## Entscheidung

**Der `plan`-Baum wird DAS kanonische Komponenten-Modell.** Er existiert bereits (box/text/svg mit
Layout/Padding/Gap/Radius/Fills, Farben zeigen schon auf Tokens) und wird heute nur für Figma
genutzt. Ziel:

- **Ein Modell (`plan`) → zwei Emitter:** Figma-Emitter (existiert) + NEUER Tailwind/Code-Emitter, beide aus dem `plan`.
- `interp.html` = nur noch **Mess-Substrat** (rendern → echte Geometrie messen → plan), keine zweite Wahrheit.
- Geminis `interp.jsx` wird **abgelöst** (Code kommt deterministisch aus dem plan → Figma↔Code garantiert konsistent).

### Die zentrale Auflösung (löst Robs „Tailwind ist nicht skalierbar"-Spannung)

Figma und Code brauchen **nicht** dieselbe Größe:
- Der **`plan` = Design-Intention** (gemessene Geometrie, token-referenziert).
- **Figma-Emitter** skaliert beim Rausschreiben auf **1:1 zum Original-Screenshot** (visuelle Rekonstruktion, beliebige px erlaubt).
- **Tailwind-Emitter** skaliert **nicht** — bleibt auf dem Token-/Design-System-Raster (`p-4`, `text-sm`).

→ **Skalieren ist eine Emit-Zeit-Transformation des Figma-Emitters, KEINE Eigenschaft des Modells.**
Damit ist Robs Größen-Fix an der architektonisch richtigen Stelle, und der Code bleibt sauber auf dem Raster.

## Zerlegung (jede Scheibe: eigener Spec → Plan → Bau)

1. **`plan → Tailwind`-Emitter** (Kern-Beweis „ein Modell → beide Ausgänge"). Detail-Spec:
   `docs/superpowers/specs/2026-07-19-plan-to-tailwind-emitter-design.md`. **← ZUERST.**
2. **`plan` token-komplett machen:** Spacing/Radius/Font aufs Token-Raster snappen (Farben schon getan).
   Macht Tailwind-Output idiomatisch UND das Modell zu einem echten Design-System-Modell.
3. **Figma-Emit-Skalierung auf 1:1** (Robs ursprünglicher Größen-Fix, jetzt als Emitter-Transform):
   `canvas = raw.meta.image_width/height` statt fix 1024; pro Baustein `scalePlan(plan, slot/natural)`
   uniform (breitengetrieben, Aspekt erhalten); Bausteine ohne bbox → Faktor 1; komponierte Eltern
   analog. Belegte Root Cause: heute prallen zwei Skalen aufeinander (Interpretationen bei ~Vollauflösung
   vs. Canvas fix 1024 → Faktor `image_width/1024`, im Testimport 2296/1024 = 2,24× → alles gestaucht/
   „im Verhältnis größer"). Plan-Felder zum Skalieren: width/height/padding[4]/gap/radius/strokeWeight/
   absolute{x,y,w,h}/text.fontSize(+lineHeight wenn px)/svg width+height-Attribute (viewBox NICHT).

### Von Rob getroffene Entscheidungen (Brainstorm 19.07.)
- Kanonisches Modell = **der `plan`** (gewählt über „neues neutrales IR" und „nur Code aus plan ableiten").
- Ausgabegröße Figma = **1:1 zum Original (2296px im Testimport)**.
- **Scheibe 1 zuerst** (plan→Tailwind).
- Scheibe 1 Output-Stil = **werktreu, arbitrary values** (`gap-[12px]`), Token-Snapping bleibt Scheibe 2.

## Verhältnis zu offenen Threads (Robs Sidebar-Befunde 19.07.)
- **hr-Trenner + Storage-Progress-Höhe** (`task_9b25b9de`, läuft als separater Hintergrund-Task): Konverter-Fix, bleibt gültig und nützt beiden Emittern.
- **#2 Margins ignoriert** (Shortcut-Abstände): Konverter-Lücke; landet natürlich in der Token-/Layout-Arbeit rund um das kanonische Modell.
- **#4 User-Profil Shrink-Overlap**: wird durch Scheibe 3 (1:1-Skalierung → kein Shrink mehr) weitgehend entschärft.
- **Schwarze Icons (currentColor)**: bereits GEFIXT & live (`bc8ce99`).

## Non-Goals (dieser Architektur-Strang)
- Kein neues IR, kein Wegwerfen des funktionierenden plan→Figma-Wegs.
- Keine bidirektionale Figma→Code-Richtung hier (eigener Roadmap-Punkt).
- Volle shadcn-cva-Varianten (ein plan = eine Variante) — bewusst schlichte Tailwind-Komponenten.
