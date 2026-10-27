<p align="center"><img src="public/largeIcon.png" alt="Hearth icon" width="120"></p>

# Hearth for WebOS: a fast, calm home screen for webOS TVs

**Hearth for WebOS** is made only for TVs that run webOS (it is not an Android TV app). It targets **webOS 3/4 and it is forward compatible with newer versions** and is **designed for speed**: it starts almost instantly, scrolls smoothly and everything is adjustable from the remote. It replaces the busy home screen with something quiet: a **clock with the date and the weather**, **your apps and TV inputs in one row** along the bottom, and a background that is plain **OLED black**, a **picture**, or a **slideshow** (your own photos or the bundled nature photos).

It is a normal webOS app (app ID `tld.my.customlauncher`). On a rooted TV it can also become the screen the TV boots into and the one the Home button opens.

> **Reference device:** an LG TV on firmware **04.60.90 (webOS 7.6.0)**, rooted with the Homebrew Channel. That is where everything is tested. Parts that were not tested on a TV are marked **experimental** below.

![Hearth home screen](docs/screenshots/home-default.jpg)

| | |
|---|---|
| ![Sunset wallpaper](docs/screenshots/home-sunset.jpg) | ![Ocean wallpaper, centred clock](docs/screenshots/home-ocean.jpg) |
| ![A different clock font](docs/screenshots/home-aurora.jpg) | ![Hold OK on an app for its menu](docs/screenshots/app-menu.jpg) |
| ![Home with the weather line](docs/screenshots/home-weather.jpg) | ![Quiet mode: only the clock stays](docs/screenshots/quiet-mode.jpg) |
| ![Back opens the Recent apps panel](docs/screenshots/recents.jpg) | ![Settings, Options tab](docs/screenshots/settings-options.jpg) |

## What it does

