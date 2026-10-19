# Despliegue de KRONOS MCP

Actualizado el **19-10-2026**.

Este repositorio puede desplegarse por Streamable HTTP en dos perfiles. No son equivalentes y no deben confundirse al conectar ChatGPT.

## Perfiles HTTP

| Perfil | Autenticación del transporte | Herramientas servidas | Uso correcto |
|---|---|---:|---|
| `authenticated` (predeterminado) | `Authorization: Bearer <MSP_HTTP_BEARER_TOKEN>` compartido | 184 | Clientes MCP controlados que sí pueden enviar una cabecera Bearer. Conserva núcleo KRONOS, contratos y estado en memoria compartido entre quienes tengan el mismo token. |
| `public-local` | Sin autenticación | 163 | Endpoint público para conectar ChatGPT en modo **No Auth**. Solo herramientas locales sin estado; no contacta KRONOS y no usa credenciales. |

### Qué excluye `public-local`

De las 180 herramientas locales se excluyen 17:

- las 15 con estado en memoria del proceso (1, 8, 17, 18, 54, 55, 61, 62, 119, 141, 144, 150, 154, 159 y 161), porque un endpoint anónimo no debe compartir memoria entre llamantes;
- la 42, `kronos_tool_benchmark_runner`, porque ejecuta ejemplos de otras herramientas y amplifica una sola llamada;
- la 153, `kronos_webhook_validation_gateway`, porque lee el secreto de una variable de entorno indicada por el llamante y no debe actuar como oráculo HMAC anónimo.

También quedan fuera `kronos_status`, `kronos_health`, `kronos_me` y `kronos_contracts`. Por eso `public-local` sirve 163 herramientas, no las 184 del servidor completo.

ChatGPT no puede presentar una API key personalizada ni el Bearer estático de este proyecto. Para exponer en ChatGPT las herramientas conectadas a KRONOS seguirá siendo necesario OAuth 2.1 compatible con MCP o, solo para una prueba privada, Secure MCP Tunnel. Nunca entregues `MSP_HTTP_BEARER_TOKEN` ni `KRONOS_MCP_TOKEN` a ChatGPT.

## Despliegue permanente en Render

El archivo [`render.yaml`](../render.yaml) define un Web Service Node llamado `kronos-space-mcp`, desde la rama `main`, con:

- build: `npm ci && npm run build`;
- start: `npm run start:http`;
- health check: `/healthz`;
- `MSP_HTTP_PROFILE=public-local`;
- cuerpo MCP máximo de 2 MiB;
- límite inicial de 240 peticiones HTTP por minuto e IP;
- sin secretos en el repositorio.

Para crearlo o sincronizarlo desde la cuenta propietaria de Render:

1. Abre el enlace de Blueprint del repositorio: <https://render.com/deploy?repo=https://github.com/donovan-hue/KRONOS_MCP>.
2. Inicia sesión en Render y conecta el repositorio si todavía no está conectado.
3. Revisa que el recurso propuesto sea `kronos-space-mcp` y que el perfil sea `public-local`.
4. Pulsa **Deploy Blueprint**.
5. Espera a que el servicio quede `Live`; no uses la URL mientras Render muestre `Application loading`.

Si el nombre está disponible, la URL prevista será:

```text
https://kronos-space-mcp.onrender.com/mcp
```

Esa URL solo debe darse por válida tras comprobar que `/healthz` responde como `kronos-msp` con `profile: "public-local"` y que un cliente MCP completa `initialize`, `tools/list` y una llamada real. Si Render asigna otro subdominio, manda la URL que muestre el panel del servicio.

> El plan `free` puede dormirse tras inactividad. Para una revisión pública o un uso continuado conviene cambiarlo por un plan siempre activo antes de enviar la ficha.

## Conectar el perfil público en ChatGPT

Después de verificar la URL permanente:

| Campo | Valor |
|---|---|
| Nombre | `KRONOS Space` |
| Descripción | `Local tools for KRONOS work` |
| URL del servidor MCP | `https://<servicio-verificado>/mcp` |
| Autenticación | `No Auth` |

Este perfil permite probar herramientas locales como `kronos_format_conversion_router`, `kronos_subtitle_alignment_engine` y `kronos_dependency_graph_planner`. No permite probar `kronos_status` ni `kronos_me`; esos casos pertenecen al despliegue conectado con OAuth o al túnel privado.

## Ejecutar cada perfil manualmente

### Público local, sin credenciales

```sh
npm ci
npm run build
MSP_HTTP_PROFILE=public-local npm run start:http
```

### Completo y privado, con Bearer compartido

```sh
npm ci
npm run build
MSP_HTTP_PROFILE=authenticated \
MSP_HTTP_BEARER_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')" \
npm run start:http
```

En un hosting real, guarda ese Bearer solo como secreto del entorno. Si además se usan las herramientas conectadas, `KRONOS_MCP_TOKEN` también debe existir solo como secreto del proceso.

## Verificación mínima tras desplegar

1. `GET /healthz` → `200`, `service: "kronos-msp"` y el perfil esperado.
2. Cliente MCP Streamable HTTP → `initialize` correcto.
3. `tools/list` → 163 en `public-local` o 184 en `authenticated`.
4. Una llamada representativa, por ejemplo `kronos_format_conversion_router`, debe devolver el sobre `local_deterministic`.
5. En `authenticated`, una petición sin Bearer debe devolver `401 AUTH_REQUIRED`.
6. En `public-local`, confirmar que no aparecen `kronos_me`, `kronos_scoped_context_store`, `kronos_tool_benchmark_runner` ni `kronos_webhook_validation_gateway`.

## Dominio propio

`mcp.kronos-space.com` no debe anunciarse hasta que exista el servicio, se añada ese dominio en el proveedor y DNS/TLS queden verificados. Primero debe funcionar la URL del proveedor; después se puede cambiar el DNS sin tocar el código.
