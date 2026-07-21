import { promises as fs } from "node:fs";
import path, { join } from "node:path";
import fg from "fast-glob";
import { spawn } from "node:child_process";

import type {
    GrepMatch,
    GrepOptions,
} from "./workspace";
import type { DirectoryEntry, Workspace } from "./workspace";

export class NodeWorkspace
    implements Workspace {
    constructor(
        private readonly root: string,
    ) { }

    private resolve(file: string) {
        return path.resolve(this.root, file);
    }

    async read(
        file: string,
        options?: { startLine?: number; endLine?: number }
    ) {
        try {
            const text = await fs.readFile(
                this.resolve(file),
                "utf8",
            );

            const lines = text.split("\n");
            
            const startIdx = options?.startLine ? Math.max(0, options.startLine - 1) : 0;
            const endIdx = options?.endLine ? Math.min(lines.length, options.endLine) : lines.length;
            
            const sliced = lines.slice(startIdx, endIdx);
            
            return sliced.map((line, idx) => `${startIdx + idx + 1} | ${line}`).join("\n");
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
            path: join(path, entry.name).replace(/\\/g, "/"),
            type: entry.isDirectory()
                ? "directory"
                : "file",
        }));
    }

    async glob(
        pattern: string,
        options?: {
            cwd?: string;
            ignore?: string[];
        }
    ): Promise<string[]> {

        return fg(pattern, {
            cwd: options?.cwd,
            ignore: options?.ignore,
            onlyFiles: true,
        });
    }

    async grep(
        pattern: string,
        options: GrepOptions = {}
    ): Promise<GrepMatch[]> {
        // Pure Node.js workaround using fast-glob instead of external ripgrep
        const targetPath = this.resolve(options.path ?? ".");
        
        const stat = await fs.stat(targetPath).catch(() => null);
        let files: string[] = [];

        if (stat?.isFile()) {
            files = [targetPath];
        } else if (stat?.isDirectory()) {
            files = await fg("**/*", {
                cwd: targetPath,
                ignore: ["**/node_modules/**", "**/.git/**", "**/.next/**", "**/dist/**", "**/build/**"],
                onlyFiles: true,
                absolute: true,
            });
        } else {
            return [];
        }

        const matches: GrepMatch[] = [];
        const searchPattern = options.caseSensitive === false ? pattern.toLowerCase() : pattern;

        for (const file of files) {
            if (options.maxResults && matches.length >= options.maxResults) {
                break;
            }

            try {
                const content = await fs.readFile(file, "utf8");
                const lines = content.split("\n");
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const searchLine = options.caseSensitive === false ? line.toLowerCase() : line;
                    const col = searchLine.indexOf(searchPattern);
                    
                    if (col !== -1) {
                        // Calculate relative path for output
                        const relativePath = path.relative(this.root, file).replace(/\\/g, "/");
                        matches.push({
                            path: relativePath,
                            line: i + 1,
                            column: col + 1,
                            text: line.trimEnd(),
                        });
                        
                        if (options.maxResults && matches.length >= options.maxResults) {
                            break;
                        }
                    }
                }
            } catch {
                // Ignore binary files or files that can't be read as utf8
            }
        }

        return matches;
    }
}