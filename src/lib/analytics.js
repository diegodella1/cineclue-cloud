import { supabase } from './supabase'

let sessionId = null

function getSessionId() {
  if (sessionId) return sessionId
  try {
    sessionId = localStorage.getItem('cc_session_id')
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem('cc_session_id', sessionId)
    }
  } catch {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
  return sessionId
}

/**
 * Fire-and-forget analytics event.
 * @param {string} eventType - e.g. 'game_started', 'game_completed', 'party_created'
 * @param {object} props - additional properties
 */
export function track(eventType, props = {}) {
  supabase.rpc('cc_track_event', {
    p_event_type: eventType,
    p_properties: props,
    p_session_id: getSessionId(),
  }).then(() => {}, () => {}) // fire and forget
}
