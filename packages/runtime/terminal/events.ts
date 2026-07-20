interface StdoutEvent {
    type: "stdout";
    data: string;
}

interface StderrEvent {
    type: "stderr";
    data: string;
}

interface ExitEvent {
    type: "exit";
    code: number;
}

export type TerminalEvent =
    | StdoutEvent
    | StderrEvent
    | ExitEvent;