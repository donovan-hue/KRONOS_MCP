# KRONOS MCP

Servidor Model Context Protocol que expone **184 herramientas**: 4 del núcleo (conectadas al API existente de KRONOS) y 180 herramientas locales y deterministas del catálogo maestro, sin proveedores externos. No es una API social paralela ni conecta directamente con la base de datos.

## Requisitos

- Node.js 20 o posterior.
- Una URL HTTPS de KRONOS. `KRONOS_API_URL` es opcional; por defecto usa `https://api.kronos-space.com`.
- Para ejecutar `kronos_me`, `kronos_status` o `kronos_health`, una credencial MCP de servicio válida como `KRONOS_MCP_TOKEN`. Las tres herramientas están protegidas por permisos comprobados contra `/api/mcp/me`; aunque `/api/health` sea público, `kronos_status` y `kronos_health` exigen autenticación en la capa MCP.

## Instalación y ejecución

### Desde npm

Una vez publicada la versión, un cliente MCP puede lanzarlo por stdio sin clonar el repositorio:

```json
{
  "mcpServers": {
    "kronos": {
      "command": "npx",
      "args": ["-y", "kronos-mcp"],
      "env": {
        "KRONOS_API_URL": "https://api.kronos-space.com",
        "KRONOS_MCP_TOKEN": "<credencial-de-servicio-para-las-3-herramientas-del-nucleo>"
      }
    }
  }
}
```

Sin `KRONOS_MCP_TOKEN`, las 180 herramientas locales y `kronos_contracts` siguen disponibles; las tres herramientas protegidas del núcleo responderán `AUTH_REQUIRED` o `FORBIDDEN`, según corresponda. El transporte HTTP instalado se invoca con el binario `kronos-mcp-http` y sigue exigiendo `MSP_HTTP_BEARER_TOKEN`.

### Desde el código fuente

```sh
npm ci
# No sobrescribir un archivo privado existente.
[ -e .env ] || cp .env.example .env
# Edita .env localmente; nunca pegues el secreto en el chat.
npm run build
npm start
```

`src/index.ts` carga `.env` mediante dotenv antes de arrancar el servidor. Variables que el entorno del proceso ya haya inyectado tienen prioridad, conforme al comportamiento de dotenv. `.env` y las variantes `.env.*` están excluidas de Git; `.env.example` es una plantilla sin secretos. Comprueba cualquier archivo local con `git check-ignore -v .env.local` antes de almacenar secretos.

El transporte stdio reserva stdout para mensajes MCP. No añadas `console.log` en el proceso servidor; el texto de operación debe ir por stderr.

## Herramientas del núcleo (conectadas a KRONOS)

| Nombre | Función | Autenticación | Error/salida |
|---|---|---|---|
| `kronos_status` | Lectura compacta del `GET /api/health` público | Requiere permiso MCP `status` comprobado contra `/api/mcp/me` | Salida MCP estructurada; el endpoint upstream sigue siendo público |
| `kronos_health` | Lectura del `GET /api/health` público | Requiere permiso MCP `health` comprobado contra `/api/mcp/me` | Salida MCP estructurada; un HTTP no exitoso es error de herramienta |
| `kronos_me` | Consulta identidad y permisos por `GET /api/mcp/me` | Requiere credencial de servicio y permiso MCP `me` | Salida MCP estructurada; requiere credencial configurada y aceptada por KRONOS |
| `kronos_contracts` | Describe las herramientas, capacidades y contratos declarados por este servidor | Ninguna, no contacta KRONOS | Salida MCP estructurada; `resources` y `prompts` salen vacíos porque aún no se sirve ninguno |

