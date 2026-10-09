# Auditoría — Orden Maestra (42 temas)

**Repositorio auditado:** `donovan-hue/KRONOS_MCP`
**Rama:** `arena/01a10610-kronos-mcp`
**Commit base:** `5f16358`
**Fecha:** 2026-10-07
**Método:** inspección directa de código, tests, configuración y documentación. Sin suposiciones.

## Regla de clasificación

Un punto solo se marca `[x]` si está **implementado, integrado y verificado**.
Tener un archivo creado no cuenta como completado.

| Código | Significado |
|---|---|
| `[x]` | EXISTENTE Y FUNCIONAL |
| `[~]` | EXISTENTE PERO INCOMPLETO |
| `[ ]` | FALTA DESARROLLAR |
| `[!]` | REQUIERE DECISIÓN / CONFIGURACIÓN EXTERNA |

**Ámbito:** `MCP` = este repositorio · `BACKEND` = `donovan-hue/Kronos-space.com` · `EXT` = decisión externa.

## Evidencias abreviadas

| Ref | Archivo |
|---|---|
| `IDX` | `src/index.ts` |
| `SRV` | `src/server.ts` |
| `API` | `src/services/kronos-api.ts` |
| `AUTH` | `src/services/kronos-auth.ts` |
| `ENV` | `src/config/env.ts` |
| `MCPCFG` | `src/config/mcp.ts` |
| `ERR` | `src/tools/tool-error.ts` |
| `T*` | `src/tools/kronos-*.ts` |
| `VER` | `scripts/verify-mcp.mjs` |
| `DIA` | `scripts/diagnose-kronos.mjs` |
| `VCFG` | `scripts/verification-config.mjs` |
| `T1` | `tests/mcp.test.ts` |
| `T2` | `tests/verification.test.ts` |
| `T3` | `tests/upstream-diagnostics.test.ts` |

---

## 1. MCP CORE — Ámbito MCP

| Subtema | Estado | Evidencia |
|---|---|---|
| Servidor MCP | `[x]` | `SRV:7` `createKronosServer()` |
| MCP SDK | `[x]` | `@modelcontextprotocol/sdk ^1.31.0`, `package.json` |
| Inicialización | `[x]` | `IDX:12-13` |
| Handshake | `[x]` | Verificado en `VER` (cliente SDK real) |
| `tools/list` | `[x]` | `VER` valida los 3 nombres |
| `tools/call` | `[x]` | `VER` invoca las 3 tools |
| `resources/list` | `[ ]` | No existe ningún `registerResource` |
| `resources/read` | `[ ]` | No existe |
| `prompts/list` | `[ ]` | No existe ningún `registerPrompt` |
| `prompts/get` | `[ ]` | No existe |
| Schemas | `[x]` | zod en las 3 tools |
| `outputSchema` | `[x]` | `T*`, p. ej. `src/tools/kronos-me.ts:11` |
| `structuredContent` | `[x]` | `T*`, p. ej. `src/tools/kronos-me.ts:16` |
| Errores MCP | `[x]` | `ERR:9-12` (`isError: true`) |
| Timeouts | `[x]` | `API:4` `REQUEST_TIMEOUT_MS = 10_000` |
| Cancelación | `[~]` | Hay `AbortController` + `cancelBody` (`API:52-60`); **no** hay cancelación de `tools/call` |
| Límites de respuesta | `[x]` | `API:5` `MAX_RESPONSE_BYTES = 1 MiB`, lectura acotada `API:62-95` |
| Validación de entrada | `[x]` | `inputSchema: z.object({}).strict()` |
| Validación de salida | `[x]` | `outputSchema` + `safeParse` (`API:168`) |

**Resumen:** 15 `[x]` · 1 `[~]` · 4 `[ ]`

---

## 2. TRANSPORTE STDIO — Ámbito MCP

Transporte obligatorio actual: **STDIO**. No se sustituye.

