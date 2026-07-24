import type { ChatModel } from "@odin/ai";
import { MessageBuilder } from "@odin/ai";
import type { Message } from "@odin/shared";
import type { Conversation } from "../conversation";
import type { ExecutionPlan, PlanTask } from "./execution-plan";
import type { Planner } from "./planner";
import { randomUUID } from "node:crypto";

export class LLMPlanner implements Planner {
    constructor(private readonly model: ChatModel) {}

    async plan(conversation: Conversation): Promise<ExecutionPlan> {
        const history = [...conversation.history()];
        
        // Find the current user goal (the last user message)
        const lastUserMessage = [...history].reverse().find(m => m.role === "user");
        const goalText = lastUserMessage && typeof lastUserMessage.content === "string" 
            ? lastUserMessage.content 
            : "Complete the requested tasks";

        // Fast-path: skip LLM planning for short/conversational inputs
        if (this.isSimpleQuery(goalText)) {
            return {
                goal: goalText,
                tasks: [{
                    id: randomUUID(),
                    title: "Respond to user",
                    objective: "Address the user's message directly.",
                    dependsOn: [],
                    status: "pending",
                }]
            };
        }

        const systemPrompt: Message = {
            role: "system",
            content: `You are a software engineering planner.
Break the user's goal into executable steps.

Rules:
- 3-10 tasks
- short titles
- concrete objectives for each task (what specifically needs to be understood or accomplished)
- no implementation
- logical order
- dependencies when necessary

Return JSON ONLY. Do not use markdown blocks.

Expected output format:
{
  "goal": "Add login support",
  "tasks": [
    {
      "id": "1",
      "title": "Inspect authentication code",
      "objective": "Understand how users are authenticated before making changes.",
      "dependsOn": []
    }
  ]
}`
        };

        const messages: Message[] = [systemPrompt, { role: "user", content: goalText }];

        // Call model without any tools
        const stream = await this.model.chat(messages, []);
        
        const builder = new MessageBuilder();
        for await (const event of stream) {
            builder.consume(event);
        }
        
        const response = builder.build();

        if (!response.content) {
            throw new Error("Model returned empty response during planning phase.");
        }

        // Try parsing JSON out of markdown blocks just in case
        let jsonText = response.content.trim();
        if (jsonText.startsWith("\`\`\`json")) {
            jsonText = jsonText.replace(/^\`\`\`json\n/, "").replace(/\n\`\`\`$/, "");
        } else if (jsonText.startsWith("\`\`\`")) {
            jsonText = jsonText.replace(/^\`\`\`\n/, "").replace(/\n\`\`\`$/, "");
        }

        let parsed: any;
        try {
            parsed = JSON.parse(jsonText);
        } catch (err) {
            // Fallback for conversational queries where the LLM ignores the JSON instruction
            parsed = {
                goal: goalText,
                tasks: [
                    {
                        id: randomUUID(),
                        title: "Fulfill request",
                        objective: "Address the user's prompt directly.",
                        dependsOn: []
                    }
                ]
            };
        }

        // Resilient Parser
        if (!parsed || typeof parsed !== "object") {
            parsed = { goal: goalText, tasks: [] };
        }
        
        const goal = typeof parsed.goal === "string" ? parsed.goal : goalText;
        const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];

        if (rawTasks.length === 0) {
            rawTasks.push({
                id: randomUUID(),
                title: "Fulfill request",
                objective: "Address the user's prompt directly.",
                dependsOn: []
            });
        }

        const tasks: PlanTask[] = rawTasks.map((rt: any, index: number) => {
            return {
                id: typeof rt.id === "string" ? rt.id : randomUUID(),
                title: typeof rt.title === "string" ? rt.title : `Task ${index + 1}`,
                objective: typeof rt.objective === "string" ? rt.objective : undefined,
                description: typeof rt.description === "string" ? rt.description : undefined,
                dependsOn: Array.isArray(rt.dependsOn) ? rt.dependsOn : [],
                status: "pending",
                metadata: typeof rt.metadata === "object" ? rt.metadata : undefined
            };
        });

        return {
            goal,
            tasks
        };
    }

    /**
     * Heuristic: skip the planning LLM call for short conversational messages.
     * Returns true if the input looks like a greeting, question, or chat — not
     * an actionable multi-step engineering task.
     */
    private isSimpleQuery(text: string): boolean {
        const words = text.trim().split(/\s+/);
        // Very short messages are almost always conversational
        if (words.length <= 10) {
            const actionKeywords = [
                "find", "create", "write", "read", "list", "search", "analyze",
                "refactor", "fix", "add", "remove", "update", "modify", "edit",
                "build", "run", "test", "deploy", "install", "delete", "move",
                "rename", "copy", "grep", "glob", "commit", "push", "pull",
                "implement", "debug", "inspect", "trace", "summarize", "report",
            ];
            const lower = text.toLowerCase();
            const hasAction = actionKeywords.some(kw => lower.includes(kw));
            if (!hasAction) return true;
        }
        return false;
    }
}
