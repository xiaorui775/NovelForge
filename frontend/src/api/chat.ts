import client from './client';
import { streamSSE } from './sse';

export interface ChatMessage {
  id: string;
  project_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model_id: string | null;
  token_used: number;
  created_at: string;
}

export interface ChatRequest {
  message: string;
  model_id: string;
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

  clearHistory: (projectId: string) =>
    client.delete(`/projects/${projectId}/chat/history`),
};
