# KRONOS MCP — Diagnóstico técnico

**Fecha:** 4 de octubre de 2026
**Etapa:** 1. Diagnóstico, no implementación
**Repositorio:** `donovan-hue/KRONOS_MCP`
**Base revisada:** `43377658edb566496dcf15e9e1a236ac9f3d2314`
**Rama de trabajo:** `arena/01a10610-kronos-mcp`

## 1. Dictamen

**Existe una base MCP funcional por stdio. No está lista para declararse una integración de producción completa. No necesita reconstruirse.**

El servidor compila, permite conexión de un cliente MCP, responde a ping y descubre tres herramientas. La implementación conserva la arquitectura correcta: llama a KRONOS y no incorpora una segunda base de datos ni servicios sociales o creativos duplicados.

Los principales pendientes inmediatos son configuración coherente, protección de archivos locales, validación de contratos, errores seguros, límites de espera y pruebas automatizadas con aserciones.

La autenticación real con una credencial válida, los scopes, la administración de credenciales y los controles comerciales no quedaron verificados de punta a punta. No deben anunciarse como terminados.

## 2. Alcance y límites de la revisión

Se revisaron los archivos de código, configuración de ejemplo, manifiestos, reglas de Git y pruebas de este repositorio. También se consultó, sin modificarlo, el código del backend relacionado en GitHub:

- Repositorio: `donovan-hue/Kronos-space.com`.
- Revisión consultada: `ee49ebe61ebf34915e5bdc4c010d80b20d20abaf`.
- Archivos: `mcpAuth.js`, `McpServiceCredential.js`, `mcp.routes.js`, el manejador de health y `buildInfo.js`.

**Leer el código de GitHub no demuestra que esa revisión esté desplegada en producción.**

No se realizaron llamadas a la API de producción durante este diagnóstico. No se accedió a MongoDB ni se crearon, rotaron o revocaron credenciales. No se leyeron archivos con secretos ni se mostraron sus valores.

En la raíz de este checkout solamente se encontró `.env.example`. Esto no contradice que existan archivos privados en la computadora del propietario o fuera de esta raíz; no se buscaron secretos en otras ubicaciones.

## 3. Qué existe realmente

| Componente | Evidencia | Estado |
|---|---|---|
| Servidor MCP por stdio | `src/index.ts`; conexión local mediante cliente SDK | Funciona localmente |
| Descubrimiento | `tools/list` devuelve tres herramientas | Comprobado localmente |
| `kronos_status` | Usa `GET /api/health`; selecciona campos del resultado | Implementada; no validada contra producción en esta revisión |
| `kronos_health` | Usa `GET /api/health`; devuelve el resultado completo | Implementada; no validada contra producción en esta revisión |
| `kronos_me` | Usa `GET /api/mcp/me` con Bearer de servicio | Implementada; verificado error local sin token |
| Auth de servicio en backend | Busca SHA-256 del token con `active: true`; valida expiración | Existe en código remoto revisado |
| Identidad en backend | `/api/mcp/me` devuelve `ok`, `service`, `identity`, `permissions` | Contrato observado en código |
| Estado autenticado en backend | `/api/mcp/status` añade `authenticated: true` | Existe en backend; no tiene herramienta propia en este MCP |
| Persistencia de credenciales | Modelo con `tokenHash`, `permissions`, `active`, `expiresAt`, `lastUsedAt` y timestamps | Existe en backend |
| Scopes exigidos por herramienta | No aparecen en las herramientas ni en las dos rutas MCP revisadas | Pendiente |
| KAIROS, lectura social y escritura | No hay herramientas registradas para estas capacidades | No integradas en este repositorio |

**Distinción importante:** actualmente `kronos_status` consulta salud pública. No consulta `/api/mcp/status` ni prueba que una credencial sea válida.

## 4. Hallazgos que hay que corregir

Las prioridades siguientes ordenan el trabajo; no son una certificación formal de vulnerabilidades.

### D-01 — Configuración de credenciales inconsistente · Alta

