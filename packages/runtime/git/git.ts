export interface GitStatus {
  branch: string;
  staged: string[];
  modified: string[];
  untracked: string[];
}

export interface GitDiffOptions {
  staged?: boolean;
  path?: string;
  target?: string;
}

export interface GitCommitLog {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface GitLogOptions {
  maxCount?: number;
  path?: string;
}

export interface GitCommitOptions {
  message: string;
  all?: boolean;
  files?: string[];
}

export interface Git {
  status(): Promise<GitStatus>;

  diff(options?: GitDiffOptions): Promise<string>;

  log(options?: GitLogOptions): Promise<GitCommitLog[]>;

  commit(options: GitCommitOptions | string): Promise<void>;
  commit(
    message: string,
    options?: Omit<GitCommitOptions, "message">,
  ): Promise<void>;
}