Las cuatro herramientas son de solo lectura. `kronos_status`, `kronos_health` y `kronos_me` exigen respectivamente los permisos `status`, `health` y `me` devueltos por `/api/mcp/me`; la comprobación se ejecuta en el servidor MCP antes de invocar el handler. `kronos_contracts` permanece pública porque solo expone contratos no secretos y no contacta KRONOS. El backend debe conceder los tres scopes exactos a la identidad de servicio para que las herramientas protegidas funcionen. Siguen sin existir herramientas de perfil social, KAIROS, escritura en KRONOS, publicación en plataformas ni borrado: las 180 herramientas siguientes son locales y no escriben en ningún sistema externo.

## Las 180 herramientas locales (sin proveedores)

El [catálogo maestro](docs/KRONOS_MCP_180_Herramientas.txt) (180 herramientas, 18 familias de 10) está implementado completo como herramientas MCP **locales y deterministas**. Catálogo navegable con nombres y apodos: [docs/HERRAMIENTAS_180.md](docs/HERRAMIENTAS_180.md).

Cómo deciden ser honestas:

- **Trabajan solo con los datos de cada llamada** (más, en 15 casos, memoria del proceso). Nada de red, disco, comandos del sistema ni claves de proveedor. Por eso no exigen permiso de `/api/mcp/me`, igual que `kronos_contracts`. En el transporte HTTP quedan tras el bearer token del propio MCP.
- Las que según el catálogo «eligen proveedor» o «generan» un activo (Pixel, Cine, Voz…) realizan el **enrutamiento, la planificación, el cálculo o la verificación** con los candidatos que aporta el llamante, y lo declaran en el campo `limitations`. Nunca afirman haber generado una imagen, un vídeo o una búsqueda web en vivo que no ocurrió.
- Todas responden con el mismo sobre estructurado: `ok`, `tool`, `number` (1-180), `nickname`, `technicalName`, `family`, `mode: "local_deterministic"`, `summary`, `data`, `warnings` y `limitations`. El nombre MCP es `kronos_` + nombre técnico en snake_case (p. ej. `kronos_secret_exposure_scanner`, apodo «Bóveda»).
- **15 herramientas guardan estado solo en memoria del proceso** (se reconoce porque su anotación `readOnlyHint` es `false`; las demás son `readOnlyHint: true`, `openWorldHint: false`, `destructiveHint: false`). Son las que por diseño necesitan estado entre llamadas: registro de compuestas y de estados de flujo (1, 8), circuit breaker y checkpoints (17, 18), aprobaciones y bitácora (54, 55), contexto e índice (61, 62), cola de render (119), tarifario, cuotas y registro de capacidades (141, 144, 150), cola de trabajos e idempotencia (154, 159) y colector de Telemetría (161). Al reiniciar el servidor, ese estado desaparece. **No pases secretos** a las herramientas de estado: quedarían en la memoria del proceso y en manos de quien llame después. La única verificación con secreto, `kronos_webhook_validation_gateway`, recibe el **nombre** de la variable de entorno (`secretEnvVar`), nunca el valor.
- Los límites (tamaño máximo de textos y listas, topes de almacenes) están en los esquemas de entrada de cada herramienta en `src/families/`, junto a un `example` ejecutable que la batería de pruebas llama para las 180 (`tests/local-tools.test.ts`).

