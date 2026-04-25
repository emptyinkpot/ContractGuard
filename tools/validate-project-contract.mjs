import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validate(schemaNode, value, currentPath, errors) {
  if (!schemaNode) return;

  if (schemaNode.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push(`${currentPath} should be object`);
      return;
    }

    for (const key of schemaNode.required || []) {
      if (!(key in value)) {
        errors.push(`${currentPath}.${key} is required`);
      }
    }

    for (const [key, child] of Object.entries(schemaNode.properties || {})) {
      if (key in value) {
        validate(child, value[key], `${currentPath}.${key}`, errors);
      }
    }

    return;
  }

  if (schemaNode.type === "string") {
    if (typeof value !== "string") {
      errors.push(`${currentPath} should be string`);
      return;
    }

    if (schemaNode.const !== undefined && value !== schemaNode.const) {
      errors.push(`${currentPath} should equal ${schemaNode.const}`);
    }

    if (schemaNode.minLength !== undefined && value.length < schemaNode.minLength) {
      errors.push(`${currentPath} minLength ${schemaNode.minLength}`);
    }

    if (schemaNode.pattern && !(new RegExp(schemaNode.pattern).test(value))) {
      errors.push(`${currentPath} does not match ${schemaNode.pattern}`);
    }

    if (schemaNode.enum && !schemaNode.enum.includes(value)) {
      errors.push(`${currentPath} must be one of ${schemaNode.enum.join(", ")}`);
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const targetArg = process.argv[2] || "project.json";
const targetPath = path.resolve(repoRoot, targetArg);
const schemaPath = path.resolve(repoRoot, "templates", "project-contract", "project.schema.json");
const schema = readJson(schemaPath);
const doc = readJson(targetPath);
const errors = [];
validate(schema, doc, "project", errors);

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, targetPath, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  targetPath,
  projectName: doc.projectName,
  machineReadableEntry: doc.machineReadableEntry,
  status: doc.status,
}, null, 2));
