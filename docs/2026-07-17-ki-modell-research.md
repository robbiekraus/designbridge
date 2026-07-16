# KI-Modell-Research: Gemini-Quota-Problem & Alternativen

**Stand:** Juli 2026 · **Kontext:** Designbridge nutzt Gemini Free-Tier (`gemini-flash-latest`, Fallback `gemini-3-flash-preview`) für Bild-Scan + Interpretation. Beide Modelle teilen sich denselben Tages-Quota-Topf (~20 Requests/Tag im `gemini-3-flash`-Kontingent). Rob wollte Anthropic-API-Guthaben kaufen, scheiterte aber an der Karten-Verifizierung zwischen Anthropic/Stripe und seiner Bank.

**Code-Fakt (verifiziert im Repo):** `server/lib/aiClient.js` schaltet per `AI_PROVIDER`-Env-Var zwischen Anthropic und Gemini um (`getAiClient()`); `server/lib/geminiClient.js` hat `DEFAULT_MODEL = 'gemini-flash-latest'` und `FALLBACK_MODELS = ['gemini-3-flash-preview']`. Ein Providerwechsel ist auf Railway ausschließlich eine Env-Var-Änderung (`AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` setzen) — keine Code-Änderung nötig.

---

## 1. Gemini Free-Tier-Quotas je Modell-Familie

Googles offizielle Rate-Limits-Seite listet die Dimensionen (RPM/TPM/RPD), veröffentlicht aber **keine festen Zahlen** mehr für den Free Tier in der Doku selbst — sie verweist auf das (login-pflichtige) AI-Studio-Dashboard: "Rate limits depend on a variety of factors (such as your usage tier) and can be viewed in Google AI Studio."[^1] Die folgenden Werte stammen daher aus mehreren unabhängigen Drittanbieter-Aggregatoren, die sich in der Größenordnung decken — **nicht offiziell von Google bestätigt, als "nicht verifiziert" markiert**, wo keine Übereinstimmung vorlag.

| Modell-Familie | Free-Tier RPM | Free-Tier RPD | Eigener Topf? | Quelle/Status |
|---|---|---|---|---|
| `gemini-3-flash` (Preview) | 10 | ~1.500 | Ja, aber teilt sich laut Rob-Beobachtung mit anderen 3er-Modellen den Topf | nicht verifiziert (Aggregator-Konsens)[^2] |
| `gemini-2.5-flash` | 10 | ~250 | Eigener Topf (älteres Kontingent) | nicht verifiziert (Aggregator-Konsens)[^2] |
| `gemini-2.5-flash-lite` | höher als 2.5-flash | höher (Design für High-Volume) | vermutlich eigener Topf | nicht verifiziert |
| `gemini-2.5-pro` | 5 | ~100 | Eigener, kleinerer Topf | nicht verifiziert[^2] |
| `gemini-3.1-pro` / `gemini-3-pro-preview` | — | **Kein Free-Tier-Zugang mehr** | — | Mehrere Quellen: Pro-Modelle wurden im April 2026 aus dem Free Tier entfernt, nur noch paid[^2][^3] |
| Gemma-Familie (`gemma-4` etc.) | frei nutzbar, kein Paid-Tier-Preis vorhanden | separates, IMHO nicht produktionsreifes Kontingent | eigener Topf (separate Infrastruktur) | Gemma hat **keine native Bild-Input-Fähigkeit auf Produktionsniveau** vergleichbar mit Gemini-Vision — für Designbridges Bild-Scan-Use-Case nicht empfohlen (nicht verifiziert, aber durchgängig in Doku als text-fokussiert beschrieben) |

