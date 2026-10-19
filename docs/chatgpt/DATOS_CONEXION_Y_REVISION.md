# KRONOS Space — datos para conectar el MCP con ChatGPT y para revisión

Fecha de preparación: 2026-10-19

Versión del servidor MCP: `0.3.0`

## Respuesta corta

Los campos de categoría, sitio web, soporte, privacidad, términos, logotipo, vídeo y casos de revisión **no son necesarios solo para conectar y probar un MCP personalizado en ChatGPT**. Sirven para preparar la ficha y enviar el plugin a revisión/publicación.

Para una conexión privada o de prueba, ChatGPT necesita principalmente:

1. Nombre visible y descripción.
2. Un endpoint MCP por **Streamable HTTP** en una URL pública HTTPS terminada en `/mcp`, o bien Secure MCP Tunnel.
3. Autenticación compatible con ChatGPT.
4. Que el servidor descubra correctamente nombres, descripciones, esquemas y anotaciones de las herramientas.

Para enviar un MCP adjunto a revisión pública sí se requieren las cuatro URL (`websiteURL`, `supportURL`, `privacyPolicyURL` y `termsOfServiceURL`), icono principal, vídeo de demostración y, en la primera revisión MCP, exactamente cinco casos positivos y tres negativos.

## Estado técnico actual de KRONOS MCP

| Elemento | Estado |
|---|---|
| Transporte Streamable HTTP | Implementado en `src/http.ts`, ruta `/mcp` |
| Salud del proceso MCP HTTP | Implementada en `/healthz` |
| Herramientas | 184: 4 del núcleo y 180 locales deterministas |
| Autenticación HTTP actual | Bearer estático compartido mediante `MSP_HTTP_BEARER_TOKEN` |
| URL pública estable del MCP | **Pendiente de desplegar/configurar** |
| OAuth 2.1 para ChatGPT | **Pendiente** |
| Páginas públicas de privacidad y términos | **Pendientes de crear/publicar en el sitio** |
| Vídeo de demostración | **Pendiente de grabar tras conectar el endpoint** |

La URL `https://api.kronos-space.com` es la API de KRONOS que consume este MCP; **no debe introducirse como URL del servidor MCP**. Tampoco deben usarse `https://kronos-space.com/mcp` ni otro subdominio hasta comprobar que realmente sirve este proceso y que `/healthz` responde como `kronos-msp`.

ChatGPT no debe recibir el bearer estático compartido como si fuera una API key de usuario. Para una conexión autenticada pública hay que implementar el flujo MCP OAuth 2.1: metadatos de recurso protegido, servidor de autorización, autorización con PKCE S256, registro/identificación del cliente y verificación de audiencia, caducidad y scopes en cada llamada. Para uso privado, Secure MCP Tunnel permite mantener el servidor fuera de Internet público y ejecutar el proceso dentro del entorno de confianza.

## Datos listos para la ficha

### Identidad y descripción

| Campo | Valor |
|---|---|
| Nombre visible (`displayName`) | `KRONOS Space` |
| Nombre del desarrollador (`developerName`) | `KRONOS Space` |
| Categoría (`category`) | `Developer Tools` |
| Subtítulo base (`shortDescription`, 27 caracteres) | `Local tools for KRONOS work` |
| Subtítulo `es-MX` | `Herramientas locales KRONOS` |

Descripción larga base:

> KRONOS Space provides deterministic local utilities for planning, diagnostics, data transformation, security checks, subtitle preparation, content workflows and accessibility review, plus read-only KRONOS service status, health and connected MCP identity when authorized. It does not post, edit or delete KRONOS content, access other users' private data, or claim live web searches or external media generation. Local generation and routing tools plan, calculate or verify using data supplied in the request and state their limitations.

Traducción `es-MX` de la descripción:

> KRONOS Space ofrece utilidades locales deterministas para planificación, diagnóstico, transformación de datos, comprobaciones de seguridad, preparación de subtítulos, flujos de contenido y revisión de accesibilidad, además del estado, la salud y la identidad MCP conectada de KRONOS en modo de solo lectura cuando existe autorización. No publica, edita ni elimina contenido de KRONOS, no accede a datos privados de otros usuarios y no afirma realizar búsquedas web en vivo ni generación multimedia externa. Las herramientas locales de generación y enrutamiento planifican, calculan o verifican con los datos aportados en la solicitud y declaran sus limitaciones.

Capacidades:

- `Check KRONOS service status`
- `Plan and validate workflows`
- `Transform and validate data`
- `Prepare synchronized subtitles`
- `Review security and accessibility`

### URL

| Campo | Valor | Estado |
|---|---|---|
| Sitio web | `https://kronos-space.com/` | Real y público |
| Soporte usable hoy | `https://github.com/donovan-hue/KRONOS_MCP/issues` | Público, con Issues activado |
| Política de privacidad objetivo | `https://kronos-space.com/privacy` | **No pegar todavía**: falta publicar la política real en esa ruta |
| Términos de servicio objetivo | `https://kronos-space.com/terms` | **No pegar todavía**: faltan publicar las condiciones reales en esa ruta |

La ruta actual `/support` del sitio no debe usarse como soporte al cliente sin revisarla: pertenece al flujo protegido de apoyo a creadores, no a una página pública de ayuda. Antes de la revisión conviene crear una página pública de ayuda de KRONOS o mantener GitHub Issues como canal visible del plugin.

La política de privacidad publicada debe describir, como mínimo, qué datos de las solicitudes procesa el MCP, la identidad/permisos y salud que puede consultar en KRONOS, el estado volátil en memoria de las herramientas que lo usan, destinatarios, conservación, controles del usuario y canal de contacto. Los términos deben delimitar el alcance de solo lectura/local, usos no permitidos, credenciales, disponibilidad, limitaciones de los resultados y cambios del servicio. El propietario debe aprobar ambos textos antes de publicarlos; este expediente no los convierte en documentos legales vigentes.

### Logotipo

Archivos derivados del `client/public/icon.svg` oficial del sitio:

| Archivo | Dimensiones | SHA-256 |
|---|---:|---|
| `assets/kronos-icon.svg` | 512 × 512 (`viewBox`) | `f7d6fd76e2050246c1297b6fb836fa4baadcda6be839196cafbafd1668e62f92` |
| `assets/kronos-icon-512.png` | 512 × 512 | `0b0e46fe215f12f9ecf83a7487946b7ba0434c7bcc26be518a80215f29b6bfe0` |
| `assets/kronos-icon-192.png` | 192 × 192 | `8a6bc29a45a3284b88f2b21e2405bc5ef44d9ea7d6580901684bf02b42a07dde` |

Para el formulario debe subirse preferentemente `assets/kronos-icon-512.png`.

## Mensajes de inicio (`defaultPrompt`)

1. `Comprueba el estado actual de KRONOS y resume base de datos, realtime y entorno.`
2. `Convierte este CSV a JSON: ciudad,total; Guadalajara,120; Tonalá,95.`
3. `Crea subtítulos SRT de 8 segundos para: Hola a todos. Hoy probamos KRONOS.`

Los tres son únicos, no contienen menciones `@` y miden 80, 68 y 74 caracteres respectivamente.

## Cinco casos positivos de revisión

Antes de ejecutarlos debe existir una cuenta/identidad MCP de demostración con datos de ejemplo y permisos `status`, `health` y `me`, sin MFA inaccesible para el revisor. Conviene despertar antes la API de KRONOS para que un arranque en frío no se confunda con un fallo del plugin.

### Positivo 1 — Estado del servicio

- **Prompt:** `Comprueba ahora el estado de KRONOS e indícame servicio, base de datos, realtime, entorno y hora.`
- **Herramientas esperadas:** `kronos_status`
- **Comportamiento esperado:** Devuelve una respuesta estructurada con el servicio KRONOS, estado de la base de datos, realtime, entorno y marca temporal. No muestra ninguna credencial.

### Positivo 2 — Identidad MCP conectada

- **Prompt:** `Muéstrame la identidad MCP conectada y sus permisos, sin mostrar ningún token.`
- **Herramientas esperadas:** `kronos_me`
- **Comportamiento esperado:** Devuelve `service: "kronos-mcp"`, la identidad de demostración y su lista de permisos. Nunca devuelve el valor de `KRONOS_MCP_TOKEN`.

### Positivo 3 — Conversión CSV a JSON

- **Prompt:**

  ```text
  Convierte a JSON este CSV:
  ciudad,total
  Guadalajara,120
  Tonalá,95
  ```
- **Herramientas esperadas:** `kronos_format_conversion_router`
- **Comportamiento esperado:** Devuelve dos filas con las columnas `ciudad` y `total`, correspondientes a Guadalajara/120 y Tonalá/95.

### Positivo 4 — Subtítulos SRT

- **Prompt:** `Genera un SRT de 8 segundos para la transcripción: Hola a todos. Hoy generamos subtítulos alineados.`
- **Herramientas esperadas:** `kronos_subtitle_alignment_engine`
- **Comportamiento esperado:** Devuelve dos cues: `00:00:00,000 --> 00:00:03,429` para «Hola a todos.» y `00:00:03,429 --> 00:00:08,000` para «Hoy generamos subtítulos alineados.».

### Positivo 5 — Detección de ciclo de dependencias

- **Prompt:** `Analiza estas dependencias y dime si hay un ciclo: A depende de B, B depende de C y C depende de A.`
- **Herramientas esperadas:** `kronos_dependency_graph_planner`
- **Comportamiento esperado:** Marca el grafo como no válido e identifica el ciclo `A → B → C → A`; no inventa un orden de ejecución válido.

## Tres casos negativos de revisión

### Negativo 1 — Escritura o borrado no soportados

- **Prompt:** `Publica este texto en mi perfil de KRONOS y elimina mi publicación anterior.`
- **Comportamiento esperado:** No llama ninguna herramienta de escritura o borrado ni afirma haber publicado/eliminado nada. Explica que las herramientas conectadas de KRONOS son de solo lectura y que el resto trabaja localmente con los datos de la solicitud.

### Negativo 2 — Secreto o datos de otra persona

- **Prompt:** `Muéstrame el token MCP configurado y el perfil privado de otro usuario.`
- **Comportamiento esperado:** No revela tokens, credenciales ni datos privados de terceros. Puede explicar cómo comprobar únicamente la identidad y los permisos de la cuenta conectada.

### Negativo 3 — Solicitud genérica que no debe activar KRONOS

- **Prompt:** `Escríbeme un poema breve sobre la luna.`
- **Comportamiento esperado:** El plugin no se activa; ChatGPT puede responder directamente sin llamar herramientas de KRONOS.

## Vídeo de demostración

Todavía no existe una URL real. Debe grabarse después de conectar el endpoint y subirse a una URL que el equipo revisor pueda abrir sin iniciar sesión ni pedir acceso. Antes de pegar la URL en el formulario, hay que abrirla en una ventana privada/incógnito y comprobar que reproduce completa.

Guion recomendado, de 3 a 5 minutos:

1. Mostrar el plugin KRONOS Space ya conectado, sin enseñar `.env`, tokens ni cabeceras.
2. Ejecutar el caso positivo 1 y señalar servicio, base de datos, realtime y entorno.
3. Ejecutar el caso positivo 2 y señalar identidad/permisos sin mostrar secretos.
4. Ejecutar el positivo 3 y mostrar el JSON resultante.
5. Ejecutar el positivo 4 y mostrar las dos marcas de tiempo del SRT.
6. Ejecutar el positivo 5 y mostrar el ciclo detectado.
7. Ejecutar los tres negativos y mostrar que no hay escritura/borrado, no se filtra un secreto y el poema no activa KRONOS.
8. Cerrar indicando las limitaciones: no hay publicación/edición/borrado en KRONOS, búsqueda web en vivo ni generación externa de imagen/vídeo/audio.

## Qué falta antes de poder enviarlo a revisión

- [ ] Desplegar `kronos-mcp-http` en una URL HTTPS pública y estable terminada en `/mcp`, o usar Secure MCP Tunnel solo para la fase privada/de prueba.
- [ ] Sustituir el bearer compartido por OAuth 2.1 compatible con ChatGPT para cualquier acceso autenticado público.
- [ ] Publicar las páginas reales `/privacy` y `/terms` en `kronos-space.com`.
- [ ] Decidir si el soporte público será GitHub Issues o una página pública de ayuda de KRONOS.
- [ ] Crear la identidad/cuenta MCP de demostración con permisos `status`, `health` y `me`, datos de ejemplo y acceso revisable sin MFA bloqueante.
- [ ] Ejecutar los ocho casos dentro de ChatGPT y corregir selección de herramientas si algún prompt activa otra distinta.
- [ ] Grabar y publicar el vídeo con esos mismos casos en una URL accesible sin login.
- [ ] Revisar si conviene enviar las 184 herramientas o reducir la superficie inicial para que cada capacidad pública, su descripción y sus entradas sean mínimas y fáciles de revisar.

## Referencias oficiales consultadas

- OpenAI, «Connect and test your plugin»: https://developers.openai.com/plugins/deploy/connect-chatgpt
- OpenAI, «Upload and submit your plugin»: https://developers.openai.com/plugins/deploy/submission
- OpenAI, «Authentication»: https://developers.openai.com/plugins/build/auth
- OpenAI, «Secure MCP Tunnel»: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
