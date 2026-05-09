const PROBABILISTIC_KEYWORDS = [
  "async",
  "race",
  "distributed",
  "eventual consistency",
  "timing",
  "concurrency",
  "replica",
  "queue",
  "stream"
];

const RESILIENCE_KEYWORDS = [
  "network",
  "external",
  "third-party",
  "retry",
  "fallback",
  "degrade",
  "timeout",
  "latency",
  "io",
  "rate limit"
];

export class ModeClassifier {
  classify(task = {}) {
    if (task.modeHint) {
      return {
        mode: task.modeHint,
        reason: task.modeReason ?? `explicit mode hint: ${task.modeHint}`,
        evidence: [
          {
            source: "task.modeHint",
            value: task.modeHint
          }
        ]
      };
    }

    const evidence = collectEvidence(task);
    if (evidence.resilience.length > 0) {
      return {
        mode: "resilience",
        reason: "external unreliability or recovery semantics were explicitly requested",
        evidence: evidence.resilience
      };
    }

    if (evidence.probabilistic.length > 0) {
      return {
        mode: "probabilistic",
        reason: "multi-cause or timing-sensitive evidence was detected in the task payload",
        evidence: evidence.probabilistic
      };
    }

    return {
      mode: "deterministic",
      reason: "no distributed, timing-sensitive, or resilience evidence was supplied",
      evidence: [
        {
          source: "default",
          value: "deterministic start"
        }
      ]
    };
  }
}

function collectEvidence(task) {
  const resilience = [];
  const probabilistic = [];

  const taskStrings = [
    task.goal,
    task.objective,
    task.description,
    ...(Array.isArray(task.hints) ? task.hints : []),
    ...(Array.isArray(task.constraints) ? task.constraints : [])
  ].filter((value) => typeof value === "string");

  for (const value of taskStrings) {
    const normalized = value.toLowerCase();

    for (const keyword of RESILIENCE_KEYWORDS) {
      if (normalized.includes(keyword)) {
        resilience.push({
          source: "task-text",
          value,
          keyword
        });
      }
    }

    for (const keyword of PROBABILISTIC_KEYWORDS) {
      if (normalized.includes(keyword)) {
        probabilistic.push({
          source: "task-text",
          value,
          keyword
        });
      }
    }
  }

  const steps = Array.isArray(task.steps)
    ? task.steps
    : Array.isArray(task.nodes)
      ? task.nodes
      : [];

  for (const step of steps) {
    const labels = [step.goal, step.description, step?.action?.type]
      .filter((value) => typeof value === "string")
      .map((value) => value.toLowerCase());

    if (labels.some((value) => value.includes("retry") || value.includes("fallback") || value.includes("degrade"))) {
      resilience.push({
        source: "step",
        value: step.id ?? step.goal ?? "unnamed-step"
      });
    }
  }

  return {
    probabilistic: dedupeEvidence(probabilistic),
    resilience: dedupeEvidence(resilience)
  };
}

function dedupeEvidence(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
