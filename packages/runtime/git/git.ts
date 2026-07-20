export interface GitStatus {
  branch: string;
  staged: string[];
  modified: string[];
  untracked: string[];
}

export interface Git {
  status(): Promise<GitStatus>;

  diff(): Promise<string>;

  commit(message: string): Promise<void>;
}
