# 0001. Production Scalability & Hardening Architecture

We have established the technical roadmap to transition Odin from prototype to an enterprise-grade autonomous coding agent. The architecture prioritizes security sandboxing, dynamic replanning resilience, automated self-healing verification, and native SQLite session persistence.

## Status
Accepted

## Decisions & Considered Options

### 1. Security Sandboxing: In-Process Path Jailing & Command Timeouts
- **Accepted: Option A (Strict In-Process Jailing & Process Timeouts)**:
  - Canonical path resolution via `fs.realpathSync` ensuring all operations remain strictly within `workspaceRoot`. Any symlink escape or path traversing outside the root throws an immediate `SecurityViolationError`.
  - Process execution timeouts (default 30s) in `NodeTerminal` enforced via `setTimeout` and `child.kill('SIGTERM')` / `child.kill('SIGKILL')`.
- **Rejected: Docker Ephemeral Containers**: Rejected due to high host dependency overhead (requiring Docker Desktop) which harms developer portability on CLI tools.
- **Rejected: Loose Permissive Security**: Rejected because LLMs cannot be trusted with raw unconstrained host filesystem access.

### 2. Dynamic Replanning: Two-Tier Error Recovery
- **Accepted: Option A (Two-Tier Recovery: Local Retries + Global LLM Replan)**:
  - Tier 1: Local sub-task retries (up to 3 attempts) where tool errors (compilation, missing files, or test failures) are fed directly into the model context to self-heal within the sub-task.
  - Tier 2: Global Replanning via `LLMPlanner.replan()` if a sub-task exhausts its retry budget or loop limit (25 steps). The planner restructures downstream tasks based on accumulated failure logs.
- **Rejected: Immediate Global Replan**: Rejected because single syntax typos or missing imports are trivial to fix in 1 step; invoking full replanning on every error would quadruple latency and token consumption.
- **Rejected: Fail-Fast without Recovery**: Rejected because autonomous agents must possess resilience to navigate real-world debugging workflows.

### 3. Session Persistence: Native `bun:sqlite`
- **Accepted: Option A (Native `bun:sqlite` in `.odin/odin.db`)**:
  - Leverages Bun's built-in SQLite engine with zero third-party npm dependencies.
  - ACID-compliant tables for `sessions`, `messages`, `plans`, and `telemetry`.
  - Enables CLI session resumption (`odin --resume <sessionId>`) and offline performance analysis.
- **Rejected: Flat JSON Session Files**: Rejected due to concurrency hazards, lack of index querying, and risk of corrupted JSON files on sudden process termination.
- **Rejected: External Database (Postgres / MySQL)**: Rejected as overly complex for a local CLI developer tool.

### 4. Self-Healing Verification Loop: Automated Post-Edit Hook
- **Accepted: Option A (Automated Post-Edit Verification Hook)**:
  - After a file modification (`edit_file` or `write_file`), the executor automatically runs configurable project verification commands (`bun check-types` / `bun test`).
  - Diagnostic compiler outputs are injected into the context before marking the task `completed`.
- **Rejected: Tool-Only Verification**: Rejected because models frequently forget to verify or prematurely conclude they are done without running typechecks.

### 5. Implementation Roadmap
- **Pillar 1**: Security & Sandboxing (`NodeWorkspace`, `NodeTerminal`, dangerous command filter).
- **Pillar 2**: Agent Resilience & Self-Healing (`LLMPlanner.replan`, multi-match edit disambiguation, verification hook).
- **Pillar 3**: Session Persistence & Resumption (`bun:sqlite` storage manager).
- **Pillar 4**: Runtime Fallbacks & Model Expansion (Ripgrep JS fallback, exact token estimator).

## Consequences
- Every file access now validates canonical path containment, completely neutralizing directory traversal vulnerabilities.
- Sub-tasks can no longer hang indefinitely on interactive or long-running shell scripts.
- Tasks self-heal compiler and type errors automatically before completing.
- Sessions and telemetry are durably stored locally, making Odin stateful across terminal sessions.
