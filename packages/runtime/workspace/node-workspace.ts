import { promises as fs } from "node:fs";
import path from "node:path";

import type { DirectoryEntry, Workspace } from "./workspace";

export class NodeWorkspace
    implements Workspace {
    constructor(
        private readonly root: string,
    ) { }

    private resolve(file: string) {
        return path.resolve(this.root, file);
    }

    async read(file: string) {
        try {
            return await fs.readFile(
                this.resolve(file),
                "utf8",
            );
        } catch (error) {
            if (error.code === "ENOENT") {
                throw new Error(`Error: File not found: ${file}.`);
            }
            throw error;
        }
    }

    async write(
        file: string,
        content: string,
    ) {
        await fs.writeFile(
            this.resolve(file),
            content,
        );
    }

    async edit(
        path: string,
        search: string,
        replace: string,
    ) {
        const file = await this.read(path);

        // Many local models struggle with JSON string escaping and output literal \\n characters
        // instead of actual newlines. We must unescape them to make the tool robust.
        let unescapedSearch = search.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
        let unescapedReplace = replace.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");

        // Normalize search string to match the file's line endings
        const normalizedSearch = file.includes("\r\n")
            ? unescapedSearch.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
            : unescapedSearch.replace(/\r\n/g, "\n");

        const count = file.split(normalizedSearch).length - 1;

        if (count === 0) {
            throw new Error(`Search text not found in ${path}.`);
        }

        if (count > 1) {
            throw new Error(`Found ${count} matches for search text in ${path}. Matches must be unique.`);
        }

        const updated = file.replace(normalizedSearch, unescapedReplace);

        await this.write(path, updated);

        return updated;
    }
    async exists(file: string) {
        try {
            await fs.access(this.resolve(file));
            return true;
        } catch {
            return false;
        }
    }

    async list(path: string): Promise<DirectoryEntry[]> {
        const entries = await fs.readdir(path, {
            withFileTypes: true,
        });

        return entries.map(entry => ({
            name: entry.name,
            path: join(path, entry.name),
            type: entry.isDirectory()
                ? "directory"
                : "file",
        }));
    }
}