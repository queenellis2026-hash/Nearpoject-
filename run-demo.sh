#!/usr/bin/env bash
# Run the Paid in Full demo locally. No wallet, no accounts, no network
# needed for the core flow (the Intents dry-quote panel uses the network
# if available and degrades gracefully if not).
set -e
cd "$(dirname "$0")"
echo "Running tests first..."
node --test tests/*.test.js
echo
echo "Starting the demo server on http://localhost:3737 ..."
exec node app/server.js