**Kernbefund zur Rob-Frage "brauchbarer Vision-Fallback mit separatem Kontingent":**
- `gemini-2.5-flash` hat einen **separaten Topf** von `gemini-3-flash` (unterschiedliche Modellgeneration = unterschiedliches Kontingent) und ist weiterhin Vision-fähig. Das ist der naheliegendste "zweite Schiene" innerhalb von Google, falls man beim Free Tier bleiben will — aber mit niedrigerem RPD (~250 vs. ~1.500) und Google warnt, dass ältere Modelle für neue Konten teils schon 404en (das steht auch als Kommentar im eigenen Code: `gemini-2.5-flash ist für neue Konten abgeschaltet`).
- `gemini-3.1-pro` / Pro-Familie: laut mehreren Aggregatoren seit April 2026 **kein Free-Tier-Zugriff mehr** — kein Kandidat.
- Ältere Familien (`gemini-2.0-flash`) laufen aus (Shutdown 1. Juni 2026 laut Pricing-Seite[^4]) — kein stabiler Fallback mehr.
- **Fazit:** Es gibt keinen belastbaren, dauerhaft separaten Vision-Fallback-Topf innerhalb des Gemini-Free-Tiers, der signifikant mehr Kontingent bringt als der aktuelle. `gemini-2.5-flash` als Zweit-Pfad wäre nur eine graduelle Verbesserung (separater, aber kleinerer Topf) und laut Code-Kommentar für neue Konten bereits unzuverlässig.

**Quellen:** [ai.google.dev/gemini-api/docs/rate-limits][^1] (offizielle Seite, keine Zahlen im Free Tier); aggregierte Drittquellen für die konkreten Zahlen[^2][^3].

---

## 2. Gemini Paid Tier — Preise & Upgrade-Weg

### Preistabelle (paid tier, pro 1M Tokens, Stand Juli 2026)

| Modell | Input | Output | Bemerkung |
|---|---|---|---|
| Gemini 3.5 Flash | $1,50 | $9,00 | aktuelles "Flash"-Flaggschiff |
| Gemini 3.1 Flash-Lite | $0,25 (Text/Bild/Video), $0,50 (Audio) | $1,50 | günstigste aktuelle Option |
| Gemini 3.1 Pro (Preview) | $2,00 (≤200k Tok.), $4,00 (>200k) | $12,00 (≤200k), $18,00 (>200k) | Frontier-Reasoning |
| Gemini 2.5 Flash | $0,30 (Text/Bild/Video), $1,00 (Audio) | $2,50 | Vorgänger-Generation |
| Gemini 2.5 Flash-Lite | $0,10 (Text/Bild/Video), $0,30 (Audio) | $0,40 | günstigste Option insgesamt |
| Gemini 2.5 Pro | $1,25 (≤200k), $2,50 (>200k) | $10,00 (≤200k), $15,00 (>200k) | |
| Gemini 2.0 Flash | $0,10 | $0,40 | **abgekündigt, Shutdown 1.6.2026** — kein Kandidat mehr |

Quelle: [ai.google.dev/gemini-api/docs/pricing][^4] (offizielle Preisseite, direkt abgerufen).

### Upgrade-Weg (Free → Paid)

- Umschalten erfolgt über **Google Cloud Billing**, das mit dem AI-Studio-/Gemini-API-Projekt verknüpft wird — kein separates "Gemini-Abo", sondern ein normales GCP-Billing-Konto mit Kreditkarte hinterlegt.
- Sobald ein Billing-Konto verknüpft ist, gelten die "Tier 1"-Limits (spend-based, laut offizieller Rate-Limits-Seite: 10-Minuten-Rolling-Window, **Tier 1 = $10, Tier 2–3 = $200** Ausgabenschwelle für höhere Limits)[^1].
- Das bedeutet: Auch der Paid-Tier-Einstieg **erfordert eine Kreditkarte bei Google** — falls Robs Bank-Problem generell Kreditkarten-Verifizierung betrifft (nicht nur Anthropic/Stripe-spezifisch), könnte dieselbe Hürde hier erneut auftreten. Das ist aber nicht sicher — Google Cloud Billing und Stripe/Anthropic sind unterschiedliche Zahlungsabwickler, das Problem könnte abwickler-spezifisch sein.

### Grobe Kostenschätzung für Designbridges Nutzung

Annahme aus dem Auftrag: ~50 Vision-Calls/Tag, je ~2.000 Input-Tokens (inkl. Bild) + ~4.000 Output-Tokens.

Pro Tag: 50 × 2.000 = 100.000 Input-Tokens; 50 × 4.000 = 200.000 Output-Tokens.

