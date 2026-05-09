import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ExecutionKernel } from "./core/execution-kernel.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaDir = path.join(__dirname, "contracts");
const examplesDir = path.join(__dirname, "examples");

const executionGraphSchema = readJson(path.join(schemaDir, "execution-graph.schema.json"));
const checkpointSchema = readJson(path.join(schemaDir, "checkpoint.schema.json"));
const traceEventSchema = readJson(path.join(schemaDir, "trace-event.schema.json"));
const executionStateSchema = readJson(path.join(schemaDir, "execution-state.schema.json"));

const explicitGraph = readJson(path.join(examplesDir, "explicit-graph.json"));
const sequentialTask = readJson(path.join(examplesDir, "sequential-task.json"));

validateAgainstSchema(executionGraphSchema, explicitGraph, "examples/explicit-graph.json");

const kernel = new ExecutionKernel();
const result = await kernel.run(sequentialTask, {
  runtimeEnvelope: {
    filesystem: "workspace-write",
    network: "enabled"
  }
});

validateAgainstSchema(executionGraphSchema, result.graph, "run-result.graph");
validateAgainstSchema(checkpointSchema, result.latestCheckpoint, "run-result.latestCheckpoint");
validateAgainstSchema(
  executionStateSchema,
  result.executionState,
  "run-result.executionState"
);

for (let index = 0; index < result.trace.length; index += 1) {
  validateAgainstSchema(traceEventSchema, result.trace[index], `run-result.trace[${index}]`);
}

const restoredGraph = kernel.checkpoints.restoreGraph(result.latestCheckpoint);
validateAgainstSchema(executionGraphSchema, restoredGraph, "run-result.restoredGraph");
assertRestoreContract(result.latestCheckpoint, restoredGraph);

const explicitKernel = new ExecutionKernel();
const explicitResult = await explicitKernel.run(explicitGraph, {
  runtimeEnvelope: {
    filesystem: "workspace-write",
    network: "enabled"
  }
});

validateAgainstSchema(executionGraphSchema, explicitResult.graph, "explicit-run.graph");
validateAgainstSchema(checkpointSchema, explicitResult.latestCheckpoint, "explicit-run.latestCheckpoint");

for (let index = 0; index < explicitResult.trace.length; index += 1) {
  validateAgainstSchema(traceEventSchema, explicitResult.trace[index], `explicit-run.trace[${index}]`);
}

const explicitRestoredGraph = explicitKernel.checkpoints.restoreGraph(explicitResult.latestCheckpoint);
validateAgainstSchema(executionGraphSchema, explicitRestoredGraph, "explicit-run.restoredGraph");
assertRestoreContract(explicitResult.latestCheckpoint, explicitRestoredGraph);
validateAgainstSchema(executionStateSchema, explicitResult.executionState, "explicit-run.executionState");
assertExplicitGraphTransition(explicitResult.trace);

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    traceEvents: result.trace.length,
    explicitTraceEvents: explicitResult.trace.length,
    executionStateCursor: result.executionState.cursor,
    explicitExecutionStateCursor: explicitResult.executionState.cursor,
    restoredGraphId: restoredGraph.id,
    restoredState: restoredGraph.state,
    explicitRestoredGraphId: explicitRestoredGraph.id,
    explicitRestoredState: explicitRestoredGraph.state
  }, null, 2)}\n`
);

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function validateAgainstSchema(schema, value, label) {
  validateNode(schema, value, label);
}

function assertRestoreContract(snapshot, restoredGraph) {
  if (!snapshot) {
    throw new Error("restoreGraph requires a checkpoint snapshot");
  }

  assertEqual(restoredGraph.id, snapshot.graphId, "restoredGraph.id");
  assertEqual(restoredGraph.mode, snapshot.mode, "restoredGraph.mode");
  assertEqual(restoredGraph.objective, snapshot.objective, "restoredGraph.objective");
  assertEqual(restoredGraph.state, snapshot.state, "restoredGraph.state");
  assertJsonEqual(restoredGraph.constraints, snapshot.constraints, "restoredGraph.constraints");
  assertJsonEqual(restoredGraph.pathLock, snapshot.pathLock, "restoredGraph.pathLock");
  assertJsonEqual(restoredGraph.nodes, snapshot.nodes, "restoredGraph.nodes");
  assertJsonEqual(restoredGraph.edges, snapshot.edges, "restoredGraph.edges");
}

function assertExplicitGraphTransition(trace) {
  const dependencyWait = trace.find((event) =>
    event.decision === "rejected" &&
    event.nodeId === "emit-report" &&
    event.reasonCode === "dependency-wait"
  );

  const committed = trace.find((event) =>
    event.decision === "committed" &&
    event.nodeId === "emit-report"
  );

  if (!dependencyWait) {
    throw new Error("explicit graph must reject emit-report with dependency-wait before commit");
  }

  if (!committed) {
    throw new Error("explicit graph must commit emit-report after dependency wait");
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} mismatch`);
  }
}

function validateNode(schema, value, label) {
  if (schema === true || schema === undefined) {
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    throw new Error(`${label} must equal ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.some((candidate) => candidate === value)) {
    throw new Error(`${label} must be one of ${schema.enum.join(", ")}`);
  }

  if (Array.isArray(schema.type)) {
    const matched = schema.type.some((type) => matchesType(type, value));
    if (!matched) {
      throw new Error(`${label} must match one of types: ${schema.type.join(", ")}`);
    }
  } else if (schema.type && !matchesType(schema.type, value)) {
    throw new Error(`${label} must be type ${schema.type}`);
  }

  if (schema.type === "string" && schema.minLength !== undefined && value.length < schema.minLength) {
    throw new Error(`${label} must have minLength ${schema.minLength}`);
  }

  if (schema.type === "integer") {
    if (!Number.isInteger(value)) {
      throw new Error(`${label} must be an integer`);
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      throw new Error(`${label} must be >= ${schema.minimum}`);
    }
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    for (let index = 0; index < value.length; index += 1) {
      validateNode(schema.items, value[index], `${label}[${index}]`);
    }
  }

  if (isObjectSchema(schema, value)) {
    validateObject(schema, value, label);
  }
}

function validateObject(schema, value, label) {
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  for (const key of required) {
    if (!(key in value)) {
      throw new Error(`${label}.${key} is required`);
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) {
        throw new Error(`${label}.${key} is not allowed`);
      }
    }
  }

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!(key in value)) {
      continue;
    }
    validateNode(propertySchema, value[key], `${label}.${key}`);
  }
}

function isObjectSchema(schema, value) {
  if (value === null || Array.isArray(value)) {
    return false;
  }

  if (schema.type === "object") {
    return true;
  }

  return Array.isArray(schema.type) && schema.type.includes("object");
}

function matchesType(type, value) {
  if (type === "null") {
    return value === null;
  }
  if (type === "array") {
    return Array.isArray(value);
  }
  if (type === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  if (type === "integer") {
    return Number.isInteger(value);
  }
  return typeof value === type;
}
