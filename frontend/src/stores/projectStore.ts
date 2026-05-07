import { create } from 'zustand';
import { projectsApi, Project, ProjectCreate, ProjectUpdate, ProjectStats } from '../api/projects';

interface ProjectState {
  projects: Project[];
  trashProjects: Project[];
  currentProject: Project | null;
  stats: ProjectStats | null;
  loading: boolean;
  error: string | null;

  fetchProjects: (includeArchived?: boolean) => Promise<void>;
  fetchTrash: () => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  fetchStats: (id: string) => Promise<void>;
  createProject: (data: ProjectCreate) => Promise<Project>;
  updateProject: (id: string, data: ProjectUpdate) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  unarchiveProject: (id: string) => Promise<void>;
  restoreProject: (id: string) => Promise<void>;
  permanentDeleteProject: (id: string) => Promise<void>;
}

let _projectsFetching = false;
let _trashFetching = false;
let _projectFetching: string | null = null;
let _statsFetching: string | null = null;

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  trashProjects: [],
  currentProject: null,
  stats: null,
  loading: false,
  error: null,

  fetchProjects: async (includeArchived?: boolean) => {
    if (_projectsFetching) return;
    _projectsFetching = true;
    set({ loading: true, error: null });
    try {
      const { data } = await projectsApi.list(includeArchived);
      set({ projects: data, loading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取项目列表失败';
      set({ error: message, loading: false });
    } finally {
      _projectsFetching = false;
    }
  },

  fetchTrash: async () => {
    if (_trashFetching) return;
    _trashFetching = true;
    set({ loading: true, error: null });
    try {
      const { data } = await projectsApi.listTrash();
      set({ trashProjects: data, loading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取回收站失败';
      set({ error: message, loading: false });
    } finally {
      _trashFetching = false;
    }
  },

  fetchProject: async (id: string) => {
    if (_projectFetching === id) return;
    _projectFetching = id;
    set({ loading: true, error: null });
    try {
      const { data } = await projectsApi.get(id);
      set({ currentProject: data, loading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '获取项目详情失败';
      set({ error: message, loading: false });
    } finally {
      _projectFetching = null;
    }
  },

  fetchStats: async (id: string) => {
    if (_statsFetching === id) return;
    _statsFetching = id;
    try {
      const { data } = await projectsApi.stats(id);
      set({ stats: data });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      _statsFetching = null;
    }
  },

  createProject: async (data: ProjectCreate) => {
    const { data: project } = await projectsApi.create(data);
    set((state) => ({ projects: [project, ...state.projects] }));
    return project;
  },

  updateProject: async (id: string, data: ProjectUpdate) => {
    const { data: project } = await projectsApi.update(id, data);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? project : p)),
      currentProject: state.currentProject?.id === id ? project : state.currentProject,
    }));
  },

  deleteProject: async (id: string) => {
    await projectsApi.delete(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }));
  },

  archiveProject: async (id: string) => {
    const { data: project } = await projectsApi.archive(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? project : state.currentProject,
    }));
  },

  unarchiveProject: async (id: string) => {
    const { data: project } = await projectsApi.unarchive(id);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? project : p)),
      currentProject: state.currentProject?.id === id ? project : state.currentProject,
    }));
  },

  restoreProject: async (id: string) => {
    const { data: project } = await projectsApi.restore(id);
    set((state) => ({
      trashProjects: state.trashProjects.filter((p) => p.id !== id),
      projects: [project, ...state.projects],
    }));
  },

  permanentDeleteProject: async (id: string) => {
    await projectsApi.permanentDelete(id);
    set((state) => ({
      trashProjects: state.trashProjects.filter((p) => p.id !== id),
    }));
  },
}));
