// ============================================================
// Centralized 400faqs command registry & parser
// ============================================================

export type CommandName =
  | "start"
  | "manage"
  | "help"
  | "cancel"
  | "end"
  | "leave"
  | "invite"
  | "categories"
  | "random"
  | "join"
  | "contribute"
  | "report";

export type ParsedCommand = {
  name: CommandName;
  arg?: string;
};

const REGISTRY: Record<CommandName, string[]> = {
  start: ["start", "new", "play", "create"],
  manage: ["manage", "session"],
  help: ["help", "menu", "?"],
  cancel: ["cancel"],
  end: ["end"],
  leave: ["leave", "quit", "exit", "stop"],
  invite: ["invite"],
  categories: ["categories", "category", "list"],
  random: ["random", "rand"],
  join: ["join"],
  contribute: ["contribute", "submit", "add"],
  report: ["report", "flag"],
};

const ALIAS_INDEX: { token: string; name: CommandName; takesArg: boolean }[] = [];
for (const [name, aliases] of Object.entries(REGISTRY)) {
  for (const alias of aliases) {
    ALIAS_INDEX.push({ token: alias, name: name as CommandName, takesArg: name === "join" || name === "contribute" });
  }
}

export function normalizeInput(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Parse a raw message into a command, or null when the message is not a
 * known command. Matches case-insensitively, with optional leading "/".
 */
export function parseCommand(raw: string): ParsedCommand | null {
  const text = normalizeInput(raw);
  if (!text) return null;

  let body = text;
  let arg: string | undefined;
  if (body.startsWith("/")) body = body.slice(1).trim();

  const space = body.search(/\s/);
  let token = space === -1 ? body : body.slice(0, space);
  const rest = space === -1 ? "" : body.slice(space + 1).trim();
  token = token.toLowerCase();

  const match = ALIAS_INDEX.find((a) => a.token === token);
  if (!match) return null;

  if (match.takesArg && rest) arg = rest;
  return { name: match.name, arg };
}