**Evidencia:** `.env.example` declara `MCP_AUTH_TOKEN`, pero `src/config/mcp.ts` lee `KRONOS_MCP_TOKEN`.

**Consecuencia:** configurar el ejemplo tal como está no proporciona al código el token que necesita.

**Modificar:** corregir el ejemplo para documentar la variable que realmente utiliza el cliente. Mantener su valor vacío. No introducir fallback a tokens de usuario ni a nombres ambiguos.

### D-02 — Tener un archivo `.env` no garantiza que se cargue · Alta

**Evidencia:** `dotenv` está instalado, pero el código no lo inicializa. Los scripts actuales tampoco indican un archivo de entorno. Las variables se leen durante la importación de módulos.

**Consecuencia:** un secreto puede existir en un archivo local y, aun así, no llegar al proceso MCP. Un lanzador externo podría inyectarlo, pero eso no está documentado ni comprobado aquí.

**Modificar:** documentar y probar un mecanismo explícito de carga anterior a las lecturas de configuración; no sobrescribir variables ya inyectadas. Si se utiliza dotenv, impedir mensajes en stdout, reservado para MCP.

**Dato pendiente:** cómo se lanza MCP en el equipo del propietario y cuál es el archivo de configuración que debe cargarse, sin solicitar su contenido secreto.

### D-03 — Exclusión de archivos de entorno incompleta · Alta

**Evidencia:** `.gitignore` excluye `.env`, `.env.local` y `.env.production`, pero las comprobaciones con `git check-ignore` muestran que no cubre `.env.development`, `.env.test` ni `.env.production.local`.

**Consecuencia:** otros nombres habituales de archivos privados podrían añadirse por accidente.

**Modificar:** ampliar las reglas, conservando una excepción explícita para plantillas sin secretos. Añadir una comprobación automatizada de estas reglas.

**Límite:** no se detectó ni se afirma una filtración. Esta revisión tampoco constituye una auditoría de secretos de todo el historial de Git. Una regla de exclusión no protege archivos que ya estén versionados.

### D-04 — Respuestas sin validación en ejecución · Alta

**Evidencia:** `getKronosHealth()` utiliza un cast TypeScript; `getKronosMe()` devuelve el JSON sin validar. Ninguna herramienta declara `outputSchema` ni entrega `structuredContent`.

**Consecuencia:** un HTTP exitoso con una forma incorrecta puede presentarse como resultado válido. Una interfaz TypeScript no valida datos recibidos por red.

**Modificar:** schemas basados en contratos comprobados, selección explícita de campos y salidas estructuradas, conservando el contenido textual compatible con clientes existentes.

**Detalle comprobado:** el backend puede devolver `null` para datos de build como commit, branch o repo; la interfaz local actual solamente contempla strings opcionales. Hay que aceptar la nulabilidad real, no inventar valores.

### D-05 — Entradas vacías sin rechazo explícito de propiedades adicionales · Media

**Evidencia:** las herramientas declaran `inputSchema: {}`. En el descubrimiento observado no aparece `additionalProperties: false`.

**Consecuencia:** el contrato no comunica estrictamente que estas herramientas no aceptan parámetros. No debe confundirse esto con ausencia total de validación del protocolo por el SDK.

**Modificar:** schemas explícitos de objeto vacío y pruebas para entradas desconocidas o inválidas. Verificar también cómo el SDK devuelve esos errores.

### D-06 — Cliente HTTP sin límites explícitos de espera y tamaño · Alta

**Evidencia:** los dos servicios usan `fetch` sin timeout propio, cancelación de petición MCP ni límite de cuerpo. No fijan una política explícita de redirecciones.

**Consecuencia:** no existe un presupuesto de tiempo controlado por la aplicación; una respuesta lenta o grande puede consumir recursos innecesarios.

**Modificar:** cliente HTTP compartido con timeout configurable y acotado, cancelación, control de tamaño y política de redirecciones segura. Mantener el token exclusivamente en peticiones autenticadas al destino configurado. No incluir reintentos automáticos indiscriminados.

### D-07 — Errores no normalizados y mensajes externos reenviados · Alta

