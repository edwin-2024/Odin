import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Message, AssistantMessage, ToolMessage } from "@odin/shared";
import type { ExecutionPlan } from "./planning";
import type { TelemetryMetrics } from "./telemetry";
import { randomUUID } from "node:crypto";

export interface SessionRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  goal: string;
  provider: string;
  model: string;
  status: "active" | "completed" | "failed";
}

export class SessionStore {
  private db: Database;

  constructor(dbPath: string = ".odin/odin.db") {
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.run("PRAGMA foreign_keys = ON;");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        goal TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls_json TEXT,
        tool_call_id TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS plans (
        session_id TEXT PRIMARY KEY,
        plan_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS telemetry (
        session_id TEXT PRIMARY KEY,
        metrics_json TEXT NOT NULL,
        recorded_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);
  }

  createSession(session: {
    id: string;
    goal: string;
    provider: string;
    model: string;
  }): SessionRecord {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, created_at, updated_at, goal, provider, model, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      now,
      now,
      session.goal,
      session.provider,
      session.model,
      "active",
    );

    return {
      id: session.id,
      createdAt: now,
      updatedAt: now,
      goal: session.goal,
      provider: session.provider,
      model: session.model,
      status: "active",
    };
  }

  getSession(id: string): SessionRecord | null {
    const row = this.db
      .query<any, [string]>("SELECT * FROM sessions WHERE id = ?")
      .get(id);

    if (!row) return null;

    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      goal: row.goal,
      provider: row.provider,
      model: row.model,
      status: row.status,
    };
  }

  updateSessionStatus(id: string, status: "active" | "completed" | "failed"): void {
    const now = Date.now();
    this.db
      .prepare("UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, id);
  }

  saveMessage(sessionId: string, message: Message): void {
    const now = Date.now();
    const id = randomUUID();

    let toolCallsJson: string | null = null;
    let toolCallId: string | null = null;

    if (message.role === "assistant") {
      const assistant = message as AssistantMessage;
      if (assistant.toolCalls && assistant.toolCalls.length > 0) {
        toolCallsJson = JSON.stringify(assistant.toolCalls);
      }
    } else if (message.role === "tool") {
      toolCallId = (message as ToolMessage).toolCallId;
    }

    this.db
      .prepare(`
        INSERT INTO messages (id, session_id, role, content, tool_calls_json, tool_call_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        sessionId,
        message.role,
        message.content || "",
        toolCallsJson,
        toolCallId,
        now,
      );

    this.db
      .prepare("UPDATE sessions SET updated_at = ? WHERE id = ?")
      .run(now, sessionId);
  }

  syncMessages(sessionId: string, messages: readonly Message[]): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
      for (const msg of messages) {
        this.saveMessage(sessionId, msg);
      }
    });
    tx();
  }

  getMessages(sessionId: string): Message[] {
    const rows = this.db
      .query<any, [string]>(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY rowid ASC",
      )
      .all(sessionId);

    return rows.map((row) => {
      if (row.role === "assistant") {
        const toolCalls = row.tool_calls_json
          ? JSON.parse(row.tool_calls_json)
          : [];
        return {
          role: "assistant" as const,
          content: row.content,
          toolCalls,
        };
      } else if (row.role === "tool") {
        return {
          role: "tool" as const,
          content: row.content,
          toolCallId: row.tool_call_id,
        };
      } else if (row.role === "system") {
        return {
          role: "system" as const,
          content: row.content,
        };
      } else {
        return {
          role: "user" as const,
          content: row.content,
        };
      }
    });
  }

  savePlan(sessionId: string, plan: ExecutionPlan): void {
    const now = Date.now();
    const json = JSON.stringify(plan);

    this.db
      .prepare(`
        INSERT INTO plans (session_id, plan_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET plan_json = excluded.plan_json, updated_at = excluded.updated_at
      `)
      .run(sessionId, json, now);
  }

  getPlan(sessionId: string): ExecutionPlan | null {
    const row = this.db
      .query<any, [string]>("SELECT plan_json FROM plans WHERE session_id = ?")
      .get(sessionId);

    if (!row) return null;
    try {
      return JSON.parse(row.plan_json);
    } catch {
      return null;
    }
  }

  saveTelemetry(sessionId: string, metrics: TelemetryMetrics): void {
    const now = Date.now();
    const json = JSON.stringify(metrics);

    this.db
      .prepare(`
        INSERT INTO telemetry (session_id, metrics_json, recorded_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET metrics_json = excluded.metrics_json, recorded_at = excluded.recorded_at
      `)
      .run(sessionId, json, now);
  }

  getTelemetry(sessionId: string): TelemetryMetrics | null {
    const row = this.db
      .query<any, [string]>("SELECT metrics_json FROM telemetry WHERE session_id = ?")
      .get(sessionId);

    if (!row) return null;
    try {
      return JSON.parse(row.metrics_json);
    } catch {
      return null;
    }
  }

  listSessions(limit: number = 20): SessionRecord[] {
    const rows = this.db
      .query<any, [number]>("SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?")
      .all(limit);

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      goal: row.goal,
      provider: row.provider,
      model: row.model,
      status: row.status,
    }));
  }

  deleteSession(sessionId: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  close(): void {
    this.db.close();
  }
}
