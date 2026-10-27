# Changelog

## Unreleased

- **Reassign remote buttons** (Settings → Options, rooted TVs): give the remote's Netflix, Prime Video and other partner buttons (or others, by pressing them) a new job: any app or input, Hearth, mute, or nothing. Hearth adds a key filter to the front of the TV's own key-filter chain, in the TV's memory only, and sets it again at each start (`/var/lib/webosbrew/init.d/47-launcher-remap`). Standard remote and Magic Remote alike; Off gives every button back at once. The Rakuten TV / Movies button is one row for both of its key codes (`Key_webOS_USP` on 2019 remotes, `Key_webOS_RakutenTV` on later ones). See `src/remap/README.md`.
- **Reassign remote buttons, with a picture of your remote:** choose your Magic Remote (2019–2020, 2021–2024 or the 2025 AI Magic Remote; the TV's log suggests which), then press a button on it, or move to it on the drawing, to choose its new job; what each button does is written beside it. Buttons LG Input Hook also handles are marked (idea from iulyax27). *Other, or not listed* keeps the plain list.

## 1.2.0

- **Edit names and icons** (Settings → Apps or Sources, hold OK on an item): rename an app or input, pick another icon (16 input symbols, the bundled app logos), or use your own picture from a USB drive or the TV (rooted TVs, saved inside Hearth's settings). *Use the app's / TV's name and icon* resets it. See the README, "Edit a name or icon".
- **Hearth for WebOS** is the public name; the README now explains the two ways to replace LG Home (helper script, SAM), their known problems, and a recommended setup with Input Hook. The Home key code is 773 on the test remote; others may differ.
- **Back on the home row** always opens the Recent apps panel; the old "jump to the first app" is gone.
- **Quiet mode** (apps fade after a chosen idle time, 10-60 s; off by default), **OLED shift** (slow pixel shift, on by default, with an off switch), **icon spacing**, **wallpaper opacity**, **name colour**, and **bundled nature photos** with a slideshow. Quiet mode and OLED shift follow ideas from iulyax27 (pull request #10).
- **Icon batches** and the Input Hook guide: thanks to iulyax27 (pull request #8).
- **Speed:** the clock redraws Home once a minute (it was once a second) and unchanged tiles are not redrawn (worst key delay on the reference TV 200 ms to 66 ms).
- **Credits:** Alejandro Morales (#1), chriskoperdraad-tech (#2, #3), ganondorft (#6), iulyax27 (#8, #10), community contribution (author not named); projects and ideas are listed in the README. Developed with Claude (Anthropic).
- **Recent apps panel:** Back on the home screen opens a panel along the bottom with the TV's recent apps (rooted TVs). OK opens one, holding OK closes it, ↑ reaches *Close all*, Back closes the panel. Width and height are in Settings → Look. The idea comes from a community contribution (1.6.0 build, author not named); the code is Hearth's own.
- **Icon shape** (Settings → Look): rounded or sharp square, squircle, circle, leaf, arch, teardrop. **Bottom fade** (Settings → Wallpaper): darkness and height. Both from the same contribution.
- **Ten more clock fonts** (Outfit, Work Sans, Bricolage Grotesque, Big Shoulders, Jura, Tektur, JetBrains Mono, Lora, Poiret One, Pixelify Sans) and **six clock thickness steps** (Thin to Bold), from the same contribution. **Widget shadow** switch: a slight drop shadow behind the time, date and weather (Settings → Wallpaper).
- **Experimental: webOS 3.x (Chromium 38)** from the same install file: a loader picks `app.js` or the ES5 `app.legacy.js`; custom properties are emulated there; the helper script watches the system log for the Home bar (`HOOK_VERSION` 9). Ideas and the watcher lines from pull requests #2 and #3 by chriskoperdraad-tech. Untested on a TV.
- **Widget shadow strength** (Settings, Wallpaper) beside the shadow switch.
- **Experimental: app list without root** (Settings, Options, "Load apps from the TV"): pairs with the TV's own remote-control service and reads the full app list; the order is Homebrew, then the TV, then the built-in list. Ideas from the public protocol; see README "Not rooted".
- **Quiet mode** brings the apps back when you return from an app (it used to stay hidden until a key was pressed). **Load apps from the TV** is hidden on rooted TVs. Settings shows the TV's **IP** address at the bottom right; the wallpaper guide and README now point there instead of the Homebrew Channel.
- **Tests tab:** frame timer and key delay (idle, Settings, Home) and start-up times (tests 28-31), to measure speed on a real TV. "Run all tests" skips the tests that need you to act or run long (21, 26, 29-31), and every test is given up after two minutes.
- **Nature photo slideshow** now cross-fades and no longer redraws the whole launcher on each change.
- **webOS 11:** the root options no longer stay greyed out on a rooted webOS 11 TV once a one-time permission step is done: `tools/webos11-permission.sh` (inside the app; run it once over SSH, see "webOS 11" in the README). The "TV refused the command" message now says so. Thanks to ganondorft (pull request #6) for finding the cause and the fix.
- **Building on Windows:** the helper and start-up scripts are always written to the TV with plain line ends, and `.gitattributes` keeps `*.sh` files LF (also from pull request #6).

- **Replace LG Home with a script and SAM** (Settings → Options). Instead of reacting after LG Home has appeared, a small black stand-in is mounted over
  LG Home's own folder and the TV's app manager (SAM) is restarted once to read it, so the TV opens Hearth through LG Home's own place and **LG Home is never
  drawn** (Home, Back out of an app, waking the TV). A root watcher opens Hearth the moment the TV reports the stand-in in front. The mount lives in memory
  only; a link in the startup folder redoes it about 25 s into each start, and until then the watcher works as the helper script does. A start-up that does not
  finish is not repeated, and the method switches itself off if Hearth cannot be opened. It cannot be on together with the helper script: each greys the
  other out. Adapted from Glasshouse (see THIRD_PARTY_NOTICES.md); undo steps over SSH: `src/takeover/README.md`.

- *Make this launcher the default instead of LG Home* is now **Replace LG Home with a helper script**. The helper now always starts at boot, so the
  *Start the launcher helper at boot* row is gone (installing the new version adds the boot link to an existing helper). Its description warns that LG Home can
  flash for a moment and points to the Input Hook app.

## 1.1.0

The launcher is now called **Hearth**, with a new icon, and it is faster, easier to set up and much more complete.

- **Weather** under the clock: temperature, conditions and today's high and low, from [Open-Meteo](https://open-meteo.com) (no account, no key). Choose a city from a list of about 75 or search for any place
  in the world. Celsius or Fahrenheit. It is read from a saved copy at start-up and refreshed in the background, so it never slows the home screen down.
- **Widget colour and opacity** (Settings → Wallpaper) for the clock, date and weather: white, warm white, ice blue, amber, grey, dark grey, black and three gradients (Ember, Ocean, Dusk), at 10 to 100 %.
  Readable on light pictures, and a description explains why.
- **Six clock fonts** (Inter, TV font, Poppins, Oswald, Roboto Mono, Cormorant Garamond).
- **Add Hearth as a TV input** so the TV can start straight into it (Options → Add the launcher as a TV input).
- **LG logo switch:** Options → *Show the LG logo when the TV starts* reads and changes LG's own (normally hidden) setting.
- **Refresh list** button in Settings → Apps, to find newly installed apps at once.
- **Move to end** in an app's menu (hold OK), **System Settings** tile, and **LG Home** moved before it.
- **Back on the home row** jumps to the first app.
- Icon size down to 50 % and side margin up to 300 px. **Reset look and clock** moved to the Look tab.
- **Install and update through the Homebrew Channel:** add this repository once and the Homebrew Channel shows new versions (see the README).

**Faster and smoother**
- The app list is checked and reloaded in the background a few seconds after Hearth appears, not at start-up, and merged into fewer calls. The saved full app list and its icons are never replaced by the small built-in list.
- Smoother scrolling along the row (only movement and fade are animated).
- The Home-button helper now starts about a second after Hearth appears, which removes the short flash of LG Home after boot, even with *Start the launcher helper at boot* switched off.

**Clearer messages and non-rooted TVs**
- Every failure now says what failed and why (service not running, no root, refused, too slow, or the command's own error), with a *Try again* in the wallpaper picker.
- Options that need a rooted TV are **greyed out with the reason** when the TV cannot run commands, so a non-rooted TV still gets the core launcher.

**Fixes**
- Settings → Options showed only its first row on some TVs (seen on webOS 6): the list now measures the real screen.
- Launching an app could leave the launcher reappearing in a loop until the TV was restarted: the helper no longer feeds back on itself.
- TV input add and remove now work (the app declares the `supportGIP` capability).
- After a restart the saved full app list and icons are kept when the Homebrew service is not up yet.
- Options order: TV input, live app list, helper (the "experimental" labels were removed from those three); the alternative home-app method is last.

**Tested on:** LG firmware 03.01.16 (webOS 8.0.0) and newer, webOS 6.x and webOS 4.x. Newer versions should work.

Co-authored-by: Claude (Anthropic) <noreply@anthropic.com>

## 1.0.0

First release of this fork of [partridgeworks/webos-launcher](https://github.com/partridgeworks/webos-launcher).

**Home screen**
- A centre clock (12-hour with a small AM/PM, or 24-hour) with the date, and one row of apps along the bottom, plus **LG Home** and **Settings** tiles.
- **OLED black** (default) or a calm blue-grey theme.
- Everything adjustable from the remote: clock size, thickness, colour, vertical and horizontal position, and whether to show the date and AM/PM;
  icon size; side and bottom margins; app order and which apps and HDMI inputs appear.

**Wallpaper**
- Plain background, one picture, or a **slideshow from a folder on a USB drive or the TV's storage**, with a folder browser, shuffle and an interval of 10 seconds to 1 hour (including 30 minutes).
- Pictures are read through the Homebrew Channel (the TV's web view cannot open files), shrunk if far larger than the screen, and skipped with a clear
  message if too big or not a picture.

**Speed and memory**
- The app list and the last wallpaper are cached, so the launcher draws its full screen at once; a black splash replaces the grey flash.
- While in the background the launcher lets go of its wallpaper and stops its clock.
- Optional **Close LG Home when the app opens**, and **Close LG Home now** (shows the memory freed).

**Experimental: making the launcher the TV's default**
- **Make this launcher the default instead of LG Home:** a small background helper opens the launcher whenever the TV brings LG Home to the front
  (Home, Back, boot). Nothing is replaced or mounted. **Start the launcher helper at boot** is a separate switch (one link in the startup folder).
  After opening the launcher the helper checks that it really appeared and asks again if not. The LG Home tile still opens LG's own Home.
  It writes a log and a `diagnose.sh` report for troubleshooting (see `src/homehook/README.md`). LG Home is never ended while it is the app in front.
- **Alternative method:** the TV's own home-app setting, which may only work on webOS 5 and newer (it did not on webOS 4).

**Targeted at older webOS:** built for, and tested on, an LG TV on webOS 4.x with the Homebrew Channel. Newer versions are untested.
- **Slideshow shuffle keeps its place** across restarts instead of starting a new order each time. Thanks to [@alejandro](https://github.com/alejandro) (pull request #1); the next picture now waits one interval after start-up instead of loading at once.
- **New defaults** for a fresh install and for *Reset look and clock*: clock follows the TV's 12/24-hour setting, weather on for Delhi with the city name and without high and low, icons at 90%, side margin 20 px, bottom margin 10 px. Reset now also restores the weather and the icon opacity. Existing settings are kept.
- **Smoother start and wallpaper changes:** the dark shade behind the clock and row is no longer drawn on light themes, nor on a plain pure-black background; a slideshow now fades the new picture in over the old one instead of fading both at once.
- README: how to copy your own wallpapers to the TV.
- Light themes: the pale glow behind the clock and the app row is gone, so dark wallpapers look right.
