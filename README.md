# Get ~~Shit~~ Stuff Done

A chores app for a child's tablet. Daily jobs, bonus "extra" jobs with kudos, stars and streaks, phone reminders through [ntfy](https://ntfy.sh), a PIN-locked parent view and an illustrated shoelace guide. It is one small Node app with SQLite and no build step, so it runs happily on a Raspberry Pi, a mini PC or a NAS with Docker.

It opens with a short animation where "Shit" is scribbled out and replaced by "Stuff".

| Page | What it does |
|---|---|
| **Today** | Today's jobs, grouped into morning, afternoon and evening. Your child taps a job and chooses **"I did it myself!"** (full stars) or **"Mum or Dad reminded me"** (half stars). Undo works until midnight. Cards turn yellow when due soon, amber when due, red when late |
| **Extras** | Bonus jobs. Each one plays a celebration and sends the parents a kudos message |
| **Laces** | Nine illustrated "bunny ears" steps with a self-advancing practice mode |
| **Parents** | PIN locked. Today, 14-day history, weekly stats, the jobs editor (add, edit, retire, CSV import and export), settings, notification tests and a log of sent messages |

## Try it on your computer

You need [Node.js](https://nodejs.org) 22.13 or later (it uses the built-in `node:sqlite`).

```bash
npm install
npm start
```

Open http://localhost:3000. The default parent PIN is `1234`; change it in **Parents > Settings**. Data is stored in `./data/gsd.db`.

To see the reminders at a pretend time, start it with `FAKE_NOW`, for example `FAKE_NOW=2026-11-16T07:36:00Z npm start`. The clock keeps ticking from there. With no `NTFY_URL`, messages are only written to the console.

## Run it for real (Docker)

1. Copy this folder to the machine that will host it.
2. `cp .env.example .env` and fill it in (PIN, your child's name, time zone, ntfy details).
3. `docker compose up -d --build`
4. Open `http://<that machine>:3010` on the tablet and add it to the home screen. It works as an installable web app.

Check it is up with `curl -s localhost:3010/health`, which returns `{"ok":true,...}`. The database lives in `./data`, so include that folder in your backups.

Keep it on your home network (or a VPN such as Tailscale). The parent PIN is a light lock for a household, not internet-grade security.

## Your own jobs list

On first run the app loads `chores-template.csv`. Edit that file before the first start, or later use **Parents > Jobs** in the app for small changes, or **Export CSV**, edit, then **Import CSV** for big ones. If you edit in Excel, save as **CSV UTF-8** or the emojis turn into question marks.

```
name,emoji,slot,days,due_time,remind_before_min,stars,extra
Get dressed,👕,morning,weekdays,07:30,15,1,no
Change bed,🛏️,afternoon,sun,15:00,0,1,no
Help cook dinner,🍳,,,,,3,yes
```

| Column | Values |
|---|---|
| `slot` | `morning`, `afternoon` or `evening`. Blank for extras |
| `days` | `daily`, `weekdays`, `weekends`, or days such as `sun` or `mon,wed,fri` |
| `due_time` | `HH:MM`. Blank uses the slot's default from Settings |
| `remind_before_min` | Minutes before the due time for the early warning. `0` means none |
| `extra` | `yes` for an extra job |

Import adds new jobs and updates ones with the same name. It never deletes, so retire a job in the app to remove it (its history is kept). Names must be unique.

## Notifications (optional)

Reminders are sent with [ntfy](https://ntfy.sh): install the ntfy app on the tablet and on the parents' phones. You can use the public ntfy.sh server (pick hard-to-guess topic names, since anyone who knows a topic can read it) or self-host ntfy and use a token.

- The tablet subscribes to `KID_TOPIC`, the parents to `PARENT_TOPIC`.
- In the ntfy app, turn on **Instant delivery** and let ntfy ignore battery optimisation, or messages arrive late.
- **Parents > Settings** has test buttons for both topics.

| When | To | Message |
|---|---|---|
| `remind_before_min` before the due time | child | "⏰ 15 mins to go" |
| At the due time, if not ticked | child | "🔔 Job due now!" |
| Due time plus the escalate delay (default 30 min) | parents | "Job not done yet" |
| Round-up time (default 20:30) | both | Done count, extras, stars, streak and a motivational line |
| An extra job is done | parents | "⭐ Kudos time!" |

The app checks every 30 seconds and jobs due together share one message. Each message only fires inside its window and is logged, so a restart never sends a backlog or duplicates.

### When a reminder does not arrive

| What you see | Likely cause |
|---|---|
| "Failed to send" on the test button | Check `docker logs --tail 10 get-stuff-done` for the `[ntfy] ... failed:` line |
| `Failed to parse URL` | `NTFY_URL` is missing `https://` |
| `HTTP 401` / `403` | Wrong token, or the ntfy user cannot write to the topic |
| "Sent" but the tablet stays quiet | Tablet subscribed to the wrong server/topic, or Instant delivery / battery settings |

## Forgotten parent PIN

`PARENT_PIN` in `.env` is only used when no PIN is stored. To reset to it (back up `data/gsd.db` first):

```bash
docker exec get-stuff-done node --no-warnings -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/data/gsd.db').prepare(\"DELETE FROM settings WHERE key='pin_hash'\").run()" && docker restart get-stuff-done
```

## Files

| File | Purpose |
|---|---|
| `server.js` | Express API and static files |
| `db.js` | SQLite schema plus job, day, streak and stats logic |
| `scheduler.js` | Reminder rules, grouping, round-up and kudos |
| `ntfy.js` | ntfy publish |
| `time.js` | Time zone helpers and `FAKE_NOW` |
| `csv.js` | CSV import and export |
| `public/` | The app (`app.js`, `styles.css`, `laces.js`, `index.html`, manifest, icon) |
| `compose.yaml`, `Dockerfile`, `.env.example` | Docker deployment |
