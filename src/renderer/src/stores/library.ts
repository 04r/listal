import { create } from 'zustand'

export type View =
  | { kind: 'library' }
  | { kind: 'playlist'; id: number }
  | { kind: 'search' }
  | { kind: 'artist'; name: string }
  | { kind: 'uploader'; name: string }
  | { kind: 'radio'; seedUrl: string; seedTitle: string }
  | { kind: 'room'; roomId: string }

interface LibraryState {
  view: View
  version: number
  addDialogOpen: boolean
  setView: (v: View) => void
  bump: () => void
  openAdd: () => void
  closeAdd: () => void
}

export const useLibrary = create<LibraryState>((set) => ({
  view: { kind: 'library' },
  version: 0,
  addDialogOpen: false,
  setView: (view) => {
    set({ view })
    // Mirror into the active tab so the tab strip always reflects the
    // current view. Imported lazily to avoid circular imports.
    import('./tabs').then(({ useTabs }) => {
      useTabs.getState().setViewOnActive(view)
    })
  },
  bump: () => set((s) => ({ version: s.version + 1 })),
  openAdd: () => set({ addDialogOpen: true }),
  closeAdd: () => set({ addDialogOpen: false })
}))
