export interface DirectoryEntry {
    name: string;
    path: string;
    type: "file" | "directory";
}

export interface GrepMatch {
    path: string;
    line: number;
    column: number;
    text: string;
}

export interface GrepOptions {
    path?: string;
    caseSensitive?: boolean;
    maxResults?: number;
}


export interface Workspace {
    read(
        path: string,
        options?: { startLine?: number; endLine?: number }
    ): Promise<string>;

    write(path: string, content: string): Promise<void>;

    exists(path: string): Promise<boolean>;

    list(path: string): Promise<DirectoryEntry[]>;
    edit(path: string, search: string, replace: string): Promise<string>;
    glob(
        pattern: string,
        options?: {
            cwd?: string;
            ignore?: string[];
        }
    ): Promise<string[]>;

    grep(
        pattern: string,
        options?: GrepOptions
    ): Promise<GrepMatch[]>;
}