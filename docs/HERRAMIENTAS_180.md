# KRONOS MCP — 180 herramientas locales

> Generado por `npm run generate:catalog` desde `docs/KRONOS_MCP_180_Herramientas.txt`. No editar a mano.

Las 180 herramientas se ejecutan **localmente y sin proveedores externos**: trabajan de forma determinista sobre los datos que reciben en cada llamada y devuelven un sobre estructurado con `summary`, `data`, `warnings` y `limitations`. Las herramientas cuyo paso final requeriría un proveedor (generar la imagen, renderizar el vídeo, buscar en la web viva…) realizan el enrutamiento, la planificación o la verificación y lo declaran en `limitations`; nunca fingen haber generado el activo.

Las 4 herramientas del núcleo KRONOS (`kronos_status`, `kronos_health`, `kronos_me`, `kronos_contracts`) se documentan en el README. En total el servidor expone **184 herramientas**.

## 01. Coordinación y enrutamiento inteligente (`coordination`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 1 | `kronos_compound_tool_constructor` | Nexo | Compound Tool Constructor | Combina herramientas simples en una herramienta compuesta reutilizable. |
| 2 | `kronos_intelligent_tool_router` | Brújula | Intelligent Tool Router | Selecciona la herramienta adecuada según objetivo, restricciones y contexto. |
| 3 | `kronos_multi_agent_coordinator` | Director | Multi-Agent Coordinator | Distribuye subtareas entre agentes y consolida sus resultados. |
| 4 | `kronos_task_handoff_manager` | Relevo | Task Handoff Manager | Transfiere tareas entre herramientas conservando estado y contexto. |
| 5 | `kronos_dynamic_priority_scheduler` | Prior | Dynamic Priority Scheduler | Ordena tareas por urgencia, impacto, coste y dependencias. |
| 6 | `kronos_dependency_graph_planner` | Malla | Dependency Graph Planner | Construye y valida el grafo de dependencias de una ejecución. |
| 7 | `kronos_parallel_execution_planner` | Confluencia | Parallel Execution Planner | Detecta subtareas independientes y propone ejecución paralela. |
| 8 | `kronos_workflow_state_tracker` | Compás | Workflow State Tracker | Registra estados, transiciones y bloqueos de los flujos. |
| 9 | `kronos_capability_based_tool_selector` | Umbral | Capability-Based Tool Selector | Filtra herramientas según capacidades, permisos y requisitos. |
| 10 | `kronos_workflow_completion_verifier` | Cierre | Workflow Completion Verifier | Comprueba criterios de finalización antes de cerrar una tarea. |

## 02. Diagnóstico, reparación y recuperación (`diagnostics`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 11 | `kronos_system_health_diagnoser` | Pulso | System Health Diagnoser | Evalúa señales de salud y localiza fallos probables. |
| 12 | `kronos_verified_repair_planner` | Remedio | Verified Repair Planner | Propone reparaciones con pasos verificables y reversibles. |
| 13 | `kronos_adaptive_retry_controller` | Reintento | Adaptive Retry Controller | Ajusta reintentos según tipo de error y política de recuperación. |
| 14 | `kronos_adaptive_task_recovery` | Rescate | Adaptive Task Recovery | Recupera tareas interrumpidas desde el último estado consistente. |
| 15 | `kronos_root_cause_analyzer` | Rastreo | Root Cause Analyzer | Relaciona eventos, dependencias y errores para estimar causa raíz. |
| 16 | `kronos_regression_detector` | Centinela | Regression Detector | Detecta si una reparación introduce regresiones. |
| 17 | `kronos_circuit_breaker_manager` | Válvula | Circuit Breaker Manager | Interrumpe llamadas repetidamente fallidas para evitar cascadas. |
| 18 | `kronos_checkpoint_rollback_engine` | Rebobina | Checkpoint Rollback Engine | Restaura un estado previo seguro mediante puntos de control. |
| 19 | `kronos_fault_isolation_engine` | Aislante | Fault Isolation Engine | Aísla el componente defectuoso sin detener todo el flujo. |
| 20 | `kronos_repair_validation_runner` | Prueba | Repair Validation Runner | Ejecuta comprobaciones posteriores a una reparación. |