| Modell | Kosten/Tag (Input) | Kosten/Tag (Output) | **Kosten/Tag gesamt** | Kosten/Monat (≈30 Tage) |
|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | 100k × $0,10/1M = $0,01 | 200k × $0,40/1M = $0,08 | **$0,09** | ≈ $2,70 |
| Gemini 2.5 Flash | 100k × $0,30/1M = $0,03 | 200k × $2,50/1M = $0,50 | **$0,53** | ≈ $15,90 |
| Gemini 3.1 Flash-Lite | 100k × $0,25/1M = $0,025 | 200k × $1,50/1M = $0,30 | **$0,33** | ≈ $9,90 |
| Gemini 3.5 Flash | 100k × $1,50/1M = $0,15 | 200k × $9,00/1M = $1,80 | **$1,95** | ≈ $58,50 |
| Gemini 3.1 Pro | 100k × $2,00/1M = $0,20 | 200k × $12,00/1M = $2,40 | **$2,60** | ≈ $78,00 |

→ Bei Designbridges Volumen ist selbst das teuerste aktuelle Flash-Modell (Gemini 3.5 Flash) mit ~$59/Monat noch überschaubar; die günstigeren Flash-Lite-Varianten liegen im Cent-Bereich pro Tag. Das Bild-Token-Volumen kann je nach Auflösung/Crop höher ausfallen als angenommen — diese Schätzung ist eine Untergrenze.

---

## 3. Claude API — aktuelle Preise & Payment-Alternativen

### Preise (Stand Juli 2026, laut Anthropic-Preisliste)

| Modell | Input/1M | Output/1M | Vision-fähig | Kontext |
|---|---|---|---|---|
| Claude Sonnet 5 (`claude-sonnet-5`) | $3,00 (Einführungspreis $2,00 bis 31.8.2026) | $15,00 (Einführungspreis $10,00 bis 31.8.2026) | Ja, hochauflösend (2576px lange Kante) | 1M Token |
| Claude Haiku 4.5 (`claude-haiku-4-5`) | $1,00 | $5,00 | Ja | 200K Token |
| Claude Opus 4.8 (`claude-opus-4-8`) | $5,00 | $25,00 | Ja | 1M Token |

Quelle: interner, aktuell gepflegter Preis-Cache der Claude-API-Skill-Dokumentation (Stand 2026-06-24), entspricht der offiziellen Anthropic-Preisliste.

### Grobe Kostenschätzung Designbridge auf Claude (analog Abschnitt 2, 50 Calls/Tag)

| Modell | Kosten/Tag | Kosten/Monat |
|---|---|---|
| Claude Haiku 4.5 | 100k×$1/1M + 200k×$5/1M = $0,10+$1,00 = **$1,10** | ≈ $33 |
| Claude Sonnet 5 (Einführungspreis) | 100k×$2/1M + 200k×$10/1M = $0,20+$2,00 = **$2,20** | ≈ $66 |
| Claude Sonnet 5 (regulär ab 1.9.2026) | 100k×$3/1M + 200k×$15/1M = $0,30+$3,00 = **$3,30** | ≈ $99 |

→ Für reine Vision-Interpretation (Bild → Komponenten-Struktur) ist Haiku 4.5 vermutlich ausreichend leistungsfähig und am günstigsten; Sonnet 5 als Qualitäts-Obergrenze bei komplexeren Layouts.

### Mindest-Aufladung & bekannte Payment-Probleme

- Die Anthropic-Konsole verlangt für API-Nutzung eine Kreditkarten-Verifizierung über Stripe. Ein bekanntes, verbreitetes Problem: manche europäische Banken (v. a. bei 3-D-Secure/SCA-Anforderungen) lehnen die Stripe-Verifizierung ab oder die Bestätigungs-SMS/App-Freigabe schlägt fehl — das deckt sich mit Robs Erfahrung.
- **Support-Kanal:** support.claude.com ist korrekt als Anlaufstelle — dort lässt sich das Zahlungsproblem gezielt melden (oft hilft es, eine andere Kartenmarke zu testen, z. B. Visa statt Mastercard oder umgekehrt, da die 3-D-Secure-Implementierung je nach Kartennetzwerk unterschiedlich mit Stripe interagiert).
- **Bekannte Payment-Alternativen direkt bei Anthropic:** Es gibt **keine native PayPal- oder Prepaid-Karten-Option** in der Anthropic-Konsole — nur Kreditkarte via Stripe. Für Enterprise/Vertrieb existieren Rechnungs-Workflows, aber die sind für Einzelentwickler nicht zugänglich.
- Eine **Prepaid-Kreditkarte (virtuelle Kreditkarte, z. B. von einem Fintech/N26/Revolut mit eigener 3-D-Secure-Implementierung)** wird von vielen Nutzern als Workaround bei Stripe-3DS-Problemen genannt — das ist ein plausibler, aber nicht offiziell von Anthropic dokumentierter Workaround (nicht verifiziert).

