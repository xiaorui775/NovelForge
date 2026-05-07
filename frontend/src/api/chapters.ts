import client from './client';

export interface Chapter {
  id: string;
  chapter_outline_id: string;
  content: string | null;
  word_count: number;
  model_id: string | null;
  token_used: number;
  cost: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ChapterVersion {
  id: string;
  chapter_id: string;
  version_number: number;
  content: string;
  word_count: number;
  model_id: string | null;
  token_used: number;
  quality_score: number | null;
  change_type: string;
  diff_snapshot: string | null;
  created_at: string;
}

export interface ChapterUpdate {
  content: string;
}

export interface ChapterGenerateRequest {
  model_id: string;
  max_tokens?: number;
  template_id?: string;
  auto_score?: boolean;
  score_threshold?: number;
  multi_round?: boolean;
  auto_revise?: boolean;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  rule: string;
  description: string;
  suggestion: string;
}

export interface RefineSuggestion {
  index: number;
  paragraph_index: number;
  original: string;
  revised: string;
  reason: string;
  confidence: number;
}

export interface SSEConflict {
  type: 'terminology_story_bible';
  term: string;
  terminology: string;
  story_bible: string;
  entry_title?: string;
}

export interface SSEEvent {
  type:
    | 'token'
    | 'progress'
    | 'done'
    | 'error'
    | 'scored'
    | 'low_score'
    | 'score_error'
    | 'retrying'
    | 'round_start'
    | 'round_token'
    | 'round_complete'
    | 'batch_start'
    | 'batch_next'
    | 'batch_done'
    | 'validation'
    | 'status'
    | 'refine_start'
    | 'refine_suggestion'
    | 'conflicts'
    | 'brainstorm_start'
    | 'brainstorm_direction'
    | 'brainstorm_transition_token';
  content?: string;
  word_count?: number;
  token_used?: number;
  cost?: number;
  duration_ms?: number;
  message?: string;
  score?: number;
  retry_count?: number;
  threshold?: number;
  max_retries?: number;
  round?: number;
  round_name?: string;
  round_label?: string;
  rounds?: number;
  issues?: ValidationIssue[];
  total?: number;
  suggestions_count?: number;
  index?: number;
  paragraph_index?: number;
  original?: string;
  revised?: string;
  reason?: string;
  confidence?: number;
  conflicts?: SSEConflict[];
  direction?: ChapterBrainstormDirection;
  directions?: ChapterBrainstormDirection[];
  transition_text?: string;
}

export interface QualityScore {
  coherence: number;
  writing_quality: number;
  plot_progression: number;
  overall: number;
  notes: string;
}

export interface CostEstimate {
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost: number;
}

export interface VersionCompare {
  id: string;
  version_number: number;
  content: string;
  word_count: number;
  quality_score: number | null;
  created_at: string;
}

export interface ConsistencyIssue {
  dimension: string;
  severity: 'info' | 'warning' | 'error';
  description: string;
  location?: string;
  suggestion?: string;
}

export interface ConsistencyCheckResult {
  overall_score: number;
  issues: ConsistencyIssue[];
  summary: string;
}

export interface ChapterContext {
  chapter_summary: string | null;
  content_summary: string | null;
  prev_chapter_summary: string | null;
  open_foreshadowings: Array<{ description: string; plant_chapter: string | null }>;
  last_edit_time: string | null;
  word_count: number;
  scenes: Array<{ scene_number: number; location: string; summary: string }>;
}

export interface ContextModule {
  name: string;
  tokens: number;
}

export interface ContextUsage {
  max_context_tokens: number;
  total_used_tokens: number;
  usage_percent: number;
  modules: ContextModule[];
}

export interface ChapterBrainstormDirection {
  title: string;
  summary: string;
  why_it_works: string;
}

export interface ChapterBrainstormResponse {
  directions: ChapterBrainstormDirection[];
  transition_text: string | null;
}

function streamSSE(
  url: string,
  payload: unknown,
  onEvent: (event: SSEEvent) => void,
  interruptedMessage: string,
): AbortController {
  const controller = new AbortController();

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
            const event = JSON.parse(line.slice(6)) as SSEEvent;
            if (event.type === 'done') receivedDone = true;
            onEvent(event);
          } catch {
            // Skip malformed events
          }
        }
      }

      if (!receivedDone) {
        onEvent({ type: 'error', message: interruptedMessage });
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onEvent({ type: 'error', message: err.message });
      }
    });

  return controller;
}

