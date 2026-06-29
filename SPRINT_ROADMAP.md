# Sprint Roadmap — Orden Correcto

**Principio**: No construir SEO hasta que el Crawler y Coverage sean confiables.

---

## El Orden

### Sprint 1: MONITOR (Crawler)

**Objetivo**: Garantizar que cada artículo que entra al sistema sale con contenido válido o razón explícita de fallo.

**Auditoría**: `AUDIT_MONITOR.md` (8 casos reales, extremo a extremo)

**Bugs posibles**:
- HTTP 403 → no intenta Playwright
- Playwright timeout → no hay retry
- HTML vacío → no se detecta
- MIN_WORDS=80 → muy alto
- Sin logs de fallo

**Success criteria**:
- ✅ 95%+ de artículos con contenido_text completo
- ✅ 0 artículos con extraction_method=NULL (estado fantasma)
- ✅ Todo artículo RSS_ONLY tiene razón documentada
- ✅ Logs muestran exactamente qué falló y dónde

**Timeline**: 1-2 semanas

**Resultado**: Crawler confiable. Monitor entrega datos de calidad.

---

### Sprint 2: COVERAGE (Clustering, Deduplicación)

**Objetivo**: Asegurar que Monitor entrega contenido, Coverage lo agrupa correctamente.

**Auditoría**: `AUDIT_COVERAGE.md` (4 casos: no-clustered, contaminated, duplicates, short-content)

**Bugs posibles**:
- Artículos válidos que Coverage rechaza silenciosamente
- Fragmentación (4 clusters de 1 tema)
- Deduplicación incorrecto (artículos distintos se fusionan)
- Threshold de similitud muy alto (validos se rechazan)

**Success criteria**:
- ✅ 99%+ de artículos válidos se clusterizam
- ✅ Casos Lozano/Boca: 1 cluster por tema
- ✅ Deduplicación preserva todas las fuentes
- ✅ Content length NO es factor de rechazo

**Timeline**: 1 semana

**Resultado**: Coverage agrupa confiablemente. Stories são íntegras.

---

### Sprint 3: SOCIAL (Facebook, YouTube, Clustering)

**Objetivo**: Facebook/YouTube scrapers funcionan, transcripts se extraen, posts se agrupan correctamente.

**Auditoría**: `AUDIT_SOCIAL.md` (5 casos: FB posts, YT transcripts, failures, clustering, gap-detection)

**Bugs posibles**:
- Facebook scraper no extrae posts
- YouTube transcripts timeout o IP-blocked
- Social clustering fragmenta temas
- Gap detection da false positives

**Success criteria**:
- ✅ 100% de Facebook posts capturados (últimas 24h)
- ✅ 80%+ de YouTube videos con transcripts
- ✅ Social clusters no se fragmentan
- ✅ Gap detection >70% accuracy (manual validation)

**Timeline**: 1-2 semanas

**Resultado**: Social Intelligence confiable. Gaps detectados correctamente.

---

### Sprint 4: EDITORIAL (Editorial Studio, Auto-Review)

**Objetivo**: Automatizar researching → drafting → reviewing → SEO → publishing.

**Requisito previo**: Monitor + Coverage + Social son confiables.

**Por qué después**: Editorial depende de que los datos sean de calidad. Si Monitor está roto, Editorial está escribiendo sobre fragmentos. Si Coverage está mal, Editorial ve agrupaciones falsas. Si Social falla, Editorial pierde oportunidades reales.

**Timeline**: 2 semanas

**Resultado**: Editorial workflow 100% automático.

---

### Sprint 5: SEO INTELLIGENCE

**Objetivo**: Herramientas SEO basadas en contenido de calidad.

**Herramientas**:
- Freshness scoring (trending decay)
- Internal linking (orphaned pages, cannibalization)
- Competitive positioning (benchmarking)
- Schema markup validation
- Performance monitoring

**Requisito previo**: Todo lo anterior es confiable.

**Por qué al final**: Si el crawler pierde artículos, el analysis de "freshness" es incorrecto. Si Coverage fragmenta historias, el analysis de "internal linking" está basado en datos falsos. Si Social falla, las "trending topics" están perdidas.

**Timeline**: 2-3 semanas

**Resultado**: Panorama como motor SEO + Editorial.

---

## Visualización