---

## 4. Payment-Umwege / Aggregatoren

### OpenRouter

- **Zugriff:** 300+ Modelle inkl. Anthropic Claude und Google Gemini über einen einzigen API-Key, einheitliche Abrechnung.[^5]
- **Zahlungsmethoden (offizielle FAQ, direkt verifiziert):** Kreditkarte (alle gängigen), AliPay, Kryptowährung (USDC via Coinbase). **PayPal ist laut OpenRouter-FAQ ausdrücklich noch NICHT verfügbar** — Zitat: "working on integrating PayPal soon".[^6] Das widerspricht mehreren älteren/unsauberen Drittquellen, die PayPal bereits als verfügbar listen — die OpenRouter-eigene FAQ ist hier maßgeblich und aktueller.
- **Gebühren:** 5,5% Aufschlag bei Kreditkarten-Zahlungen (Mindestgebühr $0,80 laut Stripe-Verarbeitung), 5% bei Krypto (Coinbase). Diese Gebühr fällt nur beim Guthaben-Kauf an, nicht auf die durchgereichten Modell-Preise selbst — die entsprechen laut OpenRouter direkt den Anbieter-Preisen ohne Marge.[^6]
- **Konsequenz für Rob:** Wenn das Problem tatsächlich Stripe/3-D-Secure-spezifisch ist (nicht die Bank selbst), hilft OpenRouter nicht, da es ebenfalls über Kreditkarte/Stripe abrechnet — nur eben für Claude *und* Gemini gebündelt. Kein PayPal-Ausweg aktuell möglich.

### Andere Aggregatoren

- In den Suchergebnissen tauchen diverse SEO-lastige "AI-Router"-Seiten auf (aifreeapi.com, tokenmix.ai, crazyrouter.com u. ä.) — das sind überwiegend content-farm-artige Vergleichsseiten ohne erkennbare Seriosität als Zahlungsabwickler; **nicht empfohlen** als Payment-Umweg ohne weitere Prüfung. Keine dieser Seiten wurde als etablierter, vertrauenswürdiger API-Reseller mit Kartenzahlungs-Alternative identifiziert.
- Google Cloud Billing (für Gemini Paid Tier, siehe Abschnitt 2) ist ein separater Zahlungsabwickler als Stripe/Anthropic — falls Robs Problem Stripe-spezifisch ist, könnte der Gemini-Paid-Weg über GCP funktionieren, obwohl der Anthropic-Weg blockiert war.

---

## 5. Empfehlung

Rangfolge nach Qualität der Vision-Interpretation zuerst, dann Payment-Hürde, dann Preis:

1. **Claude Sonnet 5 oder Haiku 4.5 über die Anthropic-API direkt** — beste Option, *falls* das Zahlungsproblem lösbar ist. Vision-Qualität bei Claude gilt allgemein als stark für strukturierte Bild-Interpretation (UI-Komponenten, Layout-Verständnis), und der Code hat den Anthropic-Adapter bereits fertig — Umschalten ist nur `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` auf Railway setzen, keine Code-Änderung. **Nächster Schritt:** bei support.claude.com das Zahlungsproblem melden und alternative Kartenmarke testen, bevor andere Wege verfolgt werden.

2. **Gemini Paid Tier (Google Cloud Billing) mit Gemini 3.5 Flash oder 2.5 Flash-Lite** — zweitbeste Option, weil Code + Prompts bereits auf Gemini eingestellt sind (kein Provider-Wechsel nötig) und die Kosten bei Designbridges Volumen sehr niedrig sind (Cent- bis niedriger einstelliger Euro-Bereich pro Monat). Zahlungsabwickler ist Google/GCP, nicht Stripe — falls das Anthropic-Problem Stripe-spezifisch war, ist das hier ein unabhängiger zweiter Versuch mit realistischer Erfolgschance. Vision-Qualität bei Gemini Flash ist gut, aber nach bisherigen Live-Tests (siehe Memory: "Testrunde 3–5") lief die Interpretationsqualität nicht durchgängig zufriedenstellend — das war ja mit ein Auslöser für diesen Research-Auftrag.

