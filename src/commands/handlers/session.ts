import { ok } from "../../daemon/contracts";
import type { CommandHandler, MessageSnapshot } from "./types";

function formatTimestamp(date: Date): string {
  return Number.isNaN(date.getTime()) ? "unknown-time" : date.toISOString();
}

function formatMessageBlock(message: MessageSnapshot): string {
  const roleLabel = message.role === "assistant" ? "Assistant" : message.role === "system" ? "System" : "User";

  return [`## ${roleLabel}`, `_${formatTimestamp(message.createdAt)}_`, "", message.content.trim() || "(empty)", ""].join(
    "\n",
  );
}

function renderConversationExport(messages: readonly MessageSnapshot[]): string {
  if (messages.length === 0) {
    return "# Conversation Export\n\nNo messages to export.";
  }

  const messageBlocks = messages.map(formatMessageBlock);
  return ["# Conversation Export", "", ...messageBlocks].join("\n");
}

export const handleNewConversationCommand: CommandHandler = (args, context) => {
  const title = args.positional.length > 0 ? args.positional.join(" ") : undefined;
  const conversationId = context.session.createConversation(title);

  return ok({
    statusMessage: "Started a new conversation",
    responseText: `Created conversation ${conversationId}.`,
  });
};

export const handleClearConversationCommand: CommandHandler = (_args, context) => {
  context.session.clearConversation();

  return ok({
    statusMessage: "Cleared conversation messages",
    responseText: "Conversation transcript cleared.",
  });
};

export const handleExportConversationCommand: CommandHandler = (_args, context) => {
  const markdown = renderConversationExport(context.session.messages);

  return ok({
    statusMessage: "Conversation export generated",
    responseText: markdown,
  });
};