```
Day 1                                                          Day 56

Sprint 1: MONITOR
├─ Audit: 8 casos → find bugs
├─ Fix: HTTP 403, Playwright retry, logging
└─ Validate: 95%+ articles have content
   ✅ DONE

  └→ Sprint 2: COVERAGE
    ├─ Audit: 4 casos → find gates failing
    ├─ Fix: De-fragmenting, threshold tuning
    └─ Validate: 99%+ valid articles clustered
       ✅ DONE

      └→ Sprint 3: SOCIAL
        ├─ Audit: 5 casos → scraper/transcript issues
        ├─ Fix: Timeouts, retry logic, clustering
        └─ Validate: FB 100%, YT transcripts 80%+
           ✅ DONE

          └→ Sprint 4: EDITORIAL
            ├─ Auto-research, draft, review, SEO, publish
            └─ Validate: 1 hour per article end-to-end
               ✅ DONE

              └→ Sprint 5: SEO INTELLIGENCE
                ├─ Freshness, linking, positioning, schema
                └─ Validate: Ranking improvements, coverage gaps
                   ✅ PRODUCTION READY
```

---

## Por Qué Este Orden

### Monitor First (Not Editorial)

❌ **WRONG**: Sprint 1: Editorial automation
├─ Problem: Crawler is broken (articles are 50% empty)
├─ Result: Editorial writes on fragments
└─ Outcome: Garbage in, garbage out

✅ **RIGHT**: Sprint 1: Monitor (fix crawler)
├─ Problem: Fixed
├─ Span 2: Coverage works on valid articles
└─ Sprint 3+: Everything else builds on solid data

### Coverage Before Editorial

❌ **WRONG**: Build Editorial before Coverage is reliable
├─ Problem: Coverage fragments stories
├─ Result: Editorial sees 4 separate stories instead of 1
└─ Outcome: Wrong research, wrong angles

✅ **RIGHT**: Fix Coverage clustering
├─ Problem: Fixed
├─ Result: Editorial sees unified stories
└─ Outcome: Correct research, correct angles

### Social Before SEO

❌ **WRONG**: Build SEO intelligence before Social works
├─ Problem: Social missing 50% of trending topics
├─ Result: SEO metrics incomplete, gaps undetected
└─ Outcome: Missing opportunities

✅ **RIGHT**: Fix Social Intelligence
├─ Problem: Fixed
├─ Result: SEO sees all topics
└─ Outcome: Complete intelligence

### SEO Last

**When SEO is last, it's built on rock.**

- Monitor: Articles are complete ✅
- Coverage: Stories are correct ✅
- Social: Trends are detected ✅
- Editorial: Content is published ✅
- SEO: Metrics are accurate ✅

---

## Why 8 Weeks Total?

```
Sprint 1 (Monitor):   1-2 weeks    → Debug crawler (critical path)
Sprint 2 (Coverage):  1 week       → Debug grouping
Sprint 3 (Social):    1-2 weeks    → Debug extraction + clustering
Sprint 4 (Editorial): 2 weeks      → Automation + workflows
Sprint 5 (SEO):       2-3 weeks    → Intelligence tools

Total: ~8 weeks to production Panorama
```

**NOT**: "Let's add 50 features in parallel"

**YES**: "Let's get the foundation perfect, then build on it"

---

## What This Prevents

### Scenario: "Let's build Editorial first"

```
Week 1-2: Editorial automation ✅ (looks good!)
Week 3: We notice Editorial is writing articles with holes
Week 4: We realize Monitor is broken (articles are 50% empty)
Week 5-6: We tear out Editorial, rewrite Monitor
Week 7: Editorial still broken (Coverage is fragmenting)
Week 8-9: Rewrite Coverage
Week 10+: Start over (wasted 3 weeks)
```

### Scenario: "Let's do Sprint Roadmap correctly"

```
Week 1-2: Monitor fixed ✅ (solid data)
Week 3: Coverage fixed ✅ (correct grouping)
Week 4-5: Social fixed ✅ (all topics captured)
Week 6-7: Editorial built on solid foundation ✅
Week 8: SEO tools built on reliable metrics ✅
Week 9: Production ready
```

---

## The Golden Rule

**"Every layer above must assume the layer below is bulletproof."**

- Editorial assumes Coverage is correct ← Sprint 2
- Coverage assumes Monitor is correct ← Sprint 1
- Monitor assumes... nothing (it's the foundation)

If any assumption is wrong, everything above breaks.

---

## Execution

1. Do NOT skip audits
2. Each sprint MUST pass its success criteria
3. No merges to main until audit is done
4. No moving to next sprint until current one validates
5. Measure everything (before/after metrics)

---

**START**: Sprint 1, AUDIT_MONITOR.md

**DONE**: Production Panorama in 8 weeks instead of 16 with false starts.
