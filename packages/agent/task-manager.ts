import type { ExecutionPlan, PlanTask } from "./planning";
import type { AgentEvent } from "./agent-events";

export class TaskManager {
    private plan?: ExecutionPlan;
    
    emit?: (event: AgentEvent) => void;

    loadPlan(plan: ExecutionPlan) {
        this.plan = plan;
        this.emit?.({
            type: "plan:set",
            plan
        });
    }

    getPlan(): ExecutionPlan | undefined {
        return this.plan;
    }

    startTask(id: string) {
        if (!this.plan) return;
        const task = this.plan.tasks.find(t => t.id === id);
        if (task) {
            task.status = "running";
            this.emit?.({ type: "plan:set", plan: this.plan });
        }
    }

    completeTask(id: string) {
        if (!this.plan) return;
        const task = this.plan.tasks.find(t => t.id === id);
        if (task) {
            task.status = "completed";
            this.emit?.({ type: "plan:set", plan: this.plan });
        }
    }

    failTask(id: string, error?: unknown) {
        if (!this.plan) return;
        const task = this.plan.tasks.find(t => t.id === id);
        if (task) {
            task.status = "failed";
            // Store error in metadata
            task.metadata = task.metadata || {};
            task.metadata.error = error;
            this.emit?.({ type: "plan:set", plan: this.plan });
        }
    }

    active(): PlanTask | undefined {
        if (!this.plan) return undefined;
        // Find the first task that is running
        return this.plan.tasks.find(t => t.status === "running");
    }

    clear(): void {
        this.plan = undefined;
    }
}
