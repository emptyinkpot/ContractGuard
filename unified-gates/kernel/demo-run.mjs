import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ExecutionKernel } from "./core/execution-kernel.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const taskPath = path.join(__dirname, "examples", "sequential-task.json");
const task = JSON.parse(fs.readFileSync(taskPath, "utf8"));

const kernel = new ExecutionKernel();

const result = await kernel.run(task, {
  runtimeEnvelope: {
    filesystem: "workspace-write",
    network: "enabled"
  }
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
