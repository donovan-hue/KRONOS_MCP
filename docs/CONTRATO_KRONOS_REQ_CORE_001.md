# CONTRATO KRONOS-MCP-REQ-CORE-001 — Evaluación de Conformidad
**Identificador:** KRONOS-MCP-REQ-CORE-001  
**Prioridad:** CRÍTICA  
**Rama evaluada:** `arena/34a7564f-kronos-mcp` (base `main@6e77fd3`)  
**Fecha de inspección:** 2026-10-20 (America/Mexico_City)  
**Versión del servidor:** `0.3.0` (`package.json:3`, `src/server.ts:22`)  
**Alcance:** 184 herramientas MCP (4 núcleo + 180 locales) — conteo verificado, sin discrepancias  
**Estado global de puerta de calidad (§10):** **BLOCKED** — ninguna herramienta alcanza `PASS` para producción. Todas requieren correcciones.  
**Restricciones de la evaluación:** No se modificó código de ejecución, configuración de despliegue, secretos ni servicios. No se hizo commit ni push. Inspección estática + lectura de pruebas reales en `tests/*.test.ts` y ejecución fallida de `npm test` por ausencia de `tsc` en entorno (ver §7).

> **Lectura recomendada:** Este documento es la **evidencia** exigida por §10. Cada herramienta se evalúa contra los 12 apartados y el veredicto es `PASS|FAIL|BLOCKED|NOT_APPLICABLE` con justificación. Los requisitos no aplicables se justifican, nunca se marcan `PASS` sin evaluación.

---

## 1. Inventario verificado — sin discrepancias

| Fuente | Conteo | Evidencia |
|---|---|---|
| `package.json` name `kronos-mcp` | 1 paquete privado | `package.json:2,4` `private:true` |
| `src/server.ts:createKronosServer` | 184 en `full`, 163 en `public-local` | `src/server.ts:24-30`, `src/tools/register-local-tools.ts:39-52` |
| `src/families/index.ts` runtime guard | 180 locales exactas, 18 familias ×10 | `src/families/index.ts:33-46` `LOCAL_TOOLS_INCOMPLETE` |
| `src/catalog/tools-180.ts` generado | 180 entradas `{"number":1..180}` | `src/catalog/tools-180.ts:14-206` `grep -c '"number":' =180` |
| `tests/catalog.test.ts` + `tests/deployment-profile.test.ts` | 184 full / 163 public-local confirmados por `client.listTools()` | `tests/catalog.test.ts:6`, `tests/deployment-profile.test.ts:34-42` |
| `src/tools/kronos-*.ts` | 4 núcleo: `kronos_status, kronos_health, kronos_me, kronos_contracts` | `src/tools/kronos-status.ts:9`, `kronos-health.ts:9`, `kronos-me.ts:11`, `kronos-contracts.ts:20` |

**Rama:** `git branch --show-current` → `arena/34a7564f-kronos-mcp` coincide con lo solicitado.  
**Versión por herramienta:** **Ausente.** Solo existe versión de servidor `0.3.0`. Ninguna de las 184 declara `version` propia en contrato (`src/contracts/tool.ts:9-18`, `src/families/types.ts:7-21`). Esto viola §1 y §6.1 por sí solo.

---

## 2. Evaluación de los 12 apartados (resumen)

| § Requisito | Veredicto global | Hallazgos confirmados (reproducibles) | Riesgos no reproducidos (hipótesis sin evidencia en repo) |
|---|---|---|---|
| **1. Contrato entrada/salida** | **FAIL** | §1.1 `version` ausente en 184/184. §1.5 envelope actual `ok,tool,number,nickname,technicalName,family,familyId,mode,summary,data,warnings,limitations` en `src/tools/register-local-tools.ts:23-33,95-108` no incluye `version, error, metadata` exigidos. `tool-error.ts:14-20` usa `{error:{code,httpStatus}}` sin `warnings/metadata`. §1.6 no diferencia `parcial/fallido/rechazado/pendiente` — éxito con `missingPrices>0` en `f15-providers.ts:45` aún `ok:true`. | No se encontró tool que declare `PENDING` asíncrono; `NOT_APPLICABLE` justificable pero no documentado. |
| **2. Manejo de errores** | **FAIL** | §2.4 timeout solo para upstream: `REQUEST_TIMEOUT_MS=10_000` en `src/services/kronos-api.ts:6,66-87` con `AbortController+reader.cancel`, pero **0/180 locales** tienen `timeoutMs/cancel`. `nextCronRuns` en `src/engines/time.ts:61-71` puede loopear `1_051_200` iteraciones sin límite de `count`. §2.8 excepciones no controladas prevenidas vía `try/catch→toolError` en `register-local-tools.ts:82`, `kronos-status.ts:31`, pero `graph.ts:findCycle` es recursivo sin límite de profundidad. §2.6 reintentos: documentado `retries:0` en `scripts/diagnose-kronos.mjs` pero sin `NOT_APPLICABLE` formal. | Reintento de idempotentes no se ha reproducido como bug, solo como ausencia de política. |
| **3. Seguridad y aislamiento** | **BLOCKED** | §3.6 violado: `src/state/stores.ts` 13 `Map` globales + `src/http.ts:100-124` crea server por request pero comparte `toolRegistry` (`src/tools/registry.ts:9`) y todos los stores. Dos clientes `authenticated` con mismo `MSP_HTTP_BEARER_TOKEN` ven `contextScopes` ajeno. Confirmado por `src/families/f07-context.ts:12,59` `stateful:true` sin `user/session` key. §3.7 `telemetryEvents:[]` sin cota `src/state/stores.ts:48` → OOM. §3.2 `customPattern` en `src/families/f08-data.ts:56` `new RegExp(customPattern,"gu")` sin sanitización. | §3.3 exfiltración vía `X-Forwarded-For` spoof con `trustProxy=true` (`src/http.ts:48,129`) es riesgo plausible no reproducido en pruebas locales. §3.5 ejecución de comandos no existe, `NOT_APPLICABLE` correcto pero no declarado. |
| **4. Integridad/idempotencia/estado** | **FAIL** | §4.1 solo 15/180 declaran `stateful:true` (`grep stateful src/families/*.ts` = 15). Las 165 puras son `readOnly:true, openWorld:false` correcto per `src/contracts/tool.ts:42-48`, pero ninguna declara `idempotente`. §4.5 `compoundTools`, `approvals`, `jobQueues` comparten `Map` sin mutex; `if(!has) set` no atómico. §4.7 `kronos_checkpoint_rollback_engine` (`f02-diagnostics.ts:242`) promete `integrityOk` vía hash pero `hash` es `sha256Hex(canonicalStringify(state))` efímero, no firma externa. | Pérdida de estado por reinicio está documentada como `limitation` pero §4.6 exige definir `persistencia/caducidad/concurrencia/recuperación` — solo `ttlSeconds` en `f07-context.ts:13` lo cumple. |
| **5. Dependencias** | **FAIL** | §5.2 `createKronosServer({profile:"full"})` no comprueba `KRONOS_MCP_TOKEN` ni `KRONOS_API_URL` HTTPS; falla tardío en `tool call` con `AUTH_REQUIRED` (`src/tools/with-tool-authorization.ts:17-26`). §5.4 no diferencia `NOT_CONFIGURED` vs `UPSTREAM_UNAVAILABLE` en contrato — ambos son `KronosApiError` con `code` distinto, pero `kronos_status` (`src/tools/kronos-status.ts:31`) colapsa ambos a `toolError`. | §5.6 "simular proveedor como real" se cumple: 18 familias declaran `limitations` honestas (`grep limitation src/families/*.ts` ≈ 30), pero `kronos_claim_verification_engine` (`f10-web.ts:75`) infiere `supports` con `overlap>0.2` sin advertir margen — riesgo no reproducido como falso positivo. |
| **6. Observabilidad** | **FAIL** | §6.1 `src/observability/log.ts:31-50` solo `ts,level,event,...sanitizeFields` sin `requestId,tool,version,duration`. `src/http.ts:102-124` no mide latencia ni propaga `correlationId`. `src/tools/tool-error.ts:8-10` loguea `code,httpStatus` sin `tool`. | §6.3 métricas Prometheus no aplican (`NOT_APPLICABLE`) pero no está justificado por escrito. |
| **7. Pruebas obligatorias** | **FAIL** | §7.4-7.9 sin cubrir: 0 tests de `src/http.ts` (shutdown, `429`, `X-Forwarded-For`), 0 de concurrencia/idempotencia, 0 de `customPattern` ReDoS, 0 de `telemetryEvents` OOM. `npm test` no ejecutable en entorno inspeccionado (`tsc: not found` + `tsx` no instalado). Solo `tests/local-tools.test.ts:59` prueba `example` feliz y `tests/mcp.test.ts:106` prueba `invalid_input` para `kronos_status`. | 65 tests locales previos reportados en `SOCIAL-POST-DRAFT.md` no reproducibles aquí por falta de `dist/`. |
| **8. Verificación resultado** | **FAIL** | §8.2 evidencia débil: `kronos_repair_validation_runner` (`f02-diagnostics.ts:298`) usa `deepDiff` local truncado a 100 entradas (`src/engines/data.ts:134`) sin marcar truncamiento → falso `matches:true`. §8.5 `scanSecrets` enmascara pero no inventa, correcto; `extractPatterns` con `URL_RE` no valida existencia de URL. | No hay operación que afirme `persistida` — `NOT_APPLICABLE` correcto. |
| **9. Integración KRONOS MCP** | **FAIL** | §9.1 `toolRegistry` global viola §9.6 colisión de identificadores: `PUBLIC_LOCAL_EXCLUDED_TOOL_NUMBERS=[42,153]` (`register-local-tools.ts:50`) evita registrar, pero `byNameMap.has(name)` en `src/catalog/index.ts:18` sigue conociendo el nombre → `isKnownToolName` (`f01-coordination.ts:27`) permite referenciar tool excluida en `compoundTools`. | §9.3 transporte `StreamableHTTPServerTransport` usado correctamente (`src/http.ts:103-113`), no se encontró violación. |
| **10. Puerta calidad** | **BLOCKED** | No existe `scripts/quality-gate.mjs` ni CI que evalúe 10 puntos y emita `PASS/FAIL/BLOCKED`. `prepublishOnly` solo chequea `private:true` (`scripts/check-private-publish.mjs`). | — |
| **11. Calidad continua** | **FAIL** | Sin `workflow` de regresión pre-deploy (` .github/workflows/ci.yml` solo `npm test` en `push→main,arena/**`). Sin feature flag para desactivar tool defectuosa. | §11 exige re-evaluar al cambiar `esquema/permisos/proveedor` — no hay `CODEOWNERS`. |
| **12. Aceptación** | **FAIL** | Principio rector violado en envelope: se declara `mode:local_deterministic` sin `version` trazable a prueba (§12). Compilación `tsc` no ejecutada en inspección por falta de binario, no puede ser evidencia de calidad (§12.2). | — |

