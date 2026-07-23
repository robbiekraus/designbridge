# Scheibe 1: DS-Grounding gegen den Default-Katalog (shadcn/ui + Tailwind)

**Datum:** 2026-07-23
**Status:** Detail-Spec zu `2026-07-23-design-system-grounded-interpretation-architecture.md`. Noch KEIN Code. Beantwortet die 4 offenen Fragen der Architektur-Spec.
**Betroffen:** `server/` (Interpretations-Prompt), `web/` (`htmlToPlan`, `planToJsx`, neuer Katalog-Baustein). Emitter-Grundgerüst bleibt.
**Baut auf:** kanonisches `plan`-Modell (`2026-07-19-canonical-plan-model-architecture.md`).

## Die tragende Erkenntnis (warum Scheibe 1 klein ist)

Das kanonische `plan`-Modell hat **bereits** einen `component-ref`-Knotentyp mit `fallback`-Box-Baum
(`htmlToPlan.js` erkennt ihn, `planToJsx.js:130` rendert ihn heute nur als Fallback-Box, der
Figma-Emitter instanziiert damit andere Scan-Bausteine). Heute speist sich die Erkennung aus
`ctx.knownComponents` = *die anderen im selben Scan erkannten Bausteine*.

**Grounding = dieselbe Naht, andere Quelle:** `knownComponents` bekommt zusätzlich die
**Katalog-Komponenten**, und `component-ref` trägt eine **Katalog-Identität**
(`catalog`, `component`, `variant`, `props`). Kein neuer Knotentyp, kein neuer Emitter-Pfad — wir
hängen uns an die vorhandene `html → plan → component-ref`-Kette.

## Antworten auf die 4 offenen Fragen

### Q1 — Katalog-Format: kuratierter Default-Satz (KEIN cva-Parsing in Scheibe 1)

Der Default-Katalog wird als **kuratierte Daten** mitgeliefert, nicht zur Laufzeit aus cva geparst
(cva-Extraktion aus fremdem Repo = Scheibe 2). Ein Eintrag:

```
{
  name: "Button",
  import: { name: "Button", from: "@/components/ui/button" },
  variants: { variant: ["default","secondary","destructive","outline","ghost","link"],
              size:    ["default","sm","lg","icon"] },
  props:    ["disabled"],                 // sichtbar/relevant, klein gehalten
  plan:     <kanonischer plan je Default-Variante>,   // = Q3 (Rendering)
  match:    { tag: "button", hints: [...] }           // Erkennungs-Signale, s. Q2
}
```

Startsatz für Scheibe 1 (klein, die häufigsten Atome/Moleküle):
**Button, Input, Label, Badge, Card (+CardHeader/Content/Footer), Checkbox, Avatar, Separator.**
Erweiterung ist reines Daten-Nachtragen, kein Code.

### Q2 — Grounding-Mechanik: Katalog-Vokabular in den Prompt, Auflösung über die bestehende Naht

Nicht „freihändig interpretieren, dann raten" (das reimportiert die von der Kanon-Spec bekämpfte
Zwei-Wahrheiten-Falle). Stattdessen:

1. **Prompt bekommt das Katalog-Vokabular** (Namen + erlaubte Varianten). Regel-Ergänzung in
   `interpretComponents.buildPrompt`: „Wenn ein Element einer dieser bekannten Komponenten entspricht,
   markiere das äußerste Element mit `data-ds-component=\"Button\" data-ds-variant=\"secondary\"
   data-ds-size=\"sm\"` — und style es trotzdem inline wie bisher."
2. **`htmlToPlan` promotet markierte Elemente** zu `component-ref` mit Katalog-Identität, sofern der
   Name im (erweiterten) `knownComponents`-Katalog liegt. Das inline-gestylte Subtree wird zum
   `fallback` des Knotens → **visueller Fallback bleibt gratis erhalten.**

Vorteil: Das Modell interpretiert *im Vokabular*, aber der teure Umbau „Modell gibt Komponentenbaum
statt HTML aus" entfällt. Die Grounding-Entscheidung ist deterministisch im Konverter, nicht im
Modell-Rauschen.

### Q3 — Rendering: der Katalog trägt einen kanonischen, token-referenzierten `plan` je Komponente

Das Aussehen eines Katalog-Bausteins kommt **nicht** aus dem Scan, sondern aus dem Katalog-Eintrag
(`plan` je Default-Variante), von Hand/aus dem shadcn-Source für den Startsatz erstellt und
**token-referenziert** (bleibt aufs Token-Raster gesnappt, konsistent mit der Kanon-Spec):