| Subtema | Estado | Evidencia |
|---|---|---|
| `stdin` | `[x]` | `IDX:13` `StdioServerTransport` |
| `stdout` | `[x]` | Reservado exclusivamente a MCP (`IDX:10` comentario) |
| Comunicación bidireccional | `[x]` | SDK |
| JSON-RPC | `[x]` | SDK |
| MCP Protocol | `[x]` | SDK |
| `initialize` | `[x]` | Verificado en `VER` |
| `initialized` | `[x]` | SDK |
| `ping` | `[x]` | `VER` ejecuta ping |
| `tools/list` | `[x]` | `VER` |
| `tools/call` | `[x]` | `VER` |
| `resources/list` | `[ ]` | Sin recursos |
| `resources/read` | `[ ]` | Sin recursos |
| `prompts/list` | `[ ]` | Sin prompts |
| `prompts/get` | `[ ]` | Sin prompts |
| Mensajes cliente → servidor | `[x]` | SDK |
| Mensajes servidor → cliente | `[x]` | SDK |
| Manejo de errores | `[x]` | `ERR` + `T2` (escenarios 401/403/429/network) |
| Cancelación | `[~]` | `API:52-60`; sin cancelación MCP |
| Timeout | `[x]` | `API:111-123` deadline único (cabeceras + cuerpo) |
| Cierre limpio del proceso | `[~]` | No hay handler explícito de `SIGINT`/`SIGTERM` |
| Integridad del stream | `[x]` | `redirect: "error"` (`API:130`), lectura acotada |
| Separación `stdout`/`stderr` | `[x]` | `dotenv` en modo `quiet` (`IDX:11`) |
| Logs exclusivamente por `stderr` | `[x]` | Sin `console.log` en `src/`; dotenv silenciado |
| Compatibilidad con clientes MCP | `[x]` | `VER` usa `StdioClientTransport` |
| Tests específicos de STDIO | `[x]` | `T2` levanta procesos stdio reales |

**Resumen:** 20 `[x]` · 2 `[~]` · 4 `[ ]`

---

## 3. AUTENTICACIÓN — Ámbito MCP + BACKEND

| Subtema | Estado | Evidencia |
|---|---|---|
| MCP Token | `[x]` | `MCPCFG:1-5` `getKronosMcpToken()` |
| Sesiones | `[ ]` | No hay gestión de sesiones |
| Credentials | `[x]` | `KRONOS_MCP_TOKEN` vía `.env` privado |
| Rotación | `[ ]` | No existe |
| Revocación | `[!]` | Depende del backend (`/api/mcp/me`) |
| Scopes | `[ ]` | No existe |
| Permisos | `[~]` | `identitySchema.permissions` se **lee** (`AUTH:9`) pero no se aplica |
| Ownership | `[ ]` | No existe |
| Roles | `[ ]` | No existe |
| Auditoría | `[ ]` | No existe |
| Expiración | `[ ]` | No existe |
| Invalidación | `[!]` | Externa (backend) |
| Protección de secretos | `[~]` | No se imprimen (`DIA` `safeTarget`); sin rotación |

**Resumen:** 2 `[x]` · 2 `[~]` · 7 `[ ]` · 2 `[!]`

---

## 4. KRONOS CORE — Ámbito BACKEND

Ningún ítem existe en este repositorio. No hay herramientas de perfil, usuario, proyectos, archivos, library, historial, publicaciones, notificaciones, permisos ni preferencias.

| Subtema | Estado |
|---|---|
| Perfil · Usuario · Configuración · Proyectos · Archivos · Library · Historial · Publicaciones · Notificaciones · Permisos · Preferencias | `[ ]` (11) |

**Resumen:** 0 `[x]` · 11 `[ ]`

---

## 5. KAIROS ENGINE — Ámbito BACKEND

No existe motor de IA, orquestador, router ni sistema de jobs en este repositorio.