**Evidencia:** las herramientas devuelven `error.message`; el servicio autenticado concatena `data.error` del backend. Intenta interpretar JSON antes de comprobar el estado HTTP.

**Consecuencia:** una página HTML de error oculta el estado original detrás de un fallo de parseo. No hay códigos estables para que un agente distinga autenticación, permisos, rate limit o disponibilidad. Los mensajes externos no deben tratarse como seguros por defecto.

**Modificar:** errores estructurados con mensajes controlados y mapeo documentado de estados HTTP/códigos conocidos. No reenviar cuerpos, headers, stacks, tokens ni mensajes arbitrarios. Respetar `Retry-After` cuando sea válido.

**Distinción:** un error de herramienta MCP no es un HTTP 401 del transporte stdio. Puede representar un 401 del backend con `isError: true` y un código de dominio.

### D-08 — Validación de URL parcial · Media

**Evidencia:** `src/config/env.ts` únicamente comprueba el prefijo `https://` mediante expresión regular.

**Modificar:** parsear la URL completa; rechazar credenciales embebidas y configuraciones ambiguas de query/fragmento; definir el contrato de URL base. No debilitar HTTPS globalmente para poder ejecutar pruebas: utilizar inyección del cliente o un fixture aislado.

### D-09 — Pruebas actuales insuficientes y posible falso positivo · Alta

**Evidencia:** `npm test` es un placeholder que termina con código 1. `tests/mcp-test.ts` no contiene aserciones sobre `isError` ni valida el output: puede imprimir “MCP funcionando correctamente” después de recibir un error de herramienta.

**Modificar/generar:** suite automatizada determinista, separada de pruebas reales opt-in. Cubrir configuración, contratos, errores, ausencia de token, timeout, cancelación, límites y protocolo MCP. Eliminar el falso positivo del smoke test.

**Límite:** simular 401/403 sirve para comprobar el adaptador, no demuestra que MongoDB rechace una credencial revocada ni que el backend haga cumplir scopes.

### D-10 — Auth existe; autorización granular no está demostrada · Alta antes de ampliar capacidades

**Evidencia:** el middleware remoto autentica y coloca `permissions` en `req.mcp`. Las rutas `/me` y `/status` solamente aplican `mcpAuth`; no exigen permisos concretos. Todas las herramientas locales se registran sin filtrar por identidad.

**Pendiente del backend:** contratos de scopes, ownership y permisos por capacidad antes de incorporar operaciones de datos o creación. No establecer permisos ficticios únicamente en MCP y declararlos seguridad del backend.

**Sobre credenciales:** `active: false` queda fuera de la búsqueda del middleware, y `expiresAt` se comprueba en cada petición. Eso es soporte de rechazo en código, no prueba de un procedimiento completo de revocación/rotación. El esquema revisado no contiene owner, organizaciones, cuotas o historial de revocación. La identidad pública actual devuelve un nombre, no el id interno de credencial.

### D-11 — Observabilidad y controles económicos pendientes · Antes de uso comercial

**Evidencia:** este MCP no tiene auditoría estructurada, métricas propias, cuotas, contabilidad de consumo ni integración de créditos. La actualización de `lastUsedAt` en backend no sustituye un registro de operaciones.

**Modificar después de la base:** logs mínimos y seguros en stderr para operación local. Diseñar auditoría correlacionada con backend antes de operaciones sensibles. Mantener créditos, límites comerciales y billing en el core compartido.

**Límite:** no se auditó aquí el sistema completo de rate limiting o billing del backend; no se afirma que KRONOS carezca globalmente de ellos.

### D-12 — Documentación y metadatos inconsistentes · Media

**Evidencia:** no había README ni documentación operativa en este checkout. `package.json` declara versión `1.0.0` y `main: index.js`; el servidor anuncia `0.1.0` y el build se inicia desde `dist/index.js`. Las descripciones dicen “producción” aunque la URL sea configurable.

**Modificar:** documentar instalación, ejecución, contratos, variables, pruebas y límites; alinear metadatos sin cambiar arbitrariamente la versión pública. Describir el entorno realmente configurado.

