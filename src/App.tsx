import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

type PrayerName = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha'

type PrayerData = {
  timings: Record<PrayerName, string>
  gregorian: string
  hijri: string
  timezone: string
  method: string
  fetchedAt: string
}

type AladhanResponse = {
  code: number
  data: {
    timings: Record<PrayerName, string>
    date: {
      readable: string
      gregorian: { weekday: { en: string }; day: string; month: { en: string }; year: string }
      hijri: { day: string; month: { en: string }; year: string }
    }
    meta: { timezone: string; method: { name: string } }
  }
}

const prayerNames: PrayerName[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']
const CACHE_KEY = 'azchi-prayer-times-v1'

function cleanTime(time: string) {
  return time.match(/\d{1,2}:\d{2}/)?.[0]?.padStart(5, '0') ?? time
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function formatCity(timezone: string) {
  const city = timezone.split('/').pop()?.replaceAll('_', ' ') ?? 'Your location'
  return city.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getPrayerDate(time: string, dayOffset = 0) {
  const [hours, minutes] = cleanTime(time).split(':').map(Number)
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hours, minutes, 0, 0)
  return date
}

function getNextPrayer(data: PrayerData, now: Date) {
  for (const name of prayerNames) {
    const date = getPrayerDate(data.timings[name])
    if (date.getTime() > now.getTime()) return { name, date, time: cleanTime(data.timings[name]) }
  }
  return { name: 'Fajr' as PrayerName, date: getPrayerDate(data.timings.Fajr, 1), time: cleanTime(data.timings.Fajr) }
}

function countdownLabel(target: Date, now: Date) {
  const minutes = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 60_000))
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  if (!hours) return `in ${remaining}m`
  return `in ${hours}h ${remaining}m`
}

function PrayerIcon({ name, active }: { name: PrayerName; active: boolean }) {
  if (name === 'Isha') {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M26.8 5.5A15.5 15.5 0 1 0 34.5 30 13.8 13.8 0 0 1 26.8 5.5Z" fill="currentColor" />
      </svg>
    )
  }

  if (name === 'Dhuhr') {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="7.5" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M20 3v6M20 31v6M3 20h6M31 20h6M8 8l4.3 4.3M27.7 27.7 32 32M32 8l-4.3 4.3M12.3 27.7 8 32" stroke="currentColor" strokeWidth="3" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M7 26a13 13 0 0 1 26 0H7Z" fill="currentColor" />
      <path d="M4 30h32M20 5v6M8.5 12l4 4M31.5 12l-4 4" fill="none" stroke="currentColor" strokeWidth="2.5" />
      {active && <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".25" />}
    </svg>
  )
}

