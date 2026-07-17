import { useQuery } from '@tanstack/react-query';
import { projectsApi, Project, ProjectStats } from './projects';
import { modelsApi, ModelConfig } from './models';
import { chaptersApi, Chapter, ChapterContext, ContextUsage } from './chapters';

/**
 * TanStack Query hooks —— server state（Phase 2「渐进接入」）。
 *
 * 仅覆盖高频、易竞态的读取：项目列表、模型列表、章节加载、上下文用量。
 * zustand store 保留写操作与纯前端 UI 态。TanStack 的 queryKey 天然去重 +
 * 缓存 + 单飞，替代 store 里手写的 `_xxxFetching` 重入锁。
 */

// ---------- Projects ----------
export function useProjects(includeArchived = false) {
  return useQuery<Project[]>({
    queryKey: ['projects', { includeArchived }],
    queryFn: async () => (await projectsApi.list(includeArchived)).data,
  });
}

export function useTrashProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects', 'trash'],
    queryFn: async () => (await projectsApi.listTrash()).data,
  });
}

export function useProject(id: string | undefined) {
  return useQuery<Project>({
    queryKey: ['project', id],
    queryFn: async () => (await projectsApi.get(id!)).data,
    enabled: !!id,
  });
}

export function useProjectStats(id: string | undefined) {
  return useQuery<ProjectStats>({
    queryKey: ['project', id, 'stats'],
    queryFn: async () => (await projectsApi.stats(id!)).data,
    enabled: !!id,
  });
}

// ---------- Models ----------
export function useModels() {
  return useQuery<ModelConfig[]>({
    queryKey: ['models'],
    queryFn: async () => (await modelsApi.list()).data,
  });
}

// ---------- Chapters ----------
/** 按 chapter_outline_id 取章节实体（chaptersApi.getByOutline 是唯一 get 入口）。 */
export function useChapterByOutline(chapterOutlineId: string | undefined) {
  return useQuery<Chapter>({
    queryKey: ['chapter', 'by-outline', chapterOutlineId],
    queryFn: async () => (await chaptersApi.getByOutline(chapterOutlineId!)).data,
    enabled: !!chapterOutlineId,
  });
}

export function useChapterContext(chapterId: string | undefined) {
  return useQuery<ChapterContext>({
    queryKey: ['chapter', chapterId, 'context'],
    queryFn: async () => (await chaptersApi.getContext(chapterId!)).data,
    enabled: !!chapterId,
  });
}

export function useContextUsage(chapterId: string | undefined, modelId: string | undefined) {
  return useQuery<ContextUsage>({
    queryKey: ['chapter', chapterId, 'context-usage', modelId],
    queryFn: async () => (await chaptersApi.getContextUsage(chapterId!, modelId!)).data,
    enabled: !!chapterId && !!modelId,
  });
}

// ---------- Jobs（后台任务轮询）----------
export interface JobRecord {
  id: string;
  kind: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 轮询后台任务状态。``refetchInterval`` 终态后自动停止。
 * 用法：``const { data, isPending } = useJob(jobId)``；pending/running 期间 2s 轮询，
 * completed/failed 后停止。
 */
export function useJob(jobId: string | null | undefined) {
  return useQuery<JobRecord>({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('novelforge_token') ?? ''}`,
        },
      });
      if (!res.ok) throw new Error('任务查询失败');
      return res.json() as Promise<JobRecord>;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'pending' || s === 'running' ? 2000 : false;
    },
  });
}
