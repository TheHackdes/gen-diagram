import type { XYPosition } from '@xyflow/react';
import { create } from 'zustand';

export type Theme = 'light' | 'dark';
export type View = 'home' | 'workspace';
export type LeftTab = 'library' | 'networks' | 'layers';
export type RightTab = 'properties' | 'issues';
export type DialogId = 'export' | 'open' | 'templates' | 'shortcuts' | 'customOs' | null;

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

export interface PromptRequest {
  title: string;
  label: string;
  initial: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  flow: XYPosition;
  nodeId?: string;
  edgeId?: string;
}

interface UiState {
  theme: Theme;
  view: View;
  leftOpen: boolean;
  rightOpen: boolean;
  leftTab: LeftTab;
  rightTab: RightTab;
  presentation: boolean;
  dialog: DialogId;
  confirm: ConfirmRequest | null;
  prompt: PromptRequest | null;
  toasts: Toast[];
  contextMenu: ContextMenuState | null;
  zoom: number;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setView: (v: View) => void;
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setLeftTab: (t: LeftTab) => void;
  setRightTab: (t: RightTab) => void;
  setPresentation: (on: boolean) => void;
  openDialog: (d: DialogId) => void;
  askConfirm: (req: ConfirmRequest | null) => void;
  askPrompt: (req: PromptRequest | null) => void;
  toast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  setContextMenu: (m: ContextMenuState | null) => void;
  setZoom: (z: number) => void;
}

function initialTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

let toastId = 0;
const isNarrow = () => typeof window !== 'undefined' && window.innerWidth < 1024;

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme(),
  view: 'home',
  leftOpen: !isNarrow(),
  rightOpen: !isNarrow(),
  leftTab: 'library',
  rightTab: 'properties',
  presentation: false,
  dialog: null,
  confirm: null,
  prompt: null,
  toasts: [],
  contextMenu: null,
  zoom: 1,
  setTheme: (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('infracanvas.theme', theme);
    } catch {
      /* private mode */
    }
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setView: (view) => set({ view }),
  setLeftOpen: (leftOpen) => set({ leftOpen }),
  setRightOpen: (rightOpen) => set({ rightOpen }),
  setLeftTab: (leftTab) => set({ leftTab, leftOpen: true }),
  setRightTab: (rightTab) => set({ rightTab, rightOpen: true }),
  setPresentation: (presentation) => set({ presentation, contextMenu: null }),
  openDialog: (dialog) => set({ dialog }),
  askConfirm: (confirm) => set({ confirm }),
  askPrompt: (prompt) => set({ prompt }),
  toast: (message, tone = 'info') => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    setTimeout(() => get().dismissToast(id), 3200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  setZoom: (zoom) => set({ zoom }),
}));
