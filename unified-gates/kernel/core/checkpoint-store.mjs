import fs from "node:fs";
import path from "node:path";

export class CheckpointStore {
  constructor(options = {}) {
    this.snapshots = [];
    this.root = options.root ?? path.resolve(process.cwd(), ".execution-kernel-checkpoints");
  }

  checkpoint(graph, traceCursor = null) {
    const checkpointId = this.nextCheckpointId(graph.id);
    const snapshot = {
      schemaVersion: "1.0.0",
      graphId: graph.id,
      checkpointId,
      createdAt: new Date().toISOString(),
      traceCursor,
      mode: graph.mode ?? null,
      constraints: structuredClone(graph.constraints ?? {}),
      pathLock: structuredClone(graph.pathLock ?? null),
      state: graph.state ?? null,
      objective: graph.objective ?? null,
      nodes: structuredClone(graph.nodes ?? []),
      edges: structuredClone(graph.edges ?? [])
    };

    this.snapshots.push(snapshot);
    this.persist(snapshot);
    return snapshot;
  }

  persist(snapshot) {
    fs.mkdirSync(this.root, { recursive: true });
    const target = path.join(this.root, `${snapshot.checkpointId}.json`);
    fs.writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return target;
  }

  loadLatest(graphId) {
    const files = this.listCheckpointFiles(graphId);
    if (files.length === 0) {
      return null;
    }

    const latest = files.sort().at(-1);
    return JSON.parse(fs.readFileSync(latest, "utf8"));
  }

  restoreGraph(snapshot) {
    if (!snapshot) {
      return null;
    }

    return {
      id: snapshot.graphId,
      mode: snapshot.mode ?? "deterministic",
      constraints: structuredClone(snapshot.constraints ?? {}),
      pathLock: structuredClone(snapshot.pathLock ?? null),
      objective: snapshot.objective ?? null,
      nodes: structuredClone(snapshot.nodes ?? []),
      edges: structuredClone(snapshot.edges ?? []),
      state: snapshot.state ?? "PLANNED"
    };
  }

  listCheckpointFiles(graphId) {
    if (!fs.existsSync(this.root)) {
      return [];
    }

    return fs
      .readdirSync(this.root)
      .filter((file) => file.startsWith(`${graphId}-`) && file.endsWith(".json"))
      .map((file) => path.join(this.root, file));
  }

  nextCheckpointId(graphId) {
    const sequences = this.listCheckpointFiles(graphId)
      .map((file) => path.basename(file, ".json"))
      .map((name) => Number.parseInt(name.split("-").at(-1), 10))
      .filter((value) => Number.isInteger(value));

    const inMemorySequences = this.snapshots
      .filter((snapshot) => snapshot.graphId === graphId)
      .map((snapshot) => Number.parseInt(snapshot.checkpointId.split("-").at(-1), 10))
      .filter((value) => Number.isInteger(value));

    const nextSequence = Math.max(0, ...sequences, ...inMemorySequences) + 1;
    return `${graphId}-${String(nextSequence).padStart(4, "0")}`;
  }
}
