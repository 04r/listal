import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, type Profile } from '../lib/supabase'
import type { Track } from '../../../preload'

export interface ConvoySession {
  id: string
  host_id: string
  code: string
  name: string | null
  dj_mode: 'open' | 'host_only'
  current_track_url: string | null
  current_track_title: string | null
  current_track_artist: string | null
  current_track_service: string | null
  current_track_thumbnail: string | null
  current_track_duration_sec: number | null
  current_position_sec: number
  is_playing: boolean
  position_ts: string
  created_at: string
  ended_at: string | null
}

export interface ConvoyParticipant {
  convoy_id: string
  user_id: string
  role: 'host' | 'dj' | 'guest'
  joined_at: string
  profile: Profile | null
}

export interface ConvoyQueueItem {
  id: number
  convoy_id: string
  position: number
  service: string
  source_url: string
  title: string
  artist: string | null
  thumbnail_url: string | null
  duration_sec: number | null
  added_by: string
  added_at: string
}

interface ConvoyState {
  meId: string | null
  session: ConvoySession | null
  participants: ConvoyParticipant[]
  queue: ConvoyQueueItem[]
  channel: RealtimeChannel | null
  loading: boolean
  error: string | null
  // While applying incoming session state to the local player, ignore any
  // resulting player events so we don't rebroadcast our own updates.
  suppressBroadcast: boolean
  // Voter user-ids who have voted to skip the current track. Reset whenever
  // the current track changes.
  skipVotes: string[]

  setMeId: (id: string | null) => void
  createConvoy: (name?: string) => Promise<{ ok: true; code: string } | { ok: false; error: string }>
  joinByCode: (code: string) => Promise<{ ok: true } | { ok: false; error: string }>
  invite: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  leave: () => Promise<void>
  addToQueue: (track: Track) => Promise<void>
  addTracksToQueue: (tracks: Track[]) => Promise<void>
  removeFromQueue: (id: number) => Promise<void>
  broadcastTrack: (track: Track | null, positionSec: number, isPlaying: boolean) => Promise<void>
  broadcastPlayback: (state: { is_playing?: boolean; current_position_sec?: number }) => Promise<void>
  advanceQueue: () => Promise<ConvoyQueueItem | null>
  setSuppress: (v: boolean) => void
  // Skip / role controls.
  setRole: (userId: string, role: 'dj' | 'guest') => Promise<{ ok: true } | { ok: false; error: string }>
  hostSkip: () => Promise<void>
  voteSkip: () => Promise<void>
}

function genCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `CVY-${out.slice(0, 3)}-${out.slice(3)}`
}

