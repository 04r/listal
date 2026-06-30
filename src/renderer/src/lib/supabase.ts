import { createClient } from '@supabase/supabase-js'

// Personal-use Listal project. Publishable key is safe to ship in the client —
// real authorization lives in RLS on the database.
const SUPABASE_URL = 'https://ronfjxlvghptwjjqbnif.supabase.co'
const SUPABASE_KEY = 'sb_publishable_f1NSqSoMsWCt5IcZSsb8bA_MYSEos0v'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage
  }
})

export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface FriendshipRow {
  user_a: string
  user_b: string
  status: 'pending' | 'accepted' | 'declined'
  requested_by: string
  requested_at: string
  decided_at: string | null
}

// Canonical sort so a pair always hits the same (user_a, user_b) primary key.
export function canonicalPair(meId: string, otherId: string): { user_a: string; user_b: string } {
  return meId < otherId
    ? { user_a: meId, user_b: otherId }
    : { user_a: otherId, user_b: meId }
}

export interface MessageRow {
  id: number
  from_user: string
  to_user: string
  body: string
  created_at: string
  read_at: string | null
}
