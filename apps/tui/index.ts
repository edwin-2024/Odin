import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { Agent, SimpleContextManager } from "@odin/agent";
import { OllamaProvider } from "@odin/ai";
import { BashTool, ReadFileTool, ToolRegistry, WriteFileTool, EditFileTool, GitStatusTool, ListDirectoryTool, GlobTool, GrepTool } from "@odin/tools";
import { CliPermissionManager, type PermissionRule, NodeWorkspace, NodeTerminal, NodeGit } from "@odin/runtime";
import type { TerminalEvent } from "@odin/runtime/terminal/events";
import { config } from "dotenv";
import path from "node:path";
import { Renderer } from "./renderer";
import { createInitialState, reducer } from "./state";
import logUpdate from "log-update";

config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const terminal = new NodeTerminal(process.cwd());
  const workspace = new NodeWorkspace(process.cwd(), terminal);
  const git = new NodeGit(terminal);

  const registry = new ToolRegistry();
  registry.register(new ReadFileTool(workspace));
  registry.register(new WriteFileTool(workspace));
  registry.register(new EditFileTool(workspace));
  registry.register(new ListDirectoryTool(workspace));
  registry.register(new GlobTool(workspace));
  registry.register(new GrepTool(workspace));
  registry.register(new BashTool(terminal));
  registry.register(new GitStatusTool(git));


  const modelName = process.env.ODIN_MODEL || "qwen3:4b-instruct-2507-q4_K_M";

  const provider = new OllamaProvider(modelName);

  const rl = createInterface({
    input: stdin,
    output: stdout,
  });

  const policies: PermissionRule[] = [
    {
      tool: "read_file",
      matcher: () => true,
    },
    {
      tool: "write_file",
      matcher: (input: any) => typeof input?.path === "string" && input.path.includes("src/"),
    },
    {
      tool: "edit_file",
      matcher: (input: any) => typeof input?.path === "string" && input.path.includes("src/"),
    },
  ];

  const permissions = new CliPermissionManager(rl, policies);

  const agent = new Agent(provider, registry, permissions, new SimpleContextManager(20));
  const renderer = new Renderer(agent.taskManager);

  console.log("🤖 Odin");
  console.log("Type 'exit' to quit.");

  while (true) {
    const input = await rl.question("> ");

    if (input.trim() === "exit") {
      break;
    }

    if (input.trim() === "/clear") {
      agent.clear();
      console.log("✨ Conversation memory cleared.\n");
      continue;
    }

    try {
      let state = createInitialState();
      renderer.startTurn();

      let isPrompting = false;
      let hasBufferedRenders = false;

      permissions.onBeforePrompt = () => {
        isPrompting = true;
        renderer.reset();
        process.stdout.write("\x1B[?25h"); // Show cursor
      };

      permissions.onAfterPrompt = () => {
        isPrompting = false;
        process.stdout.write("\n"); // Move cursor down to prevent logUpdate from overwriting the prompt
        if (stdoutQueue.length > 0) {
          logUpdate.clear();
          process.stdout.write(stdoutQueue.join(""));
          stdoutQueue.length = 0;
          renderer.render(state);
        } else if (hasBufferedRenders) {
          renderer.render(state);
        }
        hasBufferedRenders = false;
      };

      let isAssistantSpeaking = false;
      let activeToolLines = 0;
      const stdoutQueue: string[] = [];

      const safeWrite = (text: string) => {
        if (isPrompting) {
          stdoutQueue.push(text);
        } else {
          process.stdout.write(text);
        }
      };

      await agent.send(input, {
        onEvent(event) {
          state = reducer(state, event);

          let redrawDashboard = false;

          if (event.type === "model" && (event.payload.type === "text" || event.payload.type === "thinking")) {
            if (!isAssistantSpeaking) {
              logUpdate.clear();
              safeWrite("──────────────────────────\nAssistant\n");
              isAssistantSpeaking = true;
            }
            safeWrite(event.payload.delta);
            redrawDashboard = false; // Do not redraw dashboard while streaming!
          } else if (event.type === "tool") {
            if (event.payload.type === "tool:start") {
              if (isAssistantSpeaking) {
                  safeWrite("\n");
                  isAssistantSpeaking = false;
              }
              if (!isPrompting) logUpdate.clear();
              safeWrite(`──────────────────────────\nTool Output: ${event.payload.toolName}\n`);
              activeToolLines = 0;
              redrawDashboard = true;
            } else if (event.payload.type === "tool:event") {
              const data = (event.payload.payload as any)?.data;
              if (data) {
                if (!isPrompting) logUpdate.clear();
                safeWrite(`  ${data.trim()}\n`);
                activeToolLines++;
                redrawDashboard = true;
              }
            } else if (event.payload.type === "tool:end") {
              if (!isPrompting) logUpdate.clear();
              if (activeToolLines === 0) {
                safeWrite(`  Completed.\n`);
              }
              safeWrite("──────────────────────────\n");
              redrawDashboard = true;
            }
          } else if (event.type === "task") {
            if (!isAssistantSpeaking) {
               redrawDashboard = true;
            }
          }

          if (isPrompting) {
            hasBufferedRenders = true;
          } else if (redrawDashboard) {
            renderer.render(state);
          }
        }
      });
      
      if (isAssistantSpeaking) {
          process.stdout.write("\n");
      }

      renderer.reset();
      console.log("──────────────────────────\n");

      console.log();
    } catch (err) {
      console.error(err);
    }
  }

  // Ensure all pending readline operations complete before closing
  await rl.close();

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});