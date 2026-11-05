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

- **It shows LG Home for a moment.** The helper can only react after LG Home is already in front. Use **Map home button** (System, Remote control).
- **It does not open Hearth.** Remotes send different key numbers. Run the guide in **Map home button**. If the separate *Input Hook* app has its own settings, Hearth's rows are grey with a reason.
- **It is dead after uninstalling Hearth.** Restart the TV (unplug it for 30 seconds). The clean-up finishes and Home works again.

## Other problems

- **The Settings tile is gone.** You hid it on purpose. Hold OK on any app and choose **Hearth Settings**, or press Down five times on the Home screen to show the tile until Hearth restarts. Then turn off **Hide the Hearth Settings tile** in Look -> Home row.
- **Hold OK does nothing.** Turn the TV off and on again (unplug it for a minute). That fixed it for users. The cause is not known.
- **The LG Home tile does not open on webOS 3.** Reported on one TV; the cause is not known.
- **A picture will not show.** The message says why: over 8 MB, over 25 megapixels, or not a picture.
- **The USB stick is missing in the picker.** Plug it in, then open the picker again.
- **No weather.** Check the TV's internet. Hearth tries again by itself.
- **The layout looks odd after changing sizes.** Settings, Look, **Reset Hearth visual settings to default**.
- **After updating to 2.0.0 my look changed.** That happens once on purpose. Settings, Look, **Restore my settings from before the update** brings it back.
- **No full app list without root.** Turn **LG Connect Apps** on, then use the app-list row in Settings, System and press OK on the TV when it asks. See [Without root](features/no-root.md). It may not work on every TV.
- **The screen saver does not start.** Make sure the TV's own screen saver is on. Some TVs hold it back (OLED, inputs with no signal). On webOS 10 and newer it is untested.
