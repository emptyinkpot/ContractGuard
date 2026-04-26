export class PipelineContext {
  constructor(goal) {
    this.goal = goal;
    this.steps = [];
    this.results = [];
    this.trace = [];
    this.safetyVerifier = null;
    this.auditLog = null;
  }

  addStep(step) {
    this.steps.push(step);
  }

  addResult(result) {
    this.results.push(result);
  }

  log(entry) {
    this.trace.push({
      ts: new Date().toISOString(),
      ...entry,
    });
  }

  setSafetyVerifier(report) {
    this.safetyVerifier = report;
  }

  setAuditLog(report) {
    this.auditLog = report;
  }
}
