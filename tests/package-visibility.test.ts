import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type PackageManifest = {
  name: string;
  private?: boolean;
  publishConfig?: {
    access?: string;
  };
};

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageManifest;

test("el paquete no puede publicarse como público por accidente", () => {
  assert.notEqual(manifest.publishConfig?.access, "public");

  if (!manifest.name.startsWith("@")) {
    // npm solo permite paquetes privados con ámbito (@usuario o @organización).
    // Mientras el nombre siga sin ámbito, `private: true` debe bloquear publish.
    assert.equal(manifest.private, true);
    return;
  }

  // Estado válido cuando ya exista un ámbito npm del propietario:
  // puede seguir bloqueado o estar preparado expresamente como restringido,
  // pero nunca debe quedar configurado para acceso público.
  assert.ok(
    manifest.private === true || manifest.publishConfig?.access === "restricted",
    "un paquete con ámbito debe estar bloqueado o configurado como restricted",
  );
});
