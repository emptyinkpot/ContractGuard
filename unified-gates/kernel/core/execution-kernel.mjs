import { ModeClassifier } from "./mode-classifier.mjs";
import { ConstraintResolver } from "./constraint-resolver.mjs";
import { PlanCompiler } from "./plan-compiler.mjs";
import { GraphScheduler } from "./graph-scheduler.mjs";
import { CheckpointStore } from "./checkpoint-store.mjs";
import { ObservabilityTrace } from "./observability-trace.mjs";

export class ExecutionKernel {
  constructor({
    classifier = new ModeClassifier(),
    constraints = new ConstraintResolver(),
    planner = new PlanCompiler(),
    scheduler = new GraphScheduler(),
    checkpoints = new CheckpointStore(),
    trace = new ObservabilityTrace()
  } = {}) {
    this.classifier = classifier;
    this.constraints = constraints;
    this.planner = planner;
    this.scheduler = scheduler;
    this.checkpoints = checkpoints;
    this.trace = trace;
  }

  initialize(task, runtimeEnvelope = {}) {
    const classification = this.classifier.classify(task);
    const resolved = this.constraints.resolve(runtimeEnvelope, task);
    const graph = this.planner.compile(task, classification.mode, resolved);
    this.assertPathLock(graph);

    graph.state = "CLASSIFIED";
    graph.state = "PLANNED";

    return {
      classification,
      resolved,
      graph
    };
  }

  readyBatch(graph) {
    return this.scheduler.ready(graph);
  }

  async run(task, options = {}) {
    const { runtimeEnvelope = {}, executeNode } = options;
    const initialized = this.initialize(task, runtimeEnvelope);
    const graph = initialized.graph;
    const events = [];

    graph.state = "SCHEDULED";
    events.push(
      this.trace.emit({
        graphId: graph.id,
        decision: "initialize",
        reasonCode: "mode-classification",
        reason: initialized.classification.reason
      })
    );

    while (true) {
      this.assertPathLock(graph);
      const batch = this.readyBatch(graph);
      const selectedIds = new Set(batch.map((node) => node.id));
      events.push(...this.traceBatchSelection(graph, batch));
      events.push(...this.traceBatchRejections(graph, selectedIds));

      if (batch.length === 0) {
        graph.state = this.scheduler.deriveGraphState(graph);
        if (["DONE", "FAILED", "BLOCKED"].includes(graph.state)) {
          break;
        }
        graph.state = "BLOCKED";
        events.push(
          this.trace.emit({
            graphId: graph.id,
            decision: "blocked",
            reasonCode: "no-ready-nodes",
            reason: "no ready nodes and graph not terminal"
          })
        );
        break;
      }

      events.push(
        this.trace.emit({
          graphId: graph.id,
          decision: "schedule-batch",
          reasonCode: "ready-batch",
          readyCount: batch.length
        })
      );

      graph.state = "RUNNING";
      const results = await this.scheduler.execute(batch, { executeNode });
      graph.state = "VALIDATING";

      const committed = this.commit(graph, results);
      events.push(...committed.nodeTraceEvents, committed.traceEvent);

      if (["DONE", "FAILED", "BLOCKED"].includes(committed.graph.state)) {
        break;
      }

      committed.graph.state = "SCHEDULED";
    }

    const latestCheckpoint = this.checkpoints.loadLatest(graph.id);

    return {
      classification: initialized.classification,
      constraints: initialized.resolved,
      graph,
      executionState: this.deriveExecutionState(graph, latestCheckpoint?.checkpointId ?? null),
      latestCheckpoint,
      checkpoints: [...this.checkpoints.snapshots],
      trace: [...events]
    };
  }

  commit(graph, results) {
    this.assertPathLock(graph);
    const nextGraph = this.scheduler.commit(graph, results);
    this.assertPathLock(nextGraph);
    const snapshot = this.checkpoints.checkpoint(nextGraph, `trace-${this.trace.all().length + 1}`);
    const nodeTraceEvents = results.map((result) =>
      this.trace.emit({
        graphId: nextGraph.id,
        decision: "committed",
        nodeId: result.nodeId,
        status: result.status ?? "done",
        reasonCode: "checkpoint-commit",
        reason: snapshot.checkpointId
      })
    );
    const traceEvent = this.trace.emit({
      graphId: nextGraph.id,
      decision: "commit",
      readyCount: this.readyBatch(nextGraph).length,
      reasonCode: "checkpoint-commit",
      reason: snapshot.checkpointId
    });

    return {
      graph: nextGraph,
      executionState: this.deriveExecutionState(nextGraph, snapshot.checkpointId),
      snapshot,
      nodeTraceEvents,
      traceEvent
    };
  }

  traceBatchSelection(graph, batch) {
    return batch.map((node) =>
      this.trace.emit({
        graphId: graph.id,
        decision: "selected",
        nodeId: node.id,
        status: node.status,
        reasonCode: "dependencies-resolved",
        reason: "all dependencies resolved"
      })
    );
  }

  traceBatchRejections(graph, selectedIds) {
    return (graph.nodes ?? [])
      .filter((node) => !selectedIds.has(node.id))
      .map((node) => {
        const unresolved = (node.dependencies ?? []).filter((depId) => {
          const dependency = (graph.nodes ?? []).find((candidate) => candidate.id === depId);
          return dependency?.status !== "done";
        });

        const classifiedReason = classifyRejectedReason(node, unresolved);
        return this.trace.emit({
          graphId: graph.id,
          decision: "rejected",
          nodeId: node.id,
          status: node.status,
          reasonCode: classifiedReason.code,
          reason: classifiedReason.detail
        });
      });
  }

  deriveExecutionState(graph, cursor = null) {
    return {
      graphId: graph.id,
      state: graph.state,
      cursor: cursor ?? `${graph.id}:${graph.state}`
    };
  }

  assertPathLock(graph) {
    const pathLock = graph?.pathLock;
    if (!pathLock || pathLock.locked !== true) {
      throw new Error("strict scheduler requires a locked path");
    }
    if (pathLock.pathMode !== "immutable") {
      throw new Error("strict scheduler requires immutable path mode");
    }
    if (pathLock.retryPolicy !== "same-path-only") {
      throw new Error("strict scheduler requires same-path-only retry policy");
    }
    if (pathLock.fallbackPolicy !== "disabled") {
      throw new Error("strict scheduler forbids fallback policy");
    }
    if (pathLock.compatibilityPolicy !== "disabled") {
      throw new Error("strict scheduler forbids compatibility policy");
    }
    if (pathLock.hotfixPolicy !== "disabled") {
      throw new Error("strict scheduler forbids hotfix policy");
    }
  }
}

function classifyRejectedReason(node, unresolvedDependencies) {
  if (node.status === "done" || node.status === "failed" || node.status === "blocked") {
    return {
      code: "already-terminal",
      detail: `node already terminal: ${node.status}`
    };
  }

  if (node.status !== "pending") {
    return {
      code: "not-pending",
      detail: `node status is ${node.status}`
    };
  }

  if (unresolvedDependencies.length > 0) {
    return {
      code: "dependency-wait",
      detail: `unresolved dependencies: ${unresolvedDependencies.join(", ")}`
    };
  }

  return {
    code: "not-pending",
    detail: "node not ready in current cycle"
  };
}
