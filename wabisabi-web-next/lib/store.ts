import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Model, ChatSession } from "@/types";

interface AppState {
  user: User | null;
  selectedModel: Model | null;
  chatSessions: ChatSession[];
  currentSession: ChatSession | null;
  sidebarOpen: boolean;
  theme: "light" | "dark";
  setUser: (user: User | null) => void;
  setSelectedModel: (model: Model | null) => void;
  setChatSessions: (sessions: ChatSession[]) => void;
  setCurrentSession: (session: ChatSession | null) => void;
  addChatSession: (session: ChatSession) => void;
  toggleSidebar: () => void;
  setTheme: (theme: "light" | "dark") => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      selectedModel: null,
      chatSessions: [],
      currentSession: null,
      sidebarOpen: true,
      theme: "dark",
      setUser: (user) => set({ user }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      setChatSessions: (chatSessions) => set({ chatSessions }),
      setCurrentSession: (currentSession) => set({ currentSession }),
      addChatSession: (session) =>
        set((state) => ({
          chatSessions: [session, ...state.chatSessions],
        })),
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "wabi-sabi-storage",
    },
  ),
);
