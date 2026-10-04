# KRONOS MCP

Servidor Model Context Protocol local por **stdio** que expone herramientas de lectura conectadas al API existente de KRONOS. No es una API social paralela ni conecta directamente con la base de datos.

## Requisitos

- Node.js 20 o posterior.
- Una URL HTTPS de KRONOS. `KRONOS_API_URL` es opcional; por defecto usa `https://api.kronos-space.com`.
- Para `kronos_me`, una credencial MCP de servicio válida como `KRONOS_MCP_TOKEN`. Las consultas `kronos_status` y `kronos_health` consultan `/api/health` y no necesitan ni validan esa credencial.

## Instalación y ejecución

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

## Herramientas existentes

| Nombre | Función | Autenticación | Error/salida |
|---|---|---|---|
| `kronos_status` | Lectura compacta del `GET /api/health` público | No valida credencial MCP | Salida MCP estructurada; no acredita autenticación |
| `kronos_health` | Lectura del `GET /api/health` público | No valida credencial MCP | Salida MCP estructurada; un HTTP no exitoso es error de herramienta |
| `kronos_me` | Consulta identidad y permisos por `GET /api/mcp/me` | `KRONOS_MCP_TOKEN` de servicio | Salida MCP estructurada; requiere credencial configurada y aceptada por KRONOS |

Las tres herramientas son de solo lectura. `kronos_me` informa permisos devueltos por el backend; este cliente no afirma que KRONOS haga cumplir scopes por herramienta. No hay aquí herramientas de búsqueda, perfil, analytics, KAIROS, escritura, publicación ni borrado.

## Errores y límites

Los errores MCP usan códigos estables y no incluyen el cuerpo arbitrario de KRONOS: `AUTH_REQUIRED`, `CONFIG_INVALID`, `UPSTREAM_TIMEOUT`, `UPSTREAM_UNAVAILABLE`, `UPSTREAM_HTTP_ERROR`, `INVALID_RESPONSE`, `RESPONSE_TOO_LARGE` o `INTERNAL_ERROR`. Cuando existe estado HTTP, se entrega separadamente. Timeout por petición: 10 segundos. Cuerpo máximo: 1 MiB. Redirects rechazados. No se hacen reintentos automáticos.

## Pruebas y build

```sh
npm test
npm run build
```

La suite usa respuestas HTTP simuladas, transporte MCP en memoria y procesos reales por stdio con un fixture HTTP aislado; no requiere credenciales, MongoDB ni API de producción. No constituye prueba de autenticación, scopes o despliegue en producción.

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

El antiguo `tests/mcp-test.ts` ahora delega a este verificador y también exige `--live`; ya no anuncia éxito si la herramienta falla.

## Si `kronos_me` termina en timeout

Consulta [la revisión del flujo y diagnóstico seguro](docs/DIAGNOSTICO_TIMEOUT_ME.md). El endpoint sigue siendo `/api/mcp/me`, con 10 s de plazo total HTTP (cabeceras y cuerpo) y 15 s por petición del verificador MCP. No se ha ampliado el plazo ni cambiado a `/status`.

Después de actualizar y ejecutar `npm test`:

```sh
npm run diagnose:kronos -- --live
# O añadir: --env-file "/ruta/real/al/archivo.env"
```

Realiza dos GET autenticados, `/me` y `/status`, con la misma configuración y sin rotar nada. Informa destino sanitizado, origen de configuración, fase, status y duración, no secretos ni cuerpos. Las dos llamadas pueden actualizar `lastUsedAt`. Su objetivo es diagnosticar desde el entorno que falla, no certificar producción desde pruebas locales.

## Variables

- `NODE_ENV`: etiqueta de entorno opcional.
- `KRONOS_API_URL`: URL base HTTPS opcional.
- `KRONOS_MCP_TOKEN`: credencial privada requerida únicamente para `kronos_me`.

**Nunca guardes tokens en Git, logs o salidas de herramientas.** Emite y rota credenciales por los mecanismos autorizados del backend. No se ha documentado aquí un procedimiento de emisión automática.
