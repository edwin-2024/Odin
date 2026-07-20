export interface DirectoryEntry {
    name: string;
    path: string;
    type: "file" | "directory";
}


export interface Workspace {
    read(path: string): Promise<string>;

    write(path: string, content: string): Promise<void>;

    exists(path: string): Promise<boolean>;

    list(path: string): Promise<DirectoryEntry[]>;
    edit(path: string, search: string, replace: string): Promise<string>;
}