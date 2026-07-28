import { create } from "zustand";
import type { Profile, Subscription } from "@/lib/types";

interface AppState {
  // User
  profile: Profile | null;
  subscription: Subscription | null;
  setProfile: (profile: Profile | null) => void;
  setSubscription: (subscription: Subscription | null) => void;

  // UI
  sidenavOpen: boolean;
  setSidenavOpen: (open: boolean) => void;
  toggleSidenav: () => void;

  // Notifications
  unreadNotificationCount: number;
  setUnreadNotificationCount: (count: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // User
  profile: null,
  subscription: null,
  setProfile: (profile) => set({ profile }),
  setSubscription: (subscription) => set({ subscription }),

  // UI
  sidenavOpen: false,
  setSidenavOpen: (open) => set({ sidenavOpen: open }),
  toggleSidenav: () => set((state) => ({ sidenavOpen: !state.sidenavOpen })),

  // Notifications
  unreadNotificationCount: 0,
  setUnreadNotificationCount: (count) => set({ unreadNotificationCount: count }),
}));
