# Transcript Provider Evaluation

**Contexto:** El proveedor actual (`legacy`) usa el endpoint `api/timedtext` de YouTube directamente. YouTube bloquea este endpoint a nivel IP con HTTP 429. La arquitectura on-demand (Sprint 8.4) resolvió el problema de cuota interna pero no el bloqueo de red. Este documento evalúa `yt-dlp` como proveedor de reemplazo.

**Estado actual:** `transcript_provider = 'legacy'` — desactivado en UI (Sprint 8.4A). Flag `TRANSCRIPTS_ENABLED = false` en frontend.

---

## 1. Integración desde Node.js

Hay dos opciones:

### Opción A — Binary directo via `child_process`

```javascript
import { spawn } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

async function fetchTranscriptYtDlp(url, lang = 'es,es-419,en') {
  const videoId = extractVideoId(url);
  const outPath = join(tmpdir(), `${videoId}.%(ext)s`);

  await new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--write-sub', '--write-auto-sub',
      '--sub-lang', lang,
      '--skip-download',
      '--sub-format', 'json3',
      '--output', outPath,
      '--quiet',
      url,
    ]);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`yt-dlp exited ${code}`)));
    proc.stderr.on('data', d => console.error('[yt-dlp]', d.toString().trim()));
  });

  // Try each language in priority order
  for (const l of lang.split(',')) {
    const file = join(tmpdir(), `${videoId}.${l}.json3`);
    try {
      const raw = JSON.parse(await readFile(file, 'utf8'));
      await unlink(file).catch(() => {});
      return eventsToText(raw.events); // reuse existing parser
    } catch { /* try next */ }
  }
  return null;
}
```

**Ventajas:** sin dependencia npm adicional, control total sobre argumentos.

**Desventajas:** gestión manual de archivos temporales, requiere `yt-dlp` instalado en PATH.

### Opción B — `yt-dlp-wrap` (npm)

```bash
npm install yt-dlp-wrap
```

```javascript
import YTDlpWrap from 'yt-dlp-wrap';

const ytDlp = new YTDlpWrap(); // auto-descarga binary si no existe

async function fetchTranscriptYtDlp(url) {
  const info = await ytDlp.getVideoInfo([url, '--write-sub', '--skip-download']);
  // info.requested_subtitles contiene los tracks disponibles
}
```

**Ventajas:** descarga el binary automáticamente, API Promise-based.

**Desventajas:** dependencia adicional, versión del binary puede quedar desactualizada.

**Recomendación:** Opción A (binary directo). Más predecible, sin intermediario, el binary puede actualizarse independientemente.

---

## 2. Descarga de captions manuales

```bash
yt-dlp --write-sub --sub-lang es,es-419,en --skip-download --sub-format json3 \
       --output "/tmp/%(id)s.%(ext)s" URL
```

- Descarga solo el archivo de subtítulos, no el video.
- Genera `/tmp/<videoId>.<lang>.json3`
- El formato `json3` es idéntico al que devuelve `api/timedtext` — el parser `eventsToText()` existente funciona **sin modificaciones**.

---

## 3. Descarga de captions automáticas (ASR)

```bash
yt-dlp --write-auto-sub --sub-lang es --skip-download --sub-format json3 \
       --output "/tmp/%(id)s.%(ext)s" URL
```

- `--write-sub`: captions manuales (oficiales)
- `--write-auto-sub`: captions generadas automáticamente por YouTube (ASR)
- Usar ambos flags simultáneamente: yt-dlp prioriza manuales sobre automáticas cuando están disponibles para el mismo idioma.

Para listar qué está disponible en un video:
```bash
yt-dlp --list-subs URL
```

---

## 4. Formatos soportados

| Formato | Descripción | Compatibilidad con código actual |
|---------|-------------|----------------------------------|
| `json3` | JSON de YouTube con timestamps | ✅ `eventsToText()` funciona directamente |
| `vtt`   | WebVTT estándar | ❌ requiere parser adicional |
| `srt`   | SubRip Text | ❌ requiere parser adicional |
| `srv1`  | XML con timestamps | ❌ requiere parser adicional |
| `srv2`  | XML comprimido | ❌ requiere parser adicional |
| `ttml`  | TTML/DFXP | ❌ requiere parser adicional |

**Conclusión:** usar `json3` — cero cambios en el pipeline de procesamiento.

---

## 5. Rendimiento promedio

| Operación | Tiempo estimado |
|-----------|----------------|
| Solo subtítulos (`--skip-download`) | **1–4 segundos** |
| Video completo (sin `--skip-download`) | 30–120 segundos |
| `--list-subs` (verificar disponibilidad) | 0.5–2 segundos |

El tiempo depende de la latencia hacia los CDN de YouTube desde el servidor. En producción Linux con buena conectividad: ~1.5s promedio. En desarrollo Windows: ~2–3s.

**Comparación con legacy:** el método `api/timedtext` debería ser más rápido (~0.5s cuando funciona), pero está bloqueado. yt-dlp a 2s es un trade-off aceptable para uso on-demand.

---

## 6. Manejo de errores

yt-dlp tiene manejo de errores robusto incorporado:

| Error | Comportamiento de yt-dlp | Acción en código |
|-------|--------------------------|-----------------|
| Video privado/borrado | Exit code 1 + mensaje en stderr | → `{ available: false, reason: 'private' }` |
| Sin subtítulos disponibles | Exit code 0 + sin archivo generado | → `{ available: false, reason: 'no_captions' }` |
| Rate limiting (429) | **Reintentos automáticos con backoff** | yt-dlp maneja internamente |
| Timeout de red | Exit code 1 | → `null` (retry) |
| Geo-block | Exit code 1 + mensaje "not available" | → `{ available: false, reason: 'geo_block' }` |

La detección de "sin subtítulos" se hace verificando si el archivo de salida fue creado:

```javascript
const file = join(tmpdir(), `${videoId}.es.json3`);
const exists = await access(file).then(() => true).catch(() => false);
if (!exists) return { available: false, reason: 'no_captions' };
```

---

## 7. Compatibilidad Windows

- Binary disponible en `.exe`: `yt-dlp.exe`
- Instalación: `winget install yt-dlp` / `choco install yt-dlp` / descarga directa desde GitHub Releases
- Ruta de PATH: debe estar en `C:\Users\<user>\AppData\Local\Microsoft\WinGet\Links\` o similar
- **Problema conocido:** rutas con espacios o caracteres especiales en Windows pueden causar problemas con el argumento `--output`. Usar siempre `tmpdir()` que retorna rutas sin espacios.
- Funciona con WSL si se prefiere el binario Linux.

Para detectar en Node.js:
```javascript
import { execSync } from 'child_process';
const ytDlpPath = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
try { execSync(`${ytDlpPath} --version`); } catch { throw new Error('yt-dlp not found in PATH'); }
```

---

## 8. Compatibilidad Linux

- Instalación: `pip install yt-dlp` / `apt install yt-dlp` / binary directo
- **Opción de producción recomendada:** binary standalone descargado en `/usr/local/bin/yt-dlp`
  ```bash
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
  chmod +x /usr/local/bin/yt-dlp
  ```
- Compatible con Docker — agregar al Dockerfile de producción
- Sin dependencias del sistema (Python no requerido con binary standalone)

---

## 9. Licencia

- **yt-dlp:** Licencia Unlicense (dominio público) — sin restricciones de uso comercial
- **youtube-dl** (predecesor): licencia similar, pero yt-dlp es el fork activamente mantenido
- **Advertencia legal:** yt-dlp bypasea medidas técnicas de YouTube. Los Términos de Servicio de YouTube prohíben la descarga de contenido. Para uso periodístico/editorial hay precedentes de uso legítimo, pero consultar con asesor legal si escala a volumen alto.

---

## 10. Dependencias necesarias

| Dependencia | Requerida | Alternativa |
|-------------|-----------|-------------|
| `yt-dlp` binary | ✅ Sí | N/A |
| Python | ❌ No (con binary standalone) | Solo si se instala via pip |
| `ffmpeg` | Solo para conversión de formatos | No necesario con json3 |
| npm `yt-dlp-wrap` | ❌ No (Opción A) | Solo si se usa Opción B |

Para el proyecto (Opción A, binary directo, formato json3): **única dependencia es el binary `yt-dlp`**.

---

## Recomendación final

**Proveedor recomendado: yt-dlp (Opción A — binary directo)**

### Justificación

1. **Resuelve el problema raíz:** yt-dlp usa estrategias de evasión de rate limiting que el fetch directo no tiene (rotación de cookies, headers, user-agent, reintentos con backoff).
2. **Cero cambios en el pipeline:** el formato `json3` es idéntico al de `api/timedtext`. La función `eventsToText()` existente funciona sin modificaciones.
3. **La feature flag ya existe:** `transcript_provider` en `settings` tabla, `'ytdlp'` ya es el valor anticipado. Solo implementar el handler en `social.js`.
4. **Rendimiento aceptable:** 1–4s para subtítulos only. Para uso on-demand (1 video por vez, gatillado por editor) es invisible.
5. **Cross-platform:** funciona igual en Windows (desarrollo) y Linux (producción).

### Plan de integración (cuando se decida implementar)

```
1. Instalar binary yt-dlp en entorno de dev y producción
2. En transcripts.js: agregar fetchYouTubeTranscriptYtDlp() con Opción A
3. En social.js POST /posts/:id/transcript: cuando provider='ytdlp', llamar nueva función
4. UPDATE settings SET value='ytdlp' WHERE key='transcript_provider';
5. SET TRANSCRIPTS_ENABLED = true en SocialOpportunities.jsx
6. Testear con 3–5 videos conocidos
```

### Riesgos

- **YouTube puede detectar y bloquear yt-dlp** en el futuro (precedente: youtube-dl DMCA 2020, revertido). Probabilidad baja a corto plazo dado el volumen bajo de Panorama.
- **Actualización del binary:** yt-dlp se actualiza frecuentemente para adaptarse a cambios de YouTube. Necesita proceso de actualización periódica (mensual como mínimo).
- **Latencia en producción:** si el servidor de producción tiene restricciones de egress o latencia alta hacia CDN de YouTube, puede ser >4s. Medir en el entorno real antes de activar.