| Subtema | Estado |
|---|---|
| Motor IA · Orquestador · Model Router · Provider Router · Task Router · Capability Router · Fallback · Retry · Queue · Jobs · Estados · Cancelación · Progreso · Resultados | `[ ]` (14) |

**Resumen:** 0 `[x]` · 14 `[ ]`

---

## 6. PROVEEDORES DE IA — Ámbito BACKEND (config) / MCP (sin adapters)

**Direct Providers**

| Subtema | Estado | Nota |
|---|---|---|
| OpenAI | `[ ]` | No hay adapter |
| Google Gemini | `[~]` | Existe en el **backend** (`aiProviders.js:2-7`, solo `chat`) |
| Proveedor actual de video | `[!]` | Backend usa `video-api` genérico; falta confirmar `VIDEO_API_URL` |
| Proveedores especializados de imagen | `[~]` | Backend usa OpenRouter para imagen |
| Proveedores especializados de video | `[ ]` | No hay |
| Audio · Voz · Música · Speech-to-Text | `[ ]` | No hay (4) |
| Futuros proveedores | `[ ]` | Sin arquitectura de adapters |

**AI Router / Gateway**

| Subtema | Estado | Nota |
|---|---|---|
| OpenRouter | `[~]` | Usado por el **backend**; sin adapter en MCP |
| Vercel AI Gateway | `[ ]` | No existe |

**SDK / Abstracción**

| Subtema | Estado | Nota |
|---|---|---|
| Vercel AI SDK | `[ ]` | No |
| OpenAI SDK | `[ ]` | No en este repo (sí en el backend, `openai ^5.16.0`) |
| OpenAI Agents SDK | `[ ]` | No |
| OpenRouter API/SDK | `[ ]` | No en MCP |
| OpenRouter Agent/MCP | `[ ]` | No |
| Gemini SDK/API | `[ ]` | No |
| KRONOS MCP | `[x]` | Este repositorio |

**Separación requerida «Proveedor → SDK/API → Adapter → Router → Modelo»:** `[ ]` — no existe ninguna de esas capas en MCP.

**Resumen:** 1 `[x]` · 3 `[~]` · 16 `[ ]` · 1 `[!]`

---

## 7. PROVIDER ADAPTERS — Ámbito MCP

No existe ninguna arquitectura de adapters.

| Subtema | Estado |
|---|---|
| Provider ID · Credentials · Configuración · Environment · Modelos · Capacidades · Request Adapter · Response Adapter · Error Adapter · Streaming · Timeout · Retry · Rate Limit · Cost Tracking · Usage Tracking · Health Check · Availability · Tests · Versionado | `[ ]` (19) |

**Resumen:** 0 `[x]` · 19 `[ ]`

---

## 8. CATÁLOGO DE MODELOS — Ámbito MCP

No existe catálogo. En el backend existe `getAIProviderCatalog()` (`aiProviders.js:59`) pero **no está expuesto por ninguna ruta HTTP** (0 usos).

| Subtema | Estado |
|---|---|
| Lista de modelos · ID · Provider · Versión · Modalidad · Capacidades · Resolución · Duración · Context Window · Límites · Precio · Disponibilidad · Estado · Modelo recomendado · Input formats · Output formats | `[ ]` (16) |

**Resumen:** 0 `[x]` · 16 `[ ]`

---

## 9-23 · CAPACIDADES DE PRODUCTO — Ámbito BACKEND

