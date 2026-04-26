import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_POLICY_PATH = path.join(__dirname, "policy", "task-pipeline-policy.json");

export function getDefaultPolicyPath() {
  return DEFAULT_POLICY_PATH;
}

export function loadTaskPipelinePolicy(policyPath = DEFAULT_POLICY_PATH) {
  const absolutePath = path.resolve(policyPath);
  const policy = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  return {
    absolutePath,
    policy,
  };
}
