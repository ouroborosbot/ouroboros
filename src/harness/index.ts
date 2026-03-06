import { emitNervesEvent } from "../nerves/runtime"

export * from "./primitives"

export const HARNESS_PRIMITIVES_ENTRYPOINT = "harness/primitives"

emitNervesEvent({
  component: "harness",
  event: "harness.module_entry_loaded",
  message: "harness primitives entrypoint loaded",
  meta: {},
})
