<p align="center"><img src="public/largeIcon.png" alt="Hearth icon" width="120"></p>

# Hearth: a fast, calm home screen for LG webOS TVs

Hearth replaces the busy LG home screen with something quiet and quick: a **clock with the date and the weather**, **your apps and TV inputs in one or two rows**
along the bottom, and a background that is plain **OLED black**, a **picture**, or a **slideshow from a USB drive**. It starts almost instantly, scrolls smoothly,
and everything is adjustable from the remote.

It is a normal webOS app (app ID `tld.my.customlauncher`). On a rooted TV it can also become the screen the TV boots into and the one the Home button opens.

![Hearth home screen with weather](docs/screenshots/home-weather.jpg)

| | |
|---|---|
| ![Ocean wallpaper, two rows](docs/screenshots/home-ocean.jpg) | ![Sunset wallpaper](docs/screenshots/home-sunset.jpg) |
| ![A different clock font](docs/screenshots/home-aurora.jpg) | ![Hold OK on an app for its menu](docs/screenshots/app-menu.jpg) |

## What it does

- **In English and Spanish.** Settings → Options → **Language** switches the whole interface — menus, settings, messages, dates and the weather — at once, without restarting.
- **Clock, date and weather.** Six typefaces, adjustable size, thickness and position, 12-hour, 24-hour or "same as the TV". The weather line (temperature, conditions,
  today's high and low) comes from [Open-Meteo](https://open-meteo.com), needs no account, and can be switched off.
- **Widget colour and opacity.** White is hard to read on a light picture, so the clock, date and weather can be white, warm white, ice blue, amber, grey, dark grey,
  black, or one of three gradients (Ember, Ocean, Dusk), at 10 to 100 % opacity.

  ![Widget colour options on a light background](docs/screenshots/clock-colours.jpg)
- **Your apps and inputs in one row.** Choose what is shown, re-order, or hold OK on an app for *Move to start / left / right / end*, *Hide* and *Uninstall*.
  Back on the home row jumps to the first app. **Refresh list** in Settings → Apps looks for newly installed apps straight away.
- **Wallpaper.** Plain black (or a calm blue-grey), one picture, or a slideshow of a whole folder from a USB drive or the TV's storage, with shuffle and an interval from 10 seconds to 1 hour.
- **Start the TV straight into Hearth.** *Options → Add the launcher as a TV input* adds **Hearth** to the TV's input list, next to HDMI 1 and Live TV. Choose it, set the TV to start on its last input,
  and the TV boots into Hearth.

  ![Hearth in the TV's input list](docs/screenshots/tv-input.jpg)
- **The Home button opens Hearth** (instead of LG Home), with an optional helper that also starts at boot, and a switch for LG's own **"Show LG logo when the TV starts"**
  setting (normally hidden in a secret menu) for a clean start.
- **Made to be fast.** The home screen is drawn from saved data first; everything else (app list, weather, helper checks) happens a few seconds later in the background.
  While another app is in front, Hearth lets go of its wallpaper and stops its clock.
- **Clear messages.** When something can't work on your TV, Hearth says what and why instead of failing silently, and greys out the options that need a rooted TV.

![Settings, Options tab](docs/screenshots/settings-options.jpg)

## What works on which TV

### Tested versions

| | |
|---|---|
| Lowest tested | LG firmware **03.01.16** (**webOS 7.0.0**), by users of this launcher |
| Newer versions | **Should work.** Hearth is compiled for old web views (Chromium 38) and uses only standard web features and TV services that LG keeps across versions, so newer webOS should be fine, but I have not tried every version. Please report anything odd |

### Rooted TV with the Homebrew Channel: everything

The Homebrew Channel lets Hearth run a few fixed commands on the TV. That is what powers the live app list with real icons, USB/storage browsing for wallpapers,
the Home-button hand-over and boot helper, the TV input, the LG logo switch, "Close LG Home" and uninstalling apps.

### Not rooted (only Developer Mode): the core, with the extras greyed out

> **Not yet confirmed on a non-rooted TV.** This is how Hearth is designed to behave; a test on a real non-rooted TV is still to come.

- Expected to work: the home screen, the clock and date, the **weather** (it uses the web view's own internet connection), themes, sizes, fonts and colours, the built-in list of common apps, and launching apps.
- Needs root, so it is **greyed out with the reason** shown: everything on the Options tab (live app list, TV input, Home-button hand-over, boot helper, LG logo, Close LG Home), reading USB/storage for wallpapers, and uninstalling apps.
- Without root, Hearth is simply an app you open yourself; it cannot replace LG Home or start the TV into itself.

## Install

### Option 1: through the Homebrew Channel (recommended, gets you updates)

1. Open the **Homebrew Channel** on the TV and go to **Settings**.
2. Choose **Add repository** and type this address:

   `https://raw.githubusercontent.com/rudra-avatar/webos-custom-launcher/main/repo/apps.json`

   (Typing with the remote is slow. From a computer on the same network you can send it instead, over SSH:
   `ares-launch org.webosbrew.hbchannel -p '{"launchMode":"addRepository","url":"https://raw.githubusercontent.com/rudra-avatar/webos-custom-launcher/main/repo/apps.json"}'`)
3. Go back to the app list, open **Hearth** and choose **Install**.
4. **Updating:** when a new version is released, open the Homebrew Channel, open Hearth and it shows the new version
   (for example "1.2.0 (installed: 1.1.0)") with an **Update** button. Your settings are kept.

### Option 2: install the file yourself

Download `tld.my.customlauncher_1.1.0_all.ipk` from the [Releases](../../releases) page, then either use
[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) (a desktop app; no root needed, only Developer Mode), or over SSH on a rooted TV:

```
scp -O tld.my.customlauncher_1.1.0_all.ipk root@TV_IP:/tmp/
ssh root@TV_IP
luna-send -i luna://com.webos.appInstallService/dev/install '{"id":"com.ares.defaultName","ipkUrl":"/tmp/tld.my.customlauncher_1.1.0_all.ipk","subscribe":true}'
luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"tld.my.customlauncher"}'
```

Installing over an older version keeps your settings. To remove Hearth, turn off *Make this launcher the default instead of LG Home* first, then uninstall "Hearth"
from the Homebrew Channel or Dev Manager.

## Using it

| Where | Key | Does |
|---|---|---|
| Home | ← → | Move along the row |
| Home | OK | Open the app. The last three tiles are **LG Home**, **System Settings** and **Hearth Settings** |
| Home | hold OK | The app's menu: move it, hide it, uninstall it |
| Home | Back | Jump to the first app |
| Settings | ← → on the tab bar | Apps · Sources · Look · Clock · Weather · Wallpaper · Options |
| Settings (apps) | OK / hold OK | Show or hide an app / re-order. **Refresh list** looks for new apps |
| Settings (other tabs) | OK, or ← → | OK steps through the choices; ← → nudge numbers (they stop at the ends) |
| Any other screen | Back | Go back one screen |

### Settings

- **Apps / Sources:** which apps and HDMI inputs are on the row, and their order. **Refresh list** (Apps) checks for newly installed apps.
- **Look:** theme (OLED black, calm blue-grey or Glass), the **Glass colour** (Violet, Graphite, Midnight, Sunset), **Reduce effects (faster)**, icon size (50-140 %), rows (one or two),
  side margin (0-300 px) and bottom margin, app names on or off, **When Home is pressed** (the first app, or the app opened last), **Hide the apps when idle** (never, 1, 3 or 10 minutes), and **Reset look and clock**.
- **Clock:** time format, size, font, thickness, vertical and horizontal position, date and AM/PM on or off, the Glass cards in the top-left corner, and **Move the clock slightly (OLED care)**
  (on by default: a few pixels every 3 minutes, so a static clock never wears into an OLED screen).
- **Weather:** on or off, the city, Celsius or Fahrenheit, the city name, today's high and low, and the next three hours (in the Glass weather card).
  Pick a city from the list of about 75, or choose **Search for a city** and type any place name (worldwide).
- **Wallpaper:** the picture or slideshow, interval and shuffle, **Widget colour** and **Widget opacity**.
- **Options:** the **Language** (English or Spanish — works on every TV); and, on rooted TVs, the TV input; live app list; *Make this launcher the default instead of LG Home*; *Start the launcher helper at boot*;
  *Home button opens Hearth directly* and *Red / Green / Yellow / Blue button opens*; *Show the LG logo when the TV starts*;
  *Close LG Home when the app opens* and *Close LG Home now*; and, last, the experimental *Alternative method* (webOS 5 and newer).
  The remote-button rows need [LG Input Hook](https://github.com/Simon34545/lginputhook) from the Homebrew Channel (open it once after installing). Hearth reads and
  writes Input Hook's own settings, so a button set up there or by hand shows as it is; it only adds or removes "launch" bindings on Home and the colour buttons
  and leaves every other binding alone. *Home button opens Hearth directly* means LG Home is never shown when Home is pressed (no flash).

### Wallpaper

Five minimalist wallpapers come with Hearth: **Aurora**, **Dunes**, **Tide**, **Bloom** and **Horizon** (1920×1080 JPEGs of about 150-190 KB each, drawn for Hearth;
sources in `tools/wallpapers`, rendered with `sh tools/wallpapers/render.sh`). They load straight from the app, so they also work on a TV that is not rooted, and only the one on screen is in memory.

**Settings → Wallpaper → Wallpaper** opens a folder browser: **Default background**, the five built-in wallpapers, or a **USB drive** / **Internal storage** (`/media/developer`), where OK on a picture sets it and
**Play this folder as a slideshow** plays every picture in the folder. Use JPG, PNG, WebP or BMP, ideally 1920×1080 to 3840×2160 and a few MB at most; a picture over 8 MB or over 25 megapixels is skipped
with a message. A web app cannot read files itself, so on a rooted TV the Homebrew Channel's service reads them in small pieces. If it can't, the screen says why and offers **Try again**.

### Weather and privacy

The weather comes from [Open-Meteo](https://open-meteo.com) (free, no account). The only thing sent is the latitude and longitude of the city you chose (and the words you type in the city search). It is fetched a few seconds after Hearth appears, then every 30 minutes
while Hearth is in front, and the last reading is kept so the home screen never waits for the internet. A reading older than 6 hours is not shown. If the TV's web view cannot make a secure connection (some older TVs can't), Hearth asks the TV's own `curl` or `wget` through the Homebrew Channel instead;
the last-resort attempts skip the certificate check, which is acceptable for public weather numbers that are only ever read as numbers and a place name.

## Opening Hearth instead of LG Home (rooted TVs)

**Settings → Options → Add the launcher as TV input** adds **Hearth** to the TV's input list, next to HDMI 1 and Live TV. Choose it, set the TV to start on its last input,
  and the TV boots into Hearth.

```
luna-send-pub -n 1 'luna://com.webos.service.eim/addDevice' '{"appId":"tld.my.customlauncher","pigImage":"","mvpdIcon":"","label":"Hearth","description":"Hearth home screen"}'
```
(To remove the input, use the same command with deleteDevice instead of addDevice.)
  
**Settings → Options → Make this launcher the default instead of LG Home** starts a small background helper that watches which app the TV reports as being in front. When that becomes LG Home
(Home, leaving an app with Back, boot) it opens Hearth instead. **Nothing is replaced or mounted.**

- The helper is started as soon as Hearth is on screen, so the Home button works even if **Start the launcher helper at boot** is off. Turn the boot switch on to have it running from the moment the TV is up.
- The "LG Home" tile still opens LG's own Home.
- **Turn it off before uninstalling Hearth.** Reversal steps (also over SSH) and a diagnostics script are in [`src/homehook/README.md`](src/homehook/README.md).

### No LG Home flash: map the Home button with LG Input Hook (optional)

The helper can only react once LG Home is already on screen, so LG Home shows for about half a second after you press Home.
To skip LG Home entirely, let [LG Input Hook](https://github.com/Simon34545/lginputhook) (in the Homebrew Channel) open Hearth when Home is pressed:

1. Install **LG Input Hook** from the Homebrew Channel and open it once (this gives it root and starts it at boot).
2. In it, press **Add keybind**, press Home on the remote to see its code, choose **Launch App** → **Hearth**, and **Save changes**.
   Or over SSH (773 is the Home button on the remote this was tested with; check yours in `/tmp/lginput-hook-micomservice.log`):
   ```
   echo '{"773":{"action":"launch","id":"tld.my.customlauncher"}}' > /home/root/.config/lginputhook/keybinds.json
   ```
3. Keep the helper above switched on: it still covers leaving an app with Back and the TV's own start-up.

This is stored with Input Hook, not with Hearth, so it survives Hearth updates. To undo it, delete the binding in Input Hook (or write `{}` to that file).
Tested on webOS 6.5.3.

The **Alternative method** row sets the TV's own `defaultApps.home` setting instead. It is experimental, may not work on webOS older than 5 (it did not on webOS 4), and needs the same care: switch it off before uninstalling.
To undo it from a shell:
```
luna-send -n 1 -f luna://com.webos.settingsservice/setSystemSettings '{"category":"general","settings":{"defaultApps":{"home":"com.webos.app.home"}}}'
```

## webOS 11: one extra step on rooted TVs

On webOS 11 (tested on an LG C4, firmware 43.21.73) the TV only lets an app use the Homebrew Channel's
command service when the app's Luna permissions include `org.webosbrew.hbchannel.service.group`. The app
installer leaves that out for Hearth, so even on a rooted TV every option that needs root is greyed out with
*"the TV refused the command"*, the app icons are letters, and the wallpaper picker can't read the storage.

[`tools/webos11-permission.sh`](tools/webos11-permission.sh) adds the permission. Because the installer writes
Hearth's permission file again on every install or update, it is installed as a boot hook that checks it at
each start (before Hearth's own boot helper). Once, from a computer on the same network:

```
scp -O tools/webos11-permission.sh root@TV_IP:/var/lib/webosbrew/init.d/40-hearth-permission
ssh root@TV_IP 'chmod 755 /var/lib/webosbrew/init.d/40-hearth-permission; sh /var/lib/webosbrew/init.d/40-hearth-permission'
```

Then close and reopen Hearth. After updating Hearth, restart the TV (or run the second command again).
To undo it, delete `/var/lib/webosbrew/init.d/40-hearth-permission` and reinstall Hearth.

## Troubleshooting

- **"Can't read the storage" / a greyed-out row:** the message tells you which of these it is. *The Homebrew Channel service is not running*: the TV is not rooted, or it is rooted but the service has not started (open the Homebrew Channel once, then try again).
  *Did not answer in time*: the service is still starting, try again in a moment. *The TV refused it*: this TV does not allow it without root.
- **A picture won't show:** the message says why (over 8 MB, over 25 megapixels, or not a picture).
- **USB drive missing in the picker:** plug it in, then open the picker again. The TV must have mounted it.
- **The weather doesn't appear:** check the TV's internet connection; it tries again by itself after 2, 10 and then 30 minutes.
- **The Home button shows LG Home for a moment right after boot:** turn on *Start the launcher helper at boot*.
- **LG Home flashes for a moment every time you press Home:** map the Home button with LG Input Hook (see *No LG Home flash* above).
- **Letters instead of app icons with the live app list:** fixed in this version (icons are now read a few at a time; reading them all at once went over the Homebrew service's 200 KB output limit on webOS 6).
- **Odd layout after changing sizes:** Settings → Look → **Reset look and clock**.

## Credits

- **[partridgeworks/webos-launcher](https://github.com/partridgeworks/webos-launcher)** (MIT): the project this one began as a fork of. It provided the app skeleton, the Luna service bridge, app list and icon loading, and remote-control handling. Thank you to its author.
- **Built with Claude.** This project was developed in conversation with [Claude](https://www.anthropic.com/claude), an AI assistant made by Anthropic, which wrote and tested most of the code.
  It was directed, tried out and checked on real LG TVs by the repository's maintainer. (This is a credit, not an endorsement by Anthropic.)
- Weather data: [Open-Meteo](https://open-meteo.com) (free for non-commercial use, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
- Bundled third-party material, with its licences, is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Build

Needs Node 18+.

```
npm install
npm test           # unit tests, plus the home-screen helper's shell tests
npm run build      # type-check, then build dist/ and re-emit it for Chromium 38 (webOS 3.x)
npm run package    # dist/ -> build/tld.my.customlauncher_<version>_all.ipk
```

`npm run dev` serves the UI in a desktop browser with sample apps and folders.
To publish a new release and keep Homebrew Channel updates working, see [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Notes for developers

- The build targets Chromium 38 (webOS 3.x): vite compiles for Chrome 53, then `scripts/legacy.mjs` re-emits the bundle with older syntax. It avoids CSS grid, `gap` and `inset`. Module scripts don't load from `file://` on webOS, so the bundle is one classic script.
- All user-facing text goes through `t(key, params)` in `src/lib/i18n.ts`; the tables live in `src/locales/en.json` and `src/locales/es.json`. To add a language: copy a table, add its code to `Lang` in `src/lib/i18n.ts` and `src/lib/storage.ts`, and load it in `src/main.tsx`. Labels with dynamic parts (like the colour buttons) are functions on their `Pref`, so they translate at render time.
- `src/lib/prefs.ts` describes every setting in one table; the Settings lists and key handling come from it.
- Shell commands go through one place, `exec` in `src/lib/apps.ts`, which also learns whether this TV can run commands (`src/lib/failure.ts`) so rows can be greyed out and errors explained at no extra cost.
- The weather code is behind a build switch: `HEARTH_WEATHER=0 npm run build` leaves it out entirely.
- `src/lib/wallpaper.ts` lists folders with `ls -1p` and reads pictures with `dd | base64` through the Homebrew Channel service; `src/components/Wallpaper.tsx` cross-fades two layers.
- `tools/watch-tv-settings.sh` is a read-only helper for finding which TV setting a menu switch changes (it is how the LG logo setting was found).
- `scripts/gen-repo.mjs` writes `repo/apps.json`, the file the Homebrew Channel reads.
