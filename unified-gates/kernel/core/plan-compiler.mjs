export class PlanCompiler {
  compile(task, mode, constraints) {
    const normalizedTask = this.normalizeTask(task, mode);

    return {
      id: normalizedTask.id,
      mode,
      constraints,
      pathLock: this.buildPathLock(task, normalizedTask.id),
      objective: normalizedTask.objective,
      nodes: normalizedTask.nodes,
      edges: normalizedTask.edges,
      state: "PLANNED"
    };
  }

  normalizeTask(task, mode) {
    if (task && Array.isArray(task.nodes) && Array.isArray(task.edges)) {
      const nodes = task.nodes.map((node, index) => this.normalizeNode(node, index, mode));
      const edges = this.normalizeEdges(task.edges);
      this.applyEdgeDependencies(nodes, edges);

      return {
        id: task.id ?? "graph-1",
        objective: task.objective ?? task.goal ?? "execution graph",
        nodes,
        edges
      };
    }

    if (task && Array.isArray(task.steps) && task.steps.length > 0) {
      const nodes = task.steps.map((step, index) => {
        const previousId = index === 0 ? null : nodeId(task.steps[index - 1], index - 1);
        const dependencies = Array.isArray(step.dependencies)
          ? [...step.dependencies]
          : previousId
            ? [previousId]
            : [];

        return this.normalizeNode(
          {
            ...step,
            dependencies
          },
          index,
          mode
        );
      });

      return {
        id: task.id ?? "graph-1",
        objective: task.objective ?? task.goal ?? "execution graph",
        nodes,
        edges: this.buildEdges(nodes)
      };
    }

    const fallbackNode = this.normalizeNode(
      {
        id: "step-1",
        goal: task?.goal ?? task?.task ?? "inspect task",
        action: task?.action ?? {
          type: "inspect",
          spec: {
            value: task?.task ?? task?.goal ?? "no-op"
          }
        }
      },
      0,
      mode
    );

    return {
      id: task?.id ?? "graph-1",
      objective: task?.objective ?? task?.goal ?? "execution graph",
      nodes: [fallbackNode],
      edges: []
    };
  }

  normalizeNode(node, index, mode) {
    return {
      id: nodeId(node, index),
      mode: node?.mode ?? mode,
      goal: node?.goal ?? `step ${index + 1}`,
      inputs: node?.inputs ?? {},
      outputs: node?.outputs ?? {},
      action: node?.action ?? {
        type: "inspect",
        spec: {
          value: node?.goal ?? `step ${index + 1}`
        }
      },
      dependencies: Array.isArray(node?.dependencies) ? [...node.dependencies] : [],
      status: node?.status ?? "pending"
    };
  }

  normalizeEdges(edges) {
    return edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      type: edge.type ?? "control"
    }));
  }

  applyEdgeDependencies(nodes, edges) {
    for (const edge of edges) {
      if (edge.type !== "control") {
        continue;
      }

      const node = nodes.find((candidate) => candidate.id === edge.to);
      if (!node) {
        continue;
      }

      if (!node.dependencies.includes(edge.from)) {
        node.dependencies.push(edge.from);
      }
    }
  }

  buildEdges(nodes) {
    const edges = [];

    for (const node of nodes) {
      for (const dependency of node.dependencies ?? []) {
        edges.push({
          from: dependency,
          to: node.id,
          type: "control"
        });
      }
    }

    return edges;
  }

  buildPathLock(task, graphId) {
    const source = task?.pathLock ?? {};
    const rawRetries = source.maxRetries ?? task?.maxRetries ?? task?.retryLimit ?? 0;
    const maxRetries = Number.isInteger(rawRetries) && rawRetries >= 0 ? rawRetries : 0;

    return {
      strategyId: source.strategyId ?? task?.strategyId ?? graphId,
      locked: true,
      pathMode: "immutable",
      retryPolicy: "same-path-only",
      maxRetries,
      fallbackPolicy: "disabled",
      compatibilityPolicy: "disabled",
      hotfixPolicy: "disabled"
    };
  }
}

function nodeId(node, index) {
  return node?.id ?? `step-${index + 1}`;
}
