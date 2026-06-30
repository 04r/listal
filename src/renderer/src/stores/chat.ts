import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, type Profile, type MessageRow } from '../lib/supabase'

interface ChatState {
  // Friend we're currently chatting with, null if no chat panel open.
  peer: Profile | null
  messages: MessageRow[]
  loading: boolean
  error: string | null
  // Realtime channel for new-message inserts. One channel per open chat.
  channel: RealtimeChannel | null

  openWith: (peer: Profile) => Promise<void>
  close: () => Promise<void>
  send: (meId: string, body: string) => Promise<void>
}

export const useChat = create<ChatState>((set, get) => ({
  peer: null,
  messages: [],
  loading: false,
  error: null,
  channel: null,

  openWith: async (peer) => {
    const prev = get().channel
    if (prev) await prev.unsubscribe()
    set({ peer, messages: [], loading: true, error: null, channel: null })

    const meId = (await supabase.auth.getUser()).data.user?.id
    if (!meId) {
      set({ loading: false, error: 'Not signed in.' })
      return
    }

    // Load the last 100 messages between us in either direction.
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(from_user.eq.${meId},to_user.eq.${peer.id}),and(from_user.eq.${peer.id},to_user.eq.${meId})`
      )
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) {
      set({ loading: false, error: error.message })
      return
    }
    set({ messages: data ?? [], loading: false })

    // Subscribe to new inserts that involve this pair. Postgres changes filter
    // doesn't support OR, so we filter by `to_user.eq.<meId>` (incoming) and
    // ignore anything not from `peer`.
    const ch = supabase
      .channel(`dm:${meId}:${peer.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `to_user=eq.${meId}`
        },
        (payload) => {
          const m = payload.new as MessageRow
          if (m.from_user !== peer.id) return
          set((s) => ({ messages: [...s.messages, m] }))
          // Best-effort: mark as read since the chat panel is open.
          void supabase
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', m.id)
        }
      )
      .subscribe()
    set({ channel: ch })

    // Mark any unread messages from this peer as read.
    void supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .eq('to_user', meId)
      .eq('from_user', peer.id)
  },

  close: async () => {
    const ch = get().channel
    if (ch) await ch.unsubscribe()
    set({ peer: null, messages: [], channel: null, error: null })
  },

  send: async (meId, body) => {
    const peer = get().peer
    if (!peer) return
    const trimmed = body.trim()
    if (!trimmed) return
    // Optimistic insert; we'll replace with the real row when it returns.
    const optimistic: MessageRow = {
      id: -Date.now(),
      from_user: meId,
      to_user: peer.id,
      body: trimmed,
      created_at: new Date().toISOString(),
      read_at: null
    }
    set((s) => ({ messages: [...s.messages, optimistic] }))

    const { data, error } = await supabase
      .from('messages')
      .insert({ from_user: meId, to_user: peer.id, body: trimmed })
      .select()
      .single()

    if (error) {
      // Roll back the optimistic insert and surface the error.
      set((s) => ({
        messages: s.messages.filter((m) => m.id !== optimistic.id),
        error: error.message
      }))
      return
    }
    set((s) => ({
      messages: s.messages.map((m) => (m.id === optimistic.id ? (data as MessageRow) : m))
    }))
  }
}))