export const chaptersApi = {
  getByOutline: (chapterOutlineId: string) =>
    client.get<Chapter>(`/chapter-outlines/${chapterOutlineId}/chapter`),

  batchGetByOutlines: (chapterOutlineIds: string[]) =>
    client.post<Array<{ chapter_outline_id: string; id: string; content: string | null; word_count: number; status: string }>>(
      '/chapter-outlines/batch-chapters',
      chapterOutlineIds,
    ),

  update: (chapterId: string, data: ChapterUpdate) =>
    client.put<Chapter>(`/chapters/${chapterId}`, data),

  listVersions: (chapterId: string) =>
    client.get<ChapterVersion[]>(`/chapters/${chapterId}/versions`),

  restoreVersion: (chapterId: string, versionId: string) =>
    client.post<Chapter>(`/chapters/${chapterId}/versions/${versionId}/restore`),

  compareVersions: (chapterId: string, v1Id: string, v2Id: string) =>
    client.get<{ v1: VersionCompare; v2: VersionCompare }>(
      `/chapters/${chapterId}/versions/${v1Id}/compare/${v2Id}`,
    ),

  scoreChapter: (chapterId: string, modelId: string) =>
    client.post<QualityScore>(`/chapters/${chapterId}/score`, { model_id: modelId }),

  checkConsistency: (chapterId: string, modelId: string) =>
    client.post<ConsistencyCheckResult>(`/chapters/${chapterId}/check-consistency`, { model_id: modelId }),

  estimateCost: (chapterId: string, modelId: string, templateId?: string) =>
    client.post<CostEstimate>(`/chapters/${chapterId}/estimate-cost`, {
      model_id: modelId,
      template_id: templateId || undefined,
    }),

  getContext: (chapterId: string) =>
    client.get<ChapterContext>(`/chapters/${chapterId}/context`),

  getContextUsage: (chapterId: string, modelId: string) =>
    client.get<ContextUsage>(`/chapters/${chapterId}/context-usage?model_id=${modelId}`),

  generate: (chapterId: string, data: ChapterGenerateRequest, onEvent: (event: SSEEvent) => void): AbortController =>
    streamSSE(`/api/chapters/${chapterId}/generate`, data, onEvent, '生成流意外中断'),

  continueWriting: (chapterId: string, data: ChapterGenerateRequest, onEvent: (event: SSEEvent) => void): AbortController =>
    streamSSE(`/api/chapters/${chapterId}/continue`, data, onEvent, '续写流意外中断'),

  regenerate: (chapterId: string, data: ChapterGenerateRequest, onEvent: (event: SSEEvent) => void): AbortController =>
    streamSSE(`/api/chapters/${chapterId}/regenerate`, data, onEvent, '重新生成流意外中断'),

  batchGenerate: (
    modelId: string,
    chapterOutlineIds: string[],
    onEvent: (event: SSEEvent) => void,
    onDone?: () => void,
  ): AbortController => {
    const controller = new AbortController();

    fetch('/api/chapters/batch-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: modelId, chapter_outline_ids: chapterOutlineIds }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.detail || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          onDone?.();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as SSEEvent;
              onEvent(event);
            } catch {
              // Skip malformed events
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          onEvent({ type: 'error', message: err.message });
        }
      })
      .finally(() => {
        onDone?.();
      });

    return controller;
  },

  rewriteSelection: (
    chapterId: string,
    data: { model_id: string; selected_text: string; instruction: string; context_before?: string; context_after?: string },
    onEvent: (event: SSEEvent) => void,
  ): AbortController =>
    streamSSE(`/api/chapters/${chapterId}/rewrite-selection`, data, onEvent, '改写流意外中断'),

  refine: (
    chapterId: string,
    data: { model_id: string; draft_text: string; max_suggestions?: number },
    onEvent: (event: SSEEvent) => void,
  ): AbortController =>
    streamSSE(`/api/chapters/${chapterId}/refine`, data, onEvent, '精修流意外中断'),

  brainstorm: (
    chapterId: string,
    data: { model_id: string; selected_direction?: string },
    onEvent: (event: SSEEvent) => void,
  ): AbortController =>
    streamSSE(`/api/chapters/${chapterId}/brainstorm`, data, onEvent, '脑暴流意外中断'),
};
