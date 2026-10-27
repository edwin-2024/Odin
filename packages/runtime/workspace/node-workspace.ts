import { promises as fs, existsSync, realpathSync } from "node:fs";
import path, { join } from "node:path";
import fg from "fast-glob";
import type {
    GrepMatch,
    GrepOptions,
} from "./workspace";
import type { DirectoryEntry, Workspace } from "./workspace";
import type { Terminal } from "../terminal/terminal";

export class SecurityViolationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SecurityViolationError";
    }
}

export class NodeWorkspace implements Workspace {
    constructor(
        private readonly root: string,
        private readonly terminal: Terminal,
    ) { }

    private resolveSafe(file: string): string {
        const resolved = path.resolve(this.root, file);
        const resolvedRoot = path.resolve(this.root);
        const canonicalRoot = existsSync(this.root) ? realpathSync(this.root) : resolvedRoot;

        // Check 1: Relative check against resolved root
        const relResolved = path.relative(resolvedRoot, resolved);
        if (relResolved.startsWith("..") || path.isAbsolute(relResolved)) {
            throw new SecurityViolationError(
                `Security Violation: Path "${file}" escapes workspace boundary.`
            );
        }

        // Check 2: Canonical realpath check for symlink traversal
        let checkPath = resolved;
        while (!existsSync(checkPath) && checkPath !== path.dirname(checkPath)) {
            checkPath = path.dirname(checkPath);
        }

        if (existsSync(checkPath)) {
            const canonicalCheck = realpathSync(checkPath);
            const relCanonical = path.relative(canonicalRoot, canonicalCheck);
            if (relCanonical.startsWith("..") || path.isAbsolute(relCanonical)) {
                throw new SecurityViolationError(
                    `Security Violation: Path "${file}" resolves outside workspace boundary via symlink.`
                );
            }
        }

        return resolved;
    }