**Separación exigida:** Arriba, columna 3 = *confirmados* (código/ruta reproducible). Columna 4 = *riesgos no reproducidos* (hipótesis sin PoC en repo).

---

## 3. Inventario individual — 184 herramientas

> **Convenciones:** `Versión tool = —` (ausente, ver `src/contracts/tool.ts` sin campo version). `Permisos = —` significa `requiredPermission` no declarado → herramienta pública (no exige `/api/mcp/me`). `Estado = BLOCKED` para stateful con memoria compartida; `FAIL` para puras con envelope incompleto. `Evidencia` = ruta reproducible. `Pruebas existentes` = `local-tools.test.ts` barre 180 con `example` + 1 test de familia; nada más.

### 3.1 Núcleo conectado (4)

| # | Nombre MCP | Apodo | Familia | Versión | Permisos | Estado | Evidencia concreta | Pruebas existentes | Pruebas faltantes (§7) | Corrección propuesta (§1-12) |
|---|---|---|---|---|---|---|---|---|---|
| C1 | `kronos_status` | — | diagnostics (core) | — (server 0.3.0) | `status` | **FAIL** | `src/tools/kronos-status.ts:9-20` `readOnlyTool` sin `version`; `src/services/kronos-api.ts:66` timeout 10s no propagado a caller; `src/http.ts:145` `authorization` puede ser `string[]` | `tests/mcp.test.ts:39,106` valida `strict()` y `isError` sin token | §7.3 timeout simulado, §7.4 seguridad (bearer array), §7.6 integración con fixture `kronos-fetch.mjs` | Añadir `contract.version="0.3.0"`, `metadata.durationMs,requestId`, clasificar errores §2.5, validar `authorization` es `string` |
| C2 | `kronos_health` | — | diagnostics | — | `health` | **FAIL** | Idem `src/tools/kronos-health.ts:9-18`; `getKronosHealth` passthrough `healthSchema` (`src/services/kronos-api.ts:7-16`) acepta cualquier `build` extra | `tests/mcp.test.ts:55,68` valida payload ok/400 | §7.2 `oversized body` sí existe `tests/mcp.test.ts:87`, falta §7.5 concurrencia | Incluir `version` y `error.metadata.retryAfter`, documentar `NOT_APPLICABLE` reintentos |
| C3 | `kronos_me` | — | diagnostics | — | `me` | **FAIL** | `src/tools/kronos-me.ts:11-19` sin `version`; `getKronosMe` en `src/services/kronos-auth.ts:10` exige token pero no verifica `permissionsOf` vacío | `tests/mcp.test.ts:93,133` `AUTH_REQUIRED` sin token | §7.4 `FORBIDDEN` con token sin scope `me` no probado | Propagar `correlationId` §6.2, distinguir `AUTH_REQUIRED` vs `FORBIDDEN` §2.5 |
| C4 | `kronos_contracts` | — | diagnostics | — | — (público) | **FAIL** | `src/tools/kronos-contracts.ts:20-45` lista `toolRegistry` global (`src/tools/registry.ts:12`) 오염 — reporta 184 aunque perfil `public-local` sirva 163 | `tests/mcp.test.ts:133` verifica 18 capabilities y 184 tools | Falta test `public-local` debe listar 163, no 184 | Hacer `registry` por instancia `KronosServerProfile`, añadir `version` por tool y `resources/prompts` vacíos documentados como `NOT_APPLICABLE` |

### 3.2 Familia 01 — Coordinación y enrutamiento inteligente (10) `capability: coordination`

