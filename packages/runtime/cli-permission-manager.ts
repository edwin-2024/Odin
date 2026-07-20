import {
    createInterface,
} from "node:readline/promises";

import {
    stdin,
    stdout,
} from "node:process";

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

        switch (answer) {
            case "a":
                this.allowed.add(key);
                return "allow-always";

            case "y":
                return "allow-once";

            default:
                return "deny";
        }
    }
}