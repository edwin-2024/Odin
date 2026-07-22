import {
    createInterface,
} from "node:readline/promises";

import {
    stdin,
    stdout,
} from "node:process";

import { Mutex } from "@odin/shared";

import type {
    PermissionDecision,
    PermissionManager,
    PermissionRequest,
    PermissionRule,
} from "./permission-manager";

export class CliPermissionManager
    implements PermissionManager {
    private readonly allowed =
        new Set<string>();
        
    private readonly pending = new Map<string, Promise<PermissionDecision>>();
    private readonly mutex = new Mutex();

    public onBeforePrompt?: () => void;
    public onAfterPrompt?: () => void;

    constructor(
        private readonly rl: ReturnType<typeof createInterface>,
        private readonly policies: PermissionRule[] = []
    ) {}

    async request(
        permission: PermissionRequest,
    ): Promise<PermissionDecision> {
        const policyMatch = this.policies.some(
            (p) => p.tool === permission.tool && p.matcher(permission.input)
        );

        if (policyMatch) {
            return "allow-always";
        }

        const key = JSON.stringify(permission);

        if (this.allowed.has(key)) {
            return "allow-once";
        }
        
        if (this.pending.has(key)) {
            return this.pending.get(key)!;
        }

        const promise = this.mutex.lock(async () => {
            // Check again in case it was allowed while we were waiting in the queue
            if (this.allowed.has(key)) {
                return "allow-once";
            }

            this.onBeforePrompt?.();

            console.log();
            console.log("━━━━━━━━━━━━━━━━━━━━━━");
            console.log("Tool Request");
            console.log("━━━━━━━━━━━━━━━━━━━━━━");
            console.log("Tool:", permission.tool);
            console.log("Input:");
            console.dir(permission.input, {
                depth: null,
            });

            const answer = (
                await this.rl.question(
                    "\nAllow? (y=yes n=no a=always): ",
                )
            )
                .trim()
                .toLowerCase();

            this.onAfterPrompt?.();

            switch (answer) {
                case "a":
                    this.allowed.add(key);
                    return "allow-always";

                case "y":
                    this.allowed.add(key); // Allow this specific request again if identical in-flight requests resolve
                    return "allow-once";

                default:
                    return "deny";
            }
        });

        this.pending.set(key, promise);

        try {
            return await promise;
        } finally {
            this.pending.delete(key);
        }
    }
}