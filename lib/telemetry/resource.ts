import { randomUUID } from "node:crypto";

const INSTANCE_ID = Symbol.for("focustrack.telemetry.process-instance-id");

export function processInstanceId(): string {
  // Next.js can load separate module copies; the process owns one writer identity.
  const state = process as typeof process & { [INSTANCE_ID]?: string };
  if (!state[INSTANCE_ID]) {
    Object.defineProperty(state, INSTANCE_ID, { value: randomUUID() });
  }
  return state[INSTANCE_ID]!;
}
