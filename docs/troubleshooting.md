# Troubleshooting

Something not right? Try the matching tip. If yours is not here, switch **Settings, System, Show the Debug tab** on, and send the report (`/tmp/hearth-debug.txt` on a rooted TV, or a photo of the Debug tab) in a [GitHub issue](https://github.com/rudra-avatar/Hearth/issues).

## A rooted TV says "the TV refused the command", or rows are grey

1. Update the **Homebrew Channel** to **0.8.0-rc1** ([release page](https://github.com/throwaway96/webos-homebrew-channel/releases/tag/v0.8.0-rc1)) and open it once.
2. If the message says *the Homebrew Channel service is not running*, open the Homebrew Channel once, then open Settings again.
3. **On webOS 11** run this once over SSH:

```
sh /media/developer/apps/usr/palm/applications/tld.my.customlauncher/tools/webos11-permission.sh
```

Then close and reopen Hearth. After updating Hearth, restart the TV or run the line again.

## The Home button

- **It shows LG Home for a moment.** The helper can only react after LG Home is already in front. Use **Map home button** (System, Remote control), or try **Replace LG Home with SAM** (System, TV start, experimental), which does not flash.
- **It does not open Hearth.** Remotes send different key numbers. Run the guide in **Map home button**. If the separate *Input Hook* app has its own settings, Hearth's rows are grey with a reason.
- **It is dead after uninstalling Hearth.** Restart the TV (unplug it for 30 seconds). The clean-up finishes and Home works again.

## The remote stops answering

Hearth can change what remote buttons do (**Map home button** and **Map additional keys**). If the remote stops answering after that, repair it in small steps. Do the next step only if the one before did not help.

1. **Restart the TV.** Unplug it for 30 seconds, then plug it in again. Sometimes this is enough. Hearth's button changes come back by themselves when the TV starts, so if the remote is still wrong after the restart, go on with step 2.
2. **Remove Hearth's start-up links.** These are small files that start Hearth's button changes every time the TV starts. You need a computer in the same network and *SSH*: a way to type commands to the TV from the computer (see the [rooting guide](https://tv.slada.sk/guides/rooting-guide)). Connect to the TV as `root` and type these two lines, one after the other. The first takes Hearth's button changes out of the TV's memory. The second deletes the three start-up links.

```
sh /media/developer/launcher-remap/apply.sh off
rm -f /var/lib/webosbrew/init.d/47-launcher-remap /var/lib/webosbrew/init.d/48-launcher-homehook /var/lib/webosbrew/init.d/49-launcher-homekey
```

   If the first line says it cannot find the file, you never used *Reassigned buttons*: just go on with the second line. Then restart the TV again.
3. **Only if you also use the Input Hook app,** and the remote still does not work after step 2, type these two lines as well. The first deletes the Input Hook app's own start-up link. The second deletes the button settings it saved (this also removes Hearth's Home button mapping, and you must set your buttons again afterwards).

```
rm -f /var/lib/webosbrew/init.d/inputhook
rm -f /home/root/.config/lginputhook/keybinds.json
```

   Then restart the TV again.
4. **When the remote works again,** open Hearth, then **Settings, System, Remote control**, and turn **Reassigned buttons** Off. Otherwise Hearth can put the button changes back into the TV's memory when it opens (until the next restart).

## Other problems

- **Check for updates says *Could not check*.** The TV could not reach the internet or the list. Check the TV's internet and press OK again. It never looks by itself.
- **The update bar stays at 0 or the install fails.** Wait a minute first; the TV can be slow. If it fails, nothing is changed and a button opens the Homebrew Channel, where you can update by hand.
- **The Settings tile is gone.** You hid it on purpose. Hold OK on any app and choose **Hearth Settings**, or press Down five times on the Home screen to show the tile until Hearth restarts. Then turn off **Hide the Hearth Settings tile** in Look -> Home row.
- **Hold OK does nothing.** Turn the TV off and on again (unplug it for a minute). That fixed it for users. The cause is not known.
- **The LG Home tile does not open on webOS 3.** Reported on one TV; the cause is not known.
- **A picture will not show.** The message says why: over 8 MB, over 25 megapixels, or not a picture.
- **The USB stick is missing in the picker.** Plug it in, then open the picker again.
- **No weather.** Check the TV's internet. Hearth tries again by itself. If your network blocks Open-Meteo's main server, Hearth switches to another Open-Meteo server by itself; the first time this can take about 10 seconds longer.
- **The layout looks odd after changing sizes.** Settings, Look, **Reset Hearth visual settings to default**.
- **After updating to 2.0.0 my look changed.** That happens once on purpose. Settings, Look, **Restore my settings from before the update** brings it back.
- **No full app list without root.** Turn **LG Connect Apps** on, then use the app-list row in Settings, System and press OK on the TV when it asks. See [Without root](features/no-root.md). It may not work on every TV.
- **The screen saver does not start.** Make sure the TV's own screen saver is on. Some TVs hold it back (OLED, inputs with no signal). On webOS 10 and newer it is untested.
