# Tested TVs

Does Hearth work on your TV? This page lists reports from real people. **Reference device:** rooted webOS 7.6.0, firmware 04.60.90.

## Verified reports

Every report sent with the [compatibility form](https://github.com/rudra-avatar/Hearth/issues/new?template=compatibility.yml) is read by a maintainer. When it looks right, the maintainer adds the label `verified` and this table is rebuilt by itself. One row is one person's report; "?" means not told.

<!-- verified-table:start -->
| TV model | webOS | Firmware | Setup | Result | Hearth | Remote | How it opens | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 55UT8000AUA.BUSCLKR | 10.3.0 | 33.31.23 | Rooted | Works | None | Magic Remote | None | [#44](https://github.com/rudra-avatar/Hearth/issues/44) |
| OLED77CXPUA | 5.6.2 | 04.64.00 | Rooted | Works | None | Magic Remote | None | [#45](https://github.com/rudra-avatar/Hearth/issues/45) |
<!-- verified-table:end -->

## Earlier reports (before the form)

Collected by hand from Reddit and GitHub, plus form reports whose remarks matter. All rooted unless it says otherwise.

| TV | webOS | Firmware | Hearth | Result and notes |
| --- | --- | --- | --- | --- |
| Reference TV (the maintainer's) | 7.6.0 | 04.60.90 | 2.0.0 | Works. Everything is tested here |
| Not rooted (model not told) | 11.2.0 | 43.21.44 | 2.0.0 | Works. The full app list loads without root through Hearth's helper service; options that need root are greyed out with the reason |
| Model not told | 3.x (web view 38.0.2125.122) | ? | 1.2.0 | Works with the legacy bundle: clock, apps and settings; the Home button opens Hearth, also after standby. Scrolling with the Magic Remote pointer is very sensitive |
| 55UH6030-UC (2016) | 3.4.3 | 05.70.50 | 1.2.0 | Buttons, weather and wallpaper work. The *LG Home* tile says "Couldn't open LG Home" |
| 43LM6300PDB | 4.10.2 | 05.40.97 | 1.2.0 | Hearth opens and works; the Home button still showed LG Home. Another user on webOS 4.10 says it works |
| 65UM7100PLA | 4.5 | 05.40.97 | 2.0.0 test | *Set Hearth as the TV's Home app* worked |
| The maintainer's older TV | 4.x | ? | 1.x | Where Hearth was first built |
| Model not told | 6.3.3 | ? | 1.x | Works with Input Hook mapping the Home button; a photo with EXIF rotation showed wrongly (rotate such photos first) |
| OLED48C1PTZ | 6.5.2 | ? | 1.x | Works. To start on Hearth set the TV's *Power On Screen* to *Recent Input* |
| LG C3 (as the user named it) | 8.0.0 | 03.01.16 | 1.x | Works, including wallpapers and folder slideshows |
| 77NANO55SRA | 9 | ? | 1.x | Works |
| 42QNED753RA | 9.2.1 | 33.31.75 | 1.x | Works |
| 50UR8750PSA | 10.3.2 | 33.31.75 | 1.x | Works and runs smoothly. With the Magic Remote the row moved too fast to hit a tile |
| Model not told | 10 | ? | 1.x | Works. With the helper alone LG Home flashed on Home; with the Input Hook guide the flash was gone |
| LG G5 | 26 (11.2) | 43.21.77 | 2.0.0 test | Works with *Set Hearth as the TV's Home app*; Back out of an app returns to Hearth; cold start fast. *Map home button* did not work for this user, who mapped Home with another remapper |
| OLED55C7V-Z (2017) | 3.9.3 | 06.10.65 | 1.2.0, 2.0.x | Works. *Add the launcher as a TV input* also works here. *Map home button* could not find the Home button's code before 2.1.0 (fixed, pull request #37); with Home mapped by hand it opens Hearth with no LG Home flash. Reported by chriskoperdraad-tech |
| 55UH652T (2016) | 3.4.3 | 05.70.45 | 1.2.0 to 2.0.2 | Opens and runs. Making Hearth the TV input made the TV hang at start-up (three spinning dots) until the input was switched with the remote; keep that option off on this TV. *Map additional keys, the other method* cannot work on webOS 3.4 (no key filter list); issues #23 and #36 |
| 55UH750V | 3.4 | 05.70.45 | 2.0.1 | Starts and shows the apps. Hearth as the TV input made the TV hang at start-up (three coloured dots) until several restarts; keep that option off on this TV (issue #43) |
| 32LJ600B-SA (HD panel, 2017) | 3.9.3 | 06.10.60 | 2.0.2 | Starts and shows the apps, but the screen was drawn shrunk into the top-left corner. Fixed in 2.1.0 (issue #41) |
| LG C1, C6, G6, OLED G5 | ? | ? | 1.x | Reported working (webOS version not told) |

## Send your report

Tried Hearth? Tell us your TV model, webOS version, firmware and whether it works: [open the compatibility form](https://github.com/rudra-avatar/Hearth/issues/new?template=compatibility.yml). You need a free GitHub account. You find the facts in the TV's **Settings, Support, TV Information**.

## For maintainers: how a report gets here

1. Read the new issue (label `compatibility` is set by the form). Check it makes sense; ask for more if not.
2. Add the label **`verified`** (create it once under *Issues, Labels*). The workflow *Update tested TVs table* rebuilds the table above within a minute and publishes the guides again.
3. To take a report out, remove the label `verified`. To change a row, edit the issue and then add and remove any label named `verified` again.
4. You can also run the workflow by hand (*Actions, Update tested TVs table, Run workflow*).
