#!/bin/sh
# Renders the built-in wallpapers (the .svg files here) to public/wallpapers/*.jpg at 1920x1080.
# Needs Google Chrome and macOS sips.   Run: sh tools/wallpapers/render.sh
set -e
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../public/wallpapers"
chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
tmp=$(mktemp -d)
mkdir -p "$out"
for svg in "$here"/*.svg; do
	name=$(basename "$svg" .svg)
	printf '<html><body style="margin:0"><img src="file://%s" width="1920" height="1080"></body></html>' "$svg" > "$tmp/$name.html"
	"$chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --window-size=1920,1080 --screenshot="$tmp/$name.png" "file://$tmp/$name.html" >/dev/null 2>&1
	sips -s format jpeg -s formatOptions 82 "$tmp/$name.png" --out "$out/$name.jpg" >/dev/null
	echo "$name.jpg $(wc -c < "$out/$name.jpg" | tr -d ' ') bytes"
done
rm -rf "$tmp"