## 03. Planificación y objetivos complejos (`planning`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 21 | `kronos_complex_objective_orchestrator` | Odisea | Complex Objective Orchestrator | Descompone objetivos amplios en hitos y subtareas medibles. |
| 22 | `kronos_milestone_planner` | Hito | Milestone Planner | Define entregables, criterios de aceptación y dependencias. |
| 23 | `kronos_plan_adaptation_engine` | Deriva | Plan Adaptation Engine | Recalcula el plan cuando cambian recursos o condiciones. |
| 24 | `kronos_goal_clarifier` | Lente | Goal Clarifier | Detecta ambigüedades y genera preguntas de aclaración concretas. |
| 25 | `kronos_scope_boundary_manager` | Alcance | Scope Boundary Manager | Controla inclusiones, exclusiones y cambios de alcance. |
| 26 | `kronos_progress_estimator` | Tracción | Progress Estimator | Estima progreso a partir de tareas completadas y evidencia. |
| 27 | `kronos_alternative_path_finder` | Ruta | Alternative Path Finder | Encuentra rutas alternativas cuando una dependencia no está disponible. |
| 28 | `kronos_resource_allocation_planner` | Balance | Resource Allocation Planner | Distribuye tiempo, presupuesto y capacidad entre tareas. |
| 29 | `kronos_long_horizon_planner` | Horizonte | Long-Horizon Planner | Mantiene planes de varios pasos con revisiones periódicas. |
| 30 | `kronos_acceptance_criteria_validator` | Entrega | Acceptance Criteria Validator | Verifica que el resultado cumpla los criterios acordados. |

## 04. Simulación, consecuencias y decisiones (`simulation`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 31 | `kronos_consequence_simulator` | Eco | Consequence Simulator | Simula efectos previsibles antes de ejecutar una acción. |
| 32 | `kronos_what_if_scenario_engine` | Bifurca | What-If Scenario Engine | Compara escenarios alternativos con supuestos explícitos. |
| 33 | `kronos_risk_scoring_engine` | Riesgo | Risk Scoring Engine | Calcula un nivel de riesgo según impacto y probabilidad. |
| 34 | `kronos_trade_off_analyzer` | Contrapeso | Trade-Off Analyzer | Compara calidad, coste, latencia, seguridad y mantenimiento. |
| 35 | `kronos_decision_support_engine` | Faro | Decision Support Engine | Presenta opciones ordenadas con evidencia y limitaciones. |
| 36 | `kronos_impact_boundary_checker` | Umbral de daño | Impact Boundary Checker | Detecta acciones con impacto alto o difícil de revertir. |
| 37 | `kronos_sensitivity_analysis_tool` | Sensibilidad | Sensitivity Analysis Tool | Mide qué variables alteran más el resultado estimado. |
| 38 | `kronos_cost_forecast_simulator` | Costo Cero | Cost Forecast Simulator | Proyecta consumo y coste antes de ejecutar una cadena. |
| 39 | `kronos_latency_forecast_engine` | Latencia | Latency Forecast Engine | Estima duración según dependencias y rendimiento histórico. |
| 40 | `kronos_reversibility_analyzer` | Reversa | Reversibility Analyzer | Determina si una acción puede deshacerse y cómo. |

## 05. Pruebas y evaluación de capacidades (`testing`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 41 | `kronos_capability_test_generator` | Examinador | Capability Test Generator | Genera pruebas para validar capacidades declaradas por herramientas. |
| 42 | `kronos_tool_benchmark_runner` | Banco | Tool Benchmark Runner | Ejecuta benchmarks repetibles sobre herramientas compatibles. |
| 43 | `kronos_output_accuracy_evaluator` | Exacto | Output Accuracy Evaluator | Mide exactitud frente a una referencia o criterios definidos. |
| 44 | `kronos_load_and_stress_test_generator` | Estrés | Load and Stress Test Generator | Diseña pruebas de carga y estrés controladas. |
| 45 | `kronos_workflow_test_coverage_analyzer` | Cobertura | Workflow Test Coverage Analyzer | Detecta caminos de ejecución que carecen de pruebas. |
| 46 | `kronos_expected_result_comparator` | Oráculo | Expected Result Comparator | Compara resultados reales con resultados esperados. |
| 47 | `kronos_repeatability_evaluator` | Consistencia | Repeatability Evaluator | Mide variación entre ejecuciones equivalentes. |
| 48 | `kronos_tool_contract_tester` | Contrato | Tool Contract Tester | Verifica entradas, salidas, errores y límites del contrato. |
| 49 | `kronos_mutation_test_generator` | Mutante | Mutation Test Generator | Introduce cambios controlados para medir la eficacia de las pruebas. |
| 50 | `kronos_evaluation_threshold_calibrator` | Calibrador | Evaluation Threshold Calibrator | Ajusta umbrales de aprobación según objetivos de calidad. |

