# Diagnóstico de `kronos_me`: timeout upstream

## Evidencia y límites

El propietario reportó en Termux, sobre `e0d5b68`:

- Suite local: 22/22 pasando.
- Verificador real: handshake, catálogo y rechazos de input/tool correctos.
- Fallo: `FAIL kronos_me UPSTREAM_TIMEOUT`.
- Prueba HTTP directa anterior a `/api/mcp/status`: HTTP 200, autenticada.

Esto confirma el funcionamiento inicial del protocolo MCP, pero **no** identifica la causa del timeout de `/me`. No se ha reproducido la red de Termux desde este entorno ni se dispone aquí de su credencial. No se han hecho peticiones autenticadas a producción desde esta revisión.

## Recorrido revisado

```text
verify-mcp.mjs
  → loadVerificationConfig
  → proceso dist/index.js por stdio
  → kronos_me
  → getKronosMe
  → requestKronosJson
  → GET <KRONOS_API_URL sin slash final>/api/mcp/me
```

- Endpoint real de la herramienta: **`/api/mcp/me`**, no `/api/mcp/status`.
- Headers: `Accept: application/json` y Bearer de la credencial de servicio.
- HTTPS, redirects rechazados, sin reintentos automáticos.
- Timeout HTTP: **10 000 ms**. Presupuesto por solicitud del verificador MCP: **15 000 ms**.
- URL: entorno del proceso prevalece sobre archivo `.env` (o `--env-file`); default `https://api.kronos-space.com` si no está definida. El token sigue la misma precedencia.
- El verificador pasa explícitamente URL y token al proceso hijo. dotenv no los sobrescribe.
- URL efectiva sin configuración: `https://api.kronos-space.com/api/mcp/me`.
- No puede confirmarse cuál fue la URL efectiva en Termux sin medir allí. Un valor exportado antiguo puede prevalecer sobre el archivo correcto.
- Si la URL base ya termina en `/api`, la concatenación actual genera `/api/api/mcp/me`. El diagnóstico lo señala, pero no cambia el valor ni intenta corregirlo automáticamente. No confundirlo con una causa ya demostrada.

El código del backend consultado en GitHub, revisión `ee49ebe61ebf34915e5bdc4c010d80b20d20abaf`, define `/status` y `/me` con el mismo `mcpAuth`. Ambas esperan consulta de credencial y actualización de `lastUsedAt` antes de responder. El JSON de `/me` no tiene campo `authenticated`; sí `ok`, `service`, `identity` y `permissions`. La herramienta no exige `authenticated` en `/me`.

Leer esa revisión **no prueba qué código está desplegado**. Un éxito anterior en `/status` no garantiza igual URL, ruta, cliente HTTP, límite de tiempo o condiciones de red al ejecutar `/me`.

## Lectura de respuesta y hallazgo reproducido

En `e0d5b68`:

1. `fetch` estaba dentro del catch de timeout; la lectura del cuerpo estaba fuera.
2. `UPSTREAM_TIMEOUT` indicaba aborto durante `fetch`, antes de recibir sus cabeceras. Un fallo del schema habría producido `INVALID_RESPONSE`.
3. La respuesta requería content type JSON, máximo 1 MiB, HTTP exitoso y contrato válido.
4. Un abort/error mientras se leía el cuerpo podía escapar como `INTERNAL_ERROR` a la herramienta. Además faltaba cancelar cuerpos rechazados antes de consumirlos.

Reproducción local antes del cambio, contra un servidor HTTP sintético en loopback, sin KRONOS ni token real:

| Escenario | Resultado observado |
|---|---|
| Sin cabeceras | Aproximadamente 10 s; `UPSTREAM_TIMEOUT` |
| Cabeceras 200 JSON, cuerpo incompleto | Aproximadamente 10 s; error sin normalizar → `INTERNAL_ERROR` |

**Este defecto del cuerpo no explica por sí solo el timeout previo a cabeceras reportado por el propietario.**

## Corrección acotada en el cliente MCP

- Mantiene los **10 s**, el endpoint `/me` y los schemas existentes.
- Aplica un plazo total explícito a la operación, tanto cabeceras como cuerpo, con rechazo acotado para el llamador, abort y cancelación del lector. No depende únicamente de que el transporte despierte al abortar.
- Normaliza timeout de cuerpo a `UPSTREAM_TIMEOUT`; conserva status HTTP si ya se recibió.
- Normaliza errores de stream a `UPSTREAM_UNAVAILABLE`, sin mensajes externos.
- Cancela cuerpos no consumidos/rechazados y limpia el timer al terminar.
- No añade fallback a `/status`, cambio de DNS/IPv4, retries ni ampliación del timeout.

