export interface Workspace {
    read(path: string): Promise<string>;

    write(
        path: string,
        content: string,
    ): Promise<void>;

    exists(path: string): Promise<boolean>;

    list(path?: string): Promise<string[]>;
}