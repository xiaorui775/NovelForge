import client from './client';
import { streamSSE } from './sse';

export interface ChatMessage {
  id: string;
  project_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model_id: string | null;
  token_used: number;
  referenced_chapter_id?: string | null;
  referenced_text?: string | null;
  context_mode?: string | null;
  suggested_action?: string | null;
  created_at: string;
}

export interface SuggestedAction {
  action: 'replace' | 'insert';
  chapter_id?: string;
  content: string;
}

export interface ChatRequest {
  message: string;
  model_id: string;
  referenced_chapter_id?: string | null;
  referenced_text?: string | null;
  context_mode?: string;
}

// Chat-specific SSE event (uses same structure as base SSE event)
export interface ChatSSEEvent {
  type: 'token' | 'done' | 'error';
  content?: string;
  message_id?: string;
  token_used?: number;
  message?: string;
}

export const chatApi = {
  getHistory: (projectId: string) =>
    client.get<ChatMessage[]>(`/projects/${projectId}/chat/history`),

  sendMessage: (
    projectId: string,
    data: ChatRequest,
    onEvent: (event: ChatSSEEvent) => void,
  ): AbortController => {
    return streamSSE({
      url: `/api/projects/${projectId}/chat`,
      payload: data,
      onEvent: (e) => onEvent(e as ChatSSEEvent),
      interruptedMessage: '对话流意外中断',
    });
  },

  getChapterList: (projectId: string) =>
    client.get<Array<{ id: string; title: string; chapter_number: number }>>(
      `/projects/${projectId}/chapters-for-chat`,
    ),

  clearHistory: (projectId: string) =>
    client.delete(`/projects/${projectId}/chat/history`),

  applyAction: (messageId: string, actionIndex: number = 0) =>
    client.post<{ ok: boolean; word_count: number }>('/chat/apply-action', { message_id: messageId, action_index: actionIndex }),
};
