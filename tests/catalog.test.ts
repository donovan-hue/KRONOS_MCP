import test from "node:test";
import assert from "node:assert/strict";
import { TOOLS_180, catalogEntry, catalogByName, catalogFamily, CORE_TOOL_NAMES } from "../src/catalog/index.js";
import { ALL_LOCAL_TOOLS, FAMILIES } from "../src/families/index.js";
import { localTool, toolAnnotations, toolContractSchema } from "../src/contracts/tool.js";

test("catálogo maestro: exactamente 180 herramientas en 18 familias de 10", () => {
  assert.equal(TOOLS_180.length, 180);
  for (let family = 1; family <= 18; family += 1) {
    const id = String(family).padStart(2, "0");
    assert.equal(catalogFamily(id).length, 10, `familia ${id}`);
  }
});

test("números, nombres MCP y apodos son únicos y válidos", () => {
  assert.equal(new Set(TOOLS_180.map((e) => e.number)).size, 180);
  assert.equal(new Set(TOOLS_180.map((e) => e.name)).size, 180);
  assert.equal(new Set(TOOLS_180.map((e) => e.nickname)).size, 180);
  for (const entrada of TOOLS_180) {
    assert.match(entrada.name, /^kronos_[a-z0-9_]{1,57}$/);
    assert.ok(!CORE_TOOL_NAMES.includes(entrada.name as typeof CORE_TOOL_NAMES[number]));
    assert.ok(entrada.description.length > 0);
    assert.ok(entrada.technicalName.length > 0);
  }
});

test("cada entrada del catálogo tiene exactamente una definición implementada", () => {
  assert.equal(ALL_LOCAL_TOOLS.length, 180);
  assert.equal(FAMILIES.length, 18);
  assert.ok(FAMILIES.every((family) => family.length === 10));
  const byNumber = new Map(ALL_LOCAL_TOOLS.map((def) => [def.number, def]));
  for (const entrada of TOOLS_180) {
    const def = byNumber.get(entrada.number);
    assert.ok(def, `sin definición: ${entrada.number} ${entrada.name}`);
    assert.ok(def!.inputSchema, `sin esquema: ${entrada.name}`);
    assert.ok(def!.example && typeof def!.example === "object", `sin ejemplo: ${entrada.name}`);
  }
  assert.equal(catalogEntry(52).name, "kronos_secret_exposure_scanner");
  assert.equal(catalogEntry(52).nickname, "Bóveda");
  assert.equal(catalogByName("kronos_intelligent_tool_router")?.nickname, "Brújula");
});

test("localTool produce contratos válidos y anota estado correctamente", () => {
  const pure = localTool({ name: "kronos_demo_pure", description: "x", capability: "testing" });
  const stateful = localTool({ name: "kronos_demo_state", description: "x", capability: "data", stateful: true });
  assert.deepEqual(toolAnnotations(pure), { readOnlyHint: true, destructiveHint: false, openWorldHint: false });
  assert.deepEqual(toolAnnotations(stateful), { readOnlyHint: false, destructiveHint: false, openWorldHint: false });
  assert.equal(toolContractSchema.parse(pure).name, "kronos_demo_pure");
  assert.equal(toolContractSchema.parse(stateful).name, "kronos_demo_state");
});