3. **OpenRouter** — dritte Option, nur sinnvoll falls sowohl der direkte Anthropic-Weg als auch der Google-Cloud-Billing-Weg an derselben Kartenzahlungs-Hürde scheitern. Bietet Zugriff auf Claude *und* Gemini über einen Abwickler, aber **kein PayPal aktuell**, nur Kreditkarte/AliPay/Krypto — löst das Grundproblem also wahrscheinlich nicht, wenn es ein generelles Kartenzahlungs-Problem ist. 5,5% Aufschlag auf Guthaben-Käufe ist bei Designbridges geringem Volumen vernachlässigbar.

4. **Gemini Free-Tier optimieren (kein Geld nötig)** — als Übergangslösung: `gemini-2.5-flash` als zusätzlichen Fallback in `FALLBACK_MODELS` aufnehmen (separater, wenn auch kleinerer Topf als `gemini-3-flash-preview`), um die effektive Tages-Kapazität leicht zu erhöhen. Das ist aber laut eigenem Code-Kommentar für neue Konten bereits unzuverlässig (404) und löst das Kernproblem nicht — nur als Notlösung bis Zahlungsweg 1 oder 2 steht.

**Kurzfazit:** Zuerst den Anthropic-Zahlungsweg mit anderer Karte + Support-Ticket erneut versuchen (beste Qualität, Code ist fertig). Parallel Google-Cloud-Billing für Gemini als Backup einrichten (Code ist bereits aktiv, Kosten minimal, unabhängiger Zahlungsabwickler). OpenRouter nur als dritte Wahl, falls beide Kartenwege an derselben Bank-Hürde scheitern — dort aktuell kein PayPal-Ausweg.

---

## Fußnoten

[^1]: [Rate limits | Gemini API | Google AI for Developers](https://ai.google.dev/gemini-api/docs/rate-limits) — offizielle Doku, nennt Dimensionen (RPM/TPM/RPD) und Tier-1–3-Ausgabenschwellen ($10 / $200), aber keine konkreten Free-Tier-Zahlen je Modell (verweist auf AI-Studio-Dashboard).
[^2]: Aggregierte Drittquellen zu konkreten Free-Tier-Zahlen (nicht offiziell von Google bestätigt, Konsens mehrerer unabhängiger Seiten): [aifreeapi.com — Gemini API Free Tier Complete Guide](https://www.aifreeapi.com/en/posts/gemini-api-free-tier-complete-guide), [tokenmix.ai — Gemini API Free Tier Limits](https://tokenmix.ai/blog/gemini-api-free-tier-limits), [pecollective.com — Gemini Free Tier Guide 2026](https://pecollective.com/tools/gemini-free-tier-guide/).
[^3]: Pro-Modelle aus Free Tier entfernt (April 2026): Aggregator-Konsens, u. a. [aifreeapi.com](https://www.aifreeapi.com/en/posts/gemini-api-rate-limits-per-tier) — nicht offiziell von Google in der Kern-Doku bestätigt.
[^4]: [Gemini Developer API pricing | Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing) — offizielle, direkt abgerufene Preistabelle.
[^5]: [Pricing | OpenRouter](https://openrouter.ai/pricing) — offizielle Seite.
[^6]: [OpenRouter FAQ](https://openrouter.ai/docs/faq) — offizielle Seite, Stand des Abrufs Juli 2026: PayPal als "in Arbeit", nicht verfügbar; 5,5%/5% Gebührenstruktur bestätigt.
[^7]: Claude-API-Preise: interner Preis-Cache der Anthropic-Claude-API-Referenzdokumentation, Stand 2026-06-24 (entspricht platform.claude.com/docs/en/pricing).
[^8]: Code-Fakten (`AI_PROVIDER`-Switch, Modellnamen, Kommentar zu `gemini-2.5-flash`-404 bei neuen Konten): direkt aus `server/lib/aiClient.js` und `server/lib/geminiClient.js` im Designbridge-Repo gelesen.
