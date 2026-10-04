# Verificación MCP por stdio — siguiente paso

## Estado y procedencia de la evidencia

- **Reportado por el propietario desde Termux:** petición autenticada a KRONOS con HTTP 200, `authenticated: true`, identidad `kronos-mcp`, permisos `status`, `health`, `me`. Token no compartido ni versionado.
- **Ejecutado en este checkout:** build y 22 pruebas locales pasando (22 casos, incluyendo subtests). Hay procesos reales por stdio, pero todas sus respuestas HTTP se simulan; no se envían peticiones a KRONOS.
- **Reportado después por el propietario:** copia actualizada y 22/22 pruebas locales pasando; verificación real supera handshake, catálogo, input y tool inexistente, pero falla en `kronos_me` con `UPSTREAM_TIMEOUT`. No hay éxito E2E todavía.
- **En revisión:** [diagnóstico de timeout](DIAGNOSTICO_TIMEOUT_ME.md); 34 pruebas locales pasando con instrumentación y corrección de clasificación del cuerpo. Pendiente diagnóstico desde Termux.

La credencial válida **no debe rotarse, revocarse ni modificarse** como parte de esta verificación.

## Qué comprueba el comando

1. Arranque del servidor compilado y handshake/ping del cliente MCP.
2. Descubrimiento de `kronos_status`, `kronos_health`, `kronos_me` y sus contratos de salida.
3. Rechazo de parámetros adicionales en `kronos_me` y de una herramienta inexistente (sin peticiones HTTP en el código actual).
4. `kronos_me`: autenticación real a `/api/mcp/me`, `ok: true`, estructura de identidad/permisos y acuerdo entre salida textual y estructurada.
5. `kronos_status` y `kronos_health`: lectura de `/api/health`, resultado exitoso y contrato válido.
6. Cierre del cliente y proceso servidor, incluso en caso de error.

Una ejecución completa realiza **tres GET**: uno autenticado y dos públicos. Puede actualizarse `lastUsedAt` en el backend; no se realizan llamadas administrativas, escritura de contenido ni cambios al secreto. No hay reintentos automáticos. Cada solicitud MCP tiene un plazo de 15 segundos; el cliente HTTP existente del servidor mantiene su plazo de 10 segundos. El verificador se detiene en el primer fallo.

## Ejecutarlo en Termux

Primero debe estar **esta versión del proyecto** en el celular, con `scripts/verify-mcp.mjs`, los cambios de servidor y el script npm `verify:mcp`. Los archivos editados en Arena no aparecen automáticamente en Termux. Si falta el comando o el archivo, no sustituirlo por la prueba antigua ni asumir que se ejecutó: falta transferir/sincronizar esta versión. La rama de distribución para esta sesión es `arena/01a10610-kronos-mcp`; confirmar su disponibilidad remota con `git fetch` antes de continuar. No es necesario modificar `main`.

Desde la raíz del proyecto actualizado:

```sh
npm ci
npm test
```

`npm test` compila y ejecuta las pruebas locales sin cargar tus archivos privados ni llamar a producción. Solo si termina correctamente, ejecutar:

```sh
npm run verify:mcp -- --live
```

Carga el `.env` de la raíz del proyecto. Si el secreto está en otro archivo, no hay que moverlo ni copiarlo:

```sh
npm run verify:mcp -- --live --env-file "/ruta/privada/al/archivo.env"
```

La ruta anterior es un ejemplo que debe reemplazarse por la ruta real. No es el valor del token. Las variables de entorno ya inyectadas tienen prioridad sobre el archivo. Deben configurarse `KRONOS_MCP_TOKEN` y, si corresponde, `KRONOS_API_URL` para el entorno ya validado; si falta URL, se usa `https://api.kronos-space.com`. No usar `source`, `cat`, `set -x`, `printenv` ni poner el token como argumento.

El verificador requiere `--live` para habilitar esta conexión explícitamente. No lo ejecuta `npm test`.

## Salida esperada — ejemplo, no resultado real obtenido aquí

```text
PASS stdio_handshake_ping
PASS tools_list
PASS invalid_input_rejected
PASS unknown_tool_rejected
PASS kronos_me
PASS kronos_status
PASS kronos_health
PASS MCP_VERIFICATION_COMPLETE
```

El éxito termina con código de proceso 0. Un fallo termina con código 1 y sin marcador final de éxito. Se imprime solo el nombre fijo de la etapa y un código controlado, no la respuesta ni el stack del servidor.

Ejemplos de fallo:

| Salida | Interpretación |
|---|---|
| `FAIL preflight LIVE_OPT_IN_REQUIRED` | Falta el consentimiento explícito `--live`; no conecta |
| `FAIL preflight AUTH_REQUIRED` | No se cargó un token; no equivale a rechazo del backend |
| `FAIL preflight ENV_FILE_UNREADABLE` | No se pudo leer el archivo indicado |
| `FAIL preflight BUILD_REQUIRED` | Falta ejecutar build/test en esta copia |
| `FAIL tools_list MISSING_TOOL_CONTRACT` | Puede estar ejecutándose una versión vieja sin schemas de salida |
| `FAIL kronos_me UPSTREAM_HTTP_ERROR HTTP_401` | Rechazo HTTP de la credencial; revisar carga/destino sin rotarla automáticamente |
| `FAIL kronos_me UPSTREAM_HTTP_ERROR HTTP_403` | El backend rechaza el acceso; no inventar scopes |
| `FAIL kronos_status UPSTREAM_HTTP_ERROR HTTP_503` | El diagnóstico de KRONOS respondió no disponible; no es un fallo de credencial |
| `FAIL ... INVALID_RESPONSE` | La respuesta recibida no cumple el contrato del servidor |
| `FAIL ... INVALID_OUTPUT` | La respuesta MCP no acredita éxito o contiene campos inválidos |
| `FAIL ... MCP_VERIFICATION_FAILED` | Error de transporte/protocolo/schema; se omiten detalles crudos por seguridad |

Compartir únicamente las líneas PASS/FAIL. No compartir el archivo privado ni capturas de sus valores.

## Qué NO demuestra

- Los permisos `status`, `health`, `me` no prueban que haya enforcement de scopes para futuras herramientas.
- No prueba revocación, rotación, expiración, límites comerciales, billing ni consumo.
- No prueba KAIROS, lectura social, creación o publicación: esas herramientas no existen en este catálogo.
- Las respuestas 401, 403 y 429 de las pruebas locales son simulaciones para comprobar el adaptador, no resultados reales del backend.
- Un éxito por stdio no certifica un despliegue MCP remoto.

## Cambios acotados a esta tarea

- Verificador opt-in en `scripts/verify-mcp.mjs` y comando npm correspondiente.
- Reemplazo de la prueba manual que podía anunciar falsos éxitos; la ruta antigua delega al verificador.
- Separación de `src/server.ts` (construcción sin lectura de secretos) de `src/index.ts` (arranque con dotenv silencioso). Comparación de ruta de entrada compatible con rutas codificadas/espacios.
- Aislamiento de tests de las credenciales heredadas y nuevas pruebas stdio con archivos temporales sintéticos.
- Sin cambios en credenciales, permisos del backend, endpoints, catálogo o política comercial.
