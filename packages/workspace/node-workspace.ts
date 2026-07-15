import { promises as fs } from "node:fs";
import path from "node:path";

import type { Workspace } from "./workspace";

export class NodeWorkspace
    implements Workspace {
    constructor(
        private readonly root: string,
    ) { }

    private resolve(file: string) {
        return path.resolve(this.root, file);
    }

    async read(file: string) {
        return fs.readFile(
            this.resolve(file),
            "utf8",
        );
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

    async exists(file: string) {
        try {
            await fs.access(this.resolve(file));
            return true;
        } catch {
            return false;
        }
    }

    async list(dir = ".") {
        return fs.readdir(
            this.resolve(dir),
        );
    }
}