    async read(
        file: string,
        options?: { startLine?: number; endLine?: number }
    ) {
        try {
            const text = await fs.readFile(
                this.resolveSafe(file),
                "utf8",
            );

            const lines = text.split("\n");

            const startIdx = options?.startLine ? Math.max(0, options.startLine - 1) : 0;
            const endIdx = options?.endLine ? Math.min(lines.length, options.endLine) : lines.length;

            const sliced = lines.slice(startIdx, endIdx);

            return sliced.map((line, idx) => `${startIdx + idx + 1} | ${line}`).join("\n");
        } catch (error: any) {
            if (error instanceof SecurityViolationError) {
                throw error;
            }
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
        const resolved = this.resolveSafe(file);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(
            resolved,
            content,
        );
    }

    async edit(
        path: string,
        search: string,
        replace: string,
        options?: { occurrence?: number }
    ) {
        const resolvedPath = this.resolveSafe(path);
        let file: string;
        try {
            file = await fs.readFile(resolvedPath, "utf8");
        } catch (error: any) {
            if (error instanceof SecurityViolationError) {
                throw error;
            }
            if (error.code === "ENOENT") {
                throw new Error(`Error: File not found: ${path}.`);
            }
            throw error;
        }

        // Many local models struggle with JSON string escaping and output literal \n characters
        // instead of actual newlines. We must unescape them to make the tool robust.
        let unescapedSearch = search.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
        let unescapedReplace = replace.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");

        // Normalize search and replace strings to match the file's line endings
        const isCRLF = file.includes("\r\n");
        const normalizedSearch = isCRLF
            ? unescapedSearch.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
            : unescapedSearch.replace(/\r\n/g, "\n");
        const normalizedReplace = isCRLF
            ? unescapedReplace.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
            : unescapedReplace;

        const count = file.split(normalizedSearch).length - 1;

        if (count === 0) {
            throw new Error(`Search text not found in ${path}.`);
        }

        if (count > 1) {
            if (options?.occurrence && options.occurrence >= 1 && options.occurrence <= count) {
                // Replace specific occurrence (1-based index)
                let idx = -1;
                let current = 0;
                while (current < options.occurrence) {
                    idx = file.indexOf(normalizedSearch, idx + 1);
                    current++;
                }
                const before = file.substring(0, idx);
                const after = file.substring(idx + normalizedSearch.length);
                const updated = before + normalizedReplace + after;
                await this.write(path, updated);
                return updated;
            }

            throw new Error(`Found ${count} matches for search text in ${path}. Matches must be unique, or specify occurrence (1-${count}).`);
        }

        const updated = file.replace(normalizedSearch, normalizedReplace);

        await this.write(path, updated);

        return updated;
    }

    async exists(file: string) {
        try {
            await fs.access(this.resolveSafe(file));
            return true;
        } catch {
            return false;
        }
    }

    async list(directoryPath: string): Promise<DirectoryEntry[]> {
        const resolvedDir = this.resolveSafe(directoryPath);
        const entries = await fs.readdir(resolvedDir, {
            withFileTypes: true,
        });

        return entries.map(entry => ({
            name: entry.name,
            path: join(directoryPath, entry.name).replace(/\\/g, "/"),
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
        const cwd = options?.cwd ? this.resolveSafe(options.cwd) : this.root;
        return fg(pattern, {
            cwd,
            ignore: options?.ignore,
            onlyFiles: true,
        });
    }

    async grep(
        pattern: string,
        options: GrepOptions = {}
    ): Promise<GrepMatch[]> {
        const searchPath = options.path ? this.resolveSafe(options.path) : this.root;

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
        const safePath = searchPath.replace(/"/g, '\\"');
        
        args.push(`"${safePattern}"`);
        args.push(`"${safePath}"`);

        const command = args.join(" ");
        const stream = this.terminal.run(command);
        
        let stdout = "";
        let stderr = "";
        let exitCode = 0;

        for await (const event of stream) {
            if (event.type === "stdout") {
                stdout += event.data;
            } else if (event.type === "stderr") {
                stderr += event.data;
            } else if (event.type === "exit") {
                exitCode = event.code;
            }
        }

        // If ripgrep is missing or command failed, gracefully fallback to in-memory grep
        if (exitCode !== 0 && (stderr.includes("not found") || stderr.includes("not recognized") || stdout.trim() === "")) {
            return this.grepFallback(pattern, options);
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

    private async grepFallback(
        pattern: string,
        options: GrepOptions = {}
    ): Promise<GrepMatch[]> {
        const targetDir = options.path ? this.resolveSafe(options.path) : this.root;

        const files = await fg("**/*", {
            cwd: targetDir,
            ignore: [
                "**/node_modules/**",
                "**/.git/**",
                "**/.turbo/**",
                "**/dist/**",
                "**/build/**",
                "**/*.png",
                "**/*.jpg",
                "**/*.jpeg",
                "**/*.ico",
                "**/*.lock"
            ],
            onlyFiles: true,
            absolute: true,
        });

        const regex = new RegExp(pattern, options.caseSensitive === false ? "gi" : "g");
        const matches: GrepMatch[] = [];

        for (const fullPath of files) {
            try {
                const text = await fs.readFile(fullPath, "utf8");
                const lines = text.split("\n");
                const relPath = path.relative(this.root, fullPath).replace(/\\/g, "/");

                for (let i = 0; i < lines.length; i++) {
                    const lineText = lines[i]!;
                    regex.lastIndex = 0;
                    const match = regex.exec(lineText);
                    if (match) {
                        matches.push({
                            path: relPath,
                            line: i + 1,
                            column: match.index + 1,
                            text: lineText.trimEnd(),
                        });
                        if (options.maxResults && matches.length >= options.maxResults) {
                            return matches;
                        }
                    }
                }
            } catch {
                // Skip binary or unreadable files
            }
        }

        return matches;
    }
}
