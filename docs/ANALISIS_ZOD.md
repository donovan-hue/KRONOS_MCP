# KRONOS MCP — Inventario y decisión de uso de Zod

**Fecha de auditoría:** 4 de octubre de 2026
**Repositorio auditado:** `donovan-hue/KRONOS_MCP`
**Versión instalada:** **4.6.5** (`node_modules/zod/package.json`, verificado con `npm ls zod --all`)
**Alcance original:** inventario/clasificación/plan previo al refuerzo. Las afirmaciones de «no implementado» describen esa etapa, no el estado actual. Para los cambios posteriores y su verificación, consultar `DIAGNOSTICO_MCP.md` y `VERIFICACION_MCP.md`.

## 1. Contexto de la instalación

- `package.json` declara `zod: ^4.6.5`; `package-lock.json` fija la instalación actual en `4.6.5`.
- El árbol observado deduplica Zod 4.6.5 con `@modelcontextprotocol/sdk@1.31.0`.
- El SDK MCP declara compatibilidad de peer dependency con `^3.25 || ^4.0`.
- La API clásica se importa desde `zod`, que exporta `z` y los helpers nombrados.
- La versión 4 conserva el subpath de compatibilidad `zod/v3`; **no se recomienda mezclarlo** con imports de v4 en esta implementación.
- Este inventario describe la instalación local revisada; no afirma que todos los entornos de despliegue tengan instalados los mismos módulos.

### Precisión de nombres en Zod 4

- `z.default()` **no existe con ese nombre** como helper superior. El default se aplica como `schema.default(valor)`; el helper nombrado exportado se llama `z._default(...)` y no se propone usarlo.
- `z.function()` existe sintácticamente como export `z.function`, implementada como alias de `_function`; no se utilizará para validar contratos JSON de las herramientas.
- `z.coerce` es un namespace (objeto), no un schema; expone coerciones de string, number, bigint, boolean y date.
- `z.transform()`, `z.refine()` y `z.superRefine()` existen como helpers exportados. En el uso normal también están disponibles como métodos del schema.
- `z.discriminatedUnion()` sí está disponible en 4.6.5.
- `z.nativeEnum()` sí está disponible en 4.6.5, pero es una API de compatibilidad para enums de TypeScript; no hay enums TypeScript en los contratos JSON revisados.

## 2. Inventario de APIs solicitadas

“Disponible” significa que la función/namespace está exportada en la API clásica de Zod 4.6.5 y/o que el método equivalente está en el schema. Los defaults indicados son hechos de API, no decisiones de contrato.

