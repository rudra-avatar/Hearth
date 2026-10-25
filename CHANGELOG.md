# Changelog

## 1.2.0

**New**
- **Two languages: English and Spanish.** *Settings → Options → Language* switches the whole interface at once —
  menus, settings, messages, dates and the weather — without restarting the app.
- **Five built-in minimalist wallpapers:** Aurora, Dunes, Tide, Bloom and Horizon (Settings → Wallpaper). Small (about 150-190 KB each), loaded straight from the app, and they work without root.
- **Glass colour** (Look): Violet, Graphite, Midnight or Sunset.
- **Reduce effects (faster)** (Look): no blur, shadows or springy motion, for slower TVs.
- **When Home is pressed** (Look): highlight the first app, or the app you opened last.
- **Hide the apps when idle** (Look): the app row fades out after 1, 3 or 10 minutes; any button brings it back without doing anything else.
- **Move the clock slightly (OLED care)** (Clock), on by default.
- **The next three hours** in the Glass weather card (Weather → Show the next hours).
- **Remote buttons** (Options, rooted TVs with LG Input Hook): *Home button opens Hearth directly* (no LG Home flash), and an app of your choice for each colour button.
- **webOS 3.x runs again:** the bundle is re-emitted with Chromium 38 syntax (`scripts/legacy.mjs`), and the Home-button helper also understands the older home bar's signal.

**Fixes**
- **webOS 11:** the options that need root no longer stay greyed out on a rooted webOS 11 TV once its one-time
  permission step is done: [`tools/webos11-permission.sh`](tools/webos11-permission.sh), a boot hook, gives Hearth the
  Homebrew Channel permission that the app installer leaves out (see "webOS 11" in the README). The "TV refused the
  command" message now points there.
- **Building on Windows:** the Home-button helper scripts are always written to the TV with plain line ends. A build
  from a Windows checkout embedded them with CRLF, and turning on *Make this launcher the default instead of LG Home*
  failed with `syntax error: unexpected word (expecting "then")`. `.gitattributes` keeps `*.sh` files LF.
- **App icons showed as letters** with the live app list on TVs with many apps (seen on webOS 6.5.3 with 26 apps): all icons were read in one command, whose
  output (about 240 KB) went over the Homebrew service's 200 KB limit, so the whole read failed. Icons are now read 4 per command, and a group that still fails
  is retried one icon at a time.

**Docs**
- How to stop LG Home flashing when Home is pressed, by mapping the Home button to Hearth with LG Input Hook.

## 1.1.0

The launcher is now called **Hearth**, with a new icon, and it is faster, easier to set up and much more complete.

**New**
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
