# Storybook-Emit (DS-Grounding Scheibe 3) — Stories-Emitter v1

**Datum:** 2026-07-23 · **Status:** Spec zum Bau (Rob-Scope-Entscheid: „Stories-Emitter")
**Branch:** `claude/design-bridge-resume-review-7vwgnj` (Review-Strang, kein Deploy)
**Baut auf:** Scheibe 1 (DS-Grounding, `planToJsx` emittiert echte shadcn-Komponenten) + Emit-Schicht (`emitComponents`, `buildLibraryZip`).

## Anlass / Ziel

Der Emit-Pfad liefert je Baustein schon echten React-Code (`emitComponents` → `{ name, slug, filename, kind, variants, code, grounded }`). Für die **Developer-Empfangsseite** fehlt das Schaufenster: pro Baustein eine **Component-Story-Format-Datei** (`*.stories.jsx`), damit ein Entwickler die extrahierten Komponenten direkt in Storybook sieht/durchklickt. v1 = **Emitter + Handoff-Paket**, kein laufendes Storybook im Repo (Folge-Schritt, bräuchte Fremd-npm-install → Repo-Regel #6).

## Erfolgskriterium

Aus einem echten Scan lässt sich ein Storybook-Paket herunterladen, das ein Entwickler in ein Storybook-Projekt kippt: `components/*.jsx` + `stories/*.stories.jsx` + `.storybook/main.js` + Kurz-README. Jede Story hat eine `Default`-Story und je Template-Variante eine benannte Story. Gegroundete Bausteine tragen einen Kommentar, dass sie echte shadcn-Komponenten rendern.

## Datenfluss

`emitComponents(result)` (unverändert) → **`emitStories(component)`** (neu, rein) → `{ filename: 'Button.stories.jsx', code }` → **`buildStorybookZip(result)`** (neu) bündelt components + stories + config → Export-Seite: Button **„Nach Storybook"** (bisher disabled) triggert Download.

## PINNED CONTRACT

1. `emitStories(component)` ist **rein** (kein IO), Input = ein Objekt aus `emitComponents`, Output `{ filename, code }`.
2. Story-Dateiname = `${Pascal}.stories.jsx` (Pascal aus `component.slug`, wie in `emitComponents`).
3. Import-Name wird aus `component.code` gelesen (`export function X` / `export const X` / `export default`) — Fallback = Pascal. Robust gegen gehobenen Repo-Code mit fremdem Export-Namen.
4. Import-Pfad relativ: `../components/${filename-ohne-Endung}` (Stories liegen in `stories/`, Komponenten in `components/`).
5. CSF3-Form: Default-Export `{ title, component }`, `title = '${Gruppe}/${component.name}'` (Gruppe = Atoms/Molecules/Organisms/Templates aus `kind`). Named exports = Stories.
6. Immer `export const Default = {}`. Je Variante `export const <PascalVariante> = { args: { variant: '<v>' } }`.
7. `component.grounded?.length` → Kommentarzeile oben: `// Rendert echte shadcn-Komponenten: <Namen>`.

## Änderungen (Blast Radius)

- **Neu `web/src/lib/emit/emitStories.js`** + Test — reiner Emitter.
- **Neu `web/src/lib/emit/buildStorybookZip.js`** + Test — bündelt components/stories/.storybook/main.js/README-storybook.md.
- **`web/src/lib/emit/index.js`** — Re-Export `buildStorybookZip`, `emitStories`.
- **`web/src/pages/Export.jsx`** — „Nach Storybook (folgt)"-Button aktivieren (Download `designbridge-storybook.zip`).
- **`buildLibraryZip.js`** — Stories zusätzlich unter `stories/` in die Gesamt-Library aufnehmen (ein Zug, konsistent).

## Non-Goals (v1)

- Kein `@storybook`-Install / kein laufendes Storybook im Repo (Folge-Schritt).
- Kein Argtype-/Controls-Feintuning; nur `variant`-Arg aus Template-Varianten.
- Verschachtelte Kompositionen unverändert (Scheibe-1-Grenze bleibt).