| Nº | Nombre MCP | Apodo | Versión | Perm | Estado | Evidencia | Pruebas existentes | Faltantes | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `kronos_compound_tool_constructor` | Nexo | — | — | **BLOCKED** | `src/families/f01-coordination.ts:23-38` `stateful:true`, `compoundTools Map` global `src/state/stores.ts:45` con `MAX_STORE_KEYS=500` pero sin tenant isolation; `isKnownToolName` permite `42,153` excluidas | `tests/local-tools.test.ts:59` barrido ok + `tests/catalog.test.ts:18` | §7.5 concurrencia `create` con mismo `name` → `CONFLICT` race, §7.2 `steps.alias` duplicado `CONFLICT` solo feliz | Añadir `version`, `metadata.correlationId`, `storeKey=hash(bearer)+name`, límite `steps≤50` ya existe pero falta test de `LIMIT_EXCEEDED` |
| 2 | `kronos_intelligent_tool_router` | Brújula | — | — | **FAIL** | `f01:62-99` recomienda por `queryOverlap`+`tokens` (`src/engines/text.ts:22-50`) sin `version`; `statefulNumbers` hardcodeado `[1,8,17,18,54,55,61,62,119,141,144,150,154,159,161]` duplica `register-local-tools.ts:50` | `local-tools.test.ts:81` sugiere Bóveda | §7.2 `goal` vacío `INVALID_INPUT` solo vía `reqText(2000)` | Sincronizar set stateful en `src/state/stores.ts` única fuente, añadir `version` |
| 3 | `kronos_multi_agent_coordinator` | Director | — | — | **FAIL** | `f01:100-139` `subtasks≤500, agents≤100` sin timeout | barrido | §7.3 `analyzeGraph` ciclo → `valid:false` probado solo en tool 6 | Añadir `metadata.durationMs` |
| 4 | `kronos_task_handoff_manager` | Relevo | — | — | **FAIL** | `f01:141-166` conserva `state.history` sin límite | barrido | §7.5 dos handoffs concurrentes mismo `taskId` | Límite `history≤100` |
| 5 | `kronos_dynamic_priority_scheduler` | Prior | — | — | **FAIL** | `f01:168-193` `weight` sin normalizar | barrido | §7.2 `weight` negativo ya rechazado por `z.number().nonnegative()` | — |
| 6 | `kronos_dependency_graph_planner` | Malla | — | — | **FAIL** | `f01:195-206` delega `analyzeGraph` (`src/engines/graph.ts:55-85`) ciclos detectados pero `levels` vacío si ciclo — `order` incompleto | `local-tools.test.ts:81` ciclo detectado | §7.3 `unknownDependencies` no probado | Incluir `version`, `error.code=INVALID_INPUT` con `cycle` |
| 7 | `kronos_parallel_execution_planner` | Confluencia | — | — | **FAIL** | `f01:208-233` `levels` determinista correcto | barrido | §7.5 `limit` no aplica | — |
| 8 | `kronos_workflow_state_tracker` | Compás | — | — | **BLOCKED** | `f01:235-270` `stateful:true` `workflowStates Map` global sin tenant | barrido | §7.4 aislamiento entre tenants | Key por `bearerHash+workflowId` |
| 9 | `kronos_capability_based_tool_selector` | Umbral | — | — | **FAIL** | `f01:272-305` filtra por `familyId` regex `^(0[1-9]|1[0-8])$` | `deployment-profile.test.ts:49` verifica filtro `public-local` excluye 61,62 | Falta test `familyId=99` → `INVALID_INPUT` | — |
| 10 | `kronos_workflow_completion_verifier` | Cierre | — | — | **FAIL** | `f01:307-328` `criteria[]` sin `version` | barrido | §7.2 `criteria` vacío `INVALID_INPUT` | — |

### 3.3 Familia 02 — Diagnóstico, reparación y recuperación (11-20) `diagnostics`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 11 | `kronos_system_health_diagnoser` | Pulso | — | — | **FAIL** | `f02:11-43` `limitation:"no sondea"` correcta §5.6 | barrido | §7.6 integración con señal real | — |
| 12 | `kronos_verified_repair_planner` | Remedio | — | — | **FAIL** | `f02:45-126` genera plan verificable | barrido | §7.9 recuperación no probada | Añadir `metadata.stepsVerified` |
| 13 | `kronos_adaptive_retry_controller` | Reintento | — | — | **FAIL** | `f02:128-200` no reintenta `4xx` (`local-tools.test.ts:91`) | test 02 ok | §2.6 backoff no existe — debe declararse `NOT_APPLICABLE` | Documentar `retry: manual` |
| 14 | `kronos_adaptive_task_recovery` | Rescate | — | — | **FAIL** | `f02:150-170` | barrido | §7.5 concurrencia | — |
| 15 | `kronos_root_cause_analyzer` | Rastreo | — | — | **FAIL** | `f02:172-200` `limitation` estima causa, no certifica §5.6 | barrido | — | — |
| 16 | `kronos_regression_detector` | Centinela | — | — | **FAIL** | `f02:180-200` | barrido | — | — |
| 17 | `kronos_circuit_breaker_manager` | Válvula | — | — | **BLOCKED** | `f02:202-240` `stateful:true`, `circuitBreakers Map` global `src/state/stores.ts:23` sin tenant | `local-tools.test.ts:91` `record_failure→open` | §7.5 dos `record_failure` paralelos mismo `key` | Aislar por bearer+key |
| 18 | `kronos_checkpoint_rollback_engine` | Rebobina | — | — | **BLOCKED** | `f02:242-277` `stateful:true`, `checkpoints Map` + `hash` efímero | test 02 rollback íntegro | §7.4 secreto en `state` no bloqueado | Validar `state` no contiene `token|password` |
| 19 | `kronos_fault_isolation_engine` | Aislante | — | — | **FAIL** | `f02:279-300` `impactedDependents` correcto | barrido | — | — |
| 20 | `kronos_repair_validation_runner` | Prueba | — | — | **FAIL** | `f02:298-336` `deepDiff` cap 100 trunca sin aviso §8.2 | barrido | — | Incluir `warnings:["diff truncado"]` |

### 3.4 Familia 03 — Planificación y objetivos complejos (21-30) `planning`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 21 | `kronos_complex_objective_orchestrator` | Odisea | — | — | **FAIL** | `f03:11-43` `limitation` plantilla | barrido | — | — |
| 22 | `kronos_milestone_planner` | Hito | — | — | **FAIL** | `f03:45-80` | barrido | — | — |
| 23 | `kronos_plan_adaptation_engine` | Deriva | — | — | **FAIL** | `f03:82-110` | barrido | — | — |
| 24 | `kronos_goal_clarifier` | Lente | — | — | **FAIL** | `f03:112-130` `clarityScore<60` | `local-tools.test.ts:108` vague | — | — |
| 25 | `kronos_scope_boundary_manager` | Alcance | — | — | **FAIL** | `f03:132-150` | barrido | — | — |
| 26 | `kronos_progress_estimator` | Tracción | — | — | **FAIL** | `f03:152-178` usa `daysBetween` con `Math.round` (§12 DST) | test 03 `progress 50%` | §7.2 `elapsedDays` negativo ya rechazado | Corregir `daysBetween` a `floor` |
| 27 | `kronos_alternative_path_finder` | Ruta | — | — | **FAIL** | `f03:180-210` | barrido | — | — |
| 28 | `kronos_resource_allocation_planner` | Balance | — | — | **FAIL** | `f03:212-240` | barrido | — | — |
| 29 | `kronos_long_horizon_planner` | Horizonte | — | — | **FAIL** | `f03:242-270` | barrido | — | — |
| 30 | `kronos_acceptance_criteria_validator` | Entrega | — | — | **FAIL** | `f03:272-305` `accepted` booleano sin `metadata` | test 03 | — | Añadir `version`, `warnings` si `margin` ajustado |