| API solicitada | ¿Disponible? | Clasificación para esta fase | Nota |
|---|---:|---|---|
| `z.string()` | Sí | A | Cadenas JSON, URL y timestamps representados como texto. |
| `z.number()` | Sí | B | Podría servir para el status HTTP si se añade al error interno; los contratos actuales revisados no tienen campos numéricos. |
| `z.bigint()` | Sí | D | No representa un tipo JSON nativo y no existe necesidad contractual. |
| `z.boolean()` | Sí | A | Flags explícitos en health y `environmentDeclared`, `autoIndex`. |
| `z.date()` | Sí | D | El backend entrega timestamp como string ISO, no objeto JS `Date`. |
| `z.symbol()` | Sí | D | No es valor JSON ni parte de contratos MCP revisados. |
| `z.undefined()` | Sí | B | Puede expresar casos de tipos internos, no se necesita para las propiedades JSON observadas. |
| `z.null()` | Sí | A | Build metadata devuelve null de forma explícita. |
| `z.any()` | Sí | D | Quita garantías del contrato; no usar en límites de red. |
| `z.unknown()` | Sí | B | Útil temporalmente para recibir entrada no confiable antes de parsearla; no como propiedad final sin validar. |
| `z.never()` | Sí | B | Puede representar ramas imposibles en lógica interna, sin necesidad presente en los esquemas base. |
| `z.void()` | Sí | B | Podría servir para tipos internos de callbacks; no describe payload JSON. |
| `z.object()` | Sí | A | Contratos de respuestas y entrada vacía; por defecto elimina claves desconocidas, por lo que la decisión de strictness debe ser explícita. |
| `z.array()` | Sí | A | `permissions` es array de strings. |
| `z.tuple()` | Sí | D | Contratos observados son objetos JSON, no tuplas posicionales. |
| `z.record()` | Sí | B | Útil si una respuesta futura documenta un mapa dinámico; ninguno de los contratos revisados requiere mapa arbitrario. |
| `z.map()` | Sí | D | `Map` no es representación JSON del backend. |
| `z.set()` | Sí | D | `Set` no es representación JSON; permisos llegan como array. |
| `z.union()` | Sí | B | Útil para alternativas mutuamente excluyentes si un contrato futuro real las presenta. No reemplazar enums claros por unions vagas. |
| `z.discriminatedUnion()` | Sí | B | Para payloads con discriminador estable y documentado; los payloads MCP/HTTP revisados no tienen uno. |
| `z.intersection()` | Sí | D | No se necesita combinar contratos; puede hacer más opuesta la lectura/diagnóstico que un objeto explícito. |
| `z.enum()` | Sí | A | `environment` tiene valores reales restringidos observados en el backend: `production`, `development`, `test`. |
| `z.nativeEnum()` | Sí | D | No hay enum TypeScript en las respuestas; preferir `z.enum()` para valores JSON confirmados. |
| `z.literal()` | Sí | A | Valores constantes confirmados como `service: "kronos-mcp"` y `ok: true` en `/api/mcp/me` y `/api/mcp/status`. |
| `z.optional()` | Sí | A | Operación disponible; aplicar solo donde el JSON realmente puede omitir una propiedad. Para helpers vacíos se prefiere declarar objeto vacío explícito. |
| `z.nullable()` | Sí | A | Campos build de health pueden venir `null`; por ejemplo no hay SHA/repo/branch configurado. |
| `z.default()` | No con ese nombre superior | D | La operación disponible es `.default(value)` o `.default(() => value)` sobre un schema. No completar respuestas del backend con defaults inventados. |
| `z.catch()` | Sí | D | Convertir un dato inválido a un fallback ocultaría una ruptura de contrato; no usar en respuestas. |
| `z.coerce` | Sí, namespace | D | Coerción implícita en límites externos puede convertir inputs inesperadamente; contratos MCP/HTTP deben validar el tipo recibido. |
| `z.lazy()` | Sí | B | Útil para estructuras recursivas; no hay ninguna en los contratos actuales. |
| `z.promise()` | Sí | D | Valida promesas JS, no el JSON recibido desde HTTP. |
| `z.function()` | Sí, alias `_function` | D | No hace falta para datos. No usar la API de funciones de Zod para describir las tools MCP. |
| `z.preprocess()` | Sí | D | No normalizar entradas de red en silencio; primero establecer el contrato exacto. |
| `z.transform()` | Sí | B | Puede transformar tras validar; evitarlo en la primera capa de parseo de contratos para no ocultar la forma wire original. |
| `z.refine()` | Sí, función y método | A | Necesario como opción para formato de URL HTTPS estricto; se puede usar validación URL con protocolo si la API encaja. Para timestamps se preferirá `z.iso.datetime()` si su precisión encaja con lo emitido. |
| `z.superRefine()` | Sí, función y método | B | Validación cruzada con varios issues; no hace falta para los contratos simples actuales. |

**Nota sobre coerción:** la categoría D no significa que el API desaparezca de Zod, que se configure para prohibirse ni que se elimine del paquete. Significa que no se adopta para esta implementación.

## 3. Contratos observados y schemas que se podrían crear

Estos son planes, no schemas ya creados. Fuente backend revisada en GitHub a `ee49ebe61ebf34915e5bdc4c010d80b20d20abaf`. El backend no fue modificado ni consultado en vivo.

