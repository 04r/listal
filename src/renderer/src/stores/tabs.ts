import { create } from 'zustand'
import type { View } from './library'

export interface Tab {
  id: string
  view: View
  // If pinned, the tab won't be removed when the user opens a new view; it
  // survives page swaps within its own tab context.
  pinned?: boolean
}

interface TabsState {
  tabs: Tab[]
  activeId: string
  addTab: (view: View) => string
  closeTab: (id: string) => void
  activate: (id: string) => void
  // Replace the current tab's view (used when the user navigates within a
  // tab — e.g. clicks a playlist in the sidebar).
  setViewOnActive: (view: View) => void
  reorder: (fromId: string, toId: string) => void
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export const useTabs = create<TabsState>((set, get) => {
  const initId = makeId()
  return {
    tabs: [{ id: initId, view: { kind: 'library' } }],
    activeId: initId,

    addTab: (view) => {
      const id = makeId()
      set((s) => ({ tabs: [...s.tabs, { id, view }], activeId: id }))
      return id
    },

    closeTab: (id) => {
      const { tabs, activeId } = get()
      if (tabs.length === 1) return
      const idx = tabs.findIndex((t) => t.id === id)
      if (idx === -1) return
      const nextTabs = tabs.filter((t) => t.id !== id)
      let nextActive = activeId
      if (activeId === id) {
        const fallback = nextTabs[Math.min(idx, nextTabs.length - 1)]
        nextActive = fallback.id
      }
      set({ tabs: nextTabs, activeId: nextActive })
    },

    activate: (id) => {
      const exists = get().tabs.some((t) => t.id === id)
      if (exists) set({ activeId: id })
    },

    setViewOnActive: (view) => {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === s.activeId ? { ...t, view } : t))
      }))
    },

    reorder: (fromId, toId) => {
      const tabs = [...get().tabs]
      const fromIdx = tabs.findIndex((t) => t.id === fromId)
      const toIdx = tabs.findIndex((t) => t.id === toId)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
      const [moved] = tabs.splice(fromIdx, 1)
      tabs.splice(toIdx, 0, moved)
      set({ tabs })
    }
  }
})

// Human-readable title for a view. Used by the tab strip.
export function tabTitleFor(view: View, playlistName?: string): string {
  switch (view.kind) {
    case 'library':
      return 'Library'
    case 'playlist':
      return playlistName ?? `Playlist #${view.id}`
    case 'search':
      return 'Search'
    case 'artist':
      return view.name
    case 'uploader':
      return view.name
    case 'radio':
      return `Radio · ${view.seedTitle}`
    case 'room':
      return 'Room'
  }
}
