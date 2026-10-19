import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

function refuse(message) {
  console.error(`Publicación npm bloqueada: ${message}`);
  process.exit(1);
}

if (manifest.publishConfig?.access === "public") {
  refuse("publishConfig.access está configurado como public.");
}

if (manifest.private === true) {
  refuse(
    "package.json contiene \"private\": true. Define primero el ámbito npm del propietario y prepara el paquete como restricted.",
  );
}

if (!/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(manifest.name)) {
  refuse(
    `el nombre ${JSON.stringify(manifest.name)} no tiene ámbito; npm no permite paquetes privados sin @usuario u @organización.`,
  );
}

if (manifest.publishConfig?.access !== "restricted") {
  refuse("publishConfig.access debe ser exactamente \"restricted\".");
}

console.log(`Visibilidad npm comprobada: ${manifest.name} (restricted).`);
