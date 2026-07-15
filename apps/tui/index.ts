import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { Agent } from "@odin/agent";
import { OllamaProvider } from "@odin/ai";
import { ReadFileTool, ToolRegistry } from "@odin/tools";

async function main() {
  const registry = new ToolRegistry();
  registry.register(new ReadFileTool());

  const provider = new OllamaProvider(
    "qwen3:4b-instruct-2507-q4_K_M",
  );

  const agent = new Agent(provider, registry);

  const rl = createInterface({
    input: stdin,
    output: stdout,
  });

  console.log("🤖 Odin");
  console.log("Type 'exit' to quit.\n");

  while (true) {
    const input = await rl.question("> ");

    if (input.trim() === "exit") {
      break;
    }

    try {
      await agent.send(input, {
        onEvent(event) {
          switch (event.type) {
            case "text":
              process.stdout.write(event.delta);
              break;

            case "error":
              console.error(event.error);
              break;
          }
        },
      });

      console.log();
    } catch (err) {
      console.error(err);
    }
  }

  rl.close();
}

main().catch(console.error);