- **Figma-Emit:** instanziiert den Katalog-`plan` an der Fundstelle (erkannter Text/Props gespliced) —
  echte Komponente statt Frame. Reuse des vorhandenen `plan`→Figma-Emitters.
- **Code-Emit (`planToJsx`):** `component-ref` mit Katalog-Identität rendert jetzt den **echten Import**
  (`import { Button } from \"@/components/ui/button\"`) + `<Button variant=\"secondary\">Text</Button>`,
  statt `walk(node.fallback)`. Der `fallback`-Baum bleibt nur Degradations-Pfad (Q4).

### Q4 — Nicht-Treffer: sauber degradieren + ehrlich flaggen (NICHT stumm erzwingen)

Element ohne Katalog-Entsprechung → **freihändiger `plan` wie heute** (degradiert sauber), aber im
Ergebnis als `grounded: false` markiert und in der UI/Export sichtbar gemacht (wie das bestehende
`placeholder`-Warnmuster in `Export.jsx`). „Nächstliegende Komponente erzwingen" wird **abgelehnt** —
stumm falsche Komponenten zu erzeugen ist genau Robs Kritik.

> **Wichtige Abgrenzung:** „In das nächstliegende/universellste System zwingen" (Robs Vorgabe) gilt auf
> **Design-System-Ebene** (kein eigenes DS → Fallback shadcn/Tailwind), NICHT pro Element. Pro Element
> ist ehrlicher Freihand-Fallback + Flag richtig.

## Verifikation (der eigentliche Beweis dieser Scheibe)

Der Code-Emit-Output wird in ein **echtes shadcn/Tailwind-Projekt** fallen gelassen und muss
**kompilieren + rendern** — das ist Robs bislang ungecheckter Dev-Empfang, erstmals eingelöst.
- Minimales shadcn/Vite-Scaffold (throwaway oder unter `web/` als Verifikations-Target).
- `tsc`/Build grün, Komponente rendert sichtbar.

## Bau-Schritte (jeder endet mit etwas Sicht-/Lauffähigem)

1. **Katalog-Datenmodul** (`web/src/lib/catalog/shadcn-default.js`) mit dem Startsatz + Tests
   (Struktur/Varianten vorhanden). → Lauffähig: Katalog importierbar, Test grün.
2. **`htmlToPlan`: `data-ds-*` → `component-ref` mit Katalog-Identität**, `knownComponents` um Katalog
   erweitert. → Sicht: ein markiertes Button-HTML wird zu einem Katalog-`component-ref` mit `fallback`.
3. **`planToJsx`: Katalog-`component-ref` → echter Import + JSX.** → Sicht: emittierter Code enthält
   `import { Button } … <Button variant=…>`.
4. **Prompt-Ergänzung** in `interpretComponents` (Katalog-Vokabular + `data-ds-*`-Regel). → Sicht:
   echter Bild-Scan produziert für einen Button einen gegroundeten Knoten.
5. **`grounded`-Flag durchreichen + in Export/Dashboard anzeigen** (Ehrlichkeit, Q4).
6. **Verifikation:** Emit in shadcn-Scaffold, Build grün, Render sichtbar.

**Kleinster erster Beweis (Schritt 1–3 + 6 an EINEM Atom):** ein Button, von der `data-ds-*`-Markierung
bis zu kompilierendem `<Button/>` im echten Projekt — bevor wir den Prompt (Schritt 4) und den Rest des
Startsatzes anfassen.

## Offene Detailfragen (für den Plan bzw. während des Baus)

- Genauer `plan`-Aufbau der Default-Varianten (von Hand vs. aus gerendertem shadcn-Source gemessen).
- Wohin das shadcn-Scaffold zur Verifikation kommt (throwaway vs. eingecheckt).
- Prop-Extraktion aus dem Bild: welche Props sind realistisch erkennbar (variant/size/disabled) vs.
  welche wir bewusst weglassen.

## Out of scope (Scheibe 1)

- cva-Parsing / Katalog aus User-Repo (Scheibe 2).
- Figma-DS als Katalog-Quelle (Scheibe 4).
- Storybook-Emit (Scheibe 3).
- URL/Repo als Scan-Eingang fürs Grounding (Bild-Pfad zuerst, der funktioniert heute).
