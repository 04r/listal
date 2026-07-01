import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type Profile } from '../lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  initializing: boolean
  // True when we have an auth user but no profile row — happens when sign-up
  // succeeded before the SQL schema existed, or when email confirmation was on
  // and the profile insert was skipped. UI surfaces a claim-username modal.
  needsUsername: boolean
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  signUp: (
    email: string,
    password: string,
    username: string,
    displayName: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  claimUsername: (
    username: string,
    displayName: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  updateProfile: (
    updates: { display_name?: string | null; avatar_url?: string | null; username?: string }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

// Hard timeout so a stalled Supabase request can't hang the UI forever.
// Network-level retries inside the SDK can leave promises pending indefinitely
// when the server never responds; this gives every awaited call a ceiling.
function withTimeout<T>(p: PromiseLike<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${what} timed out after ${ms / 1000}s`)),
      ms
    )
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

async function loadProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await withTimeout(
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      15_000,
      'profile load'
    )
    if (error) {
      console.warn('[auth] profile load failed', error)
      return null
    }
    return data ?? null
  } catch (e) {
    console.warn('[auth] profile load timed out', e)
    return null
  }
}

// While signUp/claimUsername is mid-flight, the auth state change listener can
// fire before our profile insert lands. Suppress its needsUsername toggle for
// that window so the UI doesn't flash the claim-username dialog.
let suppressNeedsUsername = false

// Cache the last-known profile in localStorage so the very first paint after
// launch shows the signed-in library, not a signed-out splash. We still fetch
// a fresh profile in the background to catch anything that changed elsewhere.
const PROFILE_CACHE_KEY = 'listal:cachedProfile'
function readCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Profile
  } catch {
    return null
  }
}
function writeCachedProfile(p: Profile | null): void {
  try {
    if (p) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p))
    else localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

export const useAuth = create<AuthState>((set, get) => {
  // Bootstrap: pick up any persisted session, then subscribe to changes.
  //
  // Two phases:
  //   1. Instant — flip initializing=false with cached session + profile so
  //      the app never renders a signed-out UI when the user is actually
  //      signed in.
  //   2. Refresh — pull the current profile in the background and reconcile.
  supabase.auth.getSession().then(async ({ data }) => {
    const session = data.session
    const user = session?.user ?? null
    const cached = user ? readCachedProfile() : null
    set({
      session,
      user,
      profile: cached,
      initializing: false
    })
    if (!user) return
    const profile = await loadProfile(user.id)
    writeCachedProfile(profile)
    set({
      profile,
      needsUsername: !!user && !profile && !suppressNeedsUsername
    })
  })

  supabase.auth.onAuthStateChange(async (event, session) => {
    // Only wipe profile on an explicit sign-out. Token refreshes, user
    // updates, and re-sends of the initial session must NOT null out the
    // profile — that was the source of the "logged out for a second" flash.
    if (event === 'SIGNED_OUT') {
      writeCachedProfile(null)
      set({ session: null, user: null, profile: null, needsUsername: false })
      return
    }

    const user = session?.user ?? null

    // Silent refreshes just update the session; profile stays put.
    if (event === 'TOKEN_REFRESHED') {
      set({ session, user })
      return
    }

    if (suppressNeedsUsername) {
      set({ session, user })
      return
    }

    if (!user) {
      set({ session, user: null })
      return
    }

    // SIGNED_IN, USER_UPDATED, INITIAL_SESSION — refresh the profile, but
    // only overwrite our cached one if the fetch actually returns something.
    // A failed / empty fetch keeps whatever we had (so a flaky network can't
    // flip us to signed-out either).
    const fresh = await loadProfile(user.id)
    if (fresh) {
      writeCachedProfile(fresh)
      set({ session, user, profile: fresh, needsUsername: false })
    } else {
      const existing = get().profile
      set({
        session,
        user,
        needsUsername: !existing
      })
    }
  })

  // Seed initial state from localStorage so first paint already shows the
  // signed-in library. The async bootstrap above will overwrite if reality
  // differs (session expired, etc.).
  const bootProfile = readCachedProfile()
  return {
    session: null,
    user: null,
    profile: bootProfile,
    // Skip the "restoring session" splash if we have a cached profile —
    // the user is very likely still signed in and we can render immediately.
    initializing: !bootProfile,
    needsUsername: false,

    signIn: async (email, password) => {
      try {
        console.log('[auth] signIn start', { email })
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          20_000,
          'sign in'
        )
        if (error) {
          console.warn('[auth] signIn error', error)
          return { ok: false, error: error.message }
        }
        console.log('[auth] signIn ok')
        return { ok: true }
      } catch (e) {
        const msg = (e as Error).message
        console.error('[auth] signIn threw', e)
        return { ok: false, error: msg }
      }
    },

    signUp: async (email, password, username, displayName) => {
      suppressNeedsUsername = true
      try {
        console.log('[auth] signUp start', { email, username })
        const cleanUsername = username.trim().toLowerCase()
        if (!/^[a-z0-9_]{2,32}$/.test(cleanUsername)) {
          return {
            ok: false,
            error: 'Username must be 2-32 chars: lowercase letters, digits, underscore.'
          }
        }
        // Username uniqueness pre-check. If the profiles table is missing this
        // returns a PostgREST error — we treat as "no existing row" and let
        // the real insert below produce the friendlier error.
        const lookup = await withTimeout(
          supabase.from('profiles').select('id').eq('username', cleanUsername).maybeSingle(),
          15_000,
          'username check'
        )
        if (lookup.data) return { ok: false, error: 'Username already taken.' }
        if (lookup.error) console.warn('[auth] username lookup error (continuing):', lookup.error)

        console.log('[auth] calling supabase.auth.signUp')
        const { data, error } = await withTimeout(
          supabase.auth.signUp({ email, password }),
          20_000,
          'auth signUp'
        )
        if (error) {
          console.warn('[auth] signUp error', error)
          if (/already registered|user already exists/i.test(error.message)) {
            return {
              ok: false,
              error: 'That email is already registered. Try "Sign in instead".'
            }
          }
          return { ok: false, error: error.message }
        }
        const userId = data.user?.id
        if (!userId) {
          return {
            ok: false,
            error:
              'Account created — check your inbox to confirm, then sign in.'
          }
        }
        // If Supabase has "Confirm email" ON, signUp returns a user but no
        // session. Tell the user explicitly — otherwise they'll think they
        // signed in successfully and be confused when the app restarts.
        if (!data.session) {
          return {
            ok: false,
            error:
              'Account created — please confirm your email, then sign in. (Or turn off email confirmation in Supabase Auth settings.)'
          }
        }

        console.log('[auth] inserting profile')
        const { data: newProfile, error: profileError } = await withTimeout(
          supabase
            .from('profiles')
            .insert({
              id: userId,
              username: cleanUsername,
              display_name: displayName.trim() || cleanUsername
            })
            .select()
            .single(),
          15_000,
          'profile insert'
        )
        if (profileError) {
          console.warn('[auth] profile insert error', profileError)
          return { ok: false, error: profileError.message }
        }
        // Set the profile directly — by the time onAuthStateChange fires for
        // this signUp, the suppression flag will keep it from overwriting us.
        const inserted = (newProfile as Profile) ?? null
        writeCachedProfile(inserted)
        set({
          session: data.session,
          user: data.user,
          profile: inserted,
          needsUsername: false
        })
        console.log('[auth] signUp ok')
        return { ok: true }
      } catch (e) {
        const msg = (e as Error).message
        console.error('[auth] signUp threw', e)
        return { ok: false, error: msg }
      } finally {
        suppressNeedsUsername = false
      }
    },

    claimUsername: async (username, displayName) => {
      suppressNeedsUsername = true
      try {
        const user = get().user
        if (!user) return { ok: false, error: 'Not signed in.' }
        const cleanUsername = username.trim().toLowerCase()
        if (!/^[a-z0-9_]{2,32}$/.test(cleanUsername)) {
          return {
            ok: false,
            error: 'Username must be 2-32 chars: lowercase letters, digits, underscore.'
          }
        }
        console.log('[auth] claimUsername start', cleanUsername)
        const lookup = await withTimeout(
          supabase.from('profiles').select('id').eq('username', cleanUsername).maybeSingle(),
          15_000,
          'username check'
        )
        if (lookup.data) return { ok: false, error: 'Username already taken.' }
        if (lookup.error) console.warn('[auth] username lookup error (continuing):', lookup.error)

        const { error } = await withTimeout(
          supabase.from('profiles').insert({
            id: user.id,
            username: cleanUsername,
            display_name: displayName.trim() || cleanUsername
          }),
          15_000,
          'profile insert'
        )
        if (error) {
          console.warn('[auth] claimUsername insert error', error)
          // If the table is missing, the error message will say so —
          // surface it directly.
          return { ok: false, error: error.message }
        }
        const profile = await loadProfile(user.id)
        writeCachedProfile(profile)
        set({ profile, needsUsername: !profile })
        return { ok: true }
      } catch (e) {
        const msg = (e as Error).message
        console.error('[auth] claimUsername threw', e)
        return { ok: false, error: msg }
      } finally {
        suppressNeedsUsername = false
      }
    },

    updateProfile: async (updates) => {
      try {
        const user = get().user
        if (!user) return { ok: false, error: 'Not signed in.' }
        const patch: Record<string, unknown> = {}
        if (updates.display_name !== undefined) patch.display_name = updates.display_name
        if (updates.avatar_url !== undefined) patch.avatar_url = updates.avatar_url
        if (updates.username !== undefined) {
          const clean = updates.username.trim().toLowerCase()
          if (!/^[a-z0-9_]{2,32}$/.test(clean)) {
            return {
              ok: false,
              error: 'Username must be 2-32 chars: lowercase letters, digits, underscore.'
            }
          }
          if (clean !== get().profile?.username) {
            const lookup = await withTimeout(
              supabase.from('profiles').select('id').eq('username', clean).maybeSingle(),
              15_000,
              'username check'
            )
            if (lookup.data) return { ok: false, error: 'Username already taken.' }
          }
          patch.username = clean
        }
        if (Object.keys(patch).length === 0) return { ok: true }
        const { data, error } = await withTimeout(
          supabase.from('profiles').update(patch).eq('id', user.id).select().single(),
          15_000,
          'profile update'
        )
        if (error) return { ok: false, error: error.message }
        const next = (data as Profile) ?? null
        writeCachedProfile(next)
        set({ profile: next })
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },

    signOut: async () => {
      await supabase.auth.signOut()
      writeCachedProfile(null)
      set({ session: null, user: null, profile: null, needsUsername: false })
    },

    refreshProfile: async () => {
      const user = get().user
      if (!user) return
      const profile = await loadProfile(user.id)
      writeCachedProfile(profile)
      set({ profile, needsUsername: !profile })
    }
  }
})
