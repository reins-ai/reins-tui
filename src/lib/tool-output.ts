function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function decodeEscapedCharacter(escape: string): string {
  switch (escape) {
    case "\\":
      return "\\";
    case '"':
      return '"';
    case "/":
      return "/";
    case "b":
      return "\b";
    case "f":
      return "\f";
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    default:
      return escape;
  }
}

function extractJsonStringField(input: string, fieldName: string): string | undefined {
  let searchFrom = 0;
  const token = `"${fieldName}"`;

  while (searchFrom < input.length) {
    const fieldIndex = input.indexOf(token, searchFrom);
    if (fieldIndex === -1) {
      return undefined;
    }

    let cursor = fieldIndex + token.length;
    while (cursor < input.length && /\s/.test(input[cursor] ?? "")) {
      cursor += 1;
    }

    if (input[cursor] !== ":") {
      searchFrom = fieldIndex + token.length;
      continue;
    }

    cursor += 1;
    while (cursor < input.length && /\s/.test(input[cursor] ?? "")) {
      cursor += 1;
    }

    if (input[cursor] !== '"') {
      searchFrom = fieldIndex + token.length;
      continue;
    }

    cursor += 1;
    let output = "";

    while (cursor < input.length) {
      const current = input[cursor];
      if (current === '"') {
        return output;
      }

      if (current === "\\") {
        const escaped = input[cursor + 1];
        if (escaped === undefined) {
          return undefined;
        }

        if (escaped === "u") {
          const hex = input.slice(cursor + 2, cursor + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            output += String.fromCharCode(parseInt(hex, 16));
            cursor += 6;
            continue;
          }
        }

        output += decodeEscapedCharacter(escaped);
        cursor += 2;
        continue;
      }

      output += current;
      cursor += 1;
    }

    return undefined;
  }

  return undefined;
}

function parseStructuredToolResult(result: string | undefined): {
  command?: string;
  output?: string;
} | undefined {
  if (!result) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(result);
    if (!isRecord(parsed)) {
      return undefined;
    }

    const metadata = isRecord(parsed.metadata) ? parsed.metadata : undefined;
    const command = pickNonEmptyString(parsed.command) ?? pickNonEmptyString(metadata?.command);
    const output = pickNonEmptyString(parsed.output) ?? pickNonEmptyString(parsed.result);
    if (!command && !output) {
      return undefined;
    }

    return { command, output };
  } catch {
    const command = extractJsonStringField(result, "command");
    const output = extractJsonStringField(result, "output") ?? extractJsonStringField(result, "result");
    if (!command && !output) {
      return undefined;
    }

    return { command, output };
  }
}

export function wrapLongLines(value: string, maxLineLength: number = 120): string {
  const lines = value.split("\n");
  const wrapped = lines.flatMap((line) => {
    if (line.length <= maxLineLength) {
      return [line];
    }

    const segments: string[] = [];
    for (let index = 0; index < line.length; index += maxLineLength) {
      segments.push(line.slice(index, index + maxLineLength));
    }

    return segments;
  });

  return wrapped.join("\n");
}

export function buildSimplifiedToolText(
  args: Record<string, unknown> | undefined,
  result: string | undefined,
  error: string | undefined,
): string | undefined {
  const structured = parseStructuredToolResult(result);
  const command = pickNonEmptyString(args?.command) ?? structured?.command;
  const output = structured?.output ?? (structured ? undefined : result);

  if (error && error.length > 0) {
    return wrapLongLines(command ? `$ ${command}\n${error}` : error);
  }

  if (command && output) {
    return wrapLongLines(`$ ${command}\n${output}`);
  }

  if (output) {
    return wrapLongLines(output);
  }

  if (command) {
    return `$ ${command}`;
  }

  return undefined;
}