export const useConvoy = create<ConvoyState>((set, get) => {
  async function loadParticipants(): Promise<void> {
    const { session } = get()
    if (!session) return
    const { data, error } = await supabase
      .from('convoy_participants')
      .select('*, profile:profiles(*)')
      .eq('convoy_id', session.id)
      .order('joined_at', { ascending: true })
    if (!error) set({ participants: (data ?? []) as ConvoyParticipant[] })
  }

  async function loadQueue(): Promise<void> {
    const { session } = get()
    if (!session) return
    const { data, error } = await supabase
      .from('convoy_queue')
      .select('*')
      .eq('convoy_id', session.id)
      .order('position', { ascending: true })
    if (!error) set({ queue: (data ?? []) as ConvoyQueueItem[] })
  }

  async function subscribeToConvoy(convoyId: string): Promise<void> {
    const existing = get().channel
    if (existing) await existing.unsubscribe()

    const ch = supabase.channel(`convoy:${convoyId}`)
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'convoys', filter: `id=eq.${convoyId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          void get().leave()
          return
        }
        const next = payload.new as ConvoySession
        if (next.ended_at) {
          void get().leave()
          return
        }
        const prev = get().session
        if (prev && prev.current_track_url !== next.current_track_url) {
          resetVotes()
        }
        set({ session: next })
      }
    )
    ch.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'convoy_participants',
        filter: `convoy_id=eq.${convoyId}`
      },
      () => void loadParticipants()
    )
    ch.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'convoy_queue',
        filter: `convoy_id=eq.${convoyId}`
      },
      () => void loadQueue()
    )
    // Skip-vote broadcasts. Payload: { user_id, track_url }. We only accept
    // votes matching the currently-playing track so stale votes for the
    // previous song don't leak across.
    ch.on('broadcast', { event: 'skip_vote' }, (msg) => {
      const p = msg.payload as { user_id?: string; track_url?: string } | undefined
      if (!p?.user_id) return
      const cur = get().session?.current_track_url
      if (!cur || p.track_url !== cur) return
      const votes = get().skipVotes
      if (votes.includes(p.user_id)) return
      const nextVotes = [...votes, p.user_id]
      set({ skipVotes: nextVotes })
      maybeExecuteVoteSkip(nextVotes)
    })
    ch.subscribe()
    set({ channel: ch })
  }

  // Reset votes whenever we swap tracks so a stale count doesn't skip the new
  // song. Runs from the session subscription below.
  function resetVotes(): void {
    set({ skipVotes: [] })
  }

  // Only the host (or a DJ if the host isn't currently connected) is
  // responsible for actually removing the queue item and broadcasting the
  // new track. This prevents the same vote crossing the threshold from
  // triggering N deletes.
  function maybeExecuteVoteSkip(votes: string[]): void {
    const s = get().session
    if (!s) return
    const parts = get().participants
    const total = parts.length
    if (total < 3) return
    const threshold = total - 1
    if (votes.length < threshold) return
    const meId = get().meId
    if (!meId) return
    const isHost = meId === s.host_id
    const hostPresent = parts.some((p) => p.user_id === s.host_id)
    const iAmDj = parts.find((p) => p.user_id === meId)?.role === 'dj'
    // Only the host triggers when host is present; otherwise a DJ, otherwise
    // the participant who has been in the room longest.
    let shouldAct = false
    if (isHost) shouldAct = true
    else if (!hostPresent && iAmDj) shouldAct = true
    else if (!hostPresent) {
      const nonHostDjs = parts.filter((p) => p.role === 'dj')
      if (nonHostDjs.length === 0) {
        const sorted = [...parts].sort((a, b) => a.joined_at.localeCompare(b.joined_at))
        shouldAct = sorted[0]?.user_id === meId
      }
    }
    if (shouldAct) void get().hostSkip()
  }

  return {
    meId: null,
    session: null,
    participants: [],
    queue: [],
    channel: null,
    loading: false,
    error: null,
    suppressBroadcast: false,
    skipVotes: [],

    setMeId: (id) => set({ meId: id }),

    createConvoy: async (name) => {
      const meId = get().meId
      if (!meId) return { ok: false, error: 'Not signed in' }
      set({ loading: true, error: null })
      // Retry a handful of times in case the random code collides.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = genCode()
        const { data, error } = await supabase
          .from('convoys')
          .insert({ host_id: meId, code, name: name ?? null })
          .select()
          .single()
        if (error) {
          if (error.code === '23505') continue // unique_violation on code
          set({ loading: false, error: error.message })
          return { ok: false, error: error.message }
        }
        const { error: pErr } = await supabase.from('convoy_participants').insert({
          convoy_id: data.id,
          user_id: meId,
          role: 'host'
        })
        if (pErr) {
          set({ loading: false, error: pErr.message })
          return { ok: false, error: pErr.message }
        }
        set({ session: data as ConvoySession, loading: false })
        await subscribeToConvoy(data.id)
        await loadParticipants()
        await loadQueue()
        return { ok: true, code: data.code }
      }
      set({ loading: false, error: 'Could not allocate a Convoy code' })
      return { ok: false, error: 'Could not allocate a Convoy code' }
    },

    joinByCode: async (rawCode) => {
      const meId = get().meId
      if (!meId) return { ok: false, error: 'Not signed in' }
      const code = rawCode.trim().toUpperCase().replace(/\s+/g, '')
      if (!code) return { ok: false, error: 'Code required' }
      set({ loading: true, error: null })
      const { data, error } = await supabase
        .from('convoys')
        .select('*')
        .eq('code', code)
        .is('ended_at', null)
        .maybeSingle()
      if (error || !data) {
        set({ loading: false, error: 'Convoy not found' })
        return { ok: false, error: 'Convoy not found' }
      }
      const role = data.host_id === meId ? 'host' : 'guest'
      const { error: pErr } = await supabase
        .from('convoy_participants')
        .upsert({ convoy_id: data.id, user_id: meId, role })
      if (pErr) {
        set({ loading: false, error: pErr.message })
        return { ok: false, error: pErr.message }
      }
      set({ session: data as ConvoySession, loading: false })
      await subscribeToConvoy(data.id)
      await loadParticipants()
      await loadQueue()
      return { ok: true }
    },

    invite: async (userId) => {
      // Direct add — no acceptance flow. Convoy is friend-scoped so trust is
      // already established. The invitee's client picks it up via realtime.
      const { session } = get()
      if (!session) return { ok: false, error: 'Not in a Convoy' }
      const { error } = await supabase
        .from('convoy_participants')
        .upsert({ convoy_id: session.id, user_id: userId, role: 'guest' })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    },

    leave: async () => {
      const { session, channel, meId } = get()
      if (channel) await channel.unsubscribe()
      if (session && meId) {
        if (meId === session.host_id) {
          // Host leaving ends the Convoy for everyone.
          await supabase
            .from('convoys')
            .update({ ended_at: new Date().toISOString() })
            .eq('id', session.id)
        } else {
          await supabase
            .from('convoy_participants')
            .delete()
            .eq('convoy_id', session.id)
            .eq('user_id', meId)
        }
      }
      set({ session: null, participants: [], queue: [], channel: null, error: null })
    },

    addToQueue: async (track) => {
      const { session, meId, queue } = get()
      if (!session || !meId) return
      const last = queue[queue.length - 1]
      const position = last ? last.position + 1 : 1
      await supabase.from('convoy_queue').insert({
        convoy_id: session.id,
        position,
        service: track.service,
        source_url: track.sourceUrl,
        title: track.title,
        artist: track.artist ?? null,
        thumbnail_url: track.thumbnailUrl ?? null,
        duration_sec: track.durationMs ? track.durationMs / 1000 : null,
        added_by: meId
      })
    },

    addTracksToQueue: async (tracks) => {
      const { session, meId, queue } = get()
      if (!session || !meId || tracks.length === 0) return
      const last = queue[queue.length - 1]
      let position = last ? last.position + 1 : 1
      const rows = tracks.map((t) => ({
        convoy_id: session.id,
        position: position++,
        service: t.service,
        source_url: t.sourceUrl,
        title: t.title,
        artist: t.artist ?? null,
        thumbnail_url: t.thumbnailUrl ?? null,
        duration_sec: t.durationMs ? t.durationMs / 1000 : null,
        added_by: meId
      }))
      await supabase.from('convoy_queue').insert(rows)
    },

    removeFromQueue: async (id) => {
      await supabase.from('convoy_queue').delete().eq('id', id)
    },

    broadcastTrack: async (track, positionSec, isPlaying) => {
      const { session } = get()
      if (!session) return
      await supabase
        .from('convoys')
        .update({
          current_track_url: track?.sourceUrl ?? null,
          current_track_title: track?.title ?? null,
          current_track_artist: track?.artist ?? null,
          current_track_service: track?.service ?? null,
          current_track_thumbnail: track?.thumbnailUrl ?? null,
          current_track_duration_sec: track?.durationMs ? track.durationMs / 1000 : null,
          current_position_sec: positionSec,
          is_playing: isPlaying,
          position_ts: new Date().toISOString()
        })
        .eq('id', session.id)
    },

    broadcastPlayback: async ({ is_playing, current_position_sec }) => {
      const { session } = get()
      if (!session) return
      const patch: Record<string, unknown> = {
        position_ts: new Date().toISOString()
      }
      if (typeof is_playing === 'boolean') patch.is_playing = is_playing
      if (typeof current_position_sec === 'number') patch.current_position_sec = current_position_sec
      await supabase.from('convoys').update(patch).eq('id', session.id)
    },

    advanceQueue: async () => {
      const { queue } = get()
      const next = queue[0] ?? null
      if (next) {
        await supabase.from('convoy_queue').delete().eq('id', next.id)
      }
      return next
    },

    setSuppress: (v) => set({ suppressBroadcast: v }),

    setRole: async (userId, role) => {
      const { session, meId } = get()
      if (!session || !meId) return { ok: false, error: 'Not in a Convoy' }
      if (meId !== session.host_id) return { ok: false, error: 'Only the host can change roles' }
      const { error } = await supabase
        .from('convoy_participants')
        .update({ role })
        .eq('convoy_id', session.id)
        .eq('user_id', userId)
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    },

    hostSkip: async () => {
      const { session, queue } = get()
      if (!session) return
      const next = queue[0]
      if (next) {
        await supabase.from('convoy_queue').delete().eq('id', next.id)
        await supabase
          .from('convoys')
          .update({
            current_track_url: next.source_url,
            current_track_title: next.title,
            current_track_artist: next.artist,
            current_track_service: next.service,
            current_track_thumbnail: next.thumbnail_url,
            current_track_duration_sec: next.duration_sec,
            current_position_sec: 0,
            is_playing: true,
            position_ts: new Date().toISOString()
          })
          .eq('id', session.id)
      } else {
        // Nothing next — just stop playback of the current track.
        await supabase
          .from('convoys')
          .update({
            current_track_url: null,
            current_track_title: null,
            current_track_artist: null,
            current_track_service: null,
            current_track_thumbnail: null,
            current_track_duration_sec: null,
            current_position_sec: 0,
            is_playing: false,
            position_ts: new Date().toISOString()
          })
          .eq('id', session.id)
      }
      set({ skipVotes: [] })
    },

    voteSkip: async () => {
      const { session, channel, meId, skipVotes } = get()
      if (!session || !meId || !channel) return
      if (!session.current_track_url) return
      if (skipVotes.includes(meId)) return
      // Optimistically record locally, then broadcast so peers count us.
      const nextVotes = [...skipVotes, meId]
      set({ skipVotes: nextVotes })
      await channel.send({
        type: 'broadcast',
        event: 'skip_vote',
        payload: { user_id: meId, track_url: session.current_track_url }
      })
      // Locally check the threshold too, in case we're the acting client.
      maybeExecuteVoteSkip(nextVotes)
    }
  }
})

// Turn a queue item into the Track shape the player expects.
export function queueItemToTrack(item: ConvoyQueueItem): Track {
  return {
    id: -1,
    service: item.service,
    serviceId: item.source_url,
    sourceUrl: item.source_url,
    title: item.title,
    artist: item.artist,
    durationMs: item.duration_sec ? Math.round(item.duration_sec * 1000) : null,
    thumbnailUrl: item.thumbnail_url,
    addedAt: Date.now()
  }
}
