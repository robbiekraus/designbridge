# Scheibe ③ Vorbereitung: KI-Bausteine → Figma — Entscheidungsvorlage

**Datum:** 2026-07-11 (Nacht-Recherche, autonom) · **Status:** ENTSCHEIDUNGSVORLAGE für Robs Brainstorm — KEIN Design, keine Festlegung. Rob entscheidet.

## Ausgangslage (am Code verifiziert)

- KI-interpretierte Bausteine haben in der Library `{html, jsx}` (sanitisiert, iframe-Vorschau). Beim Figma-Export emittiert `web/src/lib/emit/emitFigmaComponents.js` sie heute als `placeholder: true, plan: null` → Plugin rendert „Vorlage fehlt".
- Der Plugin-Renderer (`designbridge-plugin/src/writer/renderPlan.ts`) versteht ausschließlich das **`plan`-Modell**: `PlanBox { layout: row|column, padding, radius, fill, stroke, children }` + `PlanText { content, fontSize, fontWeight, color }`. Auto-Layout-Frames, Token-verknüpfte Farb-Styles, Inter-Font, festes itemSpacing 8. **Kein Bild-Node, kein SVG/Vektor, keine absolute Positionierung.**
- Kernfrage: Wie kommen `html/jsx`-Bausteine in dieses (oder ein erweitertes) Modell?

## Die drei Optionen

### (a) Deterministischer Konverter html → plan — EMPFEHLUNG als Fundament
Server- oder web-seitiger Parser (node-html-parser liegt vor): HTML-Baum + Tailwind-Klassen-Subset (flex/grid→layout, p-*→padding, rounded-*→radius, bg-/text-Farben→fill/color, text-*/font-*→fontSize/Weight) → verschachtelte PlanBox/PlanText.
- ✅ 0 Credits, deterministisch, voll testbar (ADR-001-Linie „Regeln zuerst, KI on-demand")
- ✅ Nutzt den kompletten bestehenden Plugin-Pfad unverändert
- ✅ Editierbare echte Figma-Nodes (Robs Grundprinzip „keine toten Pixel")
- ⚠️ SVG/Charts sind im plan-Modell nicht darstellbar → braucht eine **definierte Degradations-Regel** (z. B. Chart → Box mit den Textwerten/Legende + Notiz „vereinfacht exportiert")
- ⚠️ Tailwind-Mapping ist Fleißarbeit; Subset klar abgrenzen (YAGNI)

### (b) Gerenderte Komponente als Bild/Image-Fill — ABRATEN
- ❌ Verstößt direkt gegen das im Brainstorm 08.07. bestätigte Grundprinzip: „Library = echte, editierbare technische Artefakte, **keine toten Pixel**" (Spec Slice 1, §Grundprinzipien)
- ❌ Bräuchte serverseitig einen Headless-Browser (Puppeteer/Playwright — schwere neue Dependency, Repo-Regel 6); im Plugin selbst ist HTML-Rendering nicht möglich
- Allenfalls später als optionaler „Referenz-Screenshot"-Zusatz NEBEN echten Nodes

### (c) KI liefert `plan` direkt (drittes Feld im bestehenden Interpret-Call)
- ✅ Kein Konverter nötig; ein Call bleibt ein Call; Fixtures können plan enthalten (demo-bar)
- ⚠️ Nicht-deterministisch; live erst mit Credits verifizierbar
- ⚠️ Zwei Wahrheiten (`html` fürs Web, `plan` für Figma) können divergieren
- ⚠️ Chart-Problem identisch (plan kann kein SVG)

## Empfehlung (zur Diskussion, nicht entschieden)

**(a) als Fundament, (c) später als optionale Veredelung obendrauf** — exakt das bewährte Projektmuster (deterministische Basis + „Mit KI vertiefen"-Knopf). Eine spätere separate Scheibe kann das plan-Modell um Vektor-/Bild-Nodes erweitern und die Chart-Degradation aufheben.

## Offene Fragen für Robs Brainstorm

1. Degradations-Toleranz: Ist „Chart → Box mit echten Werten + Hinweis" für v1 akzeptabel?
2. plan-Modell jetzt erweitern (SVG-Node im Plugin) oder bewusst später?
3. Scope v1: nur Basis-Variante je Baustein oder alle Varianten?
4. Visual-Companion für diesen Brainstorm nutzen (Absprache: beim nächsten visuellen Punkt wieder anbieten — Options-Mockups a/b/c wären genau das).