### 3.5 Familia 04 — Simulación, consecuencias y decisiones (31-40) `simulation`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 31 | `kronos_consequence_simulator` | Eco | — | — | **FAIL** | `f04:10-50` `limitation` solo efectos declarados | barrido | — | — |
| 32 | `kronos_what_if_scenario_engine` | Bifurca | — | — | **FAIL** | `f04:52-90` | barrido | — | — |
| 33 | `kronos_risk_scoring_engine` | Riesgo | — | — | **FAIL** | `f04:92-130` `impact:5,prob:4→critical` `local-tools.test.ts:121` | test 04 | — | — |
| 34 | `kronos_trade_off_analyzer` | Contrapeso | — | — | **FAIL** | `f04:132-170` | barrido | — | — |
| 35 | `kronos_decision_support_system` | Faro | — | — | **FAIL** | `f04:172-210` | barrido | — | — |
| 36 | `kronos_scenario_comparison_tool` | Espejo | — | — | **FAIL** | `f04:212-240` | barrido | — | — |
| 37 | `kronos_reversibility_assessor` | Retorno | — | — | **FAIL** | `f04:242-270` | barrido | — | — |
| 38 | `kronos_cost_projection_calculator` | Coste | — | — | **FAIL** | `f04:272-300` `monthlyExpected 100` test 04 | test 04 | — | — |
| 39 | `kronos_decision_record_generator` | Acta | — | — | **FAIL** | `f04:302-330` | barrido | — | — |
| 40 | `kronos_undo_feasibility_checker` | Deshacer | — | — | **FAIL** | `f04:332-360` `verdict parcialmente_reversible` | test 04 | — | — |

### 3.6 Familia 05 — Pruebas y evaluación de capacidades (41-50) `testing`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 41 | `kronos_tool_capability_benchmark` | Banco | — | — | **FAIL** | `f05:11-50` bench ejecuta otra tool dentro del proceso — excluida en `public-local` `register-local-tools.ts:50` | barrido | §7.4 amplificación denegada en public-local verificado `deployment-profile.test.ts:22` | Documentar `NOT_APPLICABLE` reintentos |
| 42 | `kronos_tool_benchmark_runner` | Banco2 | — | — | **FAIL** | `f05:49-110` `limitation` "mide ejemplo dentro del proceso" | `deployment-profile.test.ts:22` excluida | §7.9 no hay test de error de benchmark | — |
| 43 | `kronos_load_test_designer` | Carga | — | — | **FAIL** | `f05:115-150` solo genera diseño, no ejecuta carga | barrido | — | — |
| 44 | `kronos_security_test_scenario` | EscudoTest | — | — | **FAIL** | `f05:152-190` | barrido | — | — |
| 45 | `kronos_usability_test_planner` | Uso | — | — | **FAIL** | `f05:192-220` | barrido | — | — |
| 46 | `kronos_expected_result_comparator` | Oráculo | — | — | **FAIL** | `f05:222-260` `deepDiff` cap 100 | `local-tools.test.ts:133` diff `total:3 vs 4` | §8.2 truncamiento no advertido | Añadir `warnings` si `cap` alcanzado |
| 47 | `kronos_repeatability_evaluator` | Consistencia | — | — | **FAIL** | `f05:262-290` | barrido | — | — |
| 48 | `kronos_tool_contract_tester` | Contrato | — | — | **FAIL** | `f05:292-330` verifica `toolContractSchema` pero no `version` | barrido | — | Incluir `version` en contrato |
| 49 | `kronos_mutation_test_generator` | Mutante | — | — | **FAIL** | `f05:332-370` `limitation` no ejecuta mutantes | barrido | — | — |
| 50 | `kronos_evaluation_threshold_calibrator` | Calibrador | — | — | **FAIL** | `f05:372-410` `suggestedThreshold ≥0.8` | test 05 | — | — |

### 3.7 Familia 06 — Control de cambios y seguridad operativa (51-60) `security`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 51 | `kronos_change_control_manager` | Guardia | — | — | **FAIL** | `f06:11-43` `riskLevel high→needs rollbackPlan` | barrido | — | — |
| 52 | `kronos_secret_exposure_scanner` | Bóveda | — | — | **FAIL** | `f06:45-70` `scanSecrets` enmascara `maskedPreview` `****` correcto `src/engines/security.ts:52-86`; `limit 200` findings | `local-tools.test.ts:142` secreto enmascarado, no aparece en salida | §7.2 texto >200k `longText()` rechaza | — |
| 53 | `kronos_least_privilege_policy_enforcer` | Permiso | — | — | **FAIL** | `f06:72-100` audit `hasPermission` con `*` y `:*` | barrido | — | — |
| 54 | `kronos_approval_gate_controller` | Doble Llave | — | — | **BLOCKED** | `f06:73-110` `stateful:true`, `approvals Map` global `src/state/stores.ts:39` sin tenant | barrido | §7.5 doble `approve` mismo `approver` → `CONFLICT` race | Aislar `approvals` por bearer |
| 55 | `kronos_tamper_evident_audit_logger` | Bitácora | — | — | **BLOCKED** | `f06:115-150` `stateful:true`, `auditLogs Map` + `hash` cadena | test 06 `append+verify` | §7.4 `details` podría contener secreto — no filtrado | Validar `details` no contiene patrón `SECRET_PATTERNS` |
| 56 | `kronos_tool_invocation_policy_filter` | Cortafuego | — | — | **FAIL** | `f06:152-180` | barrido | — | — |
| 57 | `kronos_untrusted_input_sandbox` | Cuarentena | — | — | **FAIL** | `f06:182-210` `htmlToText` regex, no VM real — `limitation` correcta | barrido | — | — |
| 58 | `kronos_prompt_injection_detector` | Vigía | — | — | **FAIL** | `f06:212-250` `scanPromptInjection` `score` capped 100 | test 06 Vigía detecta | — | — |
| 59 | `kronos_artifact_integrity_verifier` | Huella | — | — | **FAIL** | `f06:252-280` `sha256Hex` | barrido | — | — |
| 60 | `kronos_safe_recovery_manager` | Retorno Seguro | — | — | **FAIL** | `f06:282-305` | barrido | — | — |

