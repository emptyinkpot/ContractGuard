export class ObservabilityTrace {
  constructor() {
    this.events = [];
  }

  emit(event) {
    const traceEvent = {
      timestamp: new Date().toISOString(),
      ...event
    };

    this.events.push(traceEvent);
    return traceEvent;
  }

  all() {
    return [...this.events];
  }
}
