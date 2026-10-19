# Evidencia de implementación y preparación para npm — kronos-mcp 0.3.0

Fecha de verificación: 2026-10-19  
Entorno: Node.js v22.22.3, npm 10.9.8  
Paquete: `kronos-mcp@0.3.0`

## Veredicto corto

- Las 180 herramientas existen como código ejecutable, no solo como nombres del catálogo.
- La instalación desde el tarball generado por npm funciona en un proyecto consumidor vacío.
- Desde ese consumidor, los binarios instalados enumeraron 184 herramientas y ejecutaron correctamente las 180 herramientas locales.
- `npm publish --dry-run --access public` terminó con código de salida 0.
- La publicación real todavía requiere iniciar sesión en npm desde una máquina del propietario (`npm login`); este sandbox no tiene una cuenta npm autenticada. No se debe pegar ningún token o contraseña en un chat.

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

## Evidencia 5: ensayo oficial de publicación

Comando ejecutado:

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

## Lo único pendiente para publicar de verdad

En una máquina del propietario, desde un árbol limpio y revisado:

```sh
npm login
npm whoami
npm publish --access public
npm view kronos-mcp version
npx -y kronos-mcp
```

`npm whoami` en este sandbox devuelve `ENEEDAUTH`, por eso no se ejecutó la publicación real aquí. La autenticación puede exigir navegador, passkey o 2FA según la cuenta. Nunca compartas la contraseña ni un token por chat.

Recomendación operativa: fusionar el PR, etiquetar `v0.3.0` y publicar desde esa etiqueta para que el tarball y el código público sean trazables.