### A. Configuración local

**Hechos del repo:** `KRONOS_API_URL` es configurable y el código intenta exigir HTTPS; el destino default en código es `https://api.kronos-space.com`. `KRONOS_MCP_TOKEN` lo lee el servicio de `/api/mcp/me`. `.env.example` usa un nombre distinto, `MCP_AUTH_TOKEN`, y actualmente no lo carga explícitamente la aplicación.

**Plan de schema:** objeto estricto de configuración con `KRONOS_API_URL` como URL HTTPS, `KRONOS_MCP_TOKEN` como string opcional/no vacía al invocar la herramienta autenticada y `NODE_ENV` como string según comportamiento acordado. No incluir secreto, ni devolverlo en errores o logs. Resolver primero la carga efectiva de archivo/variables: Zod no carga `.env` por sí solo.

**Pendiente de aprobación/decisión:** qué archivos locales carga el lanzador y si el token debe ser requisito de arranque o únicamente al usar `kronos_me`. No asumirlo en el schema.

### B. `GET /api/health`

**Contrato en código backend:**

- `ok`: booleano; con health conectado es true y con desconectado false.
- `service`: literal `"kronos-space"`.
- `database`: emite `"connected"` o `"disconnected"` según readyState de Mongoose.
- `realtime`: booleano; el handler inspeccionado actualmente responde true.
- `timestamp`: string ISO.
- `build`: objeto con `commit`, `commitShort`, `branch`, `repo`, `serviceName`, `startedAt`, `traceable`.
- `environment`: handler fail-closed para valores de producción/desconocidos; o devuelve `development`/`test` si el entorno es conocido. Valores efectivos observados por la lógica: `production`, `development`, `test`.
- `environmentDeclared`: booleano.
- `autoIndex`: booleano.

**Nulabilidad del build:** `getBuildInfo()` devuelve `null` para `commit`, `commitShort`, `branch`, `repo`, `service` si no existen; el JSON health lo publica como `build.serviceName`, y `startedAt`/`traceable` se construyen con string/boolean. Por tanto, las siete claves del subobjeto `build` están presentes en el handler revisado; las seis primeras identificadoras excepto startedAt/traceable pueden ser null (`commit`, `commitShort`, `branch`, `repo`, `serviceName`). No convertir null en ausencia ni en strings inventados.

**Plan de schema:** objeto de respuesta completo; `ok` boolean para cubrir respuesta healthy y unhealthy; `database` enum de los dos estados emitidos; `environment` enum de tres valores verificados; build estricto con campos nullables donde corresponde; timestamp ISO string; booleanos confirmados.

**Importante:** el handler de health devuelve HTTP 503 cuando la DB está desconectada, aunque incluye un cuerpo conocido. El cliente actual descarta el cuerpo para todo `!response.ok`. Debe decidirse si el cliente parsea/valida respuestas de error de health como health degradado o si normaliza 503 como error. No esconder esta decisión dentro del schema.

### C. `GET /api/mcp/me`

**Contrato exacto en código:** `{ ok: true, service: "kronos-mcp", identity: <credential.name>, permissions: <credential.permissions || []> }`.

**Plan:** objeto estricto, `ok` literal true, `service` literal, `identity` string, `permissions` array de strings. El modelo permite nombres de permiso arbitrarios de hasta 100 caracteres y default `[]`; **no hay catálogo/enum de scopes confirmado**, así que no inventar uno.

### D. `GET /api/mcp/status`, si el usuario aprueba integrarlo

**Contrato exacto en código:** mismo objeto de `/me` con `authenticated: true` adicional.

**Plan:** objeto estricto con literales `ok: true`, `service: "kronos-mcp"`, `authenticated: true`, `identity: string`, `permissions: string[]`.

La ruta está comprobada en código backend, pero **no existe aún una tool local que la consuma**. No se propone crearla en la fase de schemas sin autorización explícita de añadir una herramienta nueva.

### E. Errores normalizados

