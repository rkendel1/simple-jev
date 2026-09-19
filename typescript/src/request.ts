export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Entry = string | Record<string, JsonValue> | JsonValue[] | null;

export interface ScoreQuestion {
  readonly type: "score";
  readonly instructions: Entry;
  readonly criteria: Entry[];
}
export interface ChoiceQuestion {
  readonly type: "choice";
  readonly instructions: Entry;
  readonly criteria: Record<string, Entry>;
}
export interface NoulQuestion {
  readonly type: "noul";
  readonly instructions: Entry;
  readonly criteria?: { true?: Entry; false?: Entry } | null;
}
export type Question = ScoreQuestion | ChoiceQuestion | NoulQuestion;
export interface ChatMessage {
  readonly role: "system" | "developer" | "user" | "assistant" | "tool" | "function";
  readonly content?: string | Record<string, JsonValue>[] | null;
  readonly [key: string]: unknown;
}
export interface ClassifierRequest {
  readonly model: string;
  readonly state?: string | Record<string, JsonValue> | JsonValue[] | null;
  readonly messages?: ChatMessage[] | null;
  readonly questions: Record<string, Question>;
  readonly options: { readonly raw_logits: boolean };
  readonly tools?: Record<string, JsonValue>[] | null;
  readonly mm_processor_kwargs?: Record<string, JsonValue> | null;
  readonly media_io_kwargs?: Record<string, Record<string, JsonValue>> | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEntry = (value: unknown): value is Entry =>
  value === null || typeof value === "string" || Array.isArray(value) || isObject(value);

function rejectExtra(value: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown field: ${key}`);
}

function parseQuestion(value: unknown): Question {
  if (!isObject(value) || typeof value.type !== "string") throw new Error("Question type is required");
  rejectExtra(value, ["type", "instructions", "criteria"]);
  if (!("instructions" in value) || !isEntry(value.instructions)) throw new Error("Invalid instructions");
  if (value.type === "choice") {
    if (!isObject(value.criteria) || Object.keys(value.criteria).length < 2 || Object.keys(value.criteria).length > 50)
      throw new Error("Choice criteria must contain 2–50 entries");
    for (const entry of Object.values(value.criteria)) if (!isEntry(entry)) throw new Error("Invalid choice criterion");
    return { type: "choice", instructions: value.instructions, criteria: value.criteria as Record<string, Entry> };
  }
  if (value.type === "score") {
    if (!Array.isArray(value.criteria) || value.criteria.length < 2 || value.criteria.length > 50 || !value.criteria.every(isEntry))
      throw new Error("Score criteria must contain 2–50 entries");
    return { type: "score", instructions: value.instructions, criteria: value.criteria };
  }
  if (value.type === "noul") {
    if (value.criteria !== undefined && value.criteria !== null) {
      if (!isObject(value.criteria) || Object.keys(value.criteria).some(k => k !== "true" && k !== "false") ||
          !Object.values(value.criteria).every(isEntry)) throw new Error("Invalid Noul criteria");
    }
    return { type: "noul", instructions: value.instructions, criteria: value.criteria as NoulQuestion["criteria"] };
  }
  throw new Error(`Unknown question type: ${value.type}`);
}

export function validateRequest(input: unknown): ClassifierRequest {
  if (!isObject(input) || typeof input.model !== "string" || input.model.length === 0) throw new Error("model must be a nonempty string");
  if (!isObject(input.questions) || Object.keys(input.questions).length < 1 || Object.keys(input.questions).length > 256)
    throw new Error("questions must contain 1–256 entries");
  if (Object.keys(input.questions).some(key => key.length === 0)) throw new Error("Question IDs must not be empty");
  const hasState = input.state !== undefined && input.state !== null;
  const hasMessages = input.messages !== undefined && input.messages !== null;
  if (hasState === hasMessages) throw new Error("Provide exactly one of state or messages");
  if (hasState && !isEntry(input.state)) throw new Error("Invalid state");
  if (hasMessages && (!Array.isArray(input.messages) || input.messages.length === 0)) throw new Error("messages must be nonempty");
  const questions: Record<string, Question> = {};
  for (const [key, value] of Object.entries(input.questions)) questions[key] = parseQuestion(value);
  const options = input.options === undefined ? { raw_logits: false } : input.options;
  if (!isObject(options)) throw new Error("Invalid options");
  rejectExtra(options, ["raw_logits"]);
  if (options.raw_logits !== undefined && typeof options.raw_logits !== "boolean") throw new Error("raw_logits must be boolean");
  return { model: input.model, state: input.state as ClassifierRequest["state"], messages: input.messages as ChatMessage[] | null | undefined,
    questions, options: { raw_logits: options.raw_logits === true }, tools: input.tools as ClassifierRequest["tools"],
    mm_processor_kwargs: input.mm_processor_kwargs as ClassifierRequest["mm_processor_kwargs"],
    media_io_kwargs: input.media_io_kwargs as ClassifierRequest["media_io_kwargs"] };
}