## 06. Control de cambios y seguridad operativa (`security`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 51 | `kronos_change_control_manager` | Guardia | Change Control Manager | Requiere autorización y evidencia para cambios sensibles. |
| 52 | `kronos_secret_exposure_scanner` | Bóveda | Secret Exposure Scanner | Detecta posibles secretos en texto, registros y artefactos. |
| 53 | `kronos_least_privilege_policy_enforcer` | Permiso | Least-Privilege Policy Enforcer | Limita cada herramienta a los permisos estrictamente necesarios. |
| 54 | `kronos_approval_gate_controller` | Doble Llave | Approval Gate Controller | Solicita confirmación adicional para operaciones críticas. |
| 55 | `kronos_tamper_evident_audit_logger` | Bitácora | Tamper-Evident Audit Logger | Registra decisiones y acciones en una bitácora verificable. |
| 56 | `kronos_tool_invocation_policy_filter` | Cortafuego | Tool Invocation Policy Filter | Bloquea invocaciones que incumplen políticas definidas. |
| 57 | `kronos_untrusted_input_sandbox` | Cuarentena | Untrusted Input Sandbox | Aísla entradas o archivos no confiables antes de procesarlos. |
| 58 | `kronos_prompt_injection_detector` | Vigía | Prompt Injection Detector | Busca instrucciones hostiles dentro de contenido externo. |
| 59 | `kronos_artifact_integrity_verifier` | Huella | Artifact Integrity Verifier | Comprueba hashes e integridad de archivos o resultados. |
| 60 | `kronos_safe_recovery_manager` | Retorno Seguro | Safe Recovery Manager | Coordina restauración y validación después de un cambio fallido. |

## 07. Contexto, memoria y conocimiento (`context`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 61 | `kronos_scoped_context_store` | Memoria | Scoped Context Store | Conserva contexto por proyecto, sesión o tarea con límites definidos. |
| 62 | `kronos_knowledge_index_builder` | Índice | Knowledge Index Builder | Indexa documentos y metadatos para recuperación posterior. |
| 63 | `kronos_relevant_memory_retriever` | Recuerdo | Relevant Memory Retriever | Recupera recuerdos pertinentes sin mezclar proyectos. |
| 64 | `kronos_memory_retention_controller` | Caducidad | Memory Retention Controller | Aplica expiración y políticas de retención al contexto. |
| 65 | `kronos_source_provenance_tracker` | Procedencia | Source Provenance Tracker | Asocia afirmaciones con sus fuentes y fecha de obtención. |
| 66 | `kronos_evidence_reconciliation_engine` | Consenso | Evidence Reconciliation Engine | Resuelve contradicciones entre fuentes sin ocultar incertidumbre. |
| 67 | `kronos_incremental_context_summarizer` | Resumen Vivo | Incremental Context Summarizer | Actualiza resúmenes conservando decisiones y restricciones vigentes. |
| 68 | `kronos_context_deduplication_tool` | Limpieza | Context Deduplication Tool | Elimina duplicados y reduce ruido del contexto. |
| 69 | `kronos_entity_relationship_mapper` | Vínculo | Entity Relationship Mapper | Relaciona entidades, documentos, tareas y evidencias. |
| 70 | `kronos_knowledge_freshness_checker` | Frescura | Knowledge Freshness Checker | Identifica información que requiere actualización. |

## 08. Datos, archivos y transformación (`data`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 71 | `kronos_structured_data_extractor` | Extractor | Structured Data Extractor | Extrae campos estructurados desde documentos y respuestas. |
| 72 | `kronos_data_normalization_engine` | Normaliza | Data Normalization Engine | Unifica formatos, unidades, fechas y convenciones. |
| 73 | `kronos_format_conversion_router` | Convertidor | Format Conversion Router | Convierte entre formatos compatibles y valida el resultado. |
| 74 | `kronos_document_content_reader` | Lector | Document Content Reader | Lee texto, tablas y metadatos de archivos admitidos. |
| 75 | `kronos_file_and_data_diff_analyzer` | Diferencia | File and Data Diff Analyzer | Compara versiones y resume diferencias relevantes. |
| 76 | `kronos_schema_inference_tool` | Esquema | Schema Inference Tool | Infiere esquemas a partir de muestras de datos. |
| 77 | `kronos_data_quality_validator` | Validador | Data Quality Validator | Detecta campos ausentes, tipos inválidos y reglas incumplidas. |
| 78 | `kronos_batch_processing_coordinator` | Lote | Batch Processing Coordinator | Procesa lotes con límites, seguimiento y recuperación. |
| 79 | `kronos_document_chunking_optimizer` | Fragmenta | Document Chunking Optimizer | Divide documentos para búsqueda y recuperación contextual. |
| 80 | `kronos_data_merge_and_reconciliation` | Ensamble | Data Merge and Reconciliation | Combina conjuntos de datos y señala conflictos. |

