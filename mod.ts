import { parse } from "./deps.ts";
import type { Args } from "./src/utils/types.ts";
import serve from "./src/utils/server.ts";

const args = parse(Deno.args) as Args;

if (args.h ?? args.help) {
  console.log(`
Deno File Server
  Serves a local directory.

INSTALL:
  deno install --allow-net --allow-read -n serve https://x.nest.land/serve/mod.ts

USAGE:
  serve [path] [options]

OPTIONS:
  -h, --help          Prints help information
  -H, --host <HOST>   Set the host to listen on (default: localhost)
  -p, --port <PORT>   Set port (default: 4507)
  -q, --quite         Disable logs
  --verbose           More verbose logging
  --cors              Enable CORS via the "Access-Control-Allow-Origin" header
`);
  Deno.exit(0);
}

if (import.meta.main) {
  serve();
}
