# Set Hearth as the TV's Home app (webOS 4.x)

Source of the "Set Hearth as the TV's Home app" setting (Settings → Options). The code is in `src/lib/homeapp.ts` and
`src/lib/homeappcmd.ts`; this folder holds the start-up check that the launcher writes to the TV.

**Nothing runs in the background, and nothing is replaced or mounted.** The Home button opens whichever app the TV's own
system setting `general.defaultApps.home` names. This method writes Hearth's id (`tld.my.customlauncher`) there.

## Why it exists

On webOS 4.x (seen on an LG UM7100, webOS 4.5) the Home button opens `com.webos.app.fullhome`, a full-screen overlay
that is drawn over the app in front **without ever becoming the app in front**. The helper script and the SAM method both
wait for LG Home (`com.webos.app.home`) to come to the front, so on such a TV neither of them ever fires. (Both now also
react to `com.webos.app.fullhome` where a TV does report it in front.)

## The switch (Settings → Options)

- **On:** reads the setting, keeps the value it found (on webOS 4.5: `com.webos.app.fullhome`), and writes Hearth's id.
  It needs root: the setting is changed through the Homebrew Channel's root shell, because settingsservice answers an
  app's own Luna call for it with "Access denied" (webOS 4.5).
  It is greyed out on a TV that has no such setting, and while the helper script or the SAM method is on.
- **Off:** puts the kept value back. If that is not known (the setting was changed by hand, or Hearth's settings were
  cleared), it uses the value the start-up check kept, and otherwise LG's own Home: `com.webos.app.fullhome` where that app
  exists, else `com.webos.app.home`. If the setting no longer names Hearth, it is left as it is.
- It also writes a small start-up check (`guard.sh`, in `/media/developer/launcher-homeapp`, linked as
  `/var/lib/webosbrew/init.d/46-launcher-homeapp`) together with the value to put back. At each start, if Hearth is no longer
  installed and the setting still names it, the check puts the old value back and deletes itself. While Hearth is
  installed it does nothing. Switching the method off deletes it.

## Limits

- **Uninstalling Hearth while it is on:** until the next start the Home button points at an app that is gone (not tried: what the TV then shows).
  The start-up check fixes it at the next start (or switch the method off before uninstalling, or undo it over SSH, below).
- Only tested on webOS 4.5. Other versions may have the setting and ignore it, or not have it (then the row is greyed out).
- The "LG Home" tile still opens `com.webos.app.home`, as before.

## Reversing it

Any one of these works:

1. In the launcher: **Settings → Options → Set Hearth as the TV's Home app → OK**.
2. Over SSH (use `com.webos.app.home` on TVs other than webOS 4.x):
   ```
   luna-send -n 1 -f luna://com.webos.settingsservice/setSystemSettings '{"category":"general","settings":{"defaultApps":{"home":"com.webos.app.fullhome"}}}'
   rm -f /var/lib/webosbrew/init.d/46-launcher-homeapp; rm -rf /media/developer/launcher-homeapp
   ```
3. See what it is now:
   ```
   luna-send -n 1 -f luna://com.webos.settingsservice/getSystemSettings '{"category":"general","keys":["defaultApps"]}'
   ```
