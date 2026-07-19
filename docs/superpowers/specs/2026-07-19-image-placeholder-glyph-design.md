# Bild-Platzhalter-Glyph für leere Bild/Logo-Boxen

Stand: 19.07.2026. Robs Freigabe („wie empfohlen"). Web-only (htmlToPlan). Design-sensibel →
konservative, datengestützte Heuristik.

## Problem

Gemini stellt manche Bilder/Marken als LEERE gestylte Divs dar (kein `<img>`) — z. B. den
EcoMetrics-Sidebar-Logo (`32×32`, `background:#fff`, `border-radius:16px…`, leer). Die rendern in
Figma als leere weiße Boxen = Robs „seltsame ungefüllte Platzhalter". Der Interpret-Schritt ersetzt
zwar echte `<img>` durch Data-URI-Platzhalter (Avatar), aber leere Divs rutschen durch.

## Heuristik (datengestützt trennscharf — Fehlalarm-Test über alle Bausteine gefahren)

Ein Element bekommt einen zentrierten **Bild-Platzhalter-Glyph** als Inhalt, wenn:

**(A)** es ein `<img>`-Tag ist (immer ein Bild — kein Fehlalarm-Risiko), ODER
**(B)** es eine **Box mit Hintergrund-Fill, OHNE Element-Kinder, OHNE nicht-leeren Text** ist UND
  - `min(width, height) ≥ 24` (px, gemessen) UND
  - Seitenverhältnis „~quadratisch": `0.7 ≤ width/height ≤ 1.43`.

**Warum diese Grenzen (an v3-Payload verifiziert):** treffen NUR den Logo (32×32 quadratisch).
NICHT getroffen: Notification/Chart-Dots (6–10px < 24), Category-Legenden-Chips (32×14, Ratio 2.3
> 1.43), KPI-Icon-Kreise (haben svg-Kind → nicht „ohne Kinder"), Chat-Badge „5" (hat Text).

## Glyph

Standard-„Bild"-Icon (Lucke-Stil), grau, damit es auf hellen UND farbigen Boxen sichtbar ist.
Als `svg`-PlanNode-Kind der Box; Größe = `round(min(w,h) * 0.6)` (min 12), zentriert:

```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="{S}" height="{S}" fill="none"
 stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
 <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
 <path d="M21 15l-5-5L5 21"/></svg>
```

Die Box behält Fill/Radius/Größe; nur `children` = `[glyphSvg]`, `primaryAlign`/`counterAlign` =
`CENTER` (Glyph mittig). Der Glyph-`svg`-Node trägt KEIN stretch/grow/absolute (skaliert nicht mit,
konsistent mit svg-Regel).

## Integration (htmlToPlan.js)

In `buildNormalNode`/`convertElement`: nachdem feststeht, dass `el` ein LEAF ist (keine Element-
Kinder) — für `<img>` (A) ODER eine leere Box mit den (B)-Kriterien — statt eines leeren Box-Node
einen Box-Node mit dem Glyph-Kind + CENTER-Alignment zurückgeben. `<img>` hat i. d. R. kein Fill →
bei (A) Glyph auch ohne Fill injizieren (die transparente img-Box im farbigen Eltern-Div zeigt dann
den Glyph). Messung über `getBoundingClientRect` (wie readAbsolute); jsdom 0×0 → Kriterium (B) nicht
erfüllt → kein Glyph (Tests mocken Rects).

## Bewusste Grenzen
- Rein visuelle Andeutung „hier ist ein Bild/Logo" — der Konverter kann Logo/Avatar/Foto nicht
  unterscheiden, ein generisches Bild-Glyph ist der pragmatische Kompromiss (Robs Freigabe).
- Ein leeres gefülltes Quadrat ≥24px, das WIRKLICH dekorativ ist (kein Bild), bekäme fälschlich ein
  Glyph — im echten Dashboard-Korpus nicht vorgekommen (Fehlalarm-Test). Bei Befund Grenzen schärfen.

## Tests (web, jsdom, gemockte Rects)
1. `<img>`-Element → Box mit Glyph-svg-Kind, CENTER.
2. Leere Box, Fill, 32×32 (quadratisch, ≥24) → Glyph-Kind.
3. Leere Box, Fill, 10×10 (< 24) → KEIN Glyph (leer bleibt leer).
4. Leere Box, Fill, 32×14 (Ratio 2.3) → KEIN Glyph.
5. Box mit Text ("5") oder mit Element-Kind (Icon-svg) → KEIN Glyph (nicht leer).
6. Glyph-Größe = round(min(w,h)*0.6); Box behält Fill/Radius.