## 09. Desarrollo de software y repositorios (`development`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 81 | `kronos_code_scaffold_generator` | Constructor | Code Scaffold Generator | Genera estructuras iniciales de proyecto según requisitos. |
| 82 | `kronos_static_code_analysis_runner` | Inspector | Static Code Analysis Runner | Ejecuta o coordina análisis estático del código. |
| 83 | `kronos_safe_refactoring_planner` | Refactor | Safe Refactoring Planner | Propone refactorizaciones con alcance y validaciones definidos. |
| 84 | `kronos_patch_generation_engine` | Parche | Patch Generation Engine | Prepara cambios pequeños asociados a un problema concreto. |
| 85 | `kronos_dependency_risk_auditor` | Dependencia | Dependency Risk Auditor | Revisa versiones, licencias y riesgos de dependencias. |
| 86 | `kronos_api_contract_mapper` | API Mapa | API Contract Mapper | Documenta endpoints, esquemas y contratos entre servicios. |
| 87 | `kronos_schema_migration_planner` | Migrador | Schema Migration Planner | Planifica migraciones de esquema con comprobaciones de reversión. |
| 88 | `kronos_build_and_typecheck_runner` | BuildCheck | Build and Typecheck Runner | Coordina compilación, lint y comprobaciones de tipos. |
| 89 | `kronos_pull_request_review_assistant` | Revisor | Pull Request Review Assistant | Identifica defectos, riesgos y cambios faltantes en propuestas. |
| 90 | `kronos_release_readiness_validator` | Release | Release Readiness Validator | Comprueba requisitos previos antes de publicar una versión. |

## 10. Web, búsqueda y verificación (`web`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 91 | `kronos_multi_source_web_search` | Radar | Multi-Source Web Search | Busca información en múltiples fuentes disponibles. |
| 92 | `kronos_search_result_relevance_ranker` | Filtro | Search Result Relevance Ranker | Ordena resultados según intención y criterios de relevancia. |
| 93 | `kronos_claim_verification_engine` | Verifica | Claim Verification Engine | Contrasta afirmaciones con fuentes independientes. |
| 94 | `kronos_citation_and_link_validator` | Cita | Citation and Link Validator | Comprueba correspondencia entre afirmaciones, citas y enlaces. |
| 95 | `kronos_web_freshness_monitor` | Vigencia | Web Freshness Monitor | Detecta páginas o datos que podrían estar desactualizados. |
| 96 | `kronos_domain_reputation_checker` | Dominio | Domain Reputation Checker | Evalúa señales de confianza y procedencia de dominios. |
| 97 | `kronos_source_comparison_analyzer` | Comparador | Source Comparison Analyzer | Compara cobertura, fechas y contradicciones entre fuentes. |
| 98 | `kronos_web_page_structure_extractor` | Página | Web Page Structure Extractor | Extrae títulos, secciones y datos estructurados de páginas. |
| 99 | `kronos_change_monitoring_watcher` | Alerta Web | Change Monitoring Watcher | Detecta cambios en páginas o recursos supervisados. |
| 100 | `kronos_evidence_based_research_synthesizer` | Síntesis | Evidence-Based Research Synthesizer | Resume hallazgos separando hechos, inferencias y vacíos. |