El backend MCP devuelve cuerpos `{ error: string, code: string }` para errores auth conocidos; el middleware observado emite `MCP_AUTH_REQUIRED`, `MCP_AUTH_INVALID`, `MCP_AUTH_EXPIRED`, `MCP_AUTH_UNAVAILABLE`. Esto no constituye un contrato global completo del API.

**Plan:** separar dos conceptos:

1. Parsear de forma defensiva el error HTTP externo como datos desconocidos y mapear únicamente códigos confirmados.
2. Definir, con aprobación, un error MCP local sanitizado (por ejemplo código controlado, mensaje seguro, status HTTP opcional), sin filtrar cuerpo remoto arbitrario.

No declarar `FORBIDDEN`, `RATE_LIMITED`, `INSUFFICIENT_CREDITS` ni `PROVIDER_ERROR` como valores actuales del backend: no se comprobaron en las rutas MCP revisadas. No se eligirá todavía un enum de error del producto.

### F. Herramientas, entradas y salidas

Herramientas actuales, comprobadas en `src/index.ts`:

- `kronos_status`: sin parámetros; devuelve selección de `ok`, `service`, `database`, `realtime`, `environment`, `build`, `timestamp` desde health.
- `kronos_health`: sin parámetros; devuelve health completo.
- `kronos_me`: sin parámetros; consume el contrato autenticado de `/api/mcp/me`.

**Entrada planificada:** objeto vacío estricto para cada tool existente. No se añaden herramientas ni parámetros nuevos.

**Salida planificada:** schemas estrictos y `structuredContent` acorde al SDK MCP instalado, más la representación textual actual para no cambiar de golpe la UX de clientes. `kronos_status` requiere su schema derivado del subconjunto indicado; `kronos_health` deriva del health completo; `kronos_me` del contrato `/me`.

Zod 4.6.5 permite generar JSON Schema; habría que probar que el strict object y los tipos resultantes son compatibles con serialización de la versión MCP SDK ya instalada antes de aprobarlos como contrato público.

## 4. Clasificación A/B/C/D explícita

### A — Se van a usar

Solo para los schemas arriba definidos:

- `z.string()` — valores string JSON, nombres, URL y fechas serializadas.
- `z.boolean()` — health flags.
- `z.null()` / `.nullable()` — nulabilidad efectiva de build.
- `z.object()` — bodies de API y entradas/salidas de tools; seleccionar strictness conscientemente.
- `z.array()` — permisos.
- `z.enum()` — únicamente valores de `database` y `environment` confirmados en backend.
- `z.literal()` — valores constantes confirmados en respuestas MCP.
- `.optional()` — solo si revisión del contrato confirma propiedad ausente; no convertir valores null en optional.
- `z.refine()` o un string-format nativo de Zod 4 — URL HTTPS de configuración; una sola estrategia, elegida después de una prueba pequeña de versión/API.
- Parseo seguro (`safeParse`/`safeParseAsync`) es la operación prevista de aplicación de schema, no una herramienta o tipo JSON adicional.

### B — Se pueden usar / futuro, no necesarios en este scope

- `z.number()` — si el contrato interno aprobado incluye `status` HTTP numérico.
- `z.undefined()` — solo tipos internos; no se prevé en JSON wire.
- `z.unknown()` — recipiente temporal de datos externos antes de validarlos.
- `z.never()` — ramas internas imposibles, sin requisito.
- `z.void()` — callbacks internos, no payloads.
- `z.record()` — mapas dinámicos con contrato documentado en el futuro.
- `z.union()` — alternativas wire documentadas.
- `z.discriminatedUnion()` — alternativas con discriminador real.
- `z.lazy()` — modelos recursivos futuros.
- `z.transform()` — transformación posterior a validación si un caso real la necesita.
- `z.superRefine()` — invariantes cruzadas que no cubra schema compositivo simple.

No se usarán solo por estar disponibles.

### C — No se van a usar ahora por no aportar al contrato actual

