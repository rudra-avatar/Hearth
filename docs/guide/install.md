# Step 3: Install Hearth

Pick **one** way. If your TV is rooted, use way A: it is the easiest and later gives you an **Update** button. If it is not rooted, use way B.

## A) Through the Homebrew Channel (rooted TV)

1. Open the **Homebrew Channel** on the TV and go to **Settings**.
2. Choose **Add repository** and type this address exactly:

   `https://raw.githubusercontent.com/rudra-avatar/Hearth/main/repo/apps.json`

   Typing with the remote is slow. Use your phone as a keyboard (see "LG Power" below).
3. Go back to the app list, open **Hearth** and choose **Install**.
4. Open **Hearth** from the TV's app list. That is all.

## B) With webOS Dev Manager (Developer Mode is enough)

webOS Dev Manager is a free helper that talks to the TV from a computer or an Android phone.

1. Get it: the computer app from <https://github.com/webosbrew/dev-manager-desktop> (Releases page, for Windows, Mac and Linux), or on Android the app **webOS Dev Manager** from Google Play. There is no iPhone version that we know of.
2. Download the newest `tld.my.customlauncher_<version>_all.ipk` from the **Releases** page of <https://github.com/rudra-avatar/Hearth>. On a phone it lands in *Downloads*.
3. Open Dev Manager, choose **Add device**, type the TV's **IP address** (the Developer Mode app shows it) and follow the prompts. **Dev Mode Status** and **Key Server** must be on.
4. The TV now shows in the list. Open its **Apps** page, press **Install** and pick the file.
5. Open **Hearth** from the TV's app list.

## C) Over SSH (rooted, for people who like typing commands)

Copy the file to the TV, then run the install command. The exact commands are in the [README](https://github.com/rudra-avatar/Hearth#option-2-install-the-file-yourself).

## Use your phone as the TV remote: LG Power (Android)

Typing letters with the TV remote takes ages. **LG Power** is a free Android remote for LG TVs with a keyboard that types straight into the TV. Phone and TV must be on the same Wi-Fi.

- Google Play: <https://play.google.com/store/apps/details?id=com.nic.lgpower>
- Source: <https://github.com/Nicsilver/LGPower> (a hobby project, not made by LG).

## SSH: typing to the TV from a computer

You need this only for way C and for fixing problems. Most people never need it.

1. In the Homebrew Channel Settings, switch the SSH server on.
2. On a computer open a terminal (the black window where you type). On Android or iPhone use any SSH app.
3. Type `ssh root@<TV address>` and press Enter. The first time it asks if it can trust the TV: say yes. The Homebrew Channel page shows the password, if one is needed.
4. TVs with only Developer Mode use another door (port 9922, user `prisoner`, a key with a passphrase from the Developer Mode app). Dev Manager hides this for you.

## Updating Hearth

With way A, open the Homebrew Channel, open Hearth and press **Update** when it shows a new version. With way B, install the new file the same way. Your apps, their order, names and favourites are kept. **When you move from 1.x to 2.0.0, the look settings go back to the new defaults once**. Open **Settings, Look, Restore my settings from before the update** to bring your old ones back.

## Next

[Learn to use Hearth](../features/using.md).