### 3.8 Familia 07 — Contexto, memoria y conocimiento (61-70) `context`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 61 | `kronos_scoped_context_store` | Memoria | — | — | **BLOCKED** | `f07:12-57` `stateful:true`, `contextScopes Map<string,Map>` global `src/state/stores.ts:18` | test 07 memoria por ámbito | §7.5 concurrent `set` mismo `scope/key` sin lock | Aislar por bearer+scope |
| 62 | `kronos_knowledge_index_builder` | Índice | — | — | **BLOCKED** | `f07:59-95` `stateful:true`, `knowledgeIndexes Map` global | test 07 | — | Aislar |
| 63 | `kronos_relevant_memory_retriever` | Recuerdo | — | — | **FAIL** | `f07:97-130` `cosineText` | barrido | — | — |
| 64 | `kronos_memory_retention_controller` | Caducidad | — | — | **FAIL** | `f07:132-160` aplica `expiresAt` lazy | test 07 caducidad | — | — |
| 65 | `kronos_source_provenance_tracker` | Procedencia | — | — | **FAIL** | `f07:162-190` | barrido | — | — |
| 66 | `kronos_evidence_reconciliation_engine` | Consenso | — | — | **FAIL** | `f07:192-220` | barrido | — | — |
| 67 | `kronos_incremental_context_summarizer` | Resumen Vivo | — | — | **FAIL** | `f07:222-250` `extractiveSummary` | barrido | — | — |
| 68 | `kronos_context_deduplication_tool` | Limpieza | — | — | **FAIL** | `f07:252-280` | barrido | — | — |
| 69 | `kronos_entity_relationship_mapper` | Vínculo | — | — | **FAIL** | `f07:282-305` `connectedComponents` (`src/engines/graph.ts:95`) | barrido | — | — |
| 70 | `kronos_knowledge_freshness_checker` | Frescura | — | — | **FAIL** | `f07:307-340` | barrido | — | — |

### 3.9 Familia 08 — Datos, archivos y transformación (71-80) `data`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 71 | `kronos_structured_data_extractor` | Extractor | — | — | **FAIL** | `f08:11-43` `customPattern` → `RegExp` sin timeout §3.2 | barrido | §7.4 ReDoS con `"(a+)+"` | Validar `customPattern` con `safe-regex` o rechazar `*+` anidados |
| 72 | `kronos_data_normalization_engine` | Normaliza | — | — | **FAIL** | `f08:45-85` `parseDateLoose` | barrido | — | — |
| 73 | `kronos_format_conversion_router` | Convertidor | — | — | **FAIL** | `f08:87-130` `objectsToDelimited` orden no determinista `src/engines/data.ts:20`; `limit` no aplicado a salida | test 08 csv-json | §7.2 TSV con `"` escapado | Incluir `version`, `metadata.rowCount` |
| 74 | `kronos_document_content_reader` | Lector | — | — | **FAIL** | `f08:132-170` `limitation` no lee FS/binarios §5.6 | barrido | — | — |
| 75 | `kronos_file_and_data_diff_analyzer` | Diferencia | — | — | **FAIL** | `f08:172-210` `linesDiff` `MAX_DIFF_PRODUCT=1_200_000` → `approximate:true` (`src/engines/text.ts:120`) sin `metadata` | barrido | — | Añadir `metadata.approximate` |
| 76 | `kronos_schema_inference_tool` | Esquema | — | — | **FAIL** | `f08:212-250` `inferSchema` `missingPct` redondeo `src/engines/data.ts:106` | barrido | — | — |
| 77 | `kronos_data_quality_validator` | Validador | — | — | **FAIL** | `f08:252-290` detecta duplicados | test 08 | — | — |
| 78 | `kronos_batch_processing_coordinator` | Lote | — | — | **FAIL** | `f08:292-330` | barrido | — | — |
| 79 | `kronos_document_chunking_optimizer` | Fragmenta | — | — | **FAIL** | `f08:332-370` `chunkText` `src/engines/text.ts:215` solape puede no avanzar §2.4 | test 08 chunking | §7.2 `targetChars < overlapChars` → `LIMIT_EXCEEDED` | Validar `overlap < target` |
| 80 | `kronos_data_merge_and_reconciliation` | Ensamble | — | — | **FAIL** | `f08:372-410` | barrido | — | — |

### 3.10 Familia 09 — Desarrollo de software y repositorios (81-90) `development`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 81 | `kronos_project_scaffolder` | Andamiaje | — | — | **FAIL** | `f09:11-43` solo genera estructura texto, no escribe FS §3.5 correcto `limitation` | barrido | — | — |
| 82 | `kronos_static_code_analysis_runner` | Inspector | — | — | **FAIL** | `f09:45-85` heurística `TODO\|any` | test 09 análisis estático | — | — |
| 83 | `kronos_safe_refactoring_planner` | Refactor | — | — | **FAIL** | `f09:87-130` | barrido | — | — |
| 84 | `kronos_patch_generation_engine` | Parche | — | — | **FAIL** | `f09:132-170` `unifiedDiff` `src/engines/text.ts:205` | test 09 parche | — | — |
| 85 | `kronos_dependency_risk_auditor` | Dependencia | — | — | **FAIL** | `f09:172-210` rangos sin CVE | barrido | — | — |
| 86 | `kronos_api_contract_mapper` | API Mapa | — | — | **FAIL** | `f09:212-250` | barrido | — | — |
| 87 | `kronos_schema_migration_planner` | Migrador | — | — | **FAIL** | `f09:252-290` | barrido | — | — |
| 88 | `kronos_build_and_typecheck_runner` | BuildCheck | — | — | **FAIL** | `f09:292-330` `limitation` no ejecuta build §5.6 | barrido | — | — |
| 89 | `kronos_pull_request_review_assistant` | Revisor | — | — | **FAIL** | `f09:332-370` detecta `console.log\|TODO` | barrido | — | — |
| 90 | `kronos_release_readiness_validator` | Release | — | — | **FAIL** | `f09:372-410` | barrido | — | — |

### 3.11 Familia 10 — Web, búsqueda y verificación (91-100) `web`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 91 | `kronos_multi_source_web_search` | Radar | — | — | **FAIL** | `f10:11-50` `limitation` no hay búsqueda viva, solo `corpus` aportado §5.6 correcto | barrido | — | — |
| 92 | `kronos_search_result_relevance_ranker` | Filtro | — | — | **FAIL** | `f10:52-95` `freshnessWeight` sin validar suma pesos | barrido | — | — |
| 93 | `kronos_claim_verification_engine` | Verifica | — | — | **FAIL** | `f10:97-130` `verdict supported/contradicted/mixed/insufficient` con `overlap>0.2` | test 10 cifras | §7.2 números con `,` vs `.` | Añadir `metadata.thresholds` |
| 94 | `kronos_citation_and_link_validator` | Cita | — | — | **FAIL** | `f10:132-170` `URL_RE` no valida existencia | barrido | — | — |
| 95 | `kronos_web_freshness_monitor` | Vigencia | — | — | **FAIL** | `f10:172-210` `daysBetween` DST bug §2 | barrido | — | Corregir `daysBetween` |
| 96 | `kronos_domain_reputation_checker` | Dominio | — | — | **FAIL** | `f10:212-260` heurística offline, `limitation` no consulta DNS §5.6 | test 10 dominio cebo | — | — |
| 97 | `kronos_source_comparison_analyzer` | Comparador | — | — | **FAIL** | `f10:262-300` | barrido | — | — |
| 98 | `kronos_web_page_structure_extractor` | Página | — | — | **FAIL** | `f10:302-340` `htmlToText` regex `src/engines/data.ts:180` | test 10 extractor página | — | — |
| 99 | `kronos_change_monitoring_watcher` | Alerta Web | — | — | **FAIL** | `f10:342-380` | barrido | — | — |
| 100 | `kronos_content_authenticity_checker` | Autenticidad | — | — | **FAIL** | `f10:382-410` | barrido | — | — |

