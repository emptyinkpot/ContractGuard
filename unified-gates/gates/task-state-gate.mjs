import fs from "node:fs";

const VALID_STATES = ["PLAN", "APPROVED", "EXECUTE", "VERIFY", "DONE"];

function fail(reason, details = {}) {
  console.error("\n❌ TASK-STATE BLOCKED");
  console.error("REASON:", reason);
  console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

function pass() {
  console.log("✅ TASK-STATE PASSED");
  process.exit(0);
}

function readJsonEnv(name) {
  try {
    return JSON.parse(process.env[name] || "");
  } catch {
    return null;
  }
}

function main() {
  const state = process.env.TASK_STATE;
  const plan = readJsonEnv("TASK_PLAN");
  const objective = process.env.TASK_OBJECTIVE || "";
  const allowExpansion = process.env.TASK_ALLOW_EXPANSION === "true";
  const verification = readJsonEnv("TASK_VERIFICATION");

  if (!state || !VALID_STATES.includes(state)) {
    fail("Missing or invalid TASK_STATE", { state, validStates: VALID_STATES });
  }

  if (!objective.trim()) {
    fail("Missing TASK_OBJECTIVE");
  }

  if (!plan || typeof plan !== "object") {
    fail("Missing TASK_PLAN");
  }

  if (state === "PLAN") {
    if (process.env.TASK_ALLOW_EXECUTION === "true") {
      fail("PLAN state cannot allow execution");
    }
    pass();
    return;
  }

  if (state === "APPROVED") {
    if (plan.approved !== true) {
      fail("APPROVED state requires plan.approved=true");
    }
    pass();
    return;
  }

  if (state === "EXECUTE") {
    if (plan.approved !== true) {
      fail("EXECUTE requires approved plan");
    }
    if (allowExpansion) {
      fail("EXECUTE cannot expand scope");
    }
    if (process.env.TASK_NEW_OBJECTIVE === "true") {
      fail("EXECUTE cannot introduce new objective");
    }
    pass();
    return;
  }

  if (state === "VERIFY") {
    if (!verification || typeof verification !== "object") {
      fail("VERIFY requires TASK_VERIFICATION");
    }
    if (!["passed", "not-needed", "blocked"].includes(verification.status)) {
      fail("Invalid verification status", { status: verification.status });
    }
    pass();
    return;
  }

  if (state === "DONE") {
    if (!verification || typeof verification !== "object") {
      fail("DONE requires TASK_VERIFICATION");
    }
    if (!["passed", "not-needed"].includes(verification.status)) {
      fail("DONE requires successful verification", { status: verification.status });
    }
    pass();
    return;
  }

  fail("Unhandled state", { state });
}

main();
