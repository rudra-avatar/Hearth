# When the TV turns on, open… (rooted TVs)

Settings → Options → **When the TV turns on, open…** chooses what the TV shows when you switch it on: Live TV or the
last input (the TV's own default), Hearth, or any installed app.

## How it works

When a webOS TV is switched on, its boot daemon (`bootd`) picks the first app. Its configuration, `/etc/palm/bootd.json`,
has a table that maps *why* the TV was switched on to an app:

```json
"firstAppByPowerOnReason": {
    "netflix": "netflix",
    "amazon": "amazon",
    "ivi": "ivi",
    "remoteKey": "{LAST_APP}",
    "localKey": "{LAST_APP}"
}
```

That is how switching the TV on with the Netflix button opens Netflix. For the power button (`remoteKey`) and the TV's
own button (`localKey`) there is no app (`{LAST_APP}` only resumes Netflix), so the TV opens the **last input**: Live
TV on most sets, which shows "No signal" when no aerial is plugged in.

`bootd` reads `/var/luna/preferences/bootd.json` **instead of** its own file when that file exists (LG left it in for
debugging). Hearth writes that file: LG's own file with `remoteKey`, `localKey` and `micomPower` (a cold start, e.g. after
a power cut or a restart) set to the chosen app (plus `wakeOnWiFi` and `wakeOnLan` when network wake-ups are on). Nothing runs in the background.

- **Only when you switch it on yourself.** Every other reason keeps LG's behaviour, so the TV still goes where it is
  asked: casting from a phone and other network wake-ups (`wakeOnWiFi`, `wakeOnLan`), HDMI-CEC (`hdmiCec`), the Netflix
  and Prime Video buttons, timers.
- **Optional: also when woken over the network.** *Also when woken over the network* (in the list, off by default)
  adds `wakeOnWiFi` and `wakeOnLan`, which is how phone apps and home automation (Home Assistant's "turn on") switch the
  TV on. The catch: a phone casting to the TV while it is off wakes it the same way, so the chosen app opens first until
  the cast takes over.
- **No Live TV first.** The app is opened behind LG's own start-up cover (`coverUI`), the way Netflix is, so Live TV is
  not drawn first.
- **A missing app is safe.** If the app cannot be opened (uninstalled), the TV opens the last input as usual.
- **It starts working after the TV restarts once.** `bootd` reads its configuration only when it starts, which is a full
  restart, not waking the TV from standby. Restarting `bootd` itself is not safe (it re-runs the TV's start-up jobs).
  Hearth offers *Restart the TV now* and the row says *(after a restart)* until then.
- **Turning it off** (choose *Live TV or the last input*) removes the file, so from the next restart the TV does
  exactly what it did before.

A start-up check (`/var/lib/webosbrew/init.d/45-launcher-poweron` → `/media/developer/launcher-poweron/guard.sh`) runs
at each start. It notes which app `bootd` loaded (`/tmp/launcher-poweron.loaded`), so Hearth knows when a restart is
still needed. It also removes the file if Hearth was uninstalled, or if a software update changed LG's own file (so an
old copy never hides the new one). If the file was changed by someone else, it is left alone. A file Hearth did not
write is never overwritten or removed.

- **Before a firmware update, turn it off** (and restart once). An update usually removes root, and then the start-up
  check no longer runs, so an old copy of LG's file could keep hiding the new one. If that happens, the undo steps below
  need SSH; without root, a factory reset clears `/var/luna/preferences`.
- The *(after a restart)* label relies on the start-up check running (the Homebrew Channel's startup folder). If that
  is switched off or in fail-safe, the label can stay although the TV already uses the setting.
- A change is written aside, read back, and moved into place in one step with a `sync`. If it fails, only that
  attempt's files are removed, so an earlier choice stays. An empty file (a power cut at the wrong moment) is removed
  at the next start.

Tested on an LG 65UM7100PLA, webOS 4.5 (4.10.2, firmware 05.40.97). Other webOS versions: the row is greyed out unless
`bootd` there reads `/var/luna/preferences/bootd.json` and LG's file has the table (both checked on the TV).

## Undo it over SSH

```sh
rm -f /var/luna/preferences/bootd.json /var/lib/webosbrew/init.d/45-launcher-poweron
rm -rf /media/developer/launcher-poweron
reboot
```

To check what is in place: `grep -A6 firstAppByPowerOnReason /var/luna/preferences/bootd.json`, and after a start
`cat /tmp/launcher-poweron.log` (one line per start: in place, or what it removed and why). The reason the TV was last switched on:
`luna-send -n 1 luna://com.webos.service.tvpower/power/getPowerOnReason '{}'`.
