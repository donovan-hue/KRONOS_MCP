/** Grafos de dependencias: validación, orden topológico, niveles paralelos y ruta crítica. */

export interface GraphTask {
  id: string;
  dependsOn?: string[];
  duration?: number;
}

export interface GraphAnalysis {
  valid: boolean;
  unknownDependencies: { task: string; dependency: string }[];
  duplicates: string[];
  cycle: string[] | null;
  /** Orden topológico estable (respeta el orden de entrada cuando puede). */
  order: string[];
  /** Lotes ejecutables en paralelo, en orden. */
  levels: string[][];
  criticalPath: { path: string[]; duration: number };
  totalSerialDuration: number;
  dependents: Record<string, string[]>;
}

const MAX_GRAPH_DEPTH = 1000; // §2.8 prevenir desbordamiento de pila recursiva
function findCycle(tasks: Map<string, GraphTask>): string[] | null {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string, depth = 0): string[] | null => {
    if (depth > MAX_GRAPH_DEPTH) throw new Error("GRAPH_TOO_DEEP");
    state.set(id, "visiting");
    stack.push(id);
    for (const dep of tasks.get(id)?.dependsOn ?? []) {
      if (!tasks.has(dep)) continue;
      if (state.get(dep) === "visiting") return [...stack.slice(stack.indexOf(dep)), dep];
      if (!state.has(dep)) {
        const found = visit(dep, depth + 1);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };
  for (const id of tasks.keys()) {
    if (!state.has(id)) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

export function analyzeGraph(input: readonly GraphTask[]): GraphAnalysis {
  const tasks = new Map<string, GraphTask>();
  const duplicates: string[] = [];
  for (const t of input) {
    if (tasks.has(t.id)) duplicates.push(t.id);
    else tasks.set(t.id, t);
  }
  const unknownDependencies: { task: string; dependency: string }[] = [];
  const dependents: Record<string, string[]> = {};
  for (const t of tasks.values()) dependents[t.id] = [];
  for (const t of tasks.values()) {
    for (const dep of t.dependsOn ?? []) {
      if (!tasks.has(dep)) unknownDependencies.push({ task: t.id, dependency: dep });
      else dependents[dep].push(t.id);
    }
  }
  const cycle = findCycle(tasks);

  // Kahn estable por nivel
  const indegree = new Map<string, number>();
  for (const t of tasks.values()) {
    indegree.set(t.id, (t.dependsOn ?? []).filter((d) => tasks.has(d)).length);
  }
  const inputOrder = [...tasks.keys()];
  const levels: string[][] = [];
  const done = new Set<string>();
  while (done.size < tasks.size) {
    const level = inputOrder.filter((id) => !done.has(id) && (indegree.get(id) ?? 0) === 0);
    if (level.length === 0) break; // ciclo: no hay más avance posible
    levels.push(level);
    for (const id of level) {
      done.add(id);
      for (const dep of dependents[id]) indegree.set(dep, (indegree.get(dep) ?? 0) - 1);
    }
  }
  const order = levels.flat();

  // Ruta crítica por programación dinámica sobre el orden topológico
  const longest = new Map<string, { total: number; path: string[] }>();
  for (const id of order) {
    const task = tasks.get(id)!;
    let best: { total: number; path: string[] } = { total: 0, path: [] };
    for (const dep of task.dependsOn ?? []) {
      const prev = longest.get(dep);
      if (prev && prev.total > best.total) best = prev;
    }
    longest.set(id, { total: best.total + (task.duration ?? 1), path: [...best.path, id] });
  }
  let critical = { path: [] as string[], duration: 0 };
  for (const v of longest.values()) {
    if (v.total > critical.duration) critical = { path: v.path, duration: v.total };
  }

  return {
    valid: cycle === null && unknownDependencies.length === 0 && duplicates.length === 0,
    unknownDependencies,
    duplicates,
    cycle,
    order,
    levels,
    criticalPath: critical,
    totalSerialDuration: [...tasks.values()].reduce((acc, t) => acc + (t.duration ?? 1), 0),
    dependents,
  };
}

export function connectedComponents(
  nodes: readonly string[],
  edges: readonly { from: string; to: string }[],
): string[][] {
  const adjacency = new Map<string, Set<string>>(nodes.map((n) => [n, new Set<string>()]));
  for (const e of edges) {
    adjacency.get(e.from)?.add(e.to);
    adjacency.get(e.to)?.add(e.from);
  }
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const node of nodes) {
    if (seen.has(node)) continue;
    const component: string[] = [];
    const queue = [node];
    seen.add(node);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    components.push(component);
  }
  return components;
}