## 11. Multimedia: imagen y diseño visual (`image`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 101 | `kronos_text_to_image_provider_router` | Pixel | Text-to-Image Provider Router | Selecciona proveedores de generación de imágenes por calidad y coste. |
| 102 | `kronos_image_editing_orchestrator` | Retoca | Image Editing Orchestrator | Coordina edición de imagen con instrucciones y controles. |
| 103 | `kronos_visual_style_consistency_checker` | Estilo | Visual Style Consistency Checker | Comprueba coherencia de estilo entre piezas visuales. |
| 104 | `kronos_image_composition_analyzer` | Lienzo | Image Composition Analyzer | Evalúa composición, encuadre, jerarquía y legibilidad. |
| 105 | `kronos_image_upscaling_router` | Escala | Image Upscaling Router | Selecciona procesos de ampliación y mejora compatibles. |
| 106 | `kronos_segmentation_and_mask_generator` | Máscara | Segmentation and Mask Generator | Genera o gestiona máscaras para edición localizada. |
| 107 | `kronos_background_removal_tool` | Fondo | Background Removal Tool | Elimina fondos y valida bordes del sujeto. |
| 108 | `kronos_visual_variant_generator` | Variantes | Visual Variant Generator | Crea variantes controladas de una pieza visual. |
| 109 | `kronos_brand_asset_compliance_checker` | Marca | Brand Asset Compliance Checker | Comprueba colores, logotipos y reglas de marca proporcionadas. |
| 110 | `kronos_image_asset_cataloger` | Galería | Image Asset Cataloger | Etiqueta, clasifica y recupera activos visuales. |

## 12. Multimedia: vídeo y movimiento (`video`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 111 | `kronos_text_to_video_provider_router` | Cine | Text-to-Video Provider Router | Selecciona proveedores de vídeo por duración, calidad, coste y límites. |
| 112 | `kronos_ai_video_editing_orchestrator` | Montaje | AI Video Editing Orchestrator | Coordina cortes, escenas, transiciones y exportación. |
| 113 | `kronos_shot_and_scene_planner` | Toma | Shot and Scene Planner | Convierte un guion en tomas y escenas planificadas. |
| 114 | `kronos_video_continuity_checker` | Continuidad | Video Continuity Checker | Detecta saltos visuales o inconsistencias entre escenas. |
| 115 | `kronos_motion_generation_router` | Movimiento | Motion Generation Router | Enruta generación de movimiento según la capacidad requerida. |
| 116 | `kronos_subtitle_alignment_engine` | Subtítulo | Subtitle Alignment Engine | Sincroniza subtítulos con audio y marcas de tiempo. |
| 117 | `kronos_smart_reframing_tool` | Recorte | Smart Reframing Tool | Reencuadra vídeo para distintas proporciones y plataformas. |
| 118 | `kronos_highlight_clip_extractor` | Clips | Highlight Clip Extractor | Extrae segmentos destacados a partir de criterios configurables. |
| 119 | `kronos_render_queue_coordinator` | Render | Render Queue Coordinator | Gestiona colas, estados, reintentos y límites de renderizado. |
| 120 | `kronos_video_quality_inspector` | Control de Toma | Video Quality Inspector | Evalúa resolución, duración, artefactos y requisitos de salida. |

## 13. Multimedia: audio, voz y música (`audio`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 121 | `kronos_text_to_speech_provider_router` | Voz | Text-to-Speech Provider Router | Selecciona motores de voz según idioma, calidad, latencia y precio. |
| 122 | `kronos_speech_to_text_router` | Oído | Speech-to-Text Router | Enruta transcripción según idioma, precisión y coste. |
| 123 | `kronos_voice_direction_planner` | Locutor | Voice Direction Planner | Define tono, ritmo y estilo de locución a partir de instrucciones. |
| 124 | `kronos_music_generation_router` | Ritmo | Music Generation Router | Selecciona proveedores de generación musical según restricciones. |
| 125 | `kronos_audio_mixing_assistant` | Mezcla | Audio Mixing Assistant | Coordina niveles, balance y mezcla de pistas. |
| 126 | `kronos_silence_and_noise_cleaner` | Silencio | Silence and Noise Cleaner | Detecta silencios y ruido para limpieza de audio. |
| 127 | `kronos_speaker_diarization_tool` | Diarista | Speaker Diarization Tool | Identifica segmentos por hablante cuando el proveedor lo permite. |
| 128 | `kronos_audio_video_synchronizer` | Sincronía | Audio-Video Synchronizer | Alinea pistas de audio con vídeo y marcas de tiempo. |
| 129 | `kronos_pronunciation_quality_checker` | Pronuncia | Pronunciation Quality Checker | Detecta pronunciaciones dudosas y propone correcciones. |
| 130 | `kronos_audio_mastering_quality_checker` | Master | Audio Mastering Quality Checker | Evalúa niveles, clipping y parámetros de exportación. |

