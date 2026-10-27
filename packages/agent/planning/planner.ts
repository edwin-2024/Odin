import type { Conversation } from "../conversation";
import type { ExecutionPlan } from "./execution-plan";

export interface Planner {
    plan(conversation: Conversation): Promise<ExecutionPlan>;
    replan?(
        conversation: Conversation,
        currentPlan: ExecutionPlan,
        failedTaskId: string,
        errorReason: string
    ): Promise<ExecutionPlan>;
}