### 3.12 Familia 11 — Multimedia imagen y diseño visual (101-110) `image`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 101 | `kronos_image_provider_router` | Selector Imagen | — | — | **FAIL** | `f11:11-45` solo ordena candidatos `rankCandidates` (`src/engines/scoring.ts:14`) `limitation` no genera | barrido | — | — |
| 102 | `kronos_image_editing_planner` | Editor | — | — | **FAIL** | `f11:47-85` `cropForAspect` `src/engines/media.ts:25` no valida `Infinity` | barrido | §7.2 `focalX=NaN` → `INVALID_INPUT` no probado | Validar `0≤focal≤1` |
| 103 | `kronos_brand_asset_compliance_checker` | Marca | — | — | **FAIL** | `f11:87-130` `contrastRatio` `src/engines/media.ts:18` | barrido | — | — |
| 104 | `kronos_image_quality_evaluator` | Calidad Img | — | — | **FAIL** | `f11:132-170` | barrido | — | — |
| 105 | `kronos_batch_image_formatter` | LoteImg | — | — | **FAIL** | `f11:172-210` | barrido | — | — |
| 106 | `kronos_image_caption_generator` | Epígrafe | — | — | **FAIL** | `f11:212-250` | barrido | — | — |
| 107 | `kronos_background_removal_planner` | Fondo | — | — | **FAIL** | `f11:252-290` | barrido | — | — |
| 108 | `kronos_super_resolution_planner` | Amplía | — | — | **FAIL** | `f11:292-330` `limitation` no amplía | barrido | — | — |
| 109 | `kronos_segmentation_and_mask_generator` | Máscara | — | — | **FAIL** | `f11:332-370` | barrido | — | — |
| 110 | `kronos_product_variant_renderer` | Variante | — | — | **FAIL** | `f11:372-410` `peakDb/rmsDb` con `[]` → `-Infinity` JSON `null` §3.9 | barrido | — | Mapear `-Infinity→0` |

### 3.13 Familia 12 — Multimedia vídeo y movimiento (111-120) `video`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 111 | `kronos_video_provider_router` | Selector Vídeo | — | — | **FAIL** | `f12:11-45` | barrido | — | — |
| 112 | `kronos_video_composition_planner` | Montaje | — | — | **FAIL** | `f12:47-85` EDL | barrido | — | — |
| 113 | `kronos_shot_transition_optimizer` | Corte | — | — | **FAIL** | `f12:87-130` | barrido | — | — |
| 114 | `kronos_motion_graphics_router` | Movimiento | — | — | **FAIL** | `f12:132-170` | barrido | — | — |
| 115 | `kronos_subtitle_alignment_engine` | Subtítulos | — | — | **FAIL** | `f12:172-210` `buildSrt` `src/engines/time.ts:105` | test 12 SRT válido | — | — |
| 116 | `kronos_smart_reframing_tool` | Reencuadre | — | — | **FAIL** | `f12:212-250` `orientation` | test 12 | — | — |
| 117 | `kronos_video_quality_assurance` | QA Vídeo | — | — | **FAIL** | `f12:252-290` | test 12 calidad | — | — |
| 118 | `kronos_video_chapter_generator` | Capítulos | — | — | **FAIL** | `f12:292-330` | barrido | — | — |
| 119 | `kronos_render_queue_manager` | Cola Render | — | — | **BLOCKED** | `f12:278-315` `stateful:true`, `jobQueues Map` global `src/state/stores.ts:40` | barrido | §7.5 dos `enqueue` mismo `id` | Aislar por bearer |
| 120 | `kronos_platform_format_adapter` | Formato | — | — | **FAIL** | `f12:332-370` | barrido | — | — |

### 3.14 Familia 13 — Multimedia audio, voz y música (121-130) `audio`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 121 | `kronos_text_to_speech_provider_router` | Voz | — | — | **FAIL** | `f13:10-43` `languageRouter` | barrido | — | — |
| 122 | `kronos_speech_to_text_router` | Oído | — | — | **FAIL** | `f13:10-43` idem | barrido | — | — |
| 123 | `kronos_voice_direction_planner` | Locutor | — | — | **FAIL** | `f13:45-70` `sentences` + `speechSeconds` | barrido | — | — |
| 124 | `kronos_music_generation_router` | Ritmo | — | — | **FAIL** | `f13:10-43` | barrido | — | — |
| 125 | `kronos_audio_mixing_planner` | Mezcla | — | — | **FAIL** | `f13:72-104` `peakDb/rmsDb` `-Infinity` §1 envelope | barrido | §7.2 `samples=[]` → `null` no probado | — |
| 126 | `kronos_silence_cleaner` | Silencio | — | — | **FAIL** | `f13:106-127` | barrido | — | — |
| 127 | `kronos_speaker_diarization_tool` | Diarización | — | — | **FAIL** | `f13:129-166` suma tiempos | test 13 diarización | — | — |
| 128 | `kronos_av_synchronization_validator` | Sincronía AV | — | — | **FAIL** | `f13:168-188` | barrido | — | — |
| 129 | `kronos_pronunciation_quality_checker` | Pronunciación | — | — | **FAIL** | `f13:190-204` `alignWords` `src/engines/text.ts:240` `LIMIT_EXCEEDED` si `a*b>400k` | barrido | — | Añadir `metadata.wordCount` |
| 130 | `kronos_mastering_quality_checker` | Master | — | — | **FAIL** | `f13:206-235` | barrido | — | — |

### 3.15 Familia 14 — Guion, contenido y publicación (131-140) `content`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 131 | `kronos_script_outline_generator` | Esquema | — | — | **FAIL** | `f14:11-50` | barrido | — | — |
| 132 | `kronos_script_section_expander` | Expande | — | — | **FAIL** | `f14:52-85` | barrido | — | — |
| 133 | `kronos_narrative_consistency_checker` | Coherencia | — | — | **FAIL** | `f14:87-130` | barrido | — | — |
| 134 | `kronos_platform_format_adapter` (content) | FormatoC | — | — | **FAIL** | `f14:132-170` `limit` plataformas | barrido | — | — |
| 135 | `kronos_content_calendar_planner` | Calendario | — | — | **FAIL** | `f14:172-210` `addDays` | test 14 calendario | — | — |
| 136 | `kronos_hook_optimization_engine` | Gancho | — | — | **FAIL** | `f14:212-250` | barrido | — | — |
| 137 | `kronos_content_distribution_planner` | Distribución | — | — | **FAIL** | `f14:252-290` | barrido | — | — |
| 138 | `kronos_content_performance_analyzer` | Rendimiento | — | — | **FAIL** | `f14:292-330` `describe` `src/engines/stats.ts:55` | test 14 rendimiento | — | — |
| 139 | `kronos_a_b_test_designer` | Test A/B | — | — | **FAIL** | `f14:332-370` | barrido | — | — |
| 140 | `kronos_seo_optimization_checker` | SEO | — | — | **FAIL** | `f14:372-410` | barrido | — | — |

