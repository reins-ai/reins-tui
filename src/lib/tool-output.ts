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

function stringifyValue(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) {
      return String(value);
    }

    return json;
  } catch {
    return String(value);
  }
}

function renderStructuredOutput(value: unknown): string | undefined {
  const direct = pickNonEmptyString(value);
  if (direct) {
    return direct;
  }

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined;
    }

    return value.map((entry) => {
      const text = pickNonEmptyString(entry);
      if (text) {
        return text;
      }

      return stringifyValue(entry);
    }).join("\n");
  }

  if (isRecord(value)) {
    const nestedOutput = renderStructuredOutput(value.output ?? value.result ?? value.stdout);
    if (nestedOutput) {
      return nestedOutput;
    }

    return stringifyValue(value);
  }

  return undefined;
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
  title?: string;
  output?: string;
} | undefined {
  if (!result) {
    return undefined;
  }

  const parseRecord = (raw: string): Record<string, unknown> | undefined => {
    try {
      const parsed = JSON.parse(raw);
      if (isRecord(parsed)) {
        return parsed;
      }

      if (typeof parsed === "string") {
        const inner = parsed.trim();
        if (!inner.startsWith("{")) {
          return undefined;
        }

        const innerParsed = JSON.parse(inner);
        if (isRecord(innerParsed)) {
          return innerParsed;
        }
      }
    } catch {
      return undefined;
    }

    return undefined;
  };

  const record = parseRecord(result);
  if (record) {
    const metadata = isRecord(record.metadata) ? record.metadata : undefined;
    const args = isRecord(record.args) ? record.args : undefined;

    const command = pickNonEmptyString(record.command)
      ?? pickNonEmptyString(metadata?.command)
      ?? pickNonEmptyString(args?.command);
    const title = pickNonEmptyString(record.title)
      ?? pickNonEmptyString(record.summary)
      ?? pickNonEmptyString(metadata?.title)
      ?? pickNonEmptyString(metadata?.summary);
    const output = renderStructuredOutput(record.output)
      ?? renderStructuredOutput(record.result)
      ?? renderStructuredOutput(record.stdout)
      ?? renderStructuredOutput(record.text);

    if (!command && !title && !output) {
      return undefined;
    }

    return { command, title, output };
  }

  let extractionSource = result;
  try {
    const parsed = JSON.parse(result);
    if (typeof parsed === "string") {
      extractionSource = parsed;
    }
  } catch {
    extractionSource = result;
  }

  const title = extractJsonStringField(extractionSource, "title")
    ?? extractJsonStringField(extractionSource, "summary");
  const command = extractJsonStringField(extractionSource, "command");
  const output = extractJsonStringField(extractionSource, "output")
    ?? extractJsonStringField(extractionSource, "result")
    ?? extractJsonStringField(extractionSource, "stdout")
    ?? extractJsonStringField(extractionSource, "text");
  if (!command && !title && !output) {
    if (extractionSource !== result) {
      const nestedTitle = extractJsonStringField(result, "title") ?? extractJsonStringField(result, "summary");
      const nestedCommand = extractJsonStringField(result, "command");
      const nestedOutput = extractJsonStringField(result, "output")
        ?? extractJsonStringField(result, "result")
        ?? extractJsonStringField(result, "stdout")
        ?? extractJsonStringField(result, "text");
      if (!nestedCommand && !nestedTitle && !nestedOutput) {
        return undefined;
      }

      return {
        command: nestedCommand,
        title: nestedTitle,
        output: nestedOutput,
      };
    }

    return undefined;
  }

  return { command, title, output };
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
  const title = structured?.title;
  const output = structured?.output ?? (structured ? undefined : result);

  const sections: string[] = [];
  if (title) {
    sections.push(`# ${title}`);
  }

  if (error && error.length > 0) {
    if (command) {
      sections.push(`$ ${command}`);
    }
    sections.push(error);
    return wrapLongLines(sections.join("\n"));
  }

  if (command && output) {
    sections.push(`$ ${command}`);
    sections.push(output);
    return wrapLongLines(sections.join("\n"));
  }

  if (output) {
    sections.push(output);
    return wrapLongLines(sections.join("\n"));
  }

  if (command) {
    sections.push(`$ ${command}`);
    return sections.join("\n");
  }

  if (sections.length > 0) {
    return sections.join("\n");
  }

  return undefined;
}
