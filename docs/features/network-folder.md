# Network folder (rooted TVs, experimental)

A **network folder** is a folder on another device in your home: a **NAS** (a small computer with disks that keeps your files), a router with a disk plugged in, or a PC. Hearth can read pictures, themes and language files from it, so you do not have to copy them onto the TV or a USB stick.

Hearth **only reads** from it. It never writes, changes or deletes anything on the NAS.

## What you need

- A rooted TV (the same as for every picker that reads files).
- The TV and the NAS on the same home network.
- The NAS **address**: a number like `192.168.1.71`. It is in the NAS or router settings. A name like `mynas` can work too. It helps to give the NAS a fixed address in your router, so the number never changes.
- The name of the **shared folder** on the NAS. This is the name the NAS gives to a folder it shares, for example `Video` or `Photos`. The NAS must share it with the **SMB** kind of sharing (also called *Windows sharing* or *CIFS*; most NAS devices and routers have it).
- A **user name and password** if the NAS asks for them. If the shared folder is open to everyone, you need none: Hearth then connects as a **guest**.

## Set it up

1. Open **Settings, Wallpaper**, and press OK on **Wallpaper**. The picker opens.
2. Go to the last row, **Network folder (not set up)**, and press OK.
3. Type the **Address** and the **Shared folder**. Add the **User name** and **Password** only if the NAS needs them. OK on a row opens the TV keyboard; Enter keeps the text.
4. Choose **Connect**. Hearth saves the settings and tries the connection.
5. When it works, the picker shows two rows: **Network folder** (OK connects and opens it) and **Change or forget the network folder**.

If the connection fails, the picker tells you why. See *When it does not connect* below.

The same two rows are in the pickers for the **icon** picture, the **theme** file, the **language** file and the **screen saver**. You set the folder up once; every picker uses it.

## Use it

- **Wallpaper:** open **Network folder**, pick a picture, or press OK on **Play this folder as a slideshow**.
- **Screen saver (experimental):** in **Settings, Screen saver, Pictures**, open **Network folder** and pick a folder or a picture. A saver that follows the wallpaper uses the network folder too, when the wallpaper comes from it.
- **Icon, theme and language:** open **Network folder** in that picker and pick the file. Hearth reads the file once, when you pick it, and keeps its own copy, so these keep working when the NAS is off.

## What happens when the NAS is not there

The TV forgets the connection at every restart. Hearth connects again by itself, **only when something needs the folder**, so a start-up is never held back by a NAS that is off. If the NAS is off, asleep or the network is down, Hearth gives up after a while (about 25 seconds for one try) and uses the **default** of that place instead. It does **not** keep showing the last picture from the NAS, because that picture is gone from the TV when the connection is gone.

| Where | What you see when the NAS cannot be reached | Your choice | When the NAS is back |
| --- | --- | --- | --- |
| **Wallpaper** | The default background (plain black or the theme's colour) and a short message. | Stays saved. | A restart brings the folder back. |
| **Screen saver** | The built-in fireplace video. | Stays saved. | After a restart Hearth looks for the NAS every 20 seconds for 2 minutes, then plays your folder. If the NAS comes later, switch the saver off and on in **Settings, Screen saver**. |
| **Icon, theme, language** | A message; nothing changes. | What was set before stays. | Pick the file again. |

Icon, theme and language files are read **once**, when you pick them, and Hearth keeps its own copy. They keep working with the NAS off.

A file that fails to load from a USB drive keeps the last picture on screen. Only the network folder shows the default instead, because a NAS that is off is expected, not an error to hide.

## How it works

You do not need this to use it. It explains the messages.

1. Hearth saves the address, the shared folder and the login on the TV. The user name and password are kept in a file only root can read and are never written to a log.
2. When a picker or the screen saver needs the folder, Hearth asks the NAS for the file listing through the TV's own SMB support (a read-only mount at `/tmp/hearth-netfolder`).
3. The server is asked by its **number address**. A name is first turned into a number.
4. SMB has several versions. Hearth tries 3.0, then 2.1, 2.0 and 1.0, so old and new NAS devices both work. With no user name it logs in as **guest**.
5. The mount lives in `/tmp`, which the TV empties at every restart. Nothing is added to the TV's start-up.

## On the NAS side

- Turn on **SMB** (Windows) sharing and share one folder. Give the NAS a fixed address in the router.
- Allow a **guest** or create a user with read access to that folder.
- A NAS that allows only SMB 1.0 or only very new SMB settings may still refuse the TV. The TV's support differs between models; see *Good to know*.
- Wi-Fi NAS or a long cable run: pictures load slowly. Use a cable where you can.

## Change or forget it

Open the picker and choose **Change or forget the network folder**. You can type a new address, folder, user name or password, or choose **Disconnect and forget**. Forgetting removes the saved address and password from the TV. What is on the NAS stays.

## Where the password is kept

A user name and password are stored on the TV in a file only **root** can read. They are not shown on screen again; the row says *saved, not shown*. If you want to change one of the two, type both again. With no user name, Hearth connects as a guest.

## When it does not connect

| The picker says | What it means | What to try |
| --- | --- | --- |
| The NAS refused the user name or password | The NAS knows you are there but did not accept the login. | Type both again; check capital letters. |
| The NAS does not let guests in | You left the user name empty, and the NAS does not allow guests. | Turn on the NAS guest account, or type a user name and password. |
| There is no shared folder with that name | The NAS answered, but has no shared folder with that name. | Check the spelling in the NAS settings. |
| The NAS does not answer | Nothing replied at that address. | Is the NAS on? Is it on the same network as the TV? |
| That address is not found on the network | A name was typed that the TV cannot turn into a number. | Type the number address instead. |
| The address, folder or user name has characters that cannot be used | One of the texts has a sign Hearth cannot pass on safely. | Use letters, digits and the usual signs (`. - _`). |

The log of the last attempts is in `/tmp/hearth-netfolder.log` on the TV (you need SSH to read it). It never contains the password. The screen saver writes its own lines about the network folder to `/tmp/launcher-screensaver.log`.

To try the connection by hand over SSH: `sh /media/developer/apps/usr/palm/applications/tld.my.customlauncher/netfolder/netfolder.sh set <NAS address> <shared folder> [user password]` prints `result=ok` when it works, `... status` shows what is saved, and `... forget` removes it.

## Good to know

- **Not tested on a TV yet.** The connection uses the TV's own network file support. Some TVs lack parts of it; if yours does, the picker shows the reason and nothing else in Hearth changes.

- The first connection can take a while when the NAS is slow to wake up. **Back** gives up.
- A big folder takes longer to list than one on a USB stick.
- Videos are played by the screen saver straight from the NAS; a weak Wi-Fi link can make them stutter. A cable is better.
- This is **experimental**: it depends on the TV's own network-file support, which differs between TVs. If it does not work on yours, nothing else in Hearth is affected.