| Familia | Capacidad | Ejemplos |
|---|---|---|
| 01 Coordinación y enrutamiento | `coordination` | `kronos_intelligent_tool_router`, `kronos_dependency_graph_planner` |
| 02 Diagnóstico y recuperación | `diagnostics` | `kronos_root_cause_analyzer`, `kronos_checkpoint_rollback_engine` |
| 03 Planificación | `planning` | `kronos_milestone_planner`, `kronos_goal_clarifier` |
| 04 Simulación y decisiones | `simulation` | `kronos_risk_scoring_engine`, `kronos_trade_off_analyzer` |
| 05 Pruebas y evaluación | `testing` | `kronos_tool_benchmark_runner`, `kronos_expected_result_comparator` |
| 06 Seguridad operativa | `security` | `kronos_secret_exposure_scanner`, `kronos_prompt_injection_detector` |
| 07 Contexto y conocimiento | `context` | `kronos_scoped_context_store`, `kronos_relevant_memory_retriever` |
| 08 Datos y transformación | `data` | `kronos_format_conversion_router`, `kronos_data_quality_validator` |
| 09 Software y repositorios | `development` | `kronos_patch_generation_engine`, `kronos_pull_request_review_assistant` |
| 10 Web y verificación (sin red) | `web` | `kronos_claim_verification_engine`, `kronos_web_page_structure_extractor` |
| 11 Imagen | `image` | `kronos_brand_asset_compliance_checker`, `kronos_segmentation_and_mask_generator` |
| 12 Vídeo | `video` | `kronos_subtitle_alignment_engine`, `kronos_smart_reframing_tool` |
| 13 Audio y voz | `audio` | `kronos_speaker_diarization_tool`, `kronos_pronunciation_quality_checker` |
| 14 Guion y publicación | `content` | `kronos_platform_format_adapter`, `kronos_content_calendar_planner` |
| 15 Proveedores y costes | `providers` | `kronos_budget_guardrail_enforcer`, `kronos_quality_cost_provider_optimizer` |
| 16 Automatización | `automation` | `kronos_webhook_validation_gateway`, `kronos_scheduled_workflow_runner` |
| 17 Observabilidad | `observability` | `kronos_anomaly_detection_engine`, `kronos_service_objective_monitor` |
| 18 Experiencia y accesibilidad | `experience` | `kronos_accessibility_compliance_checker`, `kronos_decision_explanation_generator` |

El registro tipado `src/catalog/tools-180.ts` y la tabla de `docs/HERRAMIENTAS_180.md` son **generados** desde el `.txt` del catálogo; no los edites a mano:

```sh
npm run generate:catalog
```

Para encontrar la herramienta adecuada sin conocer el catálogo, `kronos_intelligent_tool_router` (Brújula, nº 2) ordena las 180 según tu objetivo en lenguaje natural, y `kronos_capability_based_tool_selector` (Umbral, nº 9) filtra por capacidad o palabra clave.

## Contratos

`src/contracts` define el vocabulario compartido (capacidades, herramientas, recursos, prompts, permisos, jobs, proyectos, credenciales y skills). `src/auth/permissions` compara los permisos de `/api/mcp/me` con los declarados en los contratos, y `src/tools/with-tool-authorization.ts` aplica esa comprobación en tiempo de ejecución. Las pruebas unitarias verifican concesión, denegación y fallo cerrado. La compatibilidad de los scopes reales debe confirmarse en el despliegue; este cliente no modifica permisos del backend.

Faltan deliberadamente los contratos de `Provider`, `ProviderAdapter`, `Model`, `Cost` y `Credits`: pertenecen al trabajo de IA generativa y créditos, actualmente en pausa. La familia 15 («Proveedores, costes y capacidad») no los introduce: gestiona precios, cuotas y selección solo con datos que declara el llamante, sin adaptadores reales todavía. El vocabulario de capacidades (`src/contracts/common.ts`) incluye ahora una capacidad por familia del catálogo (`coordination`, `planning`, …), y `localTool` en `src/contracts/tool.ts` describe las herramientas sin mundo exterior: puras `readOnly`, o con estado volátil en memoria cuando se declara `stateful`.

## Errores y límites

Los errores MCP usan códigos estables y no incluyen el cuerpo arbitrario de KRONOS: `AUTH_REQUIRED`, `FORBIDDEN`, `CONFIG_INVALID`, `UPSTREAM_TIMEOUT`, `UPSTREAM_UNAVAILABLE`, `UPSTREAM_HTTP_ERROR`, `INVALID_RESPONSE`, `RESPONSE_TOO_LARGE` o `INTERNAL_ERROR`. Cuando existe estado HTTP, se entrega separadamente. Timeout por petición: 10 segundos. Cuerpo máximo: 1 MiB. Redirects rechazados. No se hacen reintentos automáticos.