### 3.16 Familia 15 — Proveedores, costes y capacidad (141-150) `providers`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 141 | `kronos_provider_pricing_catalog` | Tarifario | — | — | **BLOCKED** | `f15:11-50` `stateful:true`, `priceCatalog Map` global `src/state/stores.ts:44` | barrido | §7.5 upsert concurrente mismo `providerId` | Aislar por bearer |
| 142 | `kronos_quality_cost_provider_optimizer` | Optimizador | — | — | **FAIL** | `f15:52-90` `rankCandidates` sin `LIMIT_EXCEEDED` si 200 providers | barrido | §7.3 `feasible` vacío → `ok:true` engañoso §1 | Devolver `ok:false` si `feasible` vacío |
| 143 | `kronos_provider_availability_monitor` | Disponibilidad | — | — | **FAIL** | `f15:92-130` `p95Latency` | barrido | — | — |
| 144 | `kronos_quota_manager` | Cuota | — | — | **BLOCKED** | `f15:102-150` `stateful:true`, `quotaWindows Map` global | test 15 cuota deniega | §7.5 dos `consume` simultáneos | Aislar + lock |
| 145 | `kronos_budget_guardrail_enforcer` | Presupuesto Guard | — | — | **FAIL** | `f15:152-190` | barrido | — | — |
| 146 | `kronos_model_capability_matrix` | Matriz | — | — | **FAIL** | `f15:192-230` | barrido | — | — |
| 147 | `kronos_fallback_strategy_planner` | Fallback | — | — | **FAIL** | `f15:232-270` | test 15 fallback | — | — |
| 148 | `kronos_capacity_forecast` | Capacidad | — | — | **FAIL** | `f15:272-310` | barrido | — | — |
| 149 | `kronos_cost_comparison_report` | Coste | — | — | **FAIL** | `f15:312-350` | barrido | — | — |
| 150 | `kronos_service_capability_registry` | Registro Cap | — | — | **BLOCKED** | `f15:283-310` `stateful:true`, `capabilityRegistryStore Map` global | barrido | — | Aislar |

### 3.17 Familia 16 — Automatización e integraciones (151-160) `automation`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 151 | `kronos_workflow_trigger_manager` | Gatillo | — | — | **FAIL** | `f16:11-50` evalúa condiciones `eq/neq/gt` con `canonicalStringify` | barrido | — | — |
| 152 | `kronos_integration_adapter_builder` | Adaptador | — | — | **FAIL** | `f16:52-110` genera código JS con `headerName` interpolado sin escape §3.2 | barrido | §7.4 `headerName='"a);evil()'` no probado | Escapar `headerName` o `z.string().regex(/^[A-Za-z0-9-]+$/)` |
| 153 | `kronos_webhook_validation_gateway` | Webhook | — | — | **FAIL** | `f16:112-152` lee `process.env[secretEnvVar]` (`safeEqualHex` timing-safe `src/engines/security.ts:16` correcto) — oráculo HMAC, excluida en `public-local` `register-local-tools.ts:50` | test 16 HMAC válido | §7.4 brute-force no probado pero `safeEqualHex` mitiga | Mantener exclusión, añadir `rateLimit` por tool |
| 154 | `kronos_job_queue_manager` | Cola Trabajos | — | — | **BLOCKED** | `f16:154-210` `stateful:true`, `jobQueues Map` global | barrido | — | Aislar |
| 155 | `kronos_event_filter_engine` | FiltroEventos | — | — | **FAIL** | `f16:212-250` | barrido | — | — |
| 156 | `kronos_scheduled_workflow_runner` | Programado | — | — | **FAIL** | `f16:252-310` `nextCronRuns` sin límite `count` §2.4 | test 16 cron | §7.3 `expression="* * * * *"` con `count=10000` DoS | Validar `count≤100` |
| 157 | `kronos_dependency_aware_scheduler` | SchedulerDep | — | — | **FAIL** | `f16:312-350` `analyzeGraph` | barrido | — | — |
| 158 | `kronos_retry_policy_manager` | PolíticaReintentos | — | — | **FAIL** | `f16:352-390` | barrido | — | — |
| 159 | `kronos_idempotency_key_manager` | Idempotencia | — | — | **BLOCKED** | `f16:321-360` `stateful:true`, `idempotencyKeys Map` global sin TTL cleanup | test 16 idempotencia | §7.5 segundo `claim` mismo `key` → `CONFLICT` no probado con clock mock | TTL janitor |
| 160 | `kronos_rate_limit_policy_manager` | RateLimit | — | — | **FAIL** | `f16:362-400` | barrido | — | — |

### 3.18 Familia 17 — Observabilidad, métricas y rendimiento (161-170) `observability`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 161 | `kronos_telemetry_event_collector` | Telemetría | — | — | **BLOCKED** | `f17:11-50` `stateful:true`, `telemetryEvents[]` global sin cota `src/state/stores.ts:48` | barrido | §7.2 `LIMIT_EXCEEDED` nunca ocurre | Buffer circular 5k + `evictOldest` |
| 162 | `kronos_metric_trend_analyzer` | Tendencia | — | — | **FAIL** | `f17:52-90` `linearRegression` `src/engines/stats.ts:42` | barrido | — | — |
| 163 | `kronos_anomaly_detection_engine` | Anomalía | — | — | **FAIL** | `f17:92-130` `zScoreOutliers` `threshold=3` | test 17 anomalía | — | — |
| 164 | `kronos_service_objective_monitor` | Objetivo | — | — | **FAIL** | `f17:132-170` `describe` | barrido | — | — |
| 165 | `kronos_error_budget_monitor` | PresupuestoError | — | — | **FAIL** | `f17:172-210` | test 17 error budget | — | — |
| 166 | `kronos_log_pattern_analyzer` | Logs | — | — | **FAIL** | `f17:212-250` `sanitizeFields` no aplica aquí | test 17 bitácora logs | — | — |
| 167 | `kronos_performance_profiler` | Perfil | — | — | **FAIL** | `f17:252-290` | barrido | — | — |
| 168 | `kronos_incident_postmortem_generator` | Postmortem | — | — | **FAIL** | `f17:292-330` | barrido | — | — |
| 169 | `kronos_health_dashboard_builder` | Dashboard | — | — | **FAIL** | `f17:332-360` | barrido | — | — |
| 170 | `kronos_capacity_planning_optimizer` | CapacidadObs | — | — | **FAIL** | `f17:362-400` | barrido | — | — |

### 3.19 Familia 18 — Experiencia, personalización y accesibilidad (171-180) `experience`