| # | Tema | Subtemas | Estado |
|---|---|---|---|
| 9 | IA de texto | Generación · Chat · Reescritura · Resumen · Expansión · Traducción · Clasificación · Extracción · Structured Output · Tool Calling · Streaming | `[ ]` (11) — el backend solo expone `chat` y `script` |
| 10 | IA de imagen | Text→Image · Image→Image · Edit · Variaciones · Inpainting · Outpainting · BG Removal · BG Replacement · Upscale · Restauración · Color · Filtros · Estilos · Referencias | `[ ]` (14) — backend: solo Text→Image |
| 11 | IA de video | Text→Video · Image→Video · Video→Video · Edit · Extend · Upscale · Interpolación · Efectos · Transiciones · Movimiento · Estilo · Render · Preview | `[ ]` (13) |
| 12 | IA de audio | Audio Generate · Edit · Noise Removal · Enhancement · Separation · Mixing · Mastering · Effects · Normalización | `[ ]` (9) |
| 13 | IA de voz | TTS · Voice Generation · Conversion · Cloning · Editing · Enhancement · Idiomas · Voces · Emociones · Consentimiento | `[ ]` (10) |
| 14 | IA de música | Generate · Extend · Edit · Instrumental · Vocals · Loops · Variaciones · Géneros · Duración | `[ ]` (9) |
| 15 | Speech / transcripción | Speech→Text · Transcripción · Hablantes · Timestamps · Traducción · Limpieza · Subtítulos | `[ ]` (7) |
| 16 | Subtítulos | Generación · Sincronización · Estilos · Animaciones · Posición · Tipografía · Exportación · Formatos | `[ ]` (8) |
| 17 | Script / contenido | Generate · Rewrite · Expand · Shorten · Ideas · Narrativa · Diálogos · CTA · Descripciones · Metadata | `[~]` parcial en backend (solo *generate*) · `[ ]` el resto |
| 18 | Storyboard | Generate · Escenas · Shots · Cámara · Movimiento · Narración · Assets · Actualización · Versiones | `[ ]` (9) |
| 19 | Proyectos KAIROS | Crear · Abrir · Actualizar · Duplicar · Versionar · Eliminar · Compartir · Restaurar · Renderizar · Preview | `[ ]` (10) |
| 20 | Editor multimedia | Timeline · Tracks · Assets · Layers · Texto · Imagen · Video · Audio · Música · Voz · Subtítulos · Efectos · Transiciones · Render | `[ ]` (14) |
| 21 | Library | List · Search · Get · Upload · Download · Organize · Tags · Folders · Metadata · Delete · Versiones · Ownership · ACL | `[ ]` (13) |
| 22 | Historial | Historial · Jobs · Resultados · Versiones · Restore · Regenerate · Duplicar · Eliminar | `[~]` parcial en backend (`/history` de imagen y video) · `[ ]` el resto |
| 23 | Plantillas | Templates · List · Get · Crear · Editar · Duplicar · Usar · Compartir · Categorías | `[ ]` (9) |

---

## 24-31 · ECONOMÍA Y ALMACENAMIENTO — Ámbito BACKEND

| # | Tema | Subtemas | Estado |
|---|---|---|---|
| 24 | Créditos | Balance · Consumo · Estimación · Historial · Coste por modelo · Coste por operación · Conversión USD · Créditos adicionales · Límites · Reservas | `[ ]` (10) |
| 25 | Billing | Planes · Suscripciones · Add-ons · Créditos · Pagos · Facturación · Límites · Usage · Stripe · Webhooks | `[ ]` (10) |
| 26 | Cost Engine | Coste proveedor · Coste modelo · Input · Output · Duración · Resolución · Conversión a créditos · Margen · Estimación previa · Coste real · Registro | `[ ]` (11) |
| 27 | Model Router | Selección manual · Automática · Cost · Quality · Speed · Capability matching · Fallback · Failover · Provider ranking · Model ranking · Availability · Limits | `[ ]` (12) |
| 28 | Job System | Crear · Queue · Pending · Processing · Completed · Failed · Cancelled · Retry · Progress · Result · Logs · Provider Job ID · Model Job ID | `[~]` parcial en backend (video: `queued`/`completed`/`failed`) · `[ ]` el resto |
| 29 | Storage | Upload · Download · GridFS · Metadata · Ownership · ACL · URLs · Expiración · CDN · Cleanup · Versionado · Seguridad | `[ ]` (12) en MCP · parcial en backend |
| 30 | Exportación | Imagen · Video · Audio · Música · Subtítulos · Script · Storyboard · Proyecto · Formatos · Calidad · Descarga | `[ ]` (11) |
| 31 | Publicación KRONOS | Crear · Editar · Publicar · Programar · Borrador · Privacidad · Audiencia · Remix · Eliminar · Media ACL · Ownership | `[ ]` (11) |

