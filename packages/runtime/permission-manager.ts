export type PermissionDecision =
    | "allow-once"
    | "allow-always"
    | "deny";

export interface PermissionRequest {
    tool: string;
    input: unknown;
}

export interface PermissionRule {
    tool: string;
    matcher(input: unknown): boolean;
}

export interface PermissionManager {
    request(
        permission: PermissionRequest,
    ): Promise<PermissionDecision>;
}