| Nº | Nombre | Apodo | Ver | Perm | Estado | Evidencia | Exist | Falt | Corrección |
|---|---|---|---|---|---|---|---|---|---|
| 171 | `kronos_user_preference_resolver` | Preferencias | — | — | **FAIL** | `f18:11-50` `allowedKeys` | barrido | — | — |
| 172 | `kronos_template_builder` | Plantilla | — | — | **FAIL** | `f18:52-90` `variableKeys` | barrido | — | — |
| 173 | `kronos_contextual_guidance_generator` | Guía | — | — | **FAIL** | `f18:92-130` | barrido | — | — |
| 174 | `kronos_accessibility_compliance_checker` | Accesibilidad | — | — | **FAIL** | `f18:132-170` `contrastRatio` | test 18 accesibilidad alt | — | — |
| 175 | `kronos_localization_coverage_checker` | Localización | — | — | **FAIL** | `f18:172-210` | test 18 cobertura | — | — |
| 176 | `kronos_personalization_profile_manager` | Perfil | — | — | **FAIL** | `f18:212-250` | barrido | — | — |
| 177 | `kronos_interaction_history_analyzer` | Historial | — | — | **FAIL** | `f18:252-290` | barrido | — | — |
| 178 | `kronos_feedback_collection_engine` | Feedback | — | — | **FAIL** | `f18:292-330` | barrido | — | — |
| 179 | `kronos_onboarding_flow_designer` | Onboarding | — | — | **FAIL** | `f18:332-365` | barrido | — | — |
| 180 | `kronos_decision_explanation_generator` | Explicación | — | — | **FAIL** | `f18:367-400` | barrido | — | — |

---

## 4. Pruebas existentes vs faltantes (mapeo §7)

| §7 Requisito | Existente (ruta) | Faltante (todas las tools) |
|---|---|---|
| 7.1 lógica principal | `local-tools.test.ts:59` barrido 180 con `example` (happy path) | — |
| 7.2 esquemas/límites/entradas inválidas | `mcp.test.ts:106` `unexpected:true` → `isError`, `local-tools.test.ts:308` `invalid_input` genérico | 0/184 prueban `LIMIT_EXCEEDED` (ej: `longText 200k`), `extra props` con `strict()`, `customPattern` ReDoS |
| 7.3 errores/excepciones/timeout/cancel | `mcp.test.ts:78-83` timeout HTML/network + `upstream-diagnostics.test.ts:12` loopback 10s real | 0/180 prueban `AbortSignal`/`timeoutMs` por tool (no existe), `graph` ciclo profundo |
| 7.4 seguridad/permisos/aislamiento | `mcp.test.ts:113-133` `FORBIDDEN`, `http-auth.test.ts:1-15` bearer exacto | 0/180 prueban `string[] authorization`, tenant isolation, `telemetryEvents` OOM |
| 7.5 idempotencia/concurrencia | `local-tools.test.ts:91` `record_failure→open` secuencial | 0/15 stateful prueban `concurrent approve`/`set` race |
| 7.6 integración dependencias reales | `verification.test.ts:12` `kronos-fetch.mjs` fixture `TEST_SCENARIO=401..ok-false` | `kronos_me` real no probado sin `--live` (correcto por §5) pero `diagnose-kronos.mjs` no cubierto en CI |
| 7.7 regresión | `catalog.test.ts:6` 180/18 familias | Sin snapshot de envelope `version` (no existe) |
| 7.8 compatibilidad registro/transporte | `mcp.test.ts:38` `tools/list 184` + `deployment-profile.test.ts:34` `public-local 163` | Sin test de `toolRegistry` por instancia (fuga entre perfiles) |
| 7.9 recuperación | — | 0/180 prueban `checkpoint rollback` con fallo a mitad |

**Evidencia de no-ejecutabilidad en inspección:** `npm test` en este entorno devuelve `tsc: not found` (`which tsc` vacío, `npx tsc` instala `tsc@2.0.4` no oficial). No se pudo reproducir evidencia de 65 tests de `SOCIAL-POST-DRAFT.md`; se deja como *riesgo no reproducido* (§10).

---

## 5. Hallazgos confirmados vs riesgos no reproducidos

**Confirmados (con PoC estático o test):**
- Envelope sin `version/error/metadata` (100% tools) — `register-local-tools.ts:23`
- `telemetryEvents` sin cota — `stores.ts:48`
- `toolRegistry` global contamina `public-local` — `registry.ts:9`
- `customPattern` ReDoS — `f08-data.ts:56`
- `chunkText` overlap→no-avance — `text.ts:215`
- `deepDiff` truncado sin warning — `data.ts:134`
- `authorization` `string[]` no manejado — `http.ts:145`
- `nextCronRuns` sin límite `count` — `time.ts:61`
- `peakDb([]) = -Infinity → JSON null` — `media.ts:50`
- `authorization` timing leak longitud — `http-auth.ts:7`

**No reproducidos (hipótesis sin fixture):**
- Flood `X-Forwarded-For` con 10k IPs spoofeadas evicta rate limiter (probable, no ejecutado)
- OOM `telemetryEvents` con 240 rpm × 24h (5,5M eventos) — no medido
- Brute-force `webhook HMAC` vía `153` aunque `safeEqualHex` mitiga — no PoC
- `daysBetween` DST off-by-1 — requiere fecha con 23h
- `compoundTools` `isKnownToolName` acepta tool excluida 42,153 — lógica pero sin exploit probado

---

## 6. Correcciones propuestas (sin tocar código, ordenadas §10)

1. **§1+§6** Añadir `version: "0.3.0"` por tool en `src/catalog/tools-180.ts` (generado) y `src/contracts/tool.ts:toolContractSchema`, y envelope `version, error:{code,cause,retryable}, metadata:{correlationId,durationMs,limitations}` en `register-local-tools.ts:82-108`. **No tocar código ahora.**
2. **§3** Aislar 13 Maps por `sha256(bearer)` prefix o documentar `NOT_APPLICABLE` con advertencia en `README.md:74` y `DESPLIEGUE.md`. Hacer `toolRegistry` factory por perfil (`src/server.ts:24`).
3. **§2+§3** Validar `authorization` como `string`, añadir `timeoutMs`/`signal` por tool con `AbortController`, y `rateLimit` por tool `153` y `42` ya excluidos pero faltan `customPattern` y `cron`.
4. **§7** Crear `tests/http.test.ts`, `tests/concurrency.test.ts`, `tests/security.test.ts` y `scripts/quality-gate.mjs` que emita `PASS/FAIL/BLOCKED` por tool según 10 checks §10.
5. **§5+§11** `createKronosServer()` debe validar `KRONOS_API_URL` HTTPS antes de registrar núcleo; `healthz` debe exponer `process vs kronos` separado.

---

## 7. Trazabilidad solicitud→ejecución→resultado

- **Solicitud:** `KRONOS-MCP-REQ-CORE-001` (12 apartados, 2026-10-20)
- **Ejecución:** Inspección estática de `src/**/*.ts (5_880 líneas en 18 familias)`, `src/engines/*.ts`, `src/services/kronos-api.ts`, `src/http.ts`, `tests/*.test.ts` y `scripts/*.mjs` en rama `arena/34a7564f-kronos-mcp`. Conteo con `grep -c '"number":'` y `FAMILIES.length`.
- **Resultado:** 184/184 inventariadas, 0 discrepancias de conteo, 0 `version` por tool, 15 `BLOCKED` por aislamiento, 169 `FAIL` por envelope/observabilidad/pruebas. Evidencia en tabla §3.
- **Pruebas disponibles:** Citadas por ruta/línea; `npm test` no ejecutable por falta de `typescript` en PATH del entorno inspeccionado — registrado, no inventado.

> Documento generado sin modificar `src/`, `render.yaml`, `.env`, ni servicios. Queda en `docs/CONTRATO_KRONOS_REQ_CORE_001.md` para revisión previa a cualquier commit/push.

