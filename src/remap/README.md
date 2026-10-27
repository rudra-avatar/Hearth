# Reassign remote buttons (rooted TVs)

Source of **Settings → Options → Reassign remote buttons**. Hearth writes these files to the TV itself
(`/media/developer/launcher-remap`); you never need to copy them by hand.

## How the TV decides what a button does

The TV's window manager (`surface-manager`) runs every remote key through a chain of small JavaScript **key filters**
before the app in front sees it. The chain is a setting of the TV's config service (configd):
`com.webos.surfacemanager.keyFilters`, a list of `{file, handler}` pairs such as
`/usr/lib/qt5/qml/KeyFilters/appLaunch.js` → `handleCPHotkeys`. That filter is where LG's Netflix, Prime Video,
Disney+ (and other partner) buttons open their apps. Both remotes end up here: the IR remote and the Magic Remote
are turned into the same key codes before surface-manager sees them. surface-manager reloads the chain whenever
that setting changes, without a restart.

## What Hearth adds

- `keyfilter.js`: one more key filter, put at the **front** of the chain. For a button in your map it does the new
  job (open an app or input, open Hearth, mute, or nothing) and stops the key there; every other key goes on to the
  TV's own filters, exactly as before. It never takes the arrows, OK, Back, Exit, Home, power, volume, mute,
  channels or the number keys (hold a number = LG's Quick Access), so the remote always works to get out of a
  bad map. It costs one object lookup per key press: no timer, no polling, no extra process.
- The map is the config `tld.my.customlauncher.remap`, which the filter **subscribes** to: a change in Hearth applies
  at once.
- `apply.sh`: puts the filter in the chain and hands it the map (`map.json`), or takes both out. Both are set with
  configd's `setConfigs` and **`"volatile": true`**, so they live in memory only: nothing on the TV's storage is
  changed, and configd forgets them at a restart (and if it reconfigures, for example after a change of country;
  Hearth puts them back the next time it comes to the front).
- A link in `/var/lib/webosbrew/init.d` (`47-launcher-remap`) runs `apply.sh boot` at each start.
- "Press a button to reassign it": while Hearth is in front and has asked for it, the filter takes the next button
  press (not the protected ones) and opens Hearth again with `{"hearthRemapKey": "<button>"}`, so Hearth learns which
  button it was. It gives up after a minute.

Buttons are stored by the TV's own key name (`Key_webOS_Netflix`, `Key_webOS_Amazon`…), or `#<code>` for a button
without a name, so a map keeps working if a firmware numbers its keys differently.

**One button, two names.** Remotes from different years can send different keys for the same printed button. The
Rakuten TV / Movies button sends `Key_webOS_USP` on 2019 remotes (the MR19 Magic Remote logs it as `KEY_MOVIES`; LG's
own filter calls it "a Rakuten-only keycode") and `Key_webOS_RakutenTV` on later ones. Hearth shows one *Rakuten TV /
Movies* row and stores it as `Key_webOS_RakutenTV`; the filter treats `Key_webOS_USP` as the same button (`ALIASES` in
`keyfilter.js` and `remapcmd.ts`). "Press a button" always records what the remote really sends, so it is the surest
way to pick any other button.

## Known limits

- **Power on with an app button.** With the TV off, LG's app buttons can switch it on straight into their app. That
  is decided by the TV's standby chip before any of this runs, so the TV may still open (or try to open) the
  original app when it is switched on that way.
- Prime Video's **hold for Alexa** goes with the button: reassigned, it only does the new job.
- Tested on webOS 4.5 (LG 2019). The chain lives in the same place on other webOS versions that use
  surface-manager's key filters, but that has not been checked on a TV.

## Reversing it

Any one of these works:

1. In Hearth: **Settings → Options → Reassign remote buttons → "Reassigned buttons: On" → OK** (takes the filter out;
   your list is kept for later). To delete everything, also run 2.
2. Over SSH:
   ```
   sh /media/developer/launcher-remap/apply.sh off        # every button does what the TV does again, at once
   rm -f /var/lib/webosbrew/init.d/47-launcher-remap      # not again at the next start
   rm -rf /media/developer/launcher-remap                 # delete its files
   ```
3. Without SSH: remove the boot link (above) and restart the TV. Nothing else stays behind.

**Before uninstalling Hearth, turn it off.** (If you forget, nothing breaks: at the next start `apply.sh` sees
that Hearth is gone, leaves the buttons alone and deletes its boot link.)

## Logs

`/tmp/launcher-remap.log` (what `apply.sh` did) and the TV's system log: `grep HEARTH_REMAP /var/log/messages`
(the filter loading, the map arriving, each reassigned press).