## 14. Guion, contenido y publicación (`content`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 131 | `kronos_script_outline_generator` | Pluma | Script Outline Generator | Transforma objetivos en estructuras de guion. |
| 132 | `kronos_opening_hook_optimizer` | Gancho | Opening Hook Optimizer | Propone aperturas según audiencia y formato. |
| 133 | `kronos_narrative_consistency_checker` | Narrador | Narrative Consistency Checker | Verifica continuidad, tono y coherencia narrativa. |
| 134 | `kronos_platform_format_adapter` | Formato | Platform Format Adapter | Adapta contenido a límites y formatos de cada plataforma. |
| 135 | `kronos_content_calendar_planner` | Calendario | Content Calendar Planner | Organiza piezas, fechas, canales y dependencias. |
| 136 | `kronos_publishing_workflow_coordinator` | Publica | Publishing Workflow Coordinator | Coordina preparación, aprobación y publicación mediante integraciones disponibles. |
| 137 | `kronos_content_repurposing_engine` | Reutiliza | Content Repurposing Engine | Transforma una pieza en versiones para otros formatos. |
| 138 | `kronos_content_policy_prechecker` | Moderador | Content Policy Prechecker | Busca posibles incumplimientos antes de publicar. |
| 139 | `kronos_media_attribution_manager` | Atribuye | Media Attribution Manager | Registra fuentes, licencias y atribuciones de activos. |
| 140 | `kronos_content_performance_analyzer` | Rendimiento | Content Performance Analyzer | Analiza métricas disponibles y propone hipótesis de mejora. |

## 15. Proveedores, costes y capacidad (`providers`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 141 | `kronos_provider_price_catalog` | Tarifario | Provider Price Catalog | Mantiene precios y unidades de cobro obtenidos de fuentes configuradas. |
| 142 | `kronos_quality_cost_provider_optimizer` | Selector | Quality-Cost Provider Optimizer | Elige proveedor según límites de calidad, coste y velocidad. |
| 143 | `kronos_provider_availability_monitor` | Disponibilidad | Provider Availability Monitor | Comprueba estados y errores de proveedores integrados. |
| 144 | `kronos_quota_and_rate_limit_manager` | Cuota | Quota and Rate Limit Manager | Controla cuotas, límites de frecuencia y ventanas de reinicio. |
| 145 | `kronos_provider_fallback_router` | Fallback | Provider Fallback Router | Cambia a una alternativa compatible cuando falla el proveedor principal. |
| 146 | `kronos_usage_metering_engine` | Medidor | Usage Metering Engine | Registra unidades consumidas por tarea y proveedor. |
| 147 | `kronos_budget_guardrail_enforcer` | Presupuesto | Budget Guardrail Enforcer | Detiene o solicita aprobación al alcanzar límites configurados. |
| 148 | `kronos_provider_quality_scorecard` | Calidad | Provider Quality Scorecard | Compara proveedores mediante resultados y métricas observadas. |
| 149 | `kronos_provider_api_compatibility_tester` | Contrato API | Provider API Compatibility Tester | Verifica autenticación, parámetros y formatos de respuesta. |
| 150 | `kronos_capability_registry_manager` | Catálogo | Capability Registry Manager | Registra capacidades, límites, versiones y estado de cada proveedor. |

## 16. Automatización e integraciones (`automation`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 151 | `kronos_event_trigger_manager` | Disparador | Event Trigger Manager | Inicia flujos ante eventos admitidos y condiciones configuradas. |
| 152 | `kronos_integration_adapter_builder` | Conector | Integration Adapter Builder | Estructura adaptadores para APIs con contratos conocidos. |
| 153 | `kronos_webhook_validation_gateway` | Webhook | Webhook Validation Gateway | Valida firmas, esquemas y protección contra repetición. |
| 154 | `kronos_reliable_job_queue_manager` | Cola | Reliable Job Queue Manager | Gestiona trabajos pendientes, confirmaciones y reintentos. |
| 155 | `kronos_cross_service_message_router` | Puente | Cross-Service Message Router | Enruta mensajes entre servicios según reglas explícitas. |
| 156 | `kronos_credential_scope_manager` | Credencial | Credential Scope Manager | Asocia credenciales con servicios y permisos mínimos. |
| 157 | `kronos_data_sync_coordinator` | Sincroniza | Data Sync Coordinator | Coordina sincronización incremental y resolución de conflictos. |
| 158 | `kronos_scheduled_workflow_runner` | Programador | Scheduled Workflow Runner | Ejecuta flujos con programación y política de errores. |
| 159 | `kronos_idempotency_key_manager` | Idempotente | Idempotency Key Manager | Evita duplicar operaciones al reintentar solicitudes. |
| 160 | `kronos_event_replay_and_recovery_tool` | Webhook Replay | Event Replay and Recovery Tool | Reprocesa eventos seleccionados con controles de seguridad. |

