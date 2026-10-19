import { describe, it, expect } from "bun:test";
import { createInitialState, reducer } from "./state";

describe("TUI Runtime State Reducer", () => {
  it("initializes in planning phase", () => {
    const state = createInitialState();
    expect(state.phase).toBe("planning");
    expect(state.runningTools.size).toBe(0);
  });

  it("transitions to tool phase on tool start", () => {
    const state = createInitialState();
    const nextState = reducer(state, {
      type: "tool",
      payload: {
        phase: "start",
        id: "call-1",
        toolName: "read_file",
      },
    });

    expect(nextState.phase).toBe("tool");
    expect(nextState.currentToolName).toBe("read_file");
    expect(nextState.runningTools.has("call-1")).toBe(true);
  });

  it("transitions to thinking phase after tool finishes", () => {
    let state = createInitialState();
    state = reducer(state, {
      type: "tool",
      payload: {
        phase: "start",
        id: "call-1",
        toolName: "read_file",
      },
    });
    state = reducer(state, {
      type: "tool",
      payload: {
        phase: "end",
        id: "call-1",
        toolName: "read_file",
      },
    });

    expect(state.phase).toBe("thinking");
    expect(state.runningTools.size).toBe(0);
    expect(state.completedTools.length).toBe(1);
  });
});
