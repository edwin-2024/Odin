import type { Message } from "@odin/shared";
import type { Tool } from "@odin/tools";

import type { EventStream } from "./event-stream";

export interface ChatModel {
  chat(
    messages: Message[],
    tools?: Tool[],
  ): Promise<EventStream>;
}