# Deluge login and computer time

If the browser connects but Torrent-Deck reports a connection problem, check the
computer's date, time, and time zone. On Windows, open Settings → Time & language
→ Date & time, enable automatic time, verify the time zone, and choose Sync now.
Fully quit and reopen Torrent-Deck, then reconnect.

On October 14, 2026, a Windows computer's log timestamps were four hours ahead
of the Deluge server. Deluge's successful login response set a cookie with an
absolute expiration one hour after the server's current time. The app's cookie
jar treated that freshly issued cookie as expired. The next request failed with
“Not authenticated,” which the app displayed as a generic connection problem.
Syncing the Windows clock restored the existing 2.19.13 connection.

The adapter now interprets absolute cookie expiration relative to the HTTP Date
header when there is a significant clock difference. This preserves the cookie's
server-issued lifetime. Cookies with Max-Age retain their normal handling, session
cookies are unchanged, and expiration in the server's past remains expiration in
the client's past. Missing or invalid Date headers leave normal handling intact.
Rejected Deluge sessions also receive a specific error suggesting a clock check.

`test/unit/deluge-connection.test.cjs` exercises real HTTP requests and the
production adapter in isolated processes with clocks on time, four hours ahead,
and four hours behind. It checks connection, snapshot refresh, cookie lifetime,
and deletion. The fix also successfully connected to the affected Deluge 2.2.0
server and retrieved its 11 torrents with a simulated four-hour clock difference.
