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

export const useAuth = create<AuthState>((set, get) => {
  // Bootstrap: pick up any persisted session, then subscribe to changes.
  supabase.auth.getSession().then(async ({ data }) => {
    const session = data.session
    const user = session?.user ?? null
    const profile = user ? await loadProfile(user.id) : null
    set({
      session,
      user,
      profile,
      needsUsername: !!user && !profile,
      initializing: false
    })
  })

  supabase.auth.onAuthStateChange(async (_event, session) => {
    const user = session?.user ?? null
    const profile = user ? await loadProfile(user.id) : null
    set({
      session,
      user,
      profile,
      needsUsername: !!user && !profile
    })
  })

  return {
    session: null,
    user: null,
    profile: null,
    initializing: true,
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
          // Supabase returns this when the email already exists. Surface it
          // as a hint so the dialog can flip to Sign in.
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
              'Account created — check your inbox to confirm, then sign in. (Username will be claimed on first sign-in.)'
          }
        }

        console.log('[auth] inserting profile')
        const { error: profileError } = await withTimeout(
          supabase.from('profiles').insert({
            id: userId,
            username: cleanUsername,
            display_name: displayName.trim() || cleanUsername
          }),
          15_000,
          'profile insert'
        )
        if (profileError) {
          console.warn('[auth] profile insert error', profileError)
          return { ok: false, error: profileError.message }
        }
        console.log('[auth] signUp ok')
        return { ok: true }
      } catch (e) {
        const msg = (e as Error).message
        console.error('[auth] signUp threw', e)
        return { ok: false, error: msg }
      }
    },

    claimUsername: async (username, displayName) => {
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
        set({ profile, needsUsername: !profile })
        return { ok: true }
      } catch (e) {
        const msg = (e as Error).message
        console.error('[auth] claimUsername threw', e)
        return { ok: false, error: msg }
      }
    },

    signOut: async () => {
      await supabase.auth.signOut()
      set({ session: null, user: null, profile: null, needsUsername: false })
    },

    refreshProfile: async () => {
      const user = get().user
      if (!user) return
      const profile = await loadProfile(user.id)
      set({ profile, needsUsername: !profile })
    }
  }
})
