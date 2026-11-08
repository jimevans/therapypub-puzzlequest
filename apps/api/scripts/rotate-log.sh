#!/bin/sh
# Keeps a log file in bounds: once it reaches a size, a compressed copy is
# kept beside it and the file is emptied, keeping the last few copies
# (log.1.gz is the newest). Run it daily from cPanel's Cron Jobs page:
#
#   sh /home/thepuzzlequest/puzzlequest/apps/api/scripts/rotate-log.sh \
#     /home/thepuzzlequest/puzzlequest/stderr.log
#
# The file is emptied in place rather than moved, because Passenger keeps it
# open and goes on appending to it. A line written between copying and
# emptying it is lost, which is rare and acceptable for this log.
#
# Usage: rotate-log.sh LOG_FILE [MAX_BYTES] [COPIES]
#   MAX_BYTES  the size at which it's rotated; 10 MB by default
#   COPIES     how many compressed copies to keep; 5 by default
set -eu

log_file=$1
max_bytes=${2:-10485760}
copies=${3:-5}

if [ ! -f "$log_file" ] || [ "$(wc -c < "$log_file")" -lt "$max_bytes" ]; then
  exit 0
fi

# Each copy moves one place older, and the oldest is replaced.
copy=$copies
while [ "$copy" -gt 1 ]; do
  newer=$((copy - 1))
  if [ -f "$log_file.$newer.gz" ]; then
    mv -f "$log_file.$newer.gz" "$log_file.$copy.gz"
  fi
  copy=$newer
done

cp "$log_file" "$log_file.1"
: > "$log_file"
gzip -f "$log_file.1"
