# Step 2: Root the TV (you may skip this)

!!! tip "A very good step-by-step rooting guide"
    Before you start, have a look at this brilliant guide by the community: <https://tv.slada.sk/guides/rooting-guide>. It explains rooting in detail, with pictures.

Rooting gets you the "big key" for your TV. With it Hearth can open when you press **Home**, start when you switch the TV on, show a screen saver and much more. Without it Hearth still works, only with less magic.

!!! danger "Do not update the TV's software first"
    Some updates close the door for good, and then the TV cannot be rooted any more. **Do not update to webOS 26 firmware released after 2026-10-10 (for example 43.21.84): the public method is patched there and that firmware currently cannot be rooted.** Turn off automatic updates before you connect the TV to the internet. List of firmware: [tv.slada.sk rooting guide](https://tv.slada.sk/guides/rooting-guide). Blocking updates: [tv.slada.sk guides](https://tv.slada.sk/guides).

!!! warning "A small risk"
    Rooting from software is usually safe, but a wrong change can break the TV. Read the warnings first: <https://rootmy.tv/warning>. **Never open the TV and never use hardware tricks.** If you are unsure, ask someone experienced to help.

## 1. Find your webOS version

1. On the TV remote press the **settings (gear)** button, then the small gear again to open all settings.
2. Open **Support** (the headset picture), then **TV Information**.
3. Read **webOS TV version**, for example `webOS24 / 9.2.2-1806`. The number **after the slash** (here **9**) is the one that counts for rooting. Also write down the **model** and the **firmware**.

You need these now, and later for the [compatibility report](../COMPATIBILITY.md).

## 2. Ask: can my TV be rooted?

Open <https://cani.rootmy.tv> on a computer. Type the model and firmware. It says which method works, or that none does. If it says your TV is patched, stop here and do not update further. Hearth still works without root.

## 3. Use the method it names

This table changes often, so trust the website in step 2 more than this list.

| Method | Works on | Status |
|---|---|---|
| [faultmanager](https://github.com/throwaway96/faultmanager-autoroot) | webOS 4.0 to 10.0 | Latest firmware for most webOS 5, 6, 7 and 9 TVs is patched; 2025 models only if still on the factory firmware |
| [DejaVuln](https://github.com/throwaway96/dejavuln-autoroot) | webOS 3.5 and newer (not 2016 TVs or older) | Many models patched; 2024 models and webOS 9 releases patched |
| [Dualbro](https://github.com/exkc/e.nya.je) | webOS 7 to 10 | Newest method; online (the TV's own browser) or offline through an Android phone for TVs with no internet |
| WTA, crashd | webOS 4 and newer | Patched (crashd in April 2024) |
| [RootMy.TV](https://rootmy.tv/) | old webOS 3 to 6 firmware | Patched in 2022, probably no longer works |
| GetMeNow | some webOS 1 to 3 models | No longer works after Developer Mode updates in early 2024 |
| Hardware (opening the TV) | old models | **Do not.** It can break the TV and can be dangerous |

More: <https://www.webosbrew.org/rooting>. Every method has its own step-by-step page with pictures; this guide does not copy them, because they change. Three examples of how they look:

- **Older TVs (webOS 4-5, USB stick):** a special folder name on a USB stick tricks the TV's Music app into installing the Homebrew Channel. No internet needed.
- **Newer TVs (webOS 7-10, online):** you open a web page in the TV's own browser, type the webOS number, press the root button and say yes when the TV asks.
- **Newer TVs without internet (webOS 9-10):** an Android phone talks to the TV directly over Wi-Fi Direct.

## 4. After rooting

1. A **Homebrew Channel** app should appear. If not, restart the TV and make sure **Quick Start+** is off.
2. If installing an app fails (for example error -5), set the TV's date and time close to the real ones and try again. On webOS 8 and 9 it may take a few tries.
3. If LG's **Developer Mode** app is on the TV, remove it before restarting and do not install it again while the TV is rooted.
4. Open the Homebrew Channel once. In its Settings you can switch on **Enable SSH server** if you want [SSH](install.md#ssh-typing-to-the-tv-from-a-computer).
5. Keep automatic updates **off**. Before any update check <https://cani.rootmy.tv> again.

!!! tip "Help"
    The webOS Homebrew community is friendly: use the Discord link on <https://www.webosbrew.org/>. Attach the method's log file (for example `autoroot.log`) when you ask.

## Next

[Step 3: Install Hearth](install.md).