- **Clock, date and weather.** Sixteen typefaces, adjustable size, thickness (thin to bold), an optional slight shadow and position, 12-hour, 24-hour or "same as the TV". The weather line (temperature, conditions,
  today's high and low) comes from [Open-Meteo](https://open-meteo.com), needs no account, and can be switched off.
- **Widget colour and opacity.** White is hard to read on a light picture, so the clock, date and weather can be white, warm white, ice blue, amber, grey, dark grey,
  black, or one of three gradients (Ember, Ocean, Dusk), at 10 to 100 % opacity.

  ![Widget colour options on a light background](docs/screenshots/clock-colours.jpg)
- **Your apps and inputs in one row.** Choose what is shown, re-order, or hold OK on an app for *Move to start / left / right / end*, *Hide* and *Uninstall*.
  Back on the home row opens the **Recent apps** panel (rooted TVs). **Refresh list** in Settings → Apps looks for newly installed apps straight away.
- **Your own names and icons.** Hold OK on an app or an input in Settings → Apps or Sources to rename it and choose a different icon, or use your own picture from a USB drive or the TV's storage (rooted TVs). One entry reset puts the original back. See *Edit a name or icon* below.
- **Wallpaper.** Plain black (or a calm blue-grey), one picture, or a slideshow of a whole folder from a USB drive or the TV's storage, or the bundled nature photos, with shuffle and an interval from 10 seconds to 1 hour.
- **Continue Watching from Plex** (optional). A row of wide cards above your apps with what you are part-way through on your Plex server, with progress and time left.
  OK plays it in the Plex app, holding OK opens its page. Sign in with a code at plex.tv/link; nothing to type on the TV. See *Plex and privacy* below.
- **Start the TV straight into Hearth.** *Options → Add the launcher as a TV input* adds **Hearth** to the TV's input list, next to HDMI 1 and Live TV. Choose it, set the TV to start on its last input,
  and the TV boots into Hearth.

  ![Hearth in the TV's input list](docs/screenshots/tv-input.jpg)
- **The Home button opens Hearth** (instead of LG Home), with a helper script or the SAM method (see *Replacing LG Home*), and a switch for LG's own **"Show LG logo when the TV starts"**
  setting (normally hidden in a secret menu) for a clean start.
- **Made to be fast.** The home screen is drawn from saved data first; everything else (app list, weather, helper checks) happens a few seconds later in the background.
  While another app is in front, Hearth lets go of its wallpaper and stops its clock.
- **Clear messages.** When something can't work on your TV, Hearth says what and why instead of failing silently, and greys out the options that need a rooted TV.


## What works on which TV

### Tested versions

| | |
|---|---|
| Reference device (everything tested) | Firmware **04.60.90**, **webOS 7.6.0**, rooted, Homebrew Channel 0.7.3 |
| Also reported by users | LG firmware **03.01.16** (reported as webOS 8.0.0), webOS 6.x (a Settings display bug found there was fixed in 1.1.0) and the webOS 4.x TV it was first built on |
| webOS 11 (LG C4 and others) | **The permission fix works**, reported by several users (see [issue #5](https://github.com/rudra-avatar/Hearth/issues/5) and *webOS 11* below); the maintainer has no webOS 11 TV |
| Newer versions | **Should work.** Hearth is compiled for old web views (Chrome 53) and uses only standard web features and TV services that LG keeps across versions. Please report anything odd |

### Rooted TV (Homebrew Channel): everything

The Homebrew Channel lets Hearth run a few fixed commands on the TV. That powers the live app list with real icons, the Recent apps panel, USB/storage browsing for wallpapers, replacing LG Home, the TV input, the LG logo switch and uninstalling apps.

### Not rooted (only Developer Mode): the core, with the extras greyed out

> **Experimental / not tested on a non-rooted TV.** This is how Hearth is designed to behave.

- Expected to work: the home screen, clock and date, the **weather** (it uses the web view's own internet connection), **Continue Watching from Plex**, themes, sizes, fonts and colours, the built-in list of common apps, and launching apps.
- Needs root, so it is **greyed out with the reason** shown: everything on the Options tab (TV input, replacing LG Home, LG logo), the Recent apps panel, reading USB/storage for wallpapers, and uninstalling apps.
- Without root, Hearth is an app you open yourself; it cannot replace LG Home or start the TV into itself.
- **More apps on the row without root:** the built-in list only shows well-known apps. Two ways to get the rest:
  - **Experimental, not tested: Settings, Options, "Load apps from the TV".** Hearth asks the TV for its full app list through LG's remote-control service, with no root and no computer. Turn on "LG Connect Apps" in the TV's settings, choose the row, and press OK on the TV when it asks to allow the connection. It may not work on every TV or firmware; when it fails, the built-in list stays. The pairing key is kept only inside Hearth. The row is hidden on rooted TVs.
  - **By hand.** The [partridgeworks/webos-launcher](https://github.com/partridgeworks/webos-launcher) guide explains how to add custom apps and icons.

### Experimental, not tested on a TV

- **webOS 3.x (Chromium 38).** There is no webOS 3 TV to try it on; the build follows the web view's known limits and a contributor's pull requests. One install file serves every TV: a loader checks whether the web view supports CSS custom properties (Chrome 49+, so everything from webOS 4). Newer TVs load `assets/app.js`; webOS 3 TVs load `assets/app.legacy.js` (ES5 with polyfills, custom properties worked out by the app, `src/lib/cssvars.ts`). On webOS 3 the *helper script* opens Hearth when the Home bar is shown; the SAM method does not apply. webOS 1 and 2 are not supported (no known way to root them).
- **The no-root TV app list** (above).

## Install

### Option 1: through the Homebrew Channel (recommended, gets you updates)

1. Open the **Homebrew Channel** on the TV and go to **Settings**.
2. Choose **Add repository** and type this address:

   `https://raw.githubusercontent.com/rudra-avatar/Hearth/main/repo/apps.json`

   (Typing with the remote is slow. From a computer on the same network you can send it instead, over SSH:
   `ares-launch org.webosbrew.hbchannel -p '{"launchMode":"addRepository","url":"https://raw.githubusercontent.com/rudra-avatar/Hearth/main/repo/apps.json"}'`)
3. Go back to the app list, open **Hearth** and choose **Install**.
4. **Updating:** when a new version is released, open the Homebrew Channel, open Hearth and it shows the new version
   (for example "1.3.0 (installed: 1.2.0)") with an **Update** button. Your settings are kept.

### Option 2: install the file yourself

Download `tld.my.customlauncher_1.2.0_all.ipk` from the [Releases](../../releases) page, then either use
[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) (a desktop app; no root needed, only Developer Mode), or over SSH on a rooted TV:

```
scp -O tld.my.customlauncher_1.2.0_all.ipk root@TV_IP:/tmp/
ssh root@TV_IP
luna-send -i luna://com.webos.appInstallService/dev/install '{"id":"com.ares.defaultName","ipkUrl":"/tmp/tld.my.customlauncher_1.2.0_all.ipk","subscribe":true}'
luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"tld.my.customlauncher"}'
```

Installing over an older version keeps your settings. To remove Hearth, turn off *Replace LG Home with a helper script* (or *Replace LG Home with a script and SAM*) first, then uninstall "Hearth"
from the Homebrew Channel or Dev Manager.

## Using it

| Where | Key | Does |
|---|---|---|
| Home | ← → | Move along the row |
| Home | OK | Open the app. The last three tiles are **LG Home**, **System Settings** and **Hearth Settings** |
| Home | hold OK | The app's menu: move it, hide it, uninstall it |
| Home | Back | Open the Recent apps panel (OK opens an app, hold OK closes it, ↑ Close all) |
| Settings | ← → on the tab bar | Apps · Sources · Look · Clock · Weather · Wallpaper · Options |
| Settings (Apps, Sources) | OK / hold OK | Show or hide an item / edit its name and icon. **Re-order** and **Refresh list** are the buttons above the grid |
| Settings (other tabs) | OK, or ← → | OK steps through the choices; ← → nudge numbers (they stop at the ends) |
| Any other screen | Back | Go back one screen |

### Settings

- **Apps / Sources:** which apps and HDMI inputs are on the row, and their order. **Refresh list** (Apps) checks for newly installed apps.
- **Look:** theme (OLED black or calm blue-grey), icon size (50-140 %), rows (one or two), side margin (0-300 px) and bottom margin, app names on or off, and **Reset look and clock**.
- **Clock:** time format, size, font, thickness, vertical and horizontal position, date and AM/PM on or off.
- **Weather:** on or off, the city, Celsius or Fahrenheit, the city name and today's high and low on or off.
  Pick a city from the list of about 75, or choose **Search for a city** and type any place name (worldwide).
- **Wallpaper:** the picture or slideshow, interval and shuffle, **Widget colour** and **Widget opacity**.
- **Options (rooted TVs):** the TV input; live app list; *Replace LG Home with a helper script*; *Replace LG Home with a script and SAM*;
  *Show the LG logo when the TV starts*; *Show Continue Watching (Plex)* and *Plex account* (no root needed); and, last, *Show the Debug tab*.

### Edit a name or icon

In **Settings → Apps** or **Sources**, move to an item and **hold OK** (release OK, then press ↓ to edit). The home row shows each change at once, and it is kept across restarts and updates.

| | |
|---|---|
| ![Editing an app](docs/screenshots/edit-app-icon.jpg) | ![Editing an input](docs/screenshots/edit-source-icon.jpg) |

- **Name:** up to 24 characters. For an input, ← → step through suggestions (PlayStation 5, Xbox, Laptop and more); OK types any name with the on-screen keyboard. For an app, OK types a name.
- **Icon:** ← → or OK step through the icons that come with Hearth: inputs have 16 symbols (HDMI port, TV, console, laptop, soundbar...), apps have the bundled logos of common apps.
- **Use a picture from a USB drive or the TV:** pick your own image (a square one works best; it is cropped to a square and shrunk). Needs a rooted TV, because a web app cannot read files itself. The picture is saved inside Hearth's settings, so the USB drive can be removed afterwards.
- **Use the app's (or the TV's) name and icon:** puts the original back.
- The names in the *Hide* and *Uninstall* menus stay the app's real names.
- If holding OK does nothing, power-cycle the TV (see Troubleshooting).

### Wallpaper

![The wallpaper picker](docs/screenshots/wallpaper-picker.jpg)

**Settings → Wallpaper → Wallpaper** opens a folder browser: **Default background**, or a **USB drive** / **Internal storage** (`/media/developer`), where OK on a picture sets it and
**Play this folder as a slideshow** plays every picture in the folder. Use JPG, PNG, WebP or BMP. A web app cannot read files itself, so on a rooted TV the Homebrew Channel's service reads them in small pieces.
If it can't, the screen says why and offers **Try again**.

**Before you choose:** big pictures slow the launcher down when it loads them, so the smaller the file, the faster Hearth starts. The hard limit is **8 MB and 25 megapixels** per picture (a 4K picture is about 8 megapixels).
A picture over the limit is skipped in a slideshow and refused as a single wallpaper.

**Copying your own pictures to the TV** (the TV must be rooted; `<TV address>` is the **IP:** number at the bottom right of Hearth's Settings, or in the TV's own network settings):

1. Put the pictures in `/media/developer` (the picker shows it as *Internal storage*), or plug in a USB drive and skip the copying.
2. **From a computer with SSH:** `scp photo.jpg root@<TV address>:/media/developer/`. If `scp` fails, try `scp -O photo.jpg root@<TV address>:/media/developer/`.
3. **Without an SSH client:** connect to the TV in [webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) and use its file or terminal option to copy into `/media/developer`.
4. Open **Settings → Wallpaper → Wallpaper → Internal storage** and choose the picture or the folder.

### Weather and privacy

The weather comes from [Open-Meteo](https://open-meteo.com) (free, no account). The only thing sent is the latitude and longitude of the city you chose (and the words you type in the city search). It is fetched a few seconds after Hearth appears, then every 30 minutes
while Hearth is in front, and the last reading is kept so the home screen never waits for the internet. A reading older than 6 hours is not shown. If the TV's web view cannot make a secure connection (some older TVs can't), Hearth asks the TV's own `curl` or `wget` through the Homebrew Channel instead;
the last-resort attempts skip the certificate check, which is acceptable for public weather numbers that are only ever read as numbers and a place name.

### Plex and privacy

Continue Watching is off until you switch it on (Settings → Options). *Plex account* shows a short code: enter it at
[plex.tv/link](https://plex.tv/link) on a phone or computer, and Hearth receives a sign-in for your account. Hearth asks plex.tv once
for your server's addresses, then talks to your server directly (plain http on your home network when the server allows it,
which is lighter work for the TV). The sign-in is kept only inside Hearth on the TV, apart from the settings, so it never appears in the
Debug tab or a saved report; *Plex account* again signs out and forgets it. The list is drawn from the last copy at once and read again
a few seconds after Hearth comes to the front, at most once a minute. OK opens the item in LG's Plex app at that title.

## Replacing LG Home (rooted TVs)

There are two built-in methods and one outside helper. Each has a known problem; the recommended setup below combines the helper script with Input Hook.

### Method 1: helper script (Settings, Options, "Replace LG Home with a helper script")

A small background helper watches which app the TV reports as being in front. When that becomes LG Home (Home button, leaving an app with Back, boot) it opens Hearth instead. **Nothing is replaced or mounted.**

- It starts at boot (a link in the TV's startup folder) and also whenever Hearth is on screen.
- **Problem: LG Home can flash for a moment** before Hearth opens, because the helper can only react once LG Home is already in front. Use it with the **Input Hook** app (below) and map the Home button.
- The "LG Home" tile still opens LG's own Home.
- **Turn it off before uninstalling Hearth.** Reversal steps and a diagnostics script: [`src/homehook/README.md`](src/homehook/README.md).

### Method 2: script and SAM (Settings, Options, "Replace LG Home with a script and SAM")

The TV opens Hearth through LG Home's own place, so **LG Home is never drawn**. It cannot be on together with the helper script (each greys the other out). Tested by the maintainer on webOS 7.

- A small black stand-in is bind-mounted over LG Home's app folder and the TV's app manager (SAM) is restarted **once** (the screen may blink). A root watcher then opens Hearth when the stand-in comes to the front. The mount lives in memory; a link in the startup folder redoes it at each start.
- **Problem: it starts late in boot,** about 30-35 s after power-on. Until then it works like the helper script, so LG Home can still flash in that window.
- **Problem: the TV's aspect-ratio setting does not work while it is active.** It works again after you turn the method off and reboot the TV.
- The "LG Home" tile does nothing while it is on; switch the setting off to use LG's own Home.
- **If something is stuck,** the undo steps over SSH are in [`src/takeover/README.md`](src/takeover/README.md).

### Input Hook (flash-free Home button)

[LG Input Hook](https://github.com/Simon34545/lginputhook) (an app in the Homebrew Channel) can open Hearth when Home is pressed, before LG Home is drawn. Hearth cannot find the Home button's key code for you (an app on the TV is not given that key), so map it in Input Hook's own screen:

1. Install **LG Input Hook** from the Homebrew Channel and open it once (this gives it root and starts it at boot).
2. In Input Hook, bind the Home button to **launch** the app `tld.my.customlauncher`. The key code is **773 on the test remote; yours may differ, check it in Input Hook.**
   Or over SSH (check the code in `/tmp/lginput-hook-micomservice.log` first):
   ```
   echo '{"773":{"action":"launch","id":"tld.my.customlauncher"}}' > /home/root/.config/lginputhook/keybinds.json
   ```

The binding is stored with Input Hook, so it survives Hearth updates. To undo it, delete the binding in Input Hook (or write `{}` to that file). Input Hook is a separate project; these steps came from iulyax27 (pull request #8) and have not been checked on a TV by the maintainer.

### Recommended setup (rooted TV)

1. Install Hearth from the Homebrew Channel (see Install).
2. In Hearth: **Settings, Options, "Add the launcher as a TV input".** Hearth now appears in the TV's input list next to HDMI 1.
3. In the TV's own settings, make the TV start on its **last input** (the menu name varies by model). Select the **Hearth** input once; from now on the TV boots into Hearth.
4. In Hearth: turn on **"Replace LG Home with a helper script"**.
5. Install **LG Input Hook**, open it once, and map the **Home** button to launch `tld.my.customlauncher` (steps above).
6. Optional: turn off the LG logo at start-up (**"Show the LG logo when the TV starts"**).

If a rooted TV says "the TV refused the command", or the Homebrew Channel gives elevation errors, see Troubleshooting.

## webOS 11: one extra step on rooted TVs

On webOS 11 (found on an LG C4, firmware 43.21.73, by ganondorft; the fix is reported working by several users) the TV only lets an app use the Homebrew Channel's command service when the app's Luna permissions include `org.webosbrew.hbchannel.service.group`. The app installer leaves that out for Hearth, so even on a rooted TV every option that needs root is greyed out with *"the TV refused the command"*, the app icons are letters, and the wallpaper picker can't read the storage. Older webOS versions do not need this.

The script `tools/webos11-permission.sh` (inside the app) adds the permission. The installer writes Hearth's permission file again on every install or update, so the script installs itself as a boot hook that checks it at each start. Once, over SSH on the TV:

```
sh /media/developer/apps/usr/palm/applications/tld.my.customlauncher/tools/webos11-permission.sh
```

Or from a computer, with the file from this repository (`public/tools/`):

```
scp -O webos11-permission.sh root@TV_IP:/var/lib/webosbrew/init.d/40-hearth-permission
ssh root@TV_IP 'chmod 755 /var/lib/webosbrew/init.d/40-hearth-permission; sh /var/lib/webosbrew/init.d/40-hearth-permission'
```

Then close and reopen Hearth. After updating Hearth, restart the TV (or run the command again). To undo it, delete `/var/lib/webosbrew/init.d/40-hearth-permission` and reinstall Hearth. Not yet checked on a TV by the Hearth maintainer (the install path inside the app is the usual one for Homebrew installs).

## Troubleshooting

- **"Can't read the storage" / a greyed-out row:** the message tells you which of these it is. *The Homebrew Channel service is not running*: the TV is not rooted, or it is rooted but the service has not started (open the Homebrew Channel once, then try again).
  *Did not answer in time*: the service is still starting, try again in a moment. *The TV refused it*: this TV does not allow it without root.
- **A picture won't show:** the message says why (over 8 MB, over 25 megapixels, or not a picture).
- **USB drive missing in the picker:** plug it in, then open the picker again. The TV must have mounted it.
- **The weather doesn't appear:** check the TV's internet connection; it tries again by itself after 2, 10 and then 30 minutes.
- **The Home button shows LG Home for a moment:** the helper script can only react once LG Home is in front. Use the **Input Hook** app, or *Replace LG Home with a script and SAM* (see Replacing LG Home).
- **Hold OK does nothing** on an app in the home row, or in Settings → Apps or Sources (so the app menu and the name and icon editor do not open): users report that **turning the TV off and on again** (a power cycle: unplug it for a minute) fixes it. The cause is not known yet.
- **Root options greyed out with "the TV refused the command", or elevation (root) problems:** update the Homebrew Channel to **0.8.0-rc1** ([release page](https://github.com/throwaway96/webos-homebrew-channel/releases/tag/v0.8.0-rc1)) and open it once. On webOS 11 also do the permission step above.
- **Odd layout after changing sizes:** Settings → Look → **Reset look and clock**.

## Credits

**Code contributions** (applied by hand into Hearth's own code; authors credited in the commits and the changelog):

- **Alejandro Morales**, pull request #1: slideshow shuffle that survives restarts.
- **chriskoperdraad-tech**, pull requests #2 and #3: webOS 3.x (Chromium 38) support. The Home-bar watcher lines are theirs; the ES5 build and the custom-property fallback are Hearth's own code.
- **ganondorft**, pull request #6: the webOS 11 permission fix and the Windows line-ending fix.
- **iulyax27**, pull requests #8 and #10: icon batches, the Input Hook guide, and the ideas for quiet mode and OLED shift.
- **Recent apps panel, icon shapes and bottom fade:** community contribution, author not named. The idea and the TV services to call came from it; Hearth's code is its own.

**Projects and ideas:**

- **[partridgeworks/webos-launcher](https://github.com/partridgeworks/webos-launcher)** (MIT): the project this one began as a fork of: app skeleton, Luna service bridge, app list and icon loading, remote handling.
- **[Glasshouse](https://github.com/rorygallagher2024/glasshouse)** by Rory Gallagher (MIT): the technique behind *Replace LG Home with a script and SAM*. Adapted parts are credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **[webOS Brew / Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel)**: the root access, `exec` service and startup folder everything rooted runs on; **throwaway96's** Homebrew Channel 0.8.0-rc1 for the elevation fixes.
- **[LG Input Hook](https://github.com/Simon34545/lginputhook)** by Simon34545: the flash-free Home button.
- **Clean Your TV:** the idea of reading the app list through LG's remote-control service.
- **Photos:** the bundled nature photos are public-domain photos supplied by the maintainer.
- Weather data: [Open-Meteo](https://open-meteo.com) (free for non-commercial use, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
- Bundled third-party material, with its licences, is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **Developed with Claude (Anthropic).** Claude wrote and tested most of the code; the maintainer directed it and tried it on real LG TVs. (A credit, not an endorsement by Anthropic.)

Thank you to everyone who tested and reported problems.

## Build

Needs Node 18+.

```
npm install
npm test           # unit tests, plus the home-screen helper's shell tests
npm run build      # type-check, then build dist/ (app.js for Chrome 53+, app.legacy.js for webOS 3.x / Chromium 38)
npm run package    # dist/ -> build/tld.my.customlauncher_<version>_all.ipk
```

`npm run dev` serves the UI in a desktop browser with sample apps and folders.
To publish a new release and keep Homebrew Channel updates working, see [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Notes for developers

- The build targets Chrome 53 (webOS 4.x) and avoids CSS grid, `gap` and `inset`. Module scripts don't load from `file://` on webOS, so the bundle is one classic script.
- Custom properties are set only through `src/lib/cssvars.ts` (`setRootVars`, `varScope`). In the normal build they are plain CSS variables; in the legacy build (`HEARTH_LEGACY=1`, see `scripts/legacy.mjs`) the stylesheet is rewritten with the values filled in.
- `src/lib/prefs.ts` describes every setting in one table; the Settings lists and key handling come from it.
- Shell commands go through one place, `exec` in `src/lib/apps.ts`, which also learns whether this TV can run commands (`src/lib/failure.ts`) so rows can be greyed out and errors explained at no extra cost.
- The weather code is behind a build switch: `HEARTH_WEATHER=0 npm run build` leaves it out entirely.
- `src/lib/wallpaper.ts` lists folders with `ls -1p` and reads pictures with `dd | base64` through the Homebrew Channel service; `src/components/Wallpaper.tsx` fades each new picture in over the old one.
- `tools/watch-tv-settings.sh` is a read-only helper for finding which TV setting a menu switch changes (it is how the LG logo setting was found).
- `scripts/gen-repo.mjs` writes `repo/apps.json`, the file the Homebrew Channel reads.

