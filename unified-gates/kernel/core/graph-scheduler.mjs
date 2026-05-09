export class GraphScheduler {
  ready(graph) {
    return (graph.nodes ?? []).filter((node) => {
      if (node.status !== "pending") {
        return false;
      }

      const deps = node.dependencies ?? [];
      return deps.every((depId) => {
        const dep = (graph.nodes ?? []).find((candidate) => candidate.id === depId);
        return dep?.status === "done";
      });
    });
  }

  async execute(nodes, runtime = {}) {
    const executeNode =
      runtime.executeNode ??
      (async (node) => ({
        nodeId: node.id,
        status: "done",
        outputs: await this.runBuiltinAction(node)
      }));

    return Promise.all(
      nodes.map(async (node) => {
        node.status = "running";

        try {
          const result = await executeNode(node);
          return {
            nodeId: node.id,
            status: result?.status ?? "done",
            outputs: result?.outputs ?? {}
          };
        } catch (error) {
          return {
            nodeId: node.id,
            status: "failed",
            outputs: {
              error: error instanceof Error ? error.message : String(error)
            }
          };
        }
      })
    );
  }

  commit(graph, results) {
    for (const result of results) {
      const node = (graph.nodes ?? []).find((candidate) => candidate.id === result.nodeId);
      if (!node) {
        continue;
      }
      node.outputs = result.outputs ?? {};
      node.status = result.status ?? "done";
    }

    graph.state = this.deriveGraphState(graph);
    return graph;
  }

  deriveGraphState(graph) {
    const nodes = graph.nodes ?? [];
    if (nodes.length === 0) {
      return "DONE";
    }
    if (nodes.some((node) => node.status === "failed")) {
      return "FAILED";
    }
    if (nodes.some((node) => node.status === "blocked")) {
      return "BLOCKED";
    }
    if (nodes.every((node) => node.status === "done")) {
      return "DONE";
    }
    if (nodes.some((node) => node.status === "running")) {
      return "RUNNING";
    }
    return "SCHEDULED";
  }

  async runBuiltinAction(node) {
    const type = node?.action?.type;
    const spec = node?.action?.spec ?? {};

    if (type === "transform") {
      return {
        transformed: spec.value ?? node.inputs ?? {}
      };
    }

    if (type === "inspect") {
      return {
        inspected: spec.value ?? node.goal
      };
    }

    if (type === "tool") {
      return {
        toolResult: spec
      };
    }

    if (type === "llm") {
      return {
        llmResult: spec.prompt ?? node.goal
      };
    }

    return {
      noop: true
    };
  }
}