---

## 32. USER TOOLS — Ámbito MCP

Hoy existen **3 herramientas**, todas de solo lectura y de diagnóstico.

| Subtema | Estado | Evidencia |
|---|---|---|
| Consultar modelos | `[ ]` | No existe |
| Consultar créditos | `[ ]` | No existe |
| Consultar historial | `[ ]` | No existe |
| Crear / editar contenido | `[ ]` | No existe |
| Generar imagen / video / audio / música / voz | `[ ]` | No existe |
| Transcribir · Subtitular | `[ ]` | No existe |
| Crear / editar proyecto · Renderizar · Exportar · Publicar | `[ ]` | No existe |
| Diagnóstico (estado, salud, identidad) | `[x]` | `kronos_status`, `kronos_health`, `kronos_me` |

**Resumen:** 1 `[x]` · 16 `[ ]`

---

## 33. AI TOOLS — Ámbito MCP

No existen herramientas internas de ejecución u orquestación de IA.

| Subtema | Estado |
|---|---|
| Generación · Edición · Transformación · Análisis · Selección de modelo · Orquestación · Planificación · Ejecución · Verificación · Regeneración · Fallback | `[ ]` (11) |

---

## 34. PROVIDER TOOLS — Ámbito MCP

| Subtema | Estado |
|---|---|
| Provider List · Get · Health · Models · Capabilities · Usage · Cost · Status | `[ ]` (8) |

---

## 35. ADMIN TOOLS — Ámbito MCP

| Subtema | Estado |
|---|---|
| Configurar / activar / desactivar proveedor · Configurar / activar / desactivar modelo · Precios · Créditos · Límites · Health · Usage · Auditoría | `[ ]` (12) |

Nota: ninguna herramienta administrativa está expuesta. Correcto por diseño, pero la capacidad no existe.

---

## 36. MCP RESOURCES — Ámbito MCP

No hay ningún `registerResource` en el repositorio.

| Subtema | Estado |
|---|---|
| `kronos://profile` · `kronos://permissions` · `kronos://settings` · `kairos://projects` · `kairos://project/{id}` · `kairos://library` · `kairos://history` · `kairos://credits` · `kairos://models` · `kairos://jobs/{id}` · `kairos://templates` | `[ ]` (11) |

---

## 37. MCP PROMPTS — Ámbito MCP

No hay ningún `registerPrompt`.

| Subtema | Estado |
|---|---|
| Crear video · imagen · Short · anuncio · historia · publicación · campaña · música · voz · proyecto multimedia | `[ ]` (10) |

---

## 38. AGENT SKILLS — Ámbito MCP

| Subtema | Estado |
|---|---|
| Image · Video · Audio · Music · Voice Production · Storyboarding · Content Production · Social Publishing · Project Management · Model Selection · Cost Optimization | `[ ]` (11) |

---

## 39. OBSERVABILIDAD — Ámbito MCP

| Subtema | Estado | Evidencia |
|---|---|---|
| Logs | `[~]` | Solo `console.error` local; sin logger estructurado |
| Metrics | `[ ]` | No |
| Traces | `[ ]` | No |
| Provider usage · Model usage · Credits usage | `[ ]` | No (3) |
| Error tracking | `[~]` | Códigos propios (`API:35-40`), sin agregación |
| Performance · Latency | `[~]` | `DIA` mide `headersMs`/`elapsedMs`; sin serie histórica |
| Cost monitoring | `[ ]` | No |
| Job monitoring | `[ ]` | No |

