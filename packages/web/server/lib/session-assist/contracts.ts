export interface AssistTargets {
  recap: boolean;
  suggestion: boolean;
}

export interface AssistMessage {
  id: string;
  role: string;
  created: number | null;
  transparent: boolean;
  providerId?: string | undefined;
  modelId?: string | undefined;
  complete: boolean;
  text: string;
  authored: string;
}

export interface AssistTurn {
  user: AssistMessage;
  assistant: AssistMessage | null;
  complete: boolean;
}

export interface AssistContext {
  turns: AssistTurn[];
  last: AssistMessage;
}
