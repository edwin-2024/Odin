import type { ChatModel } from "@odin/ai";
import { MessageBuilder } from "@odin/ai";

import type { AssistantMessage } from "@odin/shared";

import { ToolRegistry, ToolExecutor } from "@odin/tools";
import type { AgentCallbacks } from "./agent-events";
import type { ContextManager } from "./context-manager";
import type { ExecutionContext } from "./execution-context";

import type { Planner } from "./planning";

export class AgentExecutor {
  constructor(
    private readonly model: ChatModel,
    private readonly toolExecutor: ToolExecutor,
    private readonly contextManager: ContextManager,
    private readonly planner: Planner,
  ) { }

    private async callModel(context: ExecutionContext): Promise<AssistantMessage> {
        const history = [...context.conversation.history()];
        
        // Inject current plan into the system prompt for overarching context
        if (history.length > 0 && history[0]!.role === "system" && context.taskManager.getPlan()) {
            const plan = context.taskManager.getPlan()!;
            let systemPrompt = history[0]!.content as string;
            systemPrompt += `\n\nCurrent Goal:\n${plan.goal}`;
            history[0] = { ...history[0]!, content: systemPrompt };
        }

        const messages = await this.contextManager.prepare(history);

    const stream = await this.model.chat(
      messages,
      context.registry.list(),
    );

    const builder = new MessageBuilder();

    for await (const event of stream) {
      context.callbacks?.onEvent?.({ type: "model", payload: event });
      builder.consume(event);
    }

    const assistant = builder.build();

    context.conversation.addAssistant(assistant);

    return assistant;
  }

  async execute(context: ExecutionContext): Promise<void> {
    const plan = await this.planner.plan(context.conversation);
    context.taskManager.loadPlan(plan);

        for (const task of plan.tasks) {
            context.taskManager.startTask(task.id);
            
            // Step the conversation forward by giving the agent its explicit sub-task instruction
            let instruction = `Execute Task: ${task.title}`;
            if (task.objective) instruction += `\n\nObjective: ${task.objective}`;
            instruction += `\n\nCRITICAL INSTRUCTION: You MUST ONLY fulfill this specific task. Do NOT attempt subsequent steps. First, use your tools to achieve the objective. THEN, and only when the objective is fully achieved, you must provide a plain text response with NO tool calls (e.g. "I am done") to advance the system to the next task.`;
            
            context.conversation.addUser(instruction);
            
            let taskCompleted = false;
        while (!taskCompleted) {
            let assistant: AssistantMessage;
            try {
                assistant = await this.callModel(context);
            } catch (e) {
                context.taskManager.failTask(task.id, e);
                throw e;
            }

            if (assistant.toolCalls.length === 0) {
                taskCompleted = true;
                break;
            }

            let toolMessages;
            try {
                toolMessages = await this.toolExecutor.execute(assistant.toolCalls, {
                    registry: context.registry,
                    permissions: context.permissions,
                    callbacks: {
                        onEvent: (toolEvent) => context.callbacks?.onEvent?.({
                            type: "tool",
                            payload: toolEvent
                        })
                    }
                });
            } catch (e) {
                context.taskManager.failTask(task.id, e);
                throw e;
            }

            for (const message of toolMessages) {
                context.conversation.addTool(message);
            }
        }

        context.taskManager.completeTask(task.id);
    }
  }
}