export class ConstraintResolver {
  resolve(runtimeEnvelope = {}, task = {}) {
    const taskConstraints = normalizeConstraintList(task.constraints ?? []);
    const runtimeConstraints = deriveRuntimeConstraints(runtimeEnvelope);
    const requestedCapabilities = deriveRequestedCapabilities(task);

    return {
      runtimeEnvelope,
      taskConstraints,
      runtimeConstraints,
      requestedCapabilities,
      writable: runtimeEnvelope.filesystem ?? "unknown",
      network: runtimeEnvelope.network ?? "unknown"
    };
  }
}

function normalizeConstraintList(constraints) {
  if (Array.isArray(constraints)) {
    return constraints
      .filter((value) => typeof value === "string" && value.length > 0)
      .map((value) => ({
        id: toConstraintId(value),
        source: "task.constraints",
        value
      }));
  }

  if (constraints && typeof constraints === "object") {
    return Object.entries(constraints)
      .filter(([key]) => typeof key === "string" && key.length > 0)
      .map(([key, value]) => ({
        id: toConstraintId(key),
        source: `task.constraints.${key}`,
        value
      }));
  }

  return [];
}

function deriveRuntimeConstraints(runtimeEnvelope) {
  return [
    {
      id: "filesystem",
      source: "runtimeEnvelope.filesystem",
      value: runtimeEnvelope.filesystem ?? "unknown"
    },
    {
      id: "network",
      source: "runtimeEnvelope.network",
      value: runtimeEnvelope.network ?? "unknown"
    }
  ];
}

function deriveRequestedCapabilities(task) {
  const steps = Array.isArray(task.steps)
    ? task.steps
    : Array.isArray(task.nodes)
      ? task.nodes
      : [];

  const capabilities = [];
  for (const step of steps) {
    const actionType = step?.action?.type ?? "inspect";
    capabilities.push({
      id: `action-${actionType}`,
      source: step.id ?? step.goal ?? "unnamed-step",
      value: actionType
    });
  }

  if (task.modeHint) {
    capabilities.push({
      id: `mode-${task.modeHint}`,
      source: "task.modeHint",
      value: task.modeHint
    });
  }

  return dedupeCapabilities(capabilities);
}

function dedupeCapabilities(capabilities) {
  const seen = new Set();
  return capabilities.filter((capability) => {
    const key = `${capability.id}:${capability.source}:${capability.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function toConstraintId(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