## 17. Observabilidad, métricas y rendimiento (`observability`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 161 | `kronos_telemetry_collector` | Telemetría | Telemetry Collector | Centraliza métricas, eventos y trazas disponibles. |
| 162 | `kronos_structured_log_analyzer` | Cronista | Structured Log Analyzer | Agrupa registros y detecta patrones de error. |
| 163 | `kronos_distributed_trace_correlator` | Traza | Distributed Trace Correlator | Relaciona una operación entre servicios y herramientas. |
| 164 | `kronos_performance_bottleneck_finder` | Cuello | Performance Bottleneck Finder | Localiza etapas que dominan la latencia o el consumo. |
| 165 | `kronos_service_objective_monitor` | SLO | Service Objective Monitor | Supervisa objetivos de disponibilidad y rendimiento definidos. |
| 166 | `kronos_anomaly_detection_engine` | Anomalía | Anomaly Detection Engine | Detecta desviaciones frente a patrones históricos. |
| 167 | `kronos_operational_dashboard_builder` | Tablero | Operational Dashboard Builder | Genera vistas de estado a partir de métricas disponibles. |
| 168 | `kronos_incident_triage_assistant` | Incidente | Incident Triage Assistant | Prioriza incidentes y reúne evidencias relevantes. |
| 169 | `kronos_capacity_forecast_planner` | Capacidad | Capacity Forecast Planner | Estima necesidades futuras de recursos a partir de tendencias. |
| 170 | `kronos_operational_report_generator` | Informe | Operational Report Generator | Produce reportes de salud, errores, coste y rendimiento. |

## 18. Experiencia, personalización y accesibilidad (`experience`)

| # | Herramienta MCP | apodo | Nombre técnico | Función |
|---|---|---|---|---|
| 171 | `kronos_user_preference_resolver` | Perfil | User Preference Resolver | Aplica preferencias explícitas de formato, tono y flujo. |
| 172 | `kronos_reusable_workflow_template_builder` | Atajo | Reusable Workflow Template Builder | Convierte flujos aprobados en plantillas reutilizables. |
| 173 | `kronos_interactive_task_guidance_engine` | Copiloto | Interactive Task Guidance Engine | Guía al usuario por pasos y solicita datos faltantes. |
| 174 | `kronos_accessibility_compliance_checker` | Accesible | Accessibility Compliance Checker | Revisa criterios de accesibilidad aplicables al contenido. |
| 175 | `kronos_localization_and_translation_router` | Idioma | Localization and Translation Router | Enruta traducción y localización según idioma y contexto. |
| 176 | `kronos_complexity_reduction_assistant` | Simpleza | Complexity Reduction Assistant | Simplifica resultados sin perder restricciones esenciales. |
| 177 | `kronos_workflow_personalization_engine` | Personaliza | Workflow Personalization Engine | Adapta flujos a preferencias autorizadas y patrones observados. |
| 178 | `kronos_decision_explanation_generator` | Explica | Decision Explanation Generator | Explica por qué se eligió una herramienta o una ruta. |
| 179 | `kronos_user_feedback_triage_tool` | Feedback | User Feedback Triage Tool | Clasifica comentarios y los convierte en señales accionables. |
| 180 | `kronos_workflow_improvement_miner` | Aprendiz | Workflow Improvement Miner | Identifica mejoras repetibles a partir de ejecuciones evaluadas. |

## Notas

- Nombre MCP = `kronos_` + nombre técnico en snake_case. Los apodos se mantienen únicos, como exige el catálogo.
- Ninguna de las 180 contacta KRONOS ni la red, ni escribe en disco, ni ejecuta comandos. Las marcadas como con estado guardan datos solo en memoria del proceso (se pierden al reiniciar).
- Los ejemplos de entrada ejecutables de cada herramienta viven junto a su definición en `src/families/` y se verifican en `tests/local-tools.test.ts`.
