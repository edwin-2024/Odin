import { promises as fs } from "node:fs";
import path, { join } from "node:path";
import fg from "fast-glob";
import type {
    GrepMatch,
    GrepOptions,
} from "./workspace";
import type { DirectoryEntry, Workspace } from "./workspace";
import type { Terminal } from "../terminal/terminal";

export class NodeWorkspace
    implements Workspace {
    constructor(
        private readonly root: string,
        private readonly terminal: Terminal,
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
        } catch (error: any) {
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
        const args = [
            "rg",
            "--json",
            "-n",
        ];

        if (options.caseSensitive === false) {
            args.push("-i");
        }

        if (options.maxResults) {
            args.push("-m", String(options.maxResults));
        }

        const safePattern = pattern.replace(/"/g, '\\"');
        const safePath = (options.path ?? ".").replace(/"/g, '\\"');
        
        args.push(`"${safePattern}"`);
        args.push(`"${safePath}"`);

        const command = args.join(" ");
        const stream = this.terminal.run(command);
        
        let stdout = "";
        for await (const event of stream) {
            if (event.type === "stdout") {
                stdout += event.data;
            }
        }

        const lines = stdout.split("\n").filter(Boolean);
        const matches: GrepMatch[] = [];

        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === "match") {
                    const data = parsed.data;
                    const matchPath = data.path.text;
                    const lineNumber = data.line_number;
                    const submatch = data.submatches[0];
                    const column = submatch ? submatch.start + 1 : 1;
                    const textContent = data.lines.text.trimEnd();

                    matches.push({
                        path: matchPath.replace(/\\/g, "/"),
                        line: lineNumber,
                        column,
                        text: textContent,
                    });
                }
            } catch {
                // Ignore parse errors from non-JSON output
            }
        }

        return matches;
    }
}