# Evidencia de implementación y preparación para npm — kronos-mcp 0.3.0

Fecha de verificación: 2026-10-19  
Entorno: Node.js v22.22.3, npm 10.9.8  
Paquete: `kronos-mcp@0.3.0`

## Actualización de visibilidad (decisión posterior)

El propietario decidió que la distribución será **privada**, no pública. Las pruebas siguientes demuestran que el artefacto funciona, incluido el ensayo histórico `--access public`, pero esa ya no es la ruta de publicación autorizada. El manifiesto actual contiene `"private": true` y no contiene `publishConfig.access: "public"`; así, `npm publish` queda bloqueado mientras el nombre siga sin ámbito. Para alojarlo privado en npm todavía hay que fijar el ámbito exacto del propietario (`@usuario/kronos-mcp` u `@organizacion/kronos-mcp`), usar una cuenta npm habilitada para paquetes privados, configurar el acceso como `restricted` y repetir las verificaciones con el nuevo nombre.

Comprobaciones tras aplicar ese candado:

- `npm test`: 92/92, incluida `tests/package-visibility.test.ts`.
- `npm run verify:tarball`: 184 herramientas por stdio, 180/180 llamadas locales, HTTP 184 y 401 sin token. Esto solo crea e instala un tarball temporal; no contacta con el registro para publicar.
- En npm 10.9.8, `npm publish --dry-run` no ejecuta la función real de publicación donde `libnpmpublish` rechaza `private: true` con `EPRIVATE`; por eso un dry-run aislado no sirve como prueba de este candado. Se añadió `scripts/check-private-publish.mjs` al inicio de `prepublishOnly` para que incluso el dry-run se detenga con un mensaje explícito mientras falte el ámbito restringido.

## Veredicto corto

- Las 180 herramientas existen como código ejecutable, no solo como nombres del catálogo.
- La instalación desde el tarball generado por npm funciona en un proyecto consumidor vacío.
- Desde ese consumidor, los binarios instalados enumeraron 184 herramientas y ejecutaron correctamente las 180 herramientas locales.
- `npm publish --dry-run --access public` terminó con código de salida 0 cuando el paquete estaba preparado como público; se conserva como evidencia histórica del empaquetado, no como instrucción actual.
- La publicación privada real todavía requiere el ámbito npm exacto del propietario, una cuenta habilitada para paquetes privados e iniciar sesión desde su máquina (`npm login`). Este sandbox no tiene una cuenta npm autenticada. No se debe pegar ningún token o contraseña en un chat.

## Qué significa «desarrolladas desde cero» en este repo

El repositorio ya tenía 4 herramientas MCP del núcleo, contratos, autorización y transportes stdio/HTTP. Sobre esa base se implementaron las 180 posiciones del catálogo aportado:

- 18 módulos en `src/families/`, uno por familia y 10 definiciones por módulo.
- 8 motores deterministas en `src/engines/` (texto/diff, grafos, estadística, scoring, datos, tiempo/cron, medios y seguridad).
- Registro tipado generado desde `docs/KRONOS_MCP_180_Herramientas.txt` mediante `npm run generate:catalog`.
- Cada herramienta declara esquema de entrada Zod con límites, handler y un ejemplo ejecutable.
- Tres routers de audio comparten una factoría de enrutamiento por idioma (`languageRouter`), pero cada uno sigue siendo una herramienta MCP distinta, con su número, nombre y contrato.
- Las herramientas cuyo paso final requeriría un proveedor hacen enrutamiento, planificación, cálculo o verificación con datos del llamante y lo declaran en `limitations`; no simulan generación externa.

Métricas del código tras preparar npm:

| Área | Archivos | Líneas | Líneas no vacías |
|---|---:|---:|---:|
| `src/families/` | 20 | 5.869 | 5.640 |
| `src/engines/` | 8 | 1.157 | 1.052 |
| Catálogo, estado y registro | 4 | 409 | 378 |
| Tests nuevos de catálogo/locales | 2 | 365 | 302 |
| Total `src/` + `tests/` TypeScript | — | 10.231 | — |

## Evidencia 1: suite completa del repositorio

Comandos ejecutados:

```sh
npm ci
npm test
```

`npm ci` auditó 102 paquetes y encontró 0 vulnerabilidades. La suite terminó así:

```text
# tests 91
# pass 91
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

La parte que prueba directamente las 180 está en `tests/local-tools.test.ts`:

- `barrido MCP: las 180 responden con su ejemplo y un sobre válido`.
- 18 pruebas adicionales de comportamiento concreto, una por familia.
- `fetch` bloqueado durante la suite, para demostrar que las 180 no dependen de red ni de credenciales KRONOS.

## Evidencia 2: tarball limpio para npm

Antes de esta preparación, `npm pack` incluía 152 entradas: fuente TypeScript, tests, scripts, documentos borrador y sin `LICENSE`. Se corrigió el paquete con:

- `bin`: `kronos-mcp` y `kronos-mcp-http`, ambos con shebang.
- `files`: solo `dist` y los dos documentos del catálogo; npm añade `README.md`, `LICENSE` y `package.json`.
- `types` y `exports` para `dist/index.d.ts`.
- `engines.node >= 20`, repositorio, homepage, bugs y keywords.
- `prepack: npm run build` y `prepublishOnly: npm test`.
- `package-lock.json` sincronizado a 0.3.0 con los binarios.

Artefacto realmente generado:

```text
filename:       kronos-mcp-0.3.0.tgz
package size:   190579 bytes (190.6 kB según npm)
unpacked size:  696579 bytes
total files:    125
SHA-256:        bede9aba57f4e92e83d7481cc560fee6b1867518b7940298e82ce5b1a768d65e
npm shasum:     d82295393954046bc39c6b1bf307fe58281afe03
integrity:      sha512-KR4PCYBBLxWjiwXLyBvL2LkmvKL/lSDrn1nM2iMqRbENvFZSExneNjD5D8hI4uOE4DFNcHl9C27ngymN3xaqOA==
```

Checks del contenido:

```json
{
  "executableStdio": true,
  "executableHttp": true,
  "mainTypes": true,
  "readme": true,
  "license": true,
  "packageJson": true,
  "noSrc": true,
  "noTests": true,
  "noScripts": true,
  "noDraftDocs": true
}
```

## Evidencia 3: instalación y ejecución desde un consumidor vacío

Se añadió `scripts/verify-npm-tarball.mjs`. Crea un proyecto temporal sin dependencias, instala solo el `.tgz`, lanza `node_modules/.bin/kronos-mcp` con un cliente MCP, llama a las 180 y después lanza `kronos-mcp-http`.

Resultado real sobre el tarball anterior:

```json
{
  "ok": true,
  "verifiedAt": "2026-10-19T19:45:55.288Z",
  "tarballBytes": 190579,
  "tarballSha256": "bede9aba57f4e92e83d7481cc560fee6b1867518b7940298e82ce5b1a768d65e",
  "probe": {
    "stdioToolCount": 184,
    "localToolsCalled": 180,
    "localToolsPassed": 180,
    "invalidInputRejected": true,
    "httpToolCount": 184,
    "httpUnauthorizedStatus": 401,
    "failures": []
  }
}
```

Para repetirla:

```sh
npm run verify:tarball
# o, contra un tarball concreto:
npm pack --pack-destination /tmp/kronos-release-evidence
npm run verify:tarball -- /tmp/kronos-release-evidence/kronos-mcp-0.3.0.tgz
```

## Evidencia 4: salidas reales de herramientas

Ejemplos ejecutados contra `dist/` (la Cobertura completa está en las pruebas y en la sonda del tarball):

- #52 `kronos_secret_exposure_scanner` detectó una asignación inventada para la prueba y devolvió `ap****89 (len 28)`, sin exponer el valor.
- #73 `kronos_format_conversion_router` convirtió CSV a JSON con 2 filas y columnas `ciudad`, `total`.
- #116 `kronos_subtitle_alignment_engine` generó:

  ```text
  1
  00:00:00,000 --> 00:00:03,429
  Hola a todos.

  2
  00:00:03,429 --> 00:00:08,000
  Hoy generamos subtítulos alineados.
  ```

- #153 `kronos_webhook_validation_gateway` aceptó un HMAC-SHA256 calculado con el secreto de prueba leído por nombre de variable de entorno.
- #174 `kronos_accessibility_compliance_checker` encontró 4 problemas e informó contraste `4.48:1` frente al mínimo AA `4.5:1`.

## Evidencia 5: ensayo oficial de publicación (histórico, configuración pública)

Este ensayo se ejecutó antes de fijar la decisión de privacidad. Sirve para acreditar que npm aceptaba la estructura del tarball; **no debe repetirse como paso de publicación actual**. Comando ejecutado entonces:

```sh
npm publish --dry-run --access public
```

Resultado:

```text
# tests 91
# pass 91
# fail 0
npm notice package: kronos-mcp@0.3.0
npm notice filename: kronos-mcp-0.3.0.tgz
npm notice package size: 190.6 kB
npm notice total files: 125
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)
+ kronos-mcp@0.3.0
EXIT_STATUS=0
```

`npm view kronos-mcp` devolvió `E404` en el momento de esta verificación, lo que indica que el nombre no aparecía registrado. Eso no reserva el nombre ni sustituye la confirmación final del registro al publicar.

## Pendiente para publicarlo como privado en npm

Con el nombre actual, la publicación está intencionadamente bloqueada. npm exige que un paquete privado tenga ámbito; `kronos-mcp`, sin ámbito, solo podría ser público. El propietario debe confirmar si el ámbito será su usuario npm o una organización npm.

Cuando ese ámbito y la cuenta con paquetes privados existan, el procedimiento será:

1. Renombrar el paquete a `@ambito/kronos-mcp` y sincronizar `package-lock.json`.
2. Retirar `"private": true` y fijar `"publishConfig": { "access": "restricted" }`.
3. Ejecutar `npm test`, `npm run verify:tarball` y `npm publish --dry-run` sin `--access public`.
4. Desde la máquina del propietario, ejecutar `npm login`, comprobar `npm whoami` y publicar con `npm publish`.
5. Comprobar con una sesión autorizada que solo las cuentas/equipos con permiso pueden ver e instalar el paquete.

`npm whoami` en este sandbox devuelve `ENEEDAUTH`, por eso no se ejecutó ninguna publicación real aquí. La autenticación puede exigir navegador, passkey o 2FA según la cuenta. Nunca compartas la contraseña ni un token por chat.

Recomendación operativa: fusionar el PR y etiquetar `v0.3.0` antes de la primera publicación privada, para que el tarball y el código sean trazables.
