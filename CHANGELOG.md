# Changelog

## 2.1.3

A small fix for the LG Home button on webOS 3 TVs.

### Fixes

- **LG Home on webOS 3 TVs** (rooted). Hearth now sends the Home key to the remote-control device of the TV first, and when the TV does not react it tries the next device. Before, on some TVs the key went to another device and nothing happened. Thanks to James18232, who debugged this on a webOS 3.4.3 TV: he sent the logs and the list of key devices, found that the remote is `event3`, and tested the fix by hand (issue #36).

### Guides

- The README and the guides now describe the *Replace LG Home with SAM (experimental)* option and credit Glasshouse for it. The recommended settings are now five, and SAM comes first because it avoids the flash of LG Home.

## 2.1.2

LG Home can now be opened from a remote button, and from the LG Home tile on webOS 3 TVs.

### New

- **LG Home** is a new job for *Map additional keys* (Settings, System, Remote control). Give a button of your remote this job and it opens LG's own home screen, on every webOS version. If a way of replacing LG Home is switched on, Hearth first warns that LG Home would not stay in front and lets you switch the replacement off first.

### Fixes

- **The LG Home tile on webOS 3 TVs** (rooted). webOS 3 has no LG Home app, so the tile could not open it. When the TV refuses the launch, Hearth now sends the TV its Home key instead. Thanks to James18232 for finding this way (issue #36).

## 2.1.1

A small fix.

### Fixes

- **Check for updates** also shows in Settings, System on TVs without root (it was missing there in 2.1.0). Without root it points you to the Homebrew Channel for the update.

## 2.1.0

A larger update: Hearth can now check for newer versions and install them itself, the home row can be re-ordered right on the Home screen, there is a new icon style, two more languages, and many fixes for webOS 3 TVs.

### Languages

- New: **Russian** (*Русский*, machine translated, shown with the *(machine translated)* mark) and **Português (Brasil)**, written and checked by assanches (issue #38), without the mark.
- Every language that comes with Hearth now has every text (French, Polish and Portuguese had a few gaps; they were filled by machine and are not yet checked by their authors, so corrections are welcome).

### Updates

- **Check for updates** is the first row of Settings, System. It looks only when you press OK and lists the newer versions with a short summary each.
- On a rooted TV, OK on the list asks *Install Hearth ...?* and installs the newest version, then shows the result. If that does not work, or the TV is not rooted, it opens the Homebrew Channel instead.

### Home screen

- **Reorder home row** moves apps right on the Home screen: hold OK on an app, choose *Reorder home row*, then OK picks an app up, the arrow keys move it, OK puts it down, Back exits. Favourites and the other apps keep their own order. This replaces the *Re-order* button in Settings and the four *Move* entries of the app menu.
- **Hide the Hearth Settings tile** (Look, Home row): removes the tile from the row. Hold OK on any app and choose *Hearth Settings* to open Settings; five presses of Down also bring the tile back until Hearth restarts.
- New icon style **Glyph**: just the shape, no tile. The focused icon only grows. *Icon tile: Dark* gives dark shapes and labels, *Light* gives light ones. Icons are drawn with smoother edges (they are made once again after the update).
- With the *Minimal* icon style the focused app grows a little more.
- *Row scroll speed*: there is a new **Fast** level and the old *Fast* is now called **Max**. Your saved choice keeps working as before.

### Widget and wallpaper

- **Widget backdrop** (Widget, Widget look): a soft dark or light glow behind the clock, date and weather so they read on bright pictures. Off, or 5 to 100. New installs start at 25; if you updated it stays Off until you turn it on.
- The wallpaper interval has a new level, **Each visit**: a new picture after a restart and after you were away for a minute or more.

### Settings

- The Settings background is a little more see-through.
- The colours of the picker screens (Recent apps, key drawings, pop-ups) are calmer.
- If Hearth cannot save your settings because the TV's storage is full, it now frees what it can rebuild, says so, and never writes an old copy over your newer choices.
- *Replace LG Home with SAM (experimental)* is back in System, TV start: a black stand-in is mounted in LG Home's place so the TV opens Hearth through it. It and the helper switch each other off (greyed out while the other is on).

### Remote and Home button

- **Map home button** now keeps listening when you press Home, shows the *Home button mapped* pop-up every time a button is mapped (also when it fails, with the reason), and while it listens the Home button no longer leaves Hearth. Detection of pressed buttons was rewritten.
- On webOS 3, *Map home button* picks the right button number from the key hook's log (it used a table slot, so the mapped Home button never fired). Thanks to chriskoperdraad-tech (pull request #37), who also tested and researched on a webOS 3.9 TV (issue #23).
- In *Map additional keys*, *Use the other method* now says plainly on a TV that cannot use it (webOS 3: no key filter list) and points to the first method; *Press a button* shows why it failed. A drawing of the 2016 Magic Remote was added. Thanks to Obednal97 (pull request #39, issue #36).

### webOS 3 TVs

- Fix for webOS 3 sets with an HD panel (such as the 32LJ600B): the screen was drawn shrunk into the top-left corner. Hearth no longer asks the TV for a fixed screen size. Reported by ggranata3 (issue #41). Reinstall the app to get it (the Homebrew Channel update does that).
- *Add Hearth as a TV input* and *When the TV turns on, open...* now warn on webOS 3 that some sets hang at start-up with them. On these TVs Hearth also keeps a small safeguard that takes the input or the power-on app out again if the TV does not reach Hearth after two start-ups (experimental; not yet tested on a TV that hangs). Reports: issues #23 and #43.

### Smaller changes

- The Debug tab's report file holds the whole session, not only the last lines.
- Many fixes and tests behind the scenes.

## 2.0.2

### Languages

- New languages that come with Hearth: **Français** (fr) and **Polski** (pl), written and checked by native speakers. Credits: Polish by sir_RAFIK (issue #35); French by Foxinou35 (issue #33). They carry no *(machine translated)* mark.

### Changes

- *Add Hearth as a TV input* is back in System, TV start, as one On/Off row (rooted TVs). Hearth no longer takes itself out of the TV inputs after an update.
- *Uninstall apps* button in Settings, Apps & Sources, Apps (rooted TVs): press it, then OK on an app to uninstall it, after a confirmation.
- Wallpaper *Picture size*: *Fill the screen* (as before) or *Fit* (the whole picture). Your wallpaper stays as it was until you change it.
- The wallpaper slideshow can change picture every 20 seconds.
- Screen saver *Brightness*: *Dim* now goes from 10% to 80% in steps of 10% (your saved choice is kept).
- Screen saver tab: the *Screen saver:* start of each row name is gone (the tab already says it).

## 2.0.1

### Fixes

- Updating from 1.2.0: a bundled photo you had chosen now maps to the same picture in 2.0 (before, some became another photo, and *Restore my settings from before the update* brought back the wrong one). The old *Nature 1* picture is no longer included and becomes the default photo. Thanks to Obednal97 for the report and the table (issue #32).

## 2.0.0

A big update: a new Settings layout, many more looks, a screen saver, a Home button that needs no other app, languages, and a full app list on TVs without root. Your apps, their order, names, favourites and TV-installed features are kept when you update. **Once**, the look, widget, wallpaper, home-row and quiet-mode values you had saved are reset to the new defaults (*Restore my settings from before the update* in Settings, Look brings them back once).

### New defaults

- A fresh install starts with the photo *Photo: 1*, a centred widget near the top, OLED black, weather off, quiet mode (apps hide after 20 s, the screen dims 20 s later), *When Home is pressed* = the app you opened last, the LG Home and System Settings tiles hidden, input status on, and the built-in video screen saver on (the TV switches off 5 minutes after it starts).
- *Reset look and clock* is now *Reset Hearth visual settings to default*.

### Settings

- New layout: tabs *Apps & Sources*, *Look*, *Widget*, *Wallpaper*, *Screen saver*, *System*. Rows live in groups that start closed and close again when you leave them; Back closes an open group first.
- *Show widget* switch; the widget has a live preview beside the list.
- Fewer rows: icon styles, shadow, fade, panel size and saver brightness are one row each.
- Settings background is a little more see-through; every row has one short description.

### Home screen

- **Favourites row:** hold OK on an app, *Add to favourites*. Home then shows only that row; Down shows all the other apps.
- **Order by last opened:** one switch puts the apps you opened last first.
- **When Home is pressed:** the highlight starts on the first app, or on the app you opened last. After switching the TV on it starts on the first app. A second Home press goes to the first app. (Idea and first code by Obednal97, pull request #20, built on an idea by iulyax27.)
- **Input status:** inputs with nothing plugged in are greyed out; a connected HDMI device's name shows under its input (rooted TVs). (Pull request #16 by Obednal97, adapted.)
- **Home row loops** (Right on the last app goes to the first); held keys start slowly and speed up; *Row scroll speed* (Slow, Medium, Fast); the Magic Remote pointer no longer runs away.
- App icons that change after an app update are noticed (pull request #21 by Obednal97). The Settings list keeps the rows above and below the highlighted one in view (pull request #17 by Obednal97).
- *Close all* in Recent apps closes the panel. Quiet mode also hides the bottom fade.

### Look and widget

- Themes: OLED black, Calm blue-grey, Midnight blue, Deep forest, **Deep teal** and **Warm graphite**. The light themes are gone (a saved one loads as OLED black).
- Icon styles: Original, Minimal, Dark mono, Soft mono, Accent mono, Gradient mono and **Tinted tile**; *Icon tile* Dark or Light; *Icon colour*; *Icon opacity*.
- **27 fonts** (ten new ones) for the widget and the app names; name font, size and thickness; widget alignment left, centre or right; widget colour *Follow theme* with its own ink on every theme; widget shadow levels.
- **Quiet mode** can also dim the screen (strength 10-80 %); **OLED shift** moves the clock and apps a few pixels each minute.
- Wallpaper: 25 new bundled photos (1920x1080), slideshows with subfolders and no picture-count limit, smooth cross-fade, and the chosen photo is painted in the very first frame.

### Custom themes (rooted TVs)

- Load a theme zip (Settings, Look, Theme): colours, widget colour, fonts, icon style, app pictures, app order and names, cities and a wallpaper or slideshow. *Save this theme*, browse saved themes with the arrows, *Delete this theme*.
- *Export theme base* writes your apps, names and icons as a starting zip for you or an AI helper. Format: `docs/theme/theme-guide.md`.

### Screen saver (rooted TVs, experimental)

- Replaces the TV's saver with your pictures, GIFs, videos or a slideshow, or the **built-in night fireplace video** (Night Stock Videos by Vecteezy). Own picture time, shuffle, fit or fill, OLED care, brightness, *Show it now*, and switch the TV off after a chosen time. A restart puts LG's saver back. On webOS 10 and newer it is untested.

### Home button, remote and TV start (rooted TVs)

- **Home button opens Hearth, no other app needed:** Hearth carries the Input Hook key hook (GPL-3.0, credited). *Map home button* finds LG's Home code (773, 774, 125) and maps it by itself, then a pop-up says whether it worked; a guide with a drawing of your remote helps when it does not. The mapping survives restarts. A separately installed Input Hook app with its own settings is never changed; Hearth then greys the rows out with the reason.
- **Map additional keys:** give the remote's colour buttons and other dedicated buttons a new job (open an app or input, Hearth, mute, or nothing). Home, arrows, OK, Back, power, volume, channels and numbers are never taken. (Pull requests #19 and #22 by Obednal97, adapted.)
- **When the TV turns on, open...:** the TV opens Hearth (or any app) at power-on, after one restart. It replaces *Add the launcher as a TV input*, which is gone (Hearth removes the old input once). (Method and first code from pull request #25 by Obednal97.)
- **Set Hearth as the TV's Home app** (experimental; worked on webOS 4.5, not on 7.6). (Pull request #18 by Obednal97.)
- **Replace LG Home (helper)** is one click and also starts the bundled key hook; the old *script and SAM* method was replaced (a TV that had it is cleaned up once). A new SAM option came later, in 2.0.3.
- **Keep Hearth ready** (experimental): asks the TV to keep Hearth in memory so Home opens it at once; a warning shows first, a failing step switches it off with the reason, and *Reopen Hearth if the TV closed it* is a second switch. Both grey out on a TV without a memory list.
- **LG preloaded apps** (experimental): see which apps LG keeps loaded in the background and switch some off; nothing is closed; *Everything back to LG's setting* undoes it. (Approach from Glasshouse.)

### Languages

- *Hearth language* (System, first row): English, languages that come with Hearth (no root: **Indonesian, Spanish, German, Arabic**; written by Claude, marked *(machine translated)* until a native speaker reviews them) and your own language file (rooted TVs). Every menu text can be translated; guide `docs/language_packs.md` and the *Translation* issue form. Scripts other than Latin, Cyrillic, Greek and Arabic are not supported yet; Arabic stays left to right.

### Without root

- The **full app list with icons now loads on a non-rooted TV** (*LG Connect Apps* switched on): newer LG firmware (webOS 11.2, 43.21.x) refuses a web page's own connection, so a small helper service packaged with Hearth makes it. Tested on a non-rooted LG TV, webOS 11.2.0, firmware 43.21.44. The method for the helper service is from free-my-tv pull request #285 by simbasjungles. TV icons are kept after the first load, so they show at once after a restart.
- *Open Hearth without root: guide* explains Quick Access (hold a number key 1-9) and the second-device watcher. Replacing LG Home without root is not possible; the guide says why.

### Faster start

- The Home button work goes first; the app list refresh, weather and other checks wait 20-30 s; the key hook and helper start after the first frame; saved wallpapers are painted by CSS before the first render; converted icons are saved between starts.

### Guides and reporting

- Guides on GitHub Pages: a beginner guide for people who have never done this before, a full guide to every feature, custom themes, language files and troubleshooting. The README is rewritten.
- *Compatibility report* form: tell us your TV, webOS, firmware and whether Hearth works. A maintainer checks the report and marks it `verified`; a workflow then adds it to the **Tested TVs** table by itself.
- Fixes: the key hook and the helper no longer overwrite each other's start-up link after a restart; the key hook start marker is written only after the hook is really up; held-key and pointer scrolling; the free-RAM reading is gone for good; scripts clean up their links and folders if Hearth is uninstalled without switching them off.

## 1.2.0

- **Edit names and icons** (Settings → Apps or Sources, hold OK on an item): rename an app or input, pick another icon (16 input symbols, the bundled app logos), or use your own picture from a USB drive or the TV (rooted TVs, saved inside Hearth's settings). *Use the app's / TV's name and icon* resets it. See the README, "Edit a name or icon".
- **Hearth for WebOS** is the public name; the README now explains the two ways to replace LG Home (helper script, SAM), their known problems, and a recommended setup with Input Hook. The Home key code is 773 on the test remote; others may differ.
- **Back on the home row** always opens the Recent apps panel; the old "jump to the first app" is gone.
- **Quiet mode** (apps fade after a chosen idle time, 10-60 s; off by default), **OLED shift** (slow pixel shift, on by default, with an off switch), **icon spacing**, **wallpaper opacity**, **name colour**, and **bundled photos** with a slideshow. Quiet mode and OLED shift follow ideas from iulyax27 (pull request #10).
- **Icon batches** and the Input Hook guide: thanks to iulyax27 (pull request #8).
- **Speed:** the clock redraws Home once a minute (it was once a second) and unchanged tiles are not redrawn (worst key delay on the reference TV 200 ms to 66 ms).
- **Credits:** Alejandro Morales (#1), chriskoperdraad-tech (#2, #3), ganondorft (#6), iulyax27 (#8, #10), community contribution (author not named); projects and ideas are listed in the README. Developed with Claude (Anthropic).
- **Recent apps panel:** Back on the home screen opens a panel along the bottom with the TV's recent apps (rooted TVs). OK opens one, holding OK closes it, ↑ reaches *Close all*, Back closes the panel. Width and height are in Settings → Look. The idea comes from a community contribution (1.6.0 build, author not named); the code is Hearth's own.
- **Icon shape** (Settings → Look): rounded or sharp square, squircle, circle, leaf, arch, teardrop. **Bottom fade** (Settings → Wallpaper): darkness and height. Both from the same contribution.
- **Ten more clock fonts** (Outfit, Work Sans, Bricolage Grotesque, Big Shoulders, Jura, Tektur, JetBrains Mono, Lora, Poiret One, Pixelify Sans) and **six clock thickness steps** (Thin to Bold), from the same contribution. **Widget shadow** switch: a slight drop shadow behind the time, date and weather (Settings → Wallpaper).
- **webOS 3.x (Chromium 38)** from the same install file: a loader picks `app.js` or the ES5 `app.legacy.js`; custom properties are emulated there; the helper script watches the system log for the Home bar (`HOOK_VERSION` 9). Ideas and the watcher lines from pull requests #2 and #3 by chriskoperdraad-tech. Users with two webOS 3 TVs report that it works.
- **Widget shadow strength** (Settings, Wallpaper) beside the shadow switch.
- **Experimental: app list without root** (Settings, Options, "Load app list from the TV without root (experimental)"): pairs with the TV's own remote-control service and reads the full app list; the order is Homebrew, then the TV, then the built-in list. Ideas from the public protocol; see README "Not rooted".
- **Quiet mode** brings the apps back when you return from an app (it used to stay hidden until a key was pressed). **Load app list from the TV without root (experimental)** is hidden on rooted TVs. Settings shows the TV's **IP** address at the bottom right; the wallpaper guide and README now point there instead of the Homebrew Channel.
- **Tests tab:** frame timer and key delay (idle, Settings, Home) and start-up times (tests 28-31), to measure speed on a real TV. "Run all tests" skips the tests that need you to act or run long (21, 26, 29-31), and every test is given up after two minutes.
- **Photo slideshow** now cross-fades and no longer redraws the whole launcher on each change.
- **webOS 11:** the root options no longer stay greyed out on a rooted webOS 11 TV once a one-time permission step is done: `tools/webos11-permission.sh` (inside the app; run it once over SSH, see "webOS 11" in the README). The "TV refused the command" message now says so. Thanks to ganondorft (pull request #6) for finding the cause and the fix.
- **Building on Windows:** the helper and start-up scripts are always written to the TV with plain line ends, and `.gitattributes` keeps `*.sh` files LF (also from pull request #6).

- **Replace LG Home with a script and SAM** (Settings → Options). Instead of reacting after LG Home has appeared, a small black stand-in is mounted over
  LG Home's own folder and the TV's app manager (SAM) is restarted once to read it, so the TV opens Hearth through LG Home's own place and **LG Home is never
  drawn** (Home, Back out of an app, waking the TV). A root watcher opens Hearth the moment the TV reports the stand-in in front. The mount lives in memory
  only; a link in the startup folder redoes it about 25 s into each start, and until then the watcher works as the helper script does. A start-up that does not
  finish is not repeated, and the method switches itself off if Hearth cannot be opened. It cannot be on together with the helper script: each greys the
  other out. Adapted from Glasshouse (see THIRD_PARTY_NOTICES.md); (this method was removed in 2.0.0).

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
