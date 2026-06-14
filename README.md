# Azchi — Prayer Times

A fast, installable React PWA for daily Islamic prayer times. Azchi uses browser geolocation and the Aladhan API, caches one response per day, and displays a live countdown to the next prayer.

## Features

- GPS-based prayer times
- Daily local cache
- Live next-prayer countdown
- Gregorian and Hijri dates
- 24-hour time format
- Light and dark themes
- Responsive mobile-first layout
- Installable PWA with offline app shell

## API

Azchi uses Aladhan calculation method 3 (Muslim World League):

```text
GET https://api.aladhan.com/v1/timings/{DD-MM-YYYY}?latitude={lat}&longitude={lng}&method=3
```

## Development

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run lint
npm run build
```

Geolocation requires HTTPS in production. It is also available on `localhost` during development.
