import { useEffect } from 'react'

// keeps the screen on while `on` is true; a no-op where the Screen Wake Lock
// API is missing (older browsers, plain-HTTP origins)
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let done = false

    const request = () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      navigator.wakeLock.request('screen').then(l => {
        if (done) void l.release()
        else lock = l
      }, () => {})
    }
    // the browser drops the lock whenever the page is hidden
    const onVisibility = () => request()

    request()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      done = true
      document.removeEventListener('visibilitychange', onVisibility)
      void lock?.release()
    }
  }, [on])
}