## 5. Qué se comprobó ejecutando

| Verificación | Resultado | Qué NO demuestra |
|---|---|---|
| `npm run build` | Correcto | No comprueba API ni credenciales |
| `npm test` | Falla: script placeholder | No hay suite funcional conectada a ese comando |
| Cliente SDK → proceso `dist/index.js` por stdio | Handshake correcto | No prueba despliegue remoto |
| Ping MCP | Respuesta `{}` | No prueba salud de KRONOS o MongoDB |
| `tools/list` | Tres herramientas esperadas | No prueba scopes |
| `kronos_me` sin token, con entorno aislado | `isError: true`; indica variable ausente | No es una llamada HTTP 401 al backend |
| `npm audit --omit=dev` | Cero vulnerabilidades reportadas en esa ejecución | No es una auditoría integral de seguridad |
| `git diff --check` | Sin errores de whitespace | No prueba lógica |
| `git check-ignore` | Exclusiones parciales confirmadas | No revisa todo el historial de secretos |

El cliente de diagnóstico se lanzó sin inyectar credenciales. No se ejecutó la herramienta de salud contra producción.

## 6. Qué modificar y qué generar en el paso 2

**Plan original del diagnóstico.** El refuerzo se implementó parcialmente en el paso 2; los resultados de ejecución aparecen en la sección 9. Esta lista no certifica que todos los pendientes del informe estén cerrados.

### Modificar archivos existentes

- `.gitignore`: cubrir variantes de archivos privados sin ocultar la plantilla pública.
- `.env.example`: nombres correctos, valores secretos vacíos y explicación de configuración.
- Configuración: carga explícita, validación completa y eliminación de ambigüedad entre token humano y de servicio. `src/config/auth.ts` está sin uso en el flujo revisado; decidir su retiro sin introducirlo como fallback.
- Servicios: compartir transporte HTTP robusto, validar respuestas y normalizar errores.
- Herramientas: mantener nombres y propósito, añadir schemas, salidas estructuradas y anotaciones de solo lectura apropiadas.
- Entrada del servidor: facilitar construcción del servidor separada del arranque stdio para poder probarlo.
- Scripts y prueba actual: ejecutar tests reales y fallar cuando corresponda.

### Generar archivos necesarios

- Schemas de los contratos existentes, obtenidos del backend revisado.
- Utilidades pequeñas de transporte y errores, sin lógica de negocio duplicada.
- Pruebas unitarias y de integración local del protocolo MCP.
- README y documentación operativa/de herramientas.

No se generarán en este paso una base de datos, sistema de usuarios, autenticación independiente, frontend, billing alterno ni herramientas creativas/escritura sin contrato confirmado.

### Decisiones que no se deben tomar unilateralmente

1. **Carga de archivos locales:** confirmar el lanzador y ruta de configuración antes de adaptar la ejecución del propietario. Nunca pedir el valor del token por chat.
2. **Estado autenticado:** conservar `kronos_status` como salud pública para no romper el contrato actual. Añadir una herramienta separada para `/api/mcp/status` requiere acordar su nombre y necesidad; no está implementada.
3. **Scopes:** definirlos con el backend antes de filtrar o exponer capacidades privadas. Los ejemplos del informe maestro son una dirección de diseño, no un contrato ya desplegado.
4. **Health degradado:** acordar la forma de devolver un `/api/health` con 503 y datos de diagnóstico; hoy el cliente descarta el cuerpo en ese caso.

Se puede reforzar lo no ambiguo sin resolver todos estos puntos, pero no rellenar huecos con supuestos ocultos.

## 7. Paso 3 — Credenciales y validación real

Puede realizarse al final del refuerzo local. Las credenciales privadas existentes no deben copiarse al repositorio.

Procedimiento de verificación (la comprobación HTTP autenticada ya fue reportada por el propietario; ver sección 9):