Las 180 herramientas locales añaden códigos propios, también sin filtrar valores de entrada: `INVALID_INPUT` (la entrada no cumple el esquema o no es interpretable), `NOT_FOUND` (falta un registro en el estado en memoria), `CONFLICT` (duplicado donde no puede haberlo), `LIMIT_EXCEEDED` (tope de memoria o de cálculo alcanzado) y `NOT_CONFIGURED` (falta la configuración que la herramienta necesita, p. ej. la variable de entorno del secreto de un webhook).

## Pruebas y build

```sh
npm test
npm run build
```

La suite usa respuestas HTTP simuladas, transporte MCP en memoria y procesos reales por stdio con un fixture HTTP aislado; no requiere credenciales, MongoDB ni API de producción. No constituye prueba de autenticación, scopes o despliegue en producción.

Para las 180 herramientas locales, `tests/catalog.test.ts` verifica que el catálogo generado y las definiciones coinciden (180 posiciones, 18 familias, nombres y apodos únicos) y `tests/local-tools.test.ts` llama a las 180 por MCP con su ejemplo, con `fetch` bloqueado, además de comprobar comportamiento concreto de cada familia (grafo con ciclo, webhook HMAC válido, SRT generado, contraste WCAG, cuota agotada, etc.).

## Publicación en npm (mantenedores)

El paquete está preparado con binarios `kronos-mcp` y `kronos-mcp-http`, lista `files`, tipos TypeScript y licencia ISC. La evidencia completa de la preparación de `0.3.0` está en [docs/EVIDENCIA_NPM_0.3.0.md](docs/EVIDENCIA_NPM_0.3.0.md). Antes de publicar, verifica el tarball tal como lo instalaría un consumidor limpio y haz el ensayo oficial de npm:

```sh
npm run verify:tarball
npm publish --dry-run --access public
```

`verify:tarball` instala el `.tgz` en un directorio temporal, enumera las 184 herramientas, llama a las 180 locales y comprueba también el transporte HTTP. La publicación real se hace solo desde una sesión npm del propietario (nunca compartas credenciales o tokens en chats ni en Git):

```sh
npm login
npm whoami
npm publish --access public
npm view kronos-mcp version
```

## Verificación real desde Termux (opt-in)

Consulta [el procedimiento y sus límites](docs/VERIFICACION_MCP.md). Requiere que esta versión del proyecto esté disponible en el celular; los cambios de este checkout no se sincronizan automáticamente allí.

Con la credencial ya presente en `.env` o inyectada en el entorno:

```sh
npm ci
npm test
npm run verify:mcp -- --live
```

Si el archivo privado está en otra ubicación, se puede leer sin copiarlo:

```sh
npm run verify:mcp -- --live --env-file "/ruta/privada/al/archivo.env"
```

Sustituye únicamente la ruta. Nunca pases el valor del token por argumento. Las variables ya inyectadas en el proceso tienen prioridad sobre el archivo, incluido un valor vacío. El comando sin `--live` falla antes de cargar secretos o conectar. `npm test` no carga archivos privados, y no llama a APIs externas en sus pruebas (las pruebas de timeout usan HTTP loopback sintético).

El verificador usa el cliente SDK, descubre herramientas, comprueba rechazo de entrada inválida y herramienta desconocida, y llama `kronos_me`, `kronos_status` y `kronos_health`. Una ejecución completa realiza un GET autenticado a `/api/mcp/me` y dos GET públicos a `/api/health`. El backend puede actualizar `lastUsedAt`; no se rota ni revoca nada. La salida contiene solo etapas PASS/FAIL y códigos de error permitidos, nunca valores de identidad, permisos, tokens o cuerpos completos.

El antiguo `tests/mcp-test.ts` fue retirado. La verificación actual está en `scripts/verify-mcp.mjs` y se ejecuta mediante `npm run verify:mcp -- --live`.

## Si `kronos_me` termina en timeout

