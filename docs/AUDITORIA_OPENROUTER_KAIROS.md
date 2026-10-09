# Auditoría estática: KRONOS / Kairos ↔ OpenRouter

Auditoría de **solo lectura** sobre `donovan-hue/Kronos-space.com`.
No se generó contenido, no se consumió crédito, no se modificó el backend.

## Versiones auditadas

| | Commit |
|---|---|
| Producción (desplegado) | `ee49ebe` |
| `main` (repositorio) | `4278b64` — 14 commits por delante |

`ee49ebe` es ancestro de `4278b64`. **El backend se movió dos veces durante la
sesión** (`9c97928` → `4278b64`), así que cada hallazgo distingue qué está en
producción y qué solo en el repositorio.

---

## 1 · Proveedor y modelo por capability

`server/src/config/aiProviders.js`

| Capability | Proveedor | Modelo por defecto | API key |
|---|---|---|---|
| `chat` | `gemini` | `gemini-3.6-flash` | `GEMINI_API_KEY` |
| `image` | **openrouter** | `google/gemini-2.5-flash-image` | `OPENROUTER_API_KEY` |
| `script` | **openrouter** | `openrouter/free` | `OPENROUTER_API_KEY` |
| `video` | `video-api` | `video-generation` | `VIDEO_API_KEY` + `VIDEO_API_URL` |

- Modelo resuelto en `aiProviders.js:42-44`: `process.env[modelEnv] || defaultModel`.
- `configured` (`:52-55`) exige clave **y**, si hay `endpointEnv`, también endpoint.

## 2 · Conexión con OpenRouter

`server/src/config/openrouter.js`

- Base oficial: `https://openrouter.ai/api/v1` (`:12`).
- Sobreescribible solo con `OPENROUTER_BASE_URL` (`:20-24`).
- Cliente único `createOpenRouterClient` (`:54`).
- `maxRetries = 0` (`:59`): generar no es idempotente, un reintento duplicaría costo.
- Sin clave lanza `OPENROUTER_API_KEY_NOT_CONFIGURED` (`:62`).

## 3 · Construcción de la petición de imagen

`server/src/modules/image-ai/image.service.js`

- Prompt compuesto (`:25-32`): `Estilo visual: <estilo>.\n<prompt>\nEvita: <negativo>.`
- Cuerpo armado por `buildImageRequestBody` según capacidades declaradas (`:311-353`).
- **Con `declared === null` → cuerpo mínimo `{model, prompt}`** (`:146-152`).

## 4 · Respuesta esperada

`response.data[0]` con `b64_json` o `url`:

| Campo | Manejo |
|---|---|
| `b64_json` | `decodeBase64Image()` — `:237` |
| `url` | `downloadProviderImage()` con guarda SSRF — `:239` |
| ninguno | `OPENROUTER_IMAGE_FORMAT_UNKNOWN` — `:241` |

Validación de bytes reales (`:34-73`): magic numbers JPEG/PNG/WebP y ≤ 10 MB.

## 5 · Persistencia

```
persistProviderImage(image, ownerId)          image.service.js:234
  → saveBuffer({..., subdir:"media", ownerId})   :244
      → escribe /uploads/media/<ts>-<rand>.<ext>   storage.js:47-48
      → rememberUpload()  (await)                 storage.js:55
          → GridFS bucket "kronosUploads"         durableUploads.js:23
              metadata.ownerId                    durableUploads.js:57
  → publicUrl = /uploads/media/<nombre>           storage.js:51
```

`saveBuffer` **espera** a que GridFS confirme antes de devolver la URL:
no anuncia un upload durable antes de que exista.

## 6 · Registro `ImageGeneration`

`server/src/modules/image-ai/ImageGeneration.js`: `user`, `prompt`,
`negativePrompt`, `style` (enum), `model`, `provider`,
`status` (`queued`/`processing`/`completed`/`failed`), `imageUrl`, `error`,
timestamps, índice `{user: 1, createdAt: -1}`.

## 7 · Controles de acceso sobre `/uploads`

**En el repositorio** (`middleware/mediaAcl.js`, montado en `server.js:114`
antes de `express.static`):

- `avatars`/`covers` → públicos (`:106`).
- Fuera de `/uploads/media/` → `deny()` (`:111`).
- Dueño según `metadata.ownerId` en GridFS → permite (`:119-128`).
- Si no: Post → Story → Message → Draft, aplicando su audiencia (`:131-190`).
- Si nada aplica → `deny()` → **404** (`:11-14`).

**En producción**: ver defecto **D1**.

---

## Defectos y riesgos

### 🔴 D1 · ACL de medios no desplegado — `/uploads` es público en producción

| | |
|---|---|
| Ubicación | `server/src/server.js:113` en `ee49ebe` |
| Producción | `app.use("/uploads", express.static(uploadsRoot, { maxAge: "7d", etag: true }));` — **sin `mediaAcl`** |
| Repositorio | `server.js:114-115` ya monta `mediaAcl` antes de `static` |
| Origen | Commit `64c4957` *"feat: add media access control and durable upload ownership"* — **no incluido en `ee49ebe`** |
| Impacto | Cualquier `/uploads/media/<archivo>` es legible por URL sin autenticación: imágenes de Kairos, adjuntos de mensajes y borradores |
| Corrección | **Desplegar `main`.** No requiere cambio de código: el fix ya existe |

> No es un defecto de código. Es código correcto que no se ha desplegado.

### 🟠 D2 · El catálogo de capacidades nunca funciona

