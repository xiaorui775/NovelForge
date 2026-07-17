// SSE Stream utility - unified implementation for all SSE endpoints

export interface BaseSSEEvent {
  type: string;
  content?: string;
  message?: string;
  word_count?: number;
  token_used?: number;
  cost?: number;
  duration_ms?: number;
  score?: number;
  threshold?: number;
  retry_count?: number;
  max_retries?: number;
  round?: number;
  round_label?: string;
  round_name?: string;
  rounds?: number;
  conflicts?: Array<{ term: string; story_bible: string }>;
  issues?: ValidationIssue[];
  suggestions?: RefineSuggestion[];
  total?: number;
}

export interface SSEStreamOptions {
  url: string;
  payload: unknown;
  onEvent: (event: BaseSSEEvent) => void;
  interruptedMessage?: string;
  onDone?: () => void;
  /** Override the auto-detected auth token. Pass null to send no token. */
  token?: string | null;
}

const TOKEN_KEY = 'novelforge_token';

export function streamSSE(options: SSEStreamOptions): AbortController {
  const {
    url,
    payload,
    onEvent,
    interruptedMessage = '流式响应中断',
    onDone,
  } = options;

  const controller = new AbortController();

  // Auto-attach token unless caller explicitly passed null.
  const token = options.token !== undefined ? options.token : localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(errBody?.detail || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onEvent({ type: 'error', message: '无法读取响应流' });
        return;
      }

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
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as BaseSSEEvent;
            if (event.type === 'done') receivedDone = true;
            onEvent(event);
          } catch {
            // Skip malformed events
          }
        }
      }

      if (!receivedDone && interruptedMessage) {
        onEvent({ type: 'error', message: interruptedMessage });
      }

      onDone?.();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onEvent({ type: 'error', message: err.message });
      }
    });

  return controller;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  location?: string;
}

export interface RefineSuggestion {
  index: number;
  paragraph_index: number;
  reason: string;
  revised: string;
}