# How to build a Hearth theme (guide for an AI agent or a person)

A Hearth theme is ONE zip file, e.g. `my-theme.zip`. Copy it to `/media/developer/themes` on a rooted TV (the Hearth picker makes the folder). In Hearth: Settings -> Look -> Theme -> *Current theme*, press OK, then pick the zip. Only rooted TVs can load themes; other TVs keep the built-in themes.

## Start here: export the base theme first (do this before anything else)

Do NOT write a theme from nothing. Hearth writes a starting zip that already holds your apps (in their present order, with their names) and their icons. Without it you would have to type the app list and find every icon yourself.

1. On the TV open **Settings, Look, Theme** and press OK on **Export theme base**. Hearth writes `theme_base.zip` into `/media/developer/themes` (rooted TVs only).
2. Copy `theme_base.zip` to a computer: over SSH `scp root@<TV address>:/media/developer/themes/theme_base.zip .`, or with the file option of webOS Dev Manager, or on a USB drive.
3. Unzip it. You get `manifest.json`, an `icons` folder and a copy of this guide.
4. Change what you want (see the rules and the manifest below). Keep the parts you do not want to change as they are, or delete them: a missing part changes nothing.
5. Zip it again so that `manifest.json` is at the top of the zip, not inside a folder.
6. Copy the new zip to `/media/developer/themes` on the TV.
7. On the TV open **Settings, Look, Theme, Current theme**, press OK and pick your zip. A wrong zip changes nothing and Hearth shows the reason.

If you are an AI helper: ask the person for their exported `theme_base.zip` first and work from its `manifest.json`. Use the app ids and icon names found there; do not invent them. If the person has no export yet, tell them to do steps 1 and 2 above and send the zip.

The example in this repository (`docs/theme/theme_name.zip`) is only an empty example of the format. Your own export is the better starting point because it has your real apps.

## Rules
- The zip holds `manifest.json` (required, at the top level of the zip, not inside a folder) and data files. Make the zip so that `manifest.json` is at its root.
- Every part of the manifest is OPTIONAL. A part that is missing changes nothing on the TV. Build a theme of only colours, or only icons, or anything in between.
- NO limit on how many apps, icons, fonts or cities a theme holds. Only a file above 100 MB is refused.
- Allowed files: `.png .jpg .jpeg` (icons), `.woff2 .woff .ttf .otf` (fonts), `.json` (the manifest), `.md .txt` (notes). Anything else (scripts, pages, programs) makes Hearth refuse the whole theme. A theme never runs code.
- File names inside the zip: plain relative paths with `/`, no `..`, no leading `/`, no backslash, no `:`, at most 200 characters.
- A wrong or unsupported zip changes NOTHING; Hearth shows a pop-up with the reason (the first six problems).
- WARNING: very heavy assets (huge pictures, many large fonts) slow Hearth down on the TV, which is about 30 times slower than a PC. Keep icons small (64-256 px square, a few KB each) and fonts to the weights actually used.

## manifest.json (format 1)
```
{
  "format": 1,                      required, the number 1
  "name": "Theme name",             required, text, at most 40 characters
  "author": "Your name",            optional, at most 60 characters
  "colors": {                       optional; three independent choices, each optional
    "theme":  "black|grey|midnight|forest|teal|graphite",
    "widget": "theme|white|warm|blue|amber|grey|charcoal|black",
    "widgetInk": "#RRGGBB",         optional; your own widget colour (clock, date, weather), instead of "widget"; not both
    "icon":   "theme|white|warm|blue|amber|grey|charcoal|black"
  },                                "theme" for widget/icon = Follow theme (the theme's own colour)
  "fonts": {                        optional
    "files":  [{"id": "my-font", "label": "My font", "file": "fonts/my.woff2"}],
    "widget": "my-font",            a font id of this theme or a built-in font id
    "names":  "default"             a font id of this theme, a built-in font id, or "default"
  },                                font ids: 1-32 chars a-z 0-9 -, not the id of a built-in font
  "iconStyle": {                    optional
    "style": "original|mono|soft|accent|gradient|tinted",
    "tile":  "dark|light"
  },
  "wallpaper": {                    optional; the theme's OWN pictures (png or jpeg), one of the two
    "file": "wallpaper/main.jpg",   one picture, or
    "folder": "wallpaper",          a slideshow of the pictures directly inside this folder (no subfolders)
    "intervalSec": 60,              folder only, optional, whole seconds 5-3600 (else the user's setting)
    "shuffle": true                 folder only, optional (else the user's setting)
  },
  "icons": [{"app": "app.id", "file": "icons/x.png"}],      one picture per app id (png or jpeg)
  "apps":  [{"id": "app.id", "name": "Edited name"}],       the LIST ORDER is the order of the apps; "name" optional, at most 24 characters
  "cities":[{"name": "Delhi", "lat": 28.6139, "lon": 77.209, "detail": "India"}]
}
```
Unknown keys anywhere in the manifest make the theme refused (a typo must not pass silently). The built-in font ids are listed in Hearth Settings -> Widget -> Font.

## Notes
- `accent` icon style is shown as `soft` in the OLED black theme.
- Applied (everything below): `colors`, `fonts`, `iconStyle`, `wallpaper` (it replaces the user's wallpaper while the theme is loaded; *Remove theme* sets the default wallpaper again unless the user chose another one meanwhile; big pictures slow loading; 1920x1080 is the recommended resolution, a good balance of quality and performance, so please resize the theme's wallpapers to it) (they are put into the normal settings, which the user can still change). `icons`, `apps` and `cities` are applied too: icons are shrunk to 160 px and used for the apps whose id is on the TV (others are skipped); the `apps` order goes first and `name` becomes the edited name; `cities` are added at the top of the City list. A mismatch between the theme's apps/icons and the TV's apps shows a pop-up, but the theme is still applied. The user's own per-app icon wins over a theme icon.
- A theme font is read from the TV only while the widget or the names use it; until then, and if the file cannot be read, the text shows in Inter. Use `woff2` or `woff` (smallest); `ttf`/`otf` also work.
- Font weights: Hearth asks for weights 200-700; a font file carries one weight, so choose the file whose weight fits the widget (the widget weight row still applies, the browser fakes the others).
- This folder is a template: copy `manifest.json`, `icons/` and edit. This guide (`theme-guide.md`) may stay in the zip or be deleted (notes are allowed but ignored). The same file lies beside the dummy zip in `docs/theme/`.
- Settings -> Look -> Theme: *Current theme* (← → browse built-in and saved themes), *Save this theme*, *Delete this theme* (the parts the theme set go back to the defaults).
