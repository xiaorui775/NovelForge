import client from './client';

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
    const controller = new AbortController();

    fetch(`/api/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errBody = await response.json().catch(() => null);
          throw new Error(errBody?.detail || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) { onEvent({ type: 'error', message: '无法读取响应流' }); return; }

        const decoder = new TextDecoder();
        let buffer = '';
        let receivedDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === 'done') receivedDone = true;
                onEvent(event);
              } catch {
                // Skip malformed events
              }
            }
          }
        }

        if (!receivedDone) {
          onEvent({ type: 'error', message: '对话流意外中断' });
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          onEvent({ type: 'error', message: err.message });
        }
      });

    return controller;
  },

  clearHistory: (projectId: string) =>
    client.delete(`/projects/${projectId}/chat/history`),
};