function App() {
  const [data, setData] = useState<PrayerData | null>(null)
  const [now, setNow] = useState(new Date())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('azchi-theme') === 'dark')

  const loadPrayerTimes = useCallback((force = false) => {
    setLoading(true)
    setMessage('')

    if (!navigator.geolocation) {
      setMessage('Location is not supported by this browser.')
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const today = localDateKey()
        const cached = localStorage.getItem(CACHE_KEY)
        if (!force && cached) {
          try {
            const parsed = JSON.parse(cached) as PrayerData & { dateKey: string }
            if (parsed.dateKey === today) {
              setData(parsed)
              setLoading(false)
              return
            }
          } catch {
            localStorage.removeItem(CACHE_KEY)
          }
        }

        try {
          const date = new Intl.DateTimeFormat('en-GB').format(new Date()).replaceAll('/', '-')
          const url = new URL(`https://api.aladhan.com/v1/timings/${date}`)
          url.searchParams.set('latitude', coords.latitude.toString())
          url.searchParams.set('longitude', coords.longitude.toString())
          url.searchParams.set('method', '3')
          const response = await fetch(url)
          if (!response.ok) throw new Error('Prayer times request failed')
          const json = (await response.json()) as AladhanResponse
          if (json.code !== 200) throw new Error('Prayer times response was invalid')

          const { date: responseDate, meta, timings } = json.data
          const nextData: PrayerData = {
            timings: Object.fromEntries(
              prayerNames.map((name) => [name, cleanTime(timings[name])]),
            ) as Record<PrayerName, string>,
            gregorian: `${responseDate.gregorian.weekday.en.slice(0, 3)}, ${responseDate.gregorian.month.en} ${Number(responseDate.gregorian.day)}, ${responseDate.gregorian.year}`,
            hijri: `${Number(responseDate.hijri.day)} ${responseDate.hijri.month.en} ${responseDate.hijri.year}`,
            timezone: meta.timezone,
            method: meta.method.name,
            fetchedAt: new Date().toISOString(),
          }
          setData(nextData)
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ...nextData, dateKey: today }))
        } catch {
          setMessage('Could not load prayer times. Check your connection and try again.')
        } finally {
          setLoading(false)
        }
      },
      () => {
        setMessage('Location access was not granted. Please allow it and try again.')
        setLoading(false)
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 3_600_000 },
    )
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('azchi-theme', dark ? 'dark' : 'light')
  }, [dark])

  const nextPrayer = useMemo(() => data ? getNextPrayer(data, now) : null, [data, now])
  const nextIndex = nextPrayer ? prayerNames.indexOf(nextPrayer.name) : -1

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="menu-button" type="button" aria-label="Open menu">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <button className="icon-button" type="button" onClick={() => setSettingsOpen((open) => !open)} aria-label="Open settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.3 5.5v-3l-2.2-.7a7 7 0 0 0-.7-1.7l1-2-2.1-2.1-2 1a7 7 0 0 0-1.8-.7L11.8 2h-3l-.7 2.3a7 7 0 0 0-1.7.7l-2-1-2.1 2.1 1 2a7 7 0 0 0-.7 1.7l-2.3.7v3l2.3.7a7 7 0 0 0 .7 1.7l-1 2L4.4 20l2-1a7 7 0 0 0 1.7.7l.7 2.3h3l.7-2.3a7 7 0 0 0 1.8-.7l2 1 2.1-2.1-1-2a7 7 0 0 0 .7-1.7l2.2-.7Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        </button>
        {settingsOpen && (
          <div className="settings-panel">
            <div>
              <strong>Appearance</strong>
              <span>Choose your preferred theme</span>
            </div>
            <button className="theme-toggle" type="button" onClick={() => setDark((value) => !value)} aria-label="Toggle dark mode">
              <span className={dark ? 'toggle-dot active' : 'toggle-dot'} />
            </button>
            <button className="location-button" type="button" onClick={() => loadPrayerTimes(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.1 7-12a7 7 0 1 0-14 0c0 6.9 7 12 7 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="9" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
              Refresh location
            </button>
          </div>
        )}
      </header>

      {!data ? (
        <section className="location-consent">
          <div className="consent-illustration" aria-hidden="true">
            <svg viewBox="0 0 80 80">
              <path d="M40 72s24-17.5 24-41a24 24 0 1 0-48 0c0 23.5 24 41 24 41Z" fill="none" stroke="currentColor" strokeWidth="4" />
              <circle cx="40" cy="31" r="9" fill="none" stroke="currentColor" strokeWidth="4" />
            </svg>
          </div>
          <p className="eyebrow">Accurate prayer times</p>
          <h1>Find prayer times near you</h1>
          <p className="consent-copy">
            Azchi uses your current location only to request today’s prayer times. Your coordinates are not stored.
          </p>
          <button
            className="consent-button"
            type="button"
            disabled={loading}
            onClick={() => loadPrayerTimes()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21s7-5.1 7-12a7 7 0 1 0-14 0c0 6.9 7 12 7 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="9" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            {loading ? 'Getting your location…' : 'Use my location'}
          </button>
          {message && <p className="consent-error" role="alert">{message}</p>}
          <p className="privacy-note">You can change location permission in your browser settings.</p>
        </section>
      ) : (
        <>
          <section className="location-block">
            <h1>{formatCity(data.timezone)}</h1>
            <p>{data.gregorian}</p>
            <p>{data.hijri}</p>
          </section>

          {nextPrayer && (
            <section className="next-prayer" aria-label={`Next prayer is ${nextPrayer.name}`}>
              <div className="moon-orbit">
                <span className="moon" />
              </div>
              <p className="next-label">Next Prayer</p>
              <h2>{nextPrayer.name}</h2>
              <time>{nextPrayer.time}</time>
              <p className="countdown">{countdownLabel(nextPrayer.date, now)}</p>
            </section>
          )}

          <section className="prayers-section">
            <div className="section-heading">
              <h2>Prayer Times</h2>
              <span>Today</span>
            </div>

            <div className="prayer-list">
              {prayerNames.map((name, index) => (
                <div className={`prayer-row ${index === nextIndex ? 'is-next' : ''}`} key={name}>
                  <span className="prayer-icon"><PrayerIcon name={name} active={index === nextIndex} /></span>
                  <span className="prayer-name">
                    {name}
                    {index === nextIndex && <small>Next</small>}
                  </span>
                  <time>{cleanTime(data.timings[name])}</time>
                </div>
              ))}
            </div>
          </section>

          <footer>
            {message && <button type="button" className="status-message" onClick={() => loadPrayerTimes(true)}>{message}</button>}
            <p>{loading ? 'Updating your location…' : `Times based on ${data.method}`}</p>
            <span>Aladhan · Method 3</span>
          </footer>
        </>
      )}
    </main>
  )
}

export default App
