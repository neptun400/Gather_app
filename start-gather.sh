#!/usr/bin/env bash
# Startet die Gather-Desktop-App in ihrem eigenen Kontext.
APP_DIR="/home/estefan/Gather_app"
exec "$APP_DIR/node_modules/electron/dist/electron" "$APP_DIR" "$@"