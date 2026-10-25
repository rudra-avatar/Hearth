#!/bin/sh
# webOS 11: let Hearth use the Homebrew Channel service (boot hook for /var/lib/webosbrew/init.d).
#
# On webOS 11 an app may only call luna://org.webosbrew.hbchannel.service/exec when its Luna client
# permissions include the group org.webosbrew.hbchannel.service.group (the Homebrew Channel app has it).
# The app installer writes Hearth's permission file without it, so every command Hearth runs is refused
# ("the TV refused the command") and the live app list, wallpapers from storage, the Home-button helper,
# the TV input, the LG logo switch and Uninstall are greyed out. Older webOS versions don't need this.
#
# The installer writes the file again on every install or update of Hearth, so this runs at each boot:
# it adds the group if it is missing and asks the Luna hub to reload its permissions.
# Install (see "webOS 11" in the README):
#   scp -O tools/webos11-permission.sh root@TV_IP:/var/lib/webosbrew/init.d/40-hearth-permission
#   ssh root@TV_IP 'chmod 755 /var/lib/webosbrew/init.d/40-hearth-permission; sh /var/lib/webosbrew/init.d/40-hearth-permission'
# Undo: delete /var/lib/webosbrew/init.d/40-hearth-permission and reinstall Hearth.

GROUP=org.webosbrew.hbchannel.service.group
F=/var/luna-service2-dev/client-permissions.d/tld.my.customlauncher.app.json
[ -f "$F" ] || exit 0                                  # Hearth not installed
grep -q "$GROUP" "$F" && exit 0                        # already there
sed -i "s/\]}\$/,\"$GROUP\"]}/" "$F"
grep -q "$GROUP" "$F" && /usr/sbin/ls-control scan-services >/dev/null 2>&1
exit 0
