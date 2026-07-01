import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, type Profile } from '../lib/supabase'

export interface Room {
  id: string
  name: string
  description: string | null
  owner_id: string
  is_public: boolean
  created_at: string
  memberCount?: number
}

export interface RoomMessage {
  id: number
  room_id: string
  from_user: string
  body: string
  created_at: string
  profile?: Profile | null
}

interface RoomsState {
  meId: string | null
  // Rooms I'm a member of. Sidebar/panel shows these.
  joined: Room[]
  // Public rooms discovered via browse. Not persisted.
  browsed: Room[]
  // roomId -> in-memory messages, newest last.
  messages: Record<string, RoomMessage[]>
  // roomId -> realtime channel subscription (only for joined rooms).
  channels: Record<string, RealtimeChannel>
  loading: boolean
  error: string | null

  start: (meId: string) => Promise<void>
  stop: () => Promise<void>
  refreshJoined: () => Promise<void>
  browsePublic: () => Promise<void>
  createRoom: (
    name: string,
    description?: string
  ) => Promise<{ ok: true; room: Room } | { ok: false; error: string }>
  joinRoom: (roomId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  leaveRoom: (roomId: string) => Promise<void>
  sendMessage: (roomId: string, body: string) => Promise<{ ok: true } | { ok: false; error: string }>
  loadMessages: (roomId: string) => Promise<void>
}

const MESSAGE_BUFFER = 200

export const useRooms = create<RoomsState>((set, get) => {
  async function fetchJoined(meId: string): Promise<Room[]> {
    // Two-hop: get room_members rows for me, then fetch those rooms.
    const { data: memberships, error: e1 } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('user_id', meId)
    if (e1) throw e1
    const roomIds = (memberships ?? []).map((r) => r.room_id as string)
    if (roomIds.length === 0) return []
    const { data: rooms, error: e2 } = await supabase
      .from('rooms')
      .select('*')
      .in('id', roomIds)
    if (e2) throw e2
    return (rooms ?? []) as Room[]
  }

  async function subscribeToRoom(roomId: string): Promise<void> {
    if (get().channels[roomId]) return
    const ch = supabase.channel(`room:${roomId}`)
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
      async (payload) => {
        const raw = payload.new as RoomMessage
        // Fetch the author profile so we can render display name / avatar.
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', raw.from_user)
          .maybeSingle()
        const msg: RoomMessage = { ...raw, profile: (profile ?? null) as Profile | null }
        set((s) => {
          const list = s.messages[roomId] ?? []
          const next = [...list, msg]
          if (next.length > MESSAGE_BUFFER) next.splice(0, next.length - MESSAGE_BUFFER)
          return { messages: { ...s.messages, [roomId]: next } }
        })
      }
    )
    ch.subscribe()
    set((s) => ({ channels: { ...s.channels, [roomId]: ch } }))
  }

  async function unsubscribeFromRoom(roomId: string): Promise<void> {
    const ch = get().channels[roomId]
    if (!ch) return
    await ch.unsubscribe()
    set((s) => {
      const nextChannels = { ...s.channels }
      delete nextChannels[roomId]
      return { channels: nextChannels }
    })
  }

  return {
    meId: null,
    joined: [],
    browsed: [],
    messages: {},
    channels: {},
    loading: false,
    error: null,

    start: async (meId) => {
      if (get().meId === meId && get().joined.length > 0) return
      set({ meId, loading: true, error: null })
      try {
        const joined = await fetchJoined(meId)
        set({ joined, loading: false })
        // Subscribe to every joined room so new messages arrive live even
        // when the user isn't looking at that room.
        for (const r of joined) void subscribeToRoom(r.id)
      } catch (e) {
        set({ loading: false, error: (e as Error).message })
      }
    },

    stop: async () => {
      for (const ch of Object.values(get().channels)) {
        try {
          await ch.unsubscribe()
        } catch {
          /* ignore */
        }
      }
      set({ meId: null, joined: [], browsed: [], messages: {}, channels: {}, error: null })
    },

    refreshJoined: async () => {
      const meId = get().meId
      if (!meId) return
      try {
        const joined = await fetchJoined(meId)
        set({ joined })
      } catch (e) {
        set({ error: (e as Error).message })
      }
    },

    browsePublic: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) {
        set({ error: error.message })
        return
      }
      set({ browsed: (data ?? []) as Room[] })
    },

    createRoom: async (name, description) => {
      const meId = get().meId
      if (!meId) return { ok: false, error: 'Not signed in' }
      const clean = name.trim()
      if (clean.length < 2) return { ok: false, error: 'Room name too short' }
      const { data, error } = await supabase
        .from('rooms')
        .insert({ name: clean, description: description ?? null, owner_id: meId })
        .select()
        .single()
      if (error) return { ok: false, error: error.message }
      // Auto-join yourself as owner.
      await supabase
        .from('room_members')
        .insert({ room_id: data.id, user_id: meId, role: 'owner' })
      await get().refreshJoined()
      void subscribeToRoom(data.id)
      return { ok: true, room: data as Room }
    },

    joinRoom: async (roomId) => {
      const meId = get().meId
      if (!meId) return { ok: false, error: 'Not signed in' }
      const { error } = await supabase
        .from('room_members')
        .upsert({ room_id: roomId, user_id: meId })
      if (error) return { ok: false, error: error.message }
      await get().refreshJoined()
      void subscribeToRoom(roomId)
      void get().loadMessages(roomId)
      return { ok: true }
    },

    leaveRoom: async (roomId) => {
      const meId = get().meId
      if (!meId) return
      await supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', meId)
      await unsubscribeFromRoom(roomId)
      set((s) => {
        const nextMessages = { ...s.messages }
        delete nextMessages[roomId]
        return {
          joined: s.joined.filter((r) => r.id !== roomId),
          messages: nextMessages
        }
      })
    },

    sendMessage: async (roomId, body) => {
      const meId = get().meId
      if (!meId) return { ok: false, error: 'Not signed in' }
      const clean = body.trim()
      if (!clean) return { ok: false, error: 'Empty message' }
      const { error } = await supabase
        .from('room_messages')
        .insert({ room_id: roomId, from_user: meId, body: clean })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    },

    loadMessages: async (roomId) => {
      // Fetch messages first, then author profiles in one follow-up query.
      // Simpler than a Supabase FK-relationship select and less error-prone
      // when the relationship isn't detected.
      const { data: rows, error } = await supabase
        .from('room_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_BUFFER)
      if (error) {
        console.warn('[rooms] loadMessages error', error)
        set({ error: error.message })
        return
      }
      const list = ((rows ?? []) as RoomMessage[]).slice().reverse()
      if (list.length === 0) {
        set((s) => ({ messages: { ...s.messages, [roomId]: [] } }))
        return
      }
      const authorIds = Array.from(new Set(list.map((m) => m.from_user)))
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', authorIds)
      const byId = new Map<string, Profile>()
      for (const p of profiles ?? []) byId.set(p.id, p as Profile)
      const enriched = list.map((m) => ({ ...m, profile: byId.get(m.from_user) ?? null }))
      set((s) => ({ messages: { ...s.messages, [roomId]: enriched } }))
    }
  }
})
