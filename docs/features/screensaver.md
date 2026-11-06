# Screen saver (rooted TVs, experimental)

A screen saver shows pictures when nobody has pressed a button for a while. Hearth's saver replaces the TV's own saver with **your pictures, GIFs, videos or a slideshow**. It is **on at first** and plays a short built-in **fireplace video**. If its set-up fails, Hearth turns it off and tells you.

![Screen saver tab](../screenshots/settings-saver.jpg)

Open **Settings, Screen saver**:

- **Custom Screen Saver:** the main switch.
- **Pictures:** what it plays: a photo, a GIF, a video (mp4, mkv or webm, plays quietly to its end), a folder, the bundled photos, or the same as the wallpaper.
- **Change picture every** and **Shuffle**, for slideshows.
- **Picture size:** *Fit* shows the whole picture; *Fill* crops it to the screen.
- **OLED care:** a thin moving frame so one still picture cannot burn into the screen.
- **Brightness:** *Bright*, or *Dim* by an amount you choose, from 10% to 80% in steps of 10 (a dark layer; the backlight is not touched).
- **Switch the TV off after:** the TV goes to sleep after the saver has run this long (5 minutes at first).
- **Show it now:** starts it at once, so you can try it.

**The TV decides when the saver starts.** It uses the idle time from the TV's own screen saver settings, so that setting must be on. Any key stops the saver.

Good to know:

- Nothing is written on the TV's storage. A restart puts LG's saver back, and Hearth puts its own on again.
- GIFs, videos and fast slideshows use more power than one still picture. A very big GIF or video may use a lot of memory.
- Put your own saver pictures in `/media/developer/screensavers` (see [Wallpaper](wallpaper.md#your-own-pictures-rooted-tv)).
- **On webOS 10 and newer this is untested.** The TV's own saver is built differently there and some TVs refuse the change. Some TVs also hold the saver back (OLED, or inputs with no signal).
- If it does not work, switch on the Debug tab (see [System](system.md#debug-tab)) and send us the report.

## Apple TV Aerials (rooted TVs)

**Settings, Screen saver, Apple TV Aerials** opens a list of Apple's aerial videos, the same ones Apple TV shows (about 140: landscapes, cities, underwater and space). The right side shows Apple's preview of the highlighted video, its group and its size in 4K and 1080p, so you can choose before you download.

- **OK on a video** downloads it in the background (one at a time; you can close the screen). It moves up to the other videos on the TV and the highlight goes on to the next one. **OK on a downloaded video** removes it; the highlight goes to the first video still on the TV.
- **Quality:** 4K (about 100 to 300 MB a video, sharper on a 4K TV) or 1080p (about a quarter smaller).
- **Download to:** the TV's memory, a USB drive (a folder `hearth-aerials` is made on it) or a **network folder**: a shared folder on a NAS, a router with a disk or a computer (SMB). Type its address and the shared folder; leave the user name empty to connect as a guest. A user name and password are kept on the TV only, readable by root. The network folder is connected again after every start of the TV. The message says why when it cannot connect (a refused login, no such folder, the NAS does not answer, or it may only read).
- **Use as the screen saver** plays the videos in the chosen place, in turn, shuffled. **Use the stills as the wallpaper** shows a slideshow of one still from each video (1920x1080, made on the TV; the stills always stay in the TV's memory, so the wallpaper never waits for a USB drive or the network).

The videos are only played by the screen saver; the home screen shows a still, so it stays quick.

The videos and the previews belong to Apple and are **not part of Hearth**: they come straight from Apple's servers when you choose them, the same way the [Aerial](https://github.com/AerialScreensaver/Aerial) screen saver for macOS does. Every connection is checked: the one certificate Apple's video server needs and the TV lacks ("Apple Root CA") is fetched from apple.com and kept only when its fingerprint is the expected one.