Consulta [la revisión del flujo y diagnóstico seguro](docs/DIAGNOSTICO_TIMEOUT_ME.md). El endpoint sigue siendo `/api/mcp/me`, con 10 s de plazo total HTTP (cabeceras y cuerpo) y 15 s por petición del verificador MCP. No se ha ampliado el plazo ni cambiado a `/status`.

Después de actualizar y ejecutar `npm test`:

```sh
npm run diagnose:kronos -- --live
# O añadir: --env-file "/ruta/real/al/archivo.env"
```

Realiza dos GET autenticados, `/me` y `/status`, con la misma configuración y sin rotar nada. Informa destino sanitizado, origen de configuración, fase, status y duración, no secretos ni cuerpos. Las dos llamadas pueden actualizar `lastUsedAt`. Su objetivo es diagnosticar desde el entorno que falla, no certificar producción desde pruebas locales.

## Observabilidad

Los eventos se emiten como una línea JSON por evento, **solo en `stderr`**: `stdout` pertenece al protocolo MCP y un solo byte allí corrompe el stream.

Solo se registran primitivas (string, número, booleano, `null`). Cualquier objeto, arreglo o función se sustituye por `[omitted]`, de modo que un token o un cuerpo de respuesta del proveedor **no pueden** filtrarse por olvido.

```sh
KRONOS_LOG_LEVEL=debug npm start   # debug | info (por defecto) | warn | error
```

## Variables

- `NODE_ENV`: etiqueta de entorno opcional.
- `KRONOS_API_URL`: URL base HTTPS opcional.
- `KRONOS_MCP_TOKEN`: credencial privada para las herramientas protegidas `kronos_me`, `kronos_status` y `kronos_health`; la identidad debe tener los scopes `me`, `status` y `health` correspondientes.
- `KRONOS_LOG_LEVEL`: nivel mínimo de log opcional; por defecto `info`.

**Nunca guardes tokens en Git, logs o salidas de herramientas.** Emite y rota credenciales por los mecanismos autorizados del backend. No se ha documentado aquí un procedimiento de emisión automática.


## Transporte HTTP público (MCP Streamable HTTP)

El transporte HTTP se ejecuta como proceso independiente del modo `stdio`; ambos reutilizan los mismos contratos y herramientas. Para desarrollo local:

```sh
npm ci
npm run build
MSP_HTTP_BEARER_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')" npm run start:http
```

- Endpoint MCP: `/mcp` (requiere `Authorization: Bearer <MSP_HTTP_BEARER_TOKEN>`).
- Health check del alojamiento: `/healthz` (solo indica que el proceso responde; no revela estado interno de KRONOS).
- Puerto: `PORT` del proveedor, o `MSP_HTTP_PORT` (predeterminado `3000`).
- Host: `MSP_HTTP_HOST` (predeterminado `0.0.0.0`).
- Si falta el token o tiene menos de 32 caracteres, el proceso HTTP no arranca.
- No se configura CORS. El transporte HTTP sirve el mismo conjunto de 184 herramientas que stdio (las 180 locales incluidas) tras el bearer token. Se conserva la autorización por scopes existente para las herramientas del núcleo protegidas. **Ojo con publicación:** como el token es compartido, todas las sesiones comparten también el estado en memoria de las 15 herramientas con estado (contexto, bitácora, colas…); úsalo solo en instalaciones controladas.
- En alojamiento público, configura HTTPS en el proveedor y guarda el token como secreto del entorno; nunca lo guardes en Git ni en el frontend.

**Límite de la primera versión:** el bearer token es una credencial compartida para una instalación controlada/piloto, no un sistema multiusuario. Antes de distribuir el endpoint a usuarios finales, debe añadirse identidad individual/OAuth, rotación y revocación de credenciales, límites de uso y auditoría por cliente. No publiques el token en una aplicación web ni lo incrustes en SDKs distribuidos.
ni lo incrustes en SDKs distribuidos.