- No se asigna una API de la lista solicitada a C en esta propuesta; las APIs sin valor suficiente están clasificadas como D para mantener explícita la razón contractual/técnica. C puede usarse si el usuario prefiere que “no aporta al contrato actual” se distinga de “no usar porque debilita/representa mal los datos”. No se altera la clasificación para cuadrar artificialmente los cuatro grupos.

### D — No se deben usar en esta etapa

- `z.bigint()` — no JSON y no existe campo.
- `z.date()` — wire usa string ISO.
- `z.symbol()` — no serializable en JSON.
- `z.any()` — contrato abierto/sin validación.
- `z.tuple()` — no hay payload posicional.
- `z.map()` / `z.set()` — no son la forma JSON devuelta.
- `z.intersection()` — complejidad sin necesidad probada; objeto explícito es más claro.
- `z.nativeEnum()` — no hay enum TS; usar enum de string confirmado.
- `z.default()` como helper superior — esa función no existe; defaults de contenido externo podrían falsificar contrato. No usar `_default`.
- `.catch()` — oculta fallo de validación con fallback.
- `z.coerce.*` — convierte entradas externas implícitamente.
- `z.promise()` — no valida respuesta JSON.
- `z.function()` — no describe datos MCP ni payloads.
- `z.preprocess()` — puede normalizar/ocultar entradas sin contrato acordado.

**“No usar” aquí significa cancelación de esta etapa, no eliminación de Zod ni bloqueo del paquete.** La mayoría puede revisarse de nuevo si un contrato real futuro lo necesita; los principios de no usar `any` en límites de red y no coaccionar silenciosamente se mantienen salvo justificación y aprobación explícita.

## 5. Lista explícita de cancelación por tipo

| Tipo/API | Motivo | Alcance de descarte |
|---|---|---|
| `bigint` | No JSON; ningún campo lo requiere. | Solo esta etapa; reconsiderable únicamente si se define otra codificación pública compatible. |
| `date` | Backend emite fecha ISO como string. | Solo esta etapa y este wire contract; no para representar fechas de dominio internas en abstracto. |
| `symbol` | No serializable y no hay contrato. | Definitivo para contratos JSON del MCP; Zod permanece intacto. |
| `any` | Acepta cualquier cosa, elimina garantía de parseo. | Principio permanente para límites de API; solo reconsiderar bajo excepción explícitamente auditada. |
| `tuple` | Contratos actuales son objetos JSON con propiedades. | Solo esta etapa; posible si aparece contrato externo posicional documentado. |
| `map` | HTTP JSON entrega objetos/arrays, no `Map`. | Solo esta etapa; exigir conversión/contrato explícito si aparece caso. |
| `set` | Backend entrega permisos como array. | Solo esta etapa; no convertir array a Set en el wire. |
| `intersection` | Sin necesidad; suma complejidad frente a objeto claro. | Solo esta etapa. |
| `nativeEnum` | No existe enum TypeScript en los contratos. | Solo esta etapa; para JSON preferir `z.enum` con valores observados. |
| helper top-level `z.default` | No existe con este nombre en 4.6.5; `.default()` no debe rellenar contratos remotos. | Cancelado como técnica para esta etapa. Zod conserva `.default()` para casos futuros justificados. |
| `.catch()` | Fallback silencioso en caso de datos inválidos puede esconder incompatibilidad. | Principio permanente para parsear respuestas de APIs; reconsiderar solo para recuperación de datos internos no contractual con telemetría. |
| `coerce` | Conversión implícita de valores puede debilitar entradas estrictas. | Solo esta etapa; no para entradas MCP sin contrato/aprobación. |
| `promise` | Promesa JS, no forma wire JSON. | Definitivo para schemas de mensajes; no bloquea uso en una API interna distinta. |
| `function` | Funciones no forman parte de payloads JSON. | Definitivo para schemas wire del MCP; Zod permanece intacto. |
| `preprocess` | Pre-normalización puede ocultar una entrada distinta a la recibida. | Solo esta etapa; reconsiderable únicamente con normalización contractual explícita. |