**Resumen:** 0 `[x]` · 4 `[~]` · 7 `[ ]`

---

## 40. SEGURIDAD — Ámbito MCP

| Subtema | Estado | Evidencia |
|---|---|---|
| Authentication | `[x]` | `MCPCFG`, `AUTH` → `AUTH_REQUIRED` |
| Authorization | `[~]` | Sin aplicación de permisos |
| Scopes | `[ ]` | No |
| ACL | `[ ]` | No |
| Ownership | `[ ]` | No |
| Secrets | `[x]` | `.gitignore` excluye `.env` y `.env.*`; sin secretos en el historial |
| API keys | `[x]` | Token nunca se imprime (`DIA` `safeTarget`) |
| Rate limiting | `[ ]` | No (está en el backend) |
| Abuse prevention | `[ ]` | No |
| Audit logs | `[ ]` | No |
| Input validation | `[x]` | Schemas `.strict()` |
| Output validation | `[x]` | `outputSchema` + `safeParse` |
| SSRF protection | `[~]` | `ENV:16` exige `https:` y hostname fijo; sin allowlist de hosts |
| Redirect protection | `[x]` | `redirect: "error"` (`API:130`) |
| Credential protection | `[~]` | Sin rotación ni expiración |

**Resumen:** 5 `[x]` · 4 `[~]` · 6 `[ ]`

---

## 41. TESTING — Ámbito MCP

| Subtema | Estado | Evidencia |
|---|---|---|
| Unit tests | `[x]` | `T1` |
| Integration tests | `[x]` | `T2` (procesos stdio reales) |
| MCP tests | `[x]` | `T1`, `T2` |
| STDIO tests | `[x]` | `T2` |
| Provider tests | `[ ]` | No hay providers |
| Model tests | `[ ]` | No hay modelos |
| Tool tests | `[x]` | `T1`, `T2` |
| Resource tests | `[ ]` | No hay recursos |
| Prompt tests | `[ ]` | No hay prompts |
| E2E | `[!]` | Requiere `--live` + credencial real (`VER`) |
| Failure tests | `[x]` | `T2`: 401/403/429/network/invalid-json/invalid-schema |
| Timeout tests | `[x]` | `T3` (deadline de cabeceras y cuerpo) |
| Rate-limit tests | `[x]` | `T2` (escenario 429) |
| Security tests | `[~]` | `T2`: no fuga de identidad/permisos; sin suite dedicada |
| Cost tests | `[ ]` | No hay costes |
| Cancellation tests | `[x]` | `T3` (cancelación de cuerpos no leídos) |
| Invalid payload tests | `[x]` | `T1` (input extra rechazado) |

**Resultado verificado en este commit:** `build` limpio · **34/34 tests** en verde.

**Resumen:** 9 `[x]` · 1 `[~]` · 6 `[ ]` · 1 `[!]`

---

## 42. DOCUMENTACIÓN — Ámbito MCP

| Subtema | Estado | Evidencia |
|---|---|---|
| MCP | `[x]` | `README.md` |
| Tools | `[x]` | `README.md:26` |
| Resources | `[ ]` | No aplica (no existen) |
| Prompts | `[ ]` | No aplica |
| Skills | `[ ]` | No aplica |
| Providers | `[ ]` | No |
| Models | `[ ]` | No |
| Credentials | `[x]` | `README.md:86` |
| APIs | `[x]` | `docs/DIAGNOSTICO_MCP.md` |
| SDKs | `[~]` | Parcial |
| Arquitectura | `[~]` | Implícita; sin documento dedicado |
| Deployment | `[x]` | `README.md:11` |
| Troubleshooting | `[x]` | `docs/DIAGNOSTICO_TIMEOUT_ME.md`, `README.md:73` |
| Seguridad | `[~]` | Dispersa |
| Costos | `[ ]` | No |
| Créditos | `[ ]` | No |
| Verificación | `[x]` | `docs/VERIFICACION_MCP.md` |
| Análisis zod | `[x]` | `docs/ANALISIS_ZOD.md` |
| **Auditoría Orden Maestra** | `[x]` | Este archivo |