No se cambió la política restante: por ejemplo, una respuesta HTML sigue siendo `INVALID_RESPONSE`, aun con HTTP de error (el status se conserva). No se presenta este trabajo como cierre de todas las mejoras posibles del cliente.

## Diagnóstico seguro para Termux

Nuevo comando, separado del verificador:

```sh
npm run diagnose:kronos -- --live
```

O, usando el mismo archivo privado que en la verificación anterior:

```sh
npm run diagnose:kronos -- --live --env-file "/ruta/real/al/archivo.env"
```

**Requiere actualizar esta rama y ejecutar `npm test` antes**, para compilar el cliente revisado. No copiar plantillas encima del archivo privado.

El comando usa el mismo cargador de configuración que `verify:mcp`, las mismas funciones de servicio del build y el mismo timeout. Ejecuta **dos GET autenticados**, primero `/api/mcp/me` y luego `/api/mcp/status`, incluso si el primero falla. No modifica el token ni escribe directamente en MongoDB. Sin embargo, cada petición autenticada puede hacer que el backend actualice `lastUsedAt`; como ejecuta dos GET, ese campo puede actualizarse hasta dos veces. No incluye el gasto de arrancar MCP: sirve para aislar su cliente HTTP.

Salida:

- `INFO`: URL de `/me`, fuente de URL y token (`process_env`, `env_file`, `default` para URL), presupuestos, política de redirects/retries.
- Una línea `PASS`/`FAIL` por endpoint: tiempo hasta cabeceras, tiempo total, status HTTP o null, si el content type es JSON, fase y validación del contrato.
- No imprime token, hash, identidad, permisos, cuerpo, cabeceras crudas, ruta del archivo privado ni stacks. Si hay path en la base se sustituye por `[BASE_PATH_REDACTED]` y se indica si termina en `/api`.
- Código de proceso 0 solo si ambas consultas pasan; 1 si falla alguna.

### Interpretación

| Resultado | Conclusión limitada |
|---|---|
| `phase: awaiting_headers`, `httpStatus: null`, cerca de 10 s | Este cliente no recibió cabeceras dentro del plazo; no es un HTTP 401 |
| `phase: body_or_validation`, `httpStatus: 200`, `UPSTREAM_TIMEOUT` | Cabeceras recibidas; timeout leyendo el cuerpo |
| `HTTP 401` | El backend respondió un rechazo de autenticación para esa petición/destino; no rotar automáticamente |
| `HTTP 404` con JSON | Ruta no encontrada; revisar destino/versión desplegada |
| `/status` pasa y `/me` falla | Diferencia observada en esta secuencia; puede depender de ruta o de que la segunda petición encuentre el servicio caliente/conexión reutilizada. No basta para declarar la causa |
| Ambas pasan | El cliente HTTP funciona en ese momento; repetir entonces el verificador MCP |
| `apiUrlSource: process_env` inesperado | Revisar la variable exportada frente al archivo; no tocar el secreto |
| `basePathEndsWithApi: true` | Revisar concatenación duplicada `/api/api/...`; no cambiarla sin confirmar configuración |

Un arranque lento, latencia de red, DNS/TLS/IPv6, proxy o espera del backend son **hipótesis**, no hallazgos confirmados. Si una comparación con curl usa mayor timeout u otras opciones de red, no es equivalente al `fetch` actual de Node.

## Pruebas realizadas aquí

`npm test`: **34 casos pasando**, incluido build y las pruebas stdio anteriores. Nuevas pruebas:

- Plazo real de 10 s para cabeceras y cuerpo bloqueados, en paralelo contra servidores loopback.
- Normalización de error de stream y cancelación de cuerpos rechazados.
- Diagnóstico con las dos rutas, Bearer sintético idéntico, orden y URL normalizada.
- Timeout de cabeceras/cuerpo, JSON inválido, 401 y éxito de `/status` simulado.
- Precedencia compartida de configuración y redacción de salida.
- CLI que rechaza ejecutar sin `--live`.

**Validación posterior en Termux:** el diagnóstico real pasó para `/api/mcp/me` y `/api/mcp/status` (HTTP 200, contrato válido); después, `verify:mcp -- --live` pasó handshake, catálogo, rechazos de entradas/herramientas y las herramientas `kronos_me`, `kronos_status` y `kronos_health`. Esto demuestra que la ruta completa funcionó en esa ejecución; no garantiza que no vuelvan a ocurrir timeouts ni identifica retrospectivamente la causa exacta del fallo anterior.