| | |
|---|---|
| Ubicación | `image.capabilities.js:47` |
| Problema | `encodeURIComponent(slug)` convierte la barra en `%2F` → ruta inexistente → **404** |
| Capa adicional | La petición **no envía `Authorization`** (`:49-55` solo `Accept`, `HTTP-Referer`, `X-Title`) → aun con la URL correcta devolvería **403** |
| Impacto hoy | **Inofensivo**: el fallo se captura y se cae al cuerpo mínimo `{model, prompt}`, que funciona |
| Riesgo oculto | Corregir **solo** la línea 47 no cambia nada (seguiría 403). Corregirla **con** la clave activaría el envío de `size: "1024x1024"` cuando el modelo lo declare, y eso puede provocar un **400** |
| Corrección | Corregir la URL **y** añadir `Authorization`; probar después con una generación |

### 🟠 D3 · Sin crédito en OpenRouter

`402 Insufficient credits. This account never purchased credits.`
`middleware/aiError.js:51-59` lo traduce a **503**.
**No tiene arreglo por código.** Requiere recargar la cuenta.

### 🟡 D4 · El smoke de CI valida un modelo que producción no usa

`.github/workflows/smoke-openrouter.yml:55` fija
`OPENROUTER_IMAGE_MODEL: inclusionai/ming-image-0.1-design`,
mientras producción usa `google/gemini-2.5-flash-image`.

- **No afecta producción**: la variable vive solo en el runner de CI. No aparece
  en ningún manifest de despliegue.
- **Pero**: un CI en verde demuestra que el *cableado* funciona, **no** que el
  modelo de producción funcione.

### 🟡 D5 · Video sin proveedor

`aiProviders.js:20-25` y `.env.example:78-79`: `VIDEO_API_KEY` y
`VIDEO_API_URL` vacías; no hay proveedor ni SDK en el repositorio.

El flujo asíncrono existente (`POST` → `id` → `GET {endpoint}/{id}` → `url`)
coincide 4 de 5 con la API de video de OpenRouter. La única diferencia es que
OpenRouter devuelve el vídeo en `unsigned_urls[0]` (array), mientras
`video.service.js:37` busca `url` / `videoUrl` / `video_url`.

### ⚪ D6 · Valor por defecto obsoleto

`ImageGeneration.js:30` → `default: "gpt-image-1"`. Impacto nulo: la ruta de
generación siempre asigna `provider.model` (`:291`). Solo higiene documental.

### ⚪ D7 · Errores no estructurados

`image.service.js:337` y `image.capabilities.js:112` usan `console.error`.

---

## Diferencia CI vs Producción

```yaml
# .github/workflows/smoke-openrouter.yml:55 — job "provider"
OPENROUTER_IMAGE_MODEL: inclusionai/ming-image-0.1-design
```

| | Modelo | Dónde se define |
|---|---|---|
| CI (fase directa) | `inclusionai/ming-image-0.1-design` | Forzado en el runner |
| Producción | `google/gemini-2.5-flash-image` | `aiProviders.js:12` o Render |
| CI (fase `deployed`) | el del backend | **No** fija modelo |

Motivo: `ming-image` cuesta $0.00; el cron semanal corre con `SMOKE_IMAGE=0`.

---

## Flujo real esperado

```
Kairos
  │ POST /api/ai/images/generate   [auth + requireUser + aiLimiter]
  ▼
generateImage()                                    image.service.js:270
  ├─ getAIProviderConfig("image")                                :284
  ├─ ImageGeneration.create(status:"processing")                 :285-292
  ├─ createOpenRouterClient({ apiKey, 45s, maxRetries:0 })       :300
  ├─ getImageCapabilities(model)                                 :310
  │     ✗ 404 (encodeURIComponent)  ✗ 403 (sin Authorization)   [D2]
  │     → null → cuerpo MÍNIMO {model, prompt}
  ├─ client.images.generate(body)                                :334
  │     ✗ 402 sin crédito → aiError → 503                        [D3]
  ▼
response.data[0] → b64_json | url (SSRF)
  ▼ ensureImageBuffer()  magic bytes · ≤10 MB
  ▼ saveBuffer()  → disco + GridFS (await)
  ▼ /uploads/media/<nombre>
  ▼ ImageGeneration.update(status:"completed", imageUrl)         :374-378
  ▼
GET /uploads/media/<nombre>
  ├─ mediaAcl                                    ← NO EN PRODUCCIÓN [D1]
  ├─ express.static      → disco
  └─ serveDurableUpload  → GridFS si el disco ya no lo tiene
```

---

## Pruebas seguras sin costo

| # | Prueba | Costo |
|---|---|---|
| 1 | `server/test/openrouter.contract.test.js` (16 tests) | Cero — offline, clave falsa `"clave-de-prueba-no-real"` |
| 2 | `server/test/openrouter-smoke.contract.test.js` (5 tests) | Cero |
| 3 | `getAIProviderConfig()` con entorno simulado | Cero |
| 4 | `buildImageRequestBody()` en aislado (función pura) | Cero |

**Descartadas por riesgo:** `node scripts/openrouter-smoke.js` (la fase 4 de
guion es una petición real con clave) y cualquier fase con `SMOKE_IMAGE=1`.

---

## Recomendación de orden

1. **Desplegar `main`** → corrige D1 sin tocar código.
2. Pruebas 1-4 (costo cero) → confirman cableado.
3. **Recargar crédito** → desbloquea D3.
4. Una generación real → valida el modelo de producción.
5. Solo entonces D2, porque arreglarlo cambia el cuerpo enviado.