## 6. Decisión antes de programar

| Requisito | Resultado de auditoría / propuesta |
|---|---|
| Versión instalada | Zod **4.6.5**, confirmada localmente. |
| Features requeridas disponibles | Todos los constructores pedidos están disponibles salvo el nombre exacto superior `z.default()`; default está como método `.default()`. `discriminatedUnion`, `nativeEnum`, `promise`, `function`, `preprocess`, `transform`, `refine`, `superRefine` existen. |
| Tipos propuestos a utilizar | string, boolean, null/nullable, object, array, enum, literal, optional solo donde aplique, refine/string format para HTTPS; parse seguro. |
| Tipos opcionales/futuros | number, undefined, unknown, never, void, record, union, discriminatedUnion, lazy, transform, superRefine. |
| Tipos cancelados esta etapa | bigint, date, symbol, any, tuple, map, set, intersection, nativeEnum, helper `z.default` (no existe), catch, coerce, promise, function y preprocess. Motivos/alcance en §5. |
| Schemas propuestos | Config env; health API completo; subconjunto health de `kronos_status`; `/api/mcp/me`; errores externos conocidos + error local sanitizado aún por definir; input vacío estricto/output estructurado para las tres tools actuales. `/api/mcp/status` solo si se autoriza usar su respuesta, sin registrar tool nueva. |
| Archivos existentes que se propone modificar | `src/config/env.ts`, `src/config/mcp.ts`, `src/services/kronos-api.ts`, `src/services/kronos-auth.ts`, `src/tools/kronos-status.ts`, `src/tools/kronos-health.ts`, `src/tools/kronos-me.ts`, `src/index.ts` (solo si se requiere el esquema del SDK); `tests/mcp-test.ts`, `package.json` (script test), `.env.example`, `.gitignore`. |
| Archivos nuevos que se propone crear | `src/schemas/...` (ubicación/nombres finales sencillos por decidir al implementar); prueba unitaria de schemas y pruebas deterministas de cliente HTTP; documentación de contrato si se aprueba. |
| Dependencias adicionales | Ninguna. No se instalará nada. Zod ya consta en el árbol/manifest de trabajo por el cambio preexistente, y no se necesita instalar de nuevo. |
| Backend / producción / credenciales | No tocar. No llamadas reales, rotaciones, cambios remotos, lectura de valores secretos ni nuevos endpoints. |
| Tools existentes | Mantener nombres y propósito; no agregar herramienta. |
| Estado | **Esperando aprobación; no empezar a modificar `src/` antes de ella.** |

## 7. Archivos y cambios de la auditoría actual

Se ejecutaron inspecciones locales de manifests, `npm ls`, exports/runtime, declaraciones TypeScript de Zod, scripts y contratos remotos de backend. No se ejecutaron requests a producción ni se inspeccionaron archivos de secretos.

El árbol ya contenía cambios anteriores a esta auditoría:

- `package.json` y `package-lock.json` incluyen Zod 4.6.5 como dependencia; la inclusión fue un cambio adelantado previo, no se efectuó como parte de esta auditoría.
- `docs/DIAGNOSTICO_MCP.md` es el reporte de la etapa de diagnóstico.

Este documento, `docs/ANALISIS_ZOD.md`, es el único archivo creado para la auditoría Zod. No se cambió `src/`, no se modificó el backend y no se tocó producción ni credenciales.

## 8. Aprobación necesaria

El siguiente paso propuesto modifica los archivos de §6. **No se ejecutará hasta que el usuario apruebe expresamente.**

Antes de esa aprobación quedan dos límites de contrato claros:

1. `kronos_health` debe decidir el comportamiento de la respuesta 503 que trae un body health válido.
2. El contrato local de error normalizado (campos/códigos) debe acordarse; no hay un catálogo global del backend probado.

Ninguno se resolverá inventando propiedades o códigos.
