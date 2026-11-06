# Linux and Omarchy

The Linux release is built for **x86-64** (`uname -m` prints `x86_64`). Download
`Torrent-Deck-2.19.23-Linux-x64.AppImage` and `SHA256SUMS-linux.txt` from
[release 2.19.23](https://github.com/micro23/Torrent-Deck/releases/tag/v2.19.23).

In the download directory:

```sh
grep 'AppImage$' SHA256SUMS-linux.txt | sha256sum -c -
mkdir -p "$HOME/Applications"
mv Torrent-Deck-2.19.23-Linux-x64.AppImage "$HOME/Applications/"
chmod +x "$HOME/Applications/Torrent-Deck-2.19.23-Linux-x64.AppImage"
"$HOME/Applications/Torrent-Deck-2.19.23-Linux-x64.AppImage"
```

Keep the AppImage in a permanent, writable location so the launcher and in-app
updates can find it. Torrent-Deck registers a desktop entry on launch. Its Help
menu can repeat torrent-file registration if needed.

Electron chooses the display backend automatically. On a Wayland session, such
as Omarchy's Hyprland desktop, no legacy Electron environment variable is needed.
If the graphics driver has problems with native Wayland, try the same command
with `--ozone-platform=x11` to use XWayland. This is a fallback, not a requirement.
See [Electron's display backend switch](https://www.electronjs.org/docs/latest/api/command-line-switches#--ozone-platformplatform-linux).

## If AppImage reports a FUSE error

On Arch-based systems, the FUSE 2 compatibility library can be installed with
`sudo pacman -S --needed fuse2`. Alternatively, use the portable archive below;
it does not mount an AppImage or require FUSE.

## Portable archive

Download `Torrent-Deck-2.19.23-Linux-x64.tar.gz` and the checksum file. In the
download directory:

```sh
grep 'tar.gz$' SHA256SUMS-linux.txt | sha256sum -c -
mkdir -p "$HOME/Applications/Torrent-Deck-2.19.23"
tar -xzf Torrent-Deck-2.19.23-Linux-x64.tar.gz -C "$HOME/Applications/Torrent-Deck-2.19.23"
"$HOME/Applications/Torrent-Deck-2.19.23/torrent-deck"
```

Keep all extracted files together. Replace the archive installation manually for
future releases; in-app AppImage installation is available only when running the
AppImage itself. Normal launches run with Chromium's sandbox enabled.

Linux validation includes a packaged headless Deluge workflow on Ubuntu and
package verification. This is not a physical Omarchy/Hyprland desktop test.