**Resumen:** 7 `[x]` · 4 `[~]` · 7 `[ ]`

---

# CONTEO GLOBAL

| Estado | Ítems | % |
|---|---|---|
| `[x]` EXISTENTE Y FUNCIONAL | **60** | 15 % |
| `[~]` EXISTENTE PERO INCOMPLETO | **18** | 5 % |
| `[ ]` FALTA DESARROLLAR | **310** | 78 % |
| `[!]` REQUIERE DECISIÓN EXTERNA | **8** | 2 % |
| **Total** | **396** | 100 % |

## Lectura honesta

**Este repositorio es un cliente MCP de solo lectura con 3 herramientas de diagnóstico.**
No contiene motor de IA, adapters, catálogo de modelos, jobs, créditos, storage ni capacidades de generación. El **78 %** del checklist pertenece al backend `Kronos-space.com` o está por desarrollar.

**Lo que SÍ está sólido:** MCP Core, STDIO, validación de entrada/salida, manejo de errores, timeouts, límites de respuesta, separación stdout/stderr, tests (34/34) y protección de secretos.

## FASE 3 — Contratos pendientes (ninguno existe aún)

`Tool` (parcial) · `Provider` · `ProviderAdapter` · `Model` · `Capability` · `Job` · `Asset` · `Project` · `Credits` · `Cost` · `Permission` · `Credential` · `Resource` · `Prompt` · `Skill`

## FASE 4 — Prioridad propuesta

1. Contratos comunes (FASE 3)
2. Provider Adapter + Catálogo de modelos
3. Auth: scopes y permisos
4. Job System
5. Herramientas de usuario (imagen, video, script)
6. Resources y Prompts
7. Cost Engine y Créditos
8. Observabilidad
9. Admin Tools
10. Documentación

## FASE 6 — Pendientes reales, riesgos y dependencias

**Pendientes reales**
1. Comprar créditos en OpenRouter o corregir la key → único arreglo del `402` de Imagen.
2. Confirmar `VIDEO_API_KEY` y `VIDEO_API_URL` en Render.
3. Parche `image.capabilities.js:47` en el backend (barra codificada → 404 en descubrimiento).
4. Decidir si el backend se clona en este workspace o se trabaja en su propio repo.

**Riesgos**
1. El directorio `.git` **no persiste entre turnos** → solo sobrevive lo que se sube a GitHub.
2. `node_modules/` tampoco persiste → reinstalar en cada turno.
3. Arreglar `capabilities.js:47` añade `size` al cuerpo; la ficha del modelo se contradice sobre si acepta tamaños explícitos → riesgo de `400`. Hacerlo **después** de los créditos.
4. Sin scopes, cualquier herramienta futura será todo-o-nada.

**Dependencias externas**
- OpenRouter: créditos comprados y cuenta correcta.
- Proveedor de video: `VIDEO_API_URL` y su contrato.
- Render: variables de entorno y logs (no accesibles desde este entorno).

**Variables de entorno necesarias**
- MCP: `KRONOS_API_URL`, `KRONOS_MCP_TOKEN`, `NODE_ENV` (opcional), `DOTENV_CONFIG_PATH` (opcional).
- Backend: `OPENROUTER_API_KEY`, `OPENROUTER_IMAGE_MODEL`, `VIDEO_API_KEY`, `VIDEO_API_URL`, `GEMINI_API_KEY`.

**Próxima fase recomendada**
Definir los contratos de la FASE 3 como tipos/interfaces en `src/contracts/` antes de escribir cualquier herramienta nueva.