1. Confirmar que el proceso carga el archivo correcto y usa `KRONOS_MCP_TOKEN`, sin mostrarlo.
2. Confirmar el entorno de KRONOS al que corresponde esa credencial.
3. Probar identidad/estado autenticado y registrar únicamente resultados sanitizados.
4. Si hay discrepancia token/hash, revisar el procedimiento autorizado de emisión en backend; no escribir directamente en MongoDB sin acordarlo.
5. Posponer pruebas reales de expiración, revocación y rotación: el propietario ha indicado no modificar ni rotar la credencial actual. Cualquier futura prueba destructiva requiere autorización y credenciales de prueba separadas.
6. Probar 403 por scope cuando exista un endpoint que efectivamente lo exija.

La presencia de archivos de credenciales locales no prueba que estén cargados, que el token coincida con su hash ni que pertenezca al entorno elegido.

## 8. Cambios realmente hechos hasta esta entrega

Antes de entregar el diagnóstico se añadió `zod` como dependencia directa fuera del orden acordado; en ese momento aún no había implementación. En el paso 2, `zod` pasó a utilizarse para validar contratos de entrada y salida del backend y de las herramientas MCP.

Durante el paso 2 se modificaron la configuración, servicios HTTP, herramientas y scripts de prueba; se añadieron pruebas, documentación de uso y esta actualización de estado. El detalle está en `README.md` y en el paso 2 de esta conversación. El backend no se modificó y no se emitieron credenciales.

No se leyeron ni divulgaron valores secretos. El build generado y las dependencias instaladas están en directorios excluidos de Git.

## 9. Criterio de salida

**Diagnóstico:** entregado con evidencia y límites explícitos.

**Refuerzo de base (paso 2):** implementado en este checkout y comprobado localmente. `npm test` reportó 11/11 casos de prueba en esa etapa pasando; `npm run build` compiló; el smoke test stdio verificó handshake, ping, tres herramientas y el error controlado sin token; `npm audit --omit=dev` reportó cero vulnerabilidades. Estas comprobaciones no usan KRONOS producción ni credenciales reales.

**Integración autenticada real (paso 3):** el propietario reportó desde Termux HTTP 200, `authenticated: true`, identidad `kronos-mcp` y permisos `status`, `health`, `me`, sin divulgar la credencial. Es evidencia aportada por el propietario de una petición HTTP autenticada, no una ejecución presenciada aquí ni una comprobación de scopes efectivos. No se debe rotar ni modificar esa credencial.

**Siguiente verificación:** preparado `npm run verify:mcp -- --live` para comprobar cliente MCP → stdio → herramientas → API real en el celular. Aún no se ha ejecutado contra producción desde esta sesión. El procedimiento y los resultados locales están en `docs/VERIFICACION_MCP.md`. La suite local ampliada pasa 22 pruebas, incluidas pruebas del verificador contra procesos stdio reales y respuestas HTTP simuladas. La ejecución local no necesita ni carga archivos privados del propietario.

**Producción comercial:** no certificada. Requiere además autorización efectiva, límites, auditoría, controles de consumo y validación de las capacidades concretas que se vayan a comercializar.

## Referencias de código backend

- [Middleware MCP](https://github.com/donovan-hue/Kronos-space.com/blob/ee49ebe61ebf34915e5bdc4c010d80b20d20abaf/server/src/middleware/mcpAuth.js)
- [Modelo de credenciales](https://github.com/donovan-hue/Kronos-space.com/blob/ee49ebe61ebf34915e5bdc4c010d80b20d20abaf/server/src/modules/mcp/McpServiceCredential.js)
- [Rutas MCP](https://github.com/donovan-hue/Kronos-space.com/blob/ee49ebe61ebf34915e5bdc4c010d80b20d20abaf/server/src/modules/mcp/mcp.routes.js)
- [Health del backend](https://github.com/donovan-hue/Kronos-space.com/blob/ee49ebe61ebf34915e5bdc4c010d80b20d20abaf/server/src/server.js)
- [Datos de build y nulabilidad](https://github.com/donovan-hue/Kronos-space.com/blob/ee49ebe61ebf34915e5bdc4c010d80b20d20abaf/server/src/config/buildInfo.js)
