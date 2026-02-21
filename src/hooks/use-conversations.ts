import { useMemo } from "react";

import type { ConversationSummary } from "@reins/core";

import { type AppAction, type AppState, useApp } from "../store";

export interface ConversationsManager {
  conversations: ConversationSummary[];
  activeId: string | null;
  filter: string;
  filteredConversations(): ConversationSummary[];
  createConversation(title?: string): string;
  switchConversation(id: string): void;
  renameConversation(id: string, title: string): void;
  deleteConversation(id: string): void;
  archiveConversation(id: string): void;
  setFilter(query: string): void;
}

interface ConversationsManagerOptions {
  getState(): Pick<AppState, "conversations" | "activeConversationId" | "conversationFilter">;
  dispatch(action: AppAction): void;
  createId?: () => string;
  now?: () => Date;
}

function buildDefaultConversationTitle(conversations: ConversationSummary[]): string {
  const baseTitle = "New Chat";
  const matchingTitles = conversations
    .map((conversation) => conversation.title.trim())
    .filter((title) => title === baseTitle || /^New Chat \d+$/.test(title));

  if (matchingTitles.length === 0) {
    return baseTitle;
  }

  const nextIndex = matchingTitles.length + 1;
  return `${baseTitle} ${nextIndex}`;
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : "Untitled Chat";
}

function resolveNextActiveConversationId(conversations: ConversationSummary[], removedIndex: number): string | null {
  const nextConversation = conversations[removedIndex] ?? conversations[removedIndex - 1] ?? null;
  return nextConversation?.id ?? null;
}

export function createConversationsManager(options: ConversationsManagerOptions): ConversationsManager {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());

  return {
    get conversations() {
      return options.getState().conversations;
    },
    get activeId() {
      return options.getState().activeConversationId;
    },
    get filter() {
      return options.getState().conversationFilter;
    },
    filteredConversations() {
      const state = options.getState();
      const normalizedQuery = state.conversationFilter.trim().toLowerCase();

      if (normalizedQuery.length === 0) {
        return state.conversations;
      }

      return state.conversations.filter((conversation) => conversation.title.toLowerCase().includes(normalizedQuery));
    },
    createConversation(title) {
      const state = options.getState();
      const resolvedTitle = normalizeTitle(title ?? buildDefaultConversationTitle(state.conversations));
      const createdAt = now();
      const conversation: ConversationSummary = {
        id: createId(),
        title: resolvedTitle,
        model: "default",
        messageCount: 0,
        createdAt,
        lastMessageAt: createdAt,
      };

      options.dispatch({ type: "ADD_CONVERSATION", payload: conversation });
      options.dispatch({ type: "SET_ACTIVE_CONVERSATION", payload: conversation.id });
      options.dispatch({ type: "CLEAR_MESSAGES" });
      return conversation.id;
    },
    switchConversation(id) {
      if (id.length === 0) {
        return;
      }

      const state = options.getState();
      if (state.activeConversationId === id) {
        return;
      }

      options.dispatch({ type: "SET_ACTIVE_CONVERSATION", payload: id });
      options.dispatch({ type: "CLEAR_MESSAGES" });
    },
    renameConversation(id, title) {
      if (id.length === 0) {
        return;
      }

      options.dispatch({
        type: "RENAME_CONVERSATION",
        payload: { id, title: normalizeTitle(title) },
      });
    },
    deleteConversation(id) {
      if (id.length === 0) {
        return;
      }

      const state = options.getState();
      const removedIndex = state.conversations.findIndex((conversation) => conversation.id === id);
      const nextConversations = state.conversations.filter((conversation) => conversation.id !== id);

      options.dispatch({ type: "REMOVE_CONVERSATION", payload: id });

      if (state.activeConversationId !== id) {
        return;
      }

      const nextActiveConversationId = resolveNextActiveConversationId(nextConversations, removedIndex);
      options.dispatch({ type: "SET_ACTIVE_CONVERSATION", payload: nextActiveConversationId });
      options.dispatch({ type: "CLEAR_MESSAGES" });
    },
    archiveConversation(id) {
      if (id.length === 0) {
        return;
      }

      const state = options.getState();
      options.dispatch({ type: "ARCHIVE_CONVERSATION", payload: id });

      if (state.activeConversationId === id) {
        const removedIndex = state.conversations.findIndex((conversation) => conversation.id === id);
        const nextConversations = state.conversations.filter((conversation) => conversation.id !== id);
        const nextActiveConversationId = resolveNextActiveConversationId(nextConversations, removedIndex);
        options.dispatch({ type: "SET_ACTIVE_CONVERSATION", payload: nextActiveConversationId });
        options.dispatch({ type: "CLEAR_MESSAGES" });
      }
    },
    setFilter(query) {
      options.dispatch({ type: "SET_CONVERSATION_FILTER", payload: query });
    },
  };
}

export function useConversations(): ConversationsManager {
  const { state, dispatch } = useApp();

  return useMemo(
    () =>
      createConversationsManager({
        getState: () => ({
          conversations: state.conversations,
          activeConversationId: state.activeConversationId,
          conversationFilter: state.conversationFilter,
        }),
        dispatch,
      }),
    [dispatch, state.activeConversationId, state.conversationFilter, state.conversations],
  );
}
