#!deno run --allow-net --allow-read

// dependencies
import {
  posix,
  extname,
  listenAndServe,
  ServerRequest,
  Response,
  parse,
  assert,
} from "./deps.ts";

// utilities
import html from "./src/utils/html.ts";
import { EntryInfo, FileServerArgs } from "./src/utils/types.ts";

// pages
import errPage from "./src/pages/error.ts";
import dirPage from "./src/pages/listing.ts";

const encoder = new TextEncoder();

const serverArgs = parse(Deno.args) as FileServerArgs;
const target = posix.resolve(serverArgs._[0] ?? "");

const MEDIA_TYPES: Record<string, string> = {
  ".md": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain",
  ".ts": "text/typescript",
  ".tsx": "text/tsx",
  ".js": "application/javascript",
  ".jsx": "text/jsx",
  ".gz": "application/gzip",
  ".css": "text/css",
  ".wasm": "application/wasm",
};

/** Returns the content-type based on the extension of a path. */
function contentType(path: string): string | undefined {
  return MEDIA_TYPES[extname(path)];
}

export async function serveFile(
  req: ServerRequest,
  filePath: string,
): Promise<Response> {
  const [file, fileInfo] = await Promise.all([
    Deno.open(filePath),
    Deno.stat(filePath),
  ]);
  const headers = new Headers();
  headers.set("content-length", fileInfo.size.toString());
  const contentTypeValue = contentType(filePath);
  if (contentTypeValue) {
    headers.set("content-type", contentTypeValue);
  }
  req.done.then(() => {
    file.close();
  });
  return {
    status: 200,
    body: file,
    headers,
  };
}

// TODO: simplify this after deno.stat and deno.readDir are fixed
async function serveDir(
  req: ServerRequest,
  dirPath: string,
): Promise<Response> {
  const dirUrl = `/${posix.relative(target, dirPath)}`;
  const listEntry: EntryInfo[] = [];
  for await (const entry of Deno.readDir(dirPath)) {
    const filePath = posix.join(dirPath, entry.name);
    const fileUrl = posix.join(dirUrl, entry.name);
    if (entry.name === "index.html" && entry.isFile) {
      // in case index.html as dir...
      return serveFile(req, filePath);
    }
    // Yuck!
    let fileInfo = null;
    try {
      fileInfo = await Deno.stat(filePath);
    } catch (e) {
      // Pass
    }
    listEntry.push({
      name: entry.name,
      url: fileUrl,
      type: entry.isDirectory ? "folder" : "file",
    });
  }
  listEntry.sort((a, b) =>
    a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1
  );
  const formattedDirUrl = `${dirUrl.replace(/\/$/, "")}/`;
  const page = encoder.encode(dirPage(formattedDirUrl, listEntry));

  const headers = new Headers();
  headers.set("content-type", "text/html");

  const res = {
    status: 200,
    body: page,
    headers,
  };
  return res;
}

function serveFallback(req: ServerRequest, e: Error): Promise<Response> {
  if (e instanceof Deno.errors.NotFound) {
    return Promise.resolve({
      status: 404,
      body: errPage("404", "Not Found"),
    });
  } else {
    return Promise.resolve({
      status: 500,
      body: errPage("500", "Internal Server Error"),
    });
  }
}

function serverLog(req: ServerRequest, res: Response): void {
  if (!serverArgs.q && !serverArgs.quite) {
    const d = new Date().toISOString();
    const dateFmt = `[${d.slice(0, 10)} ${d.slice(11, 19)}]`;
    const s = serverArgs.verbose
      ? `${dateFmt} ${req.proto} ${req.method} ${res.status} "${req.url}"`
      : `[${res.status}] ${req.method} "${req.url}"`;
    console.log(s);
  }
}

function setCORS(res: Response): void {
  if (!res.headers) {
    res.headers = new Headers();
  }
  res.headers.append("access-control-allow-origin", "*");
  res.headers.append(
    "access-control-allow-headers",
    "Origin, X-Requested-With, Content-Type, Accept, Range",
  );
}

function main(): void {
  const CORSEnabled = serverArgs.cors ? true : false;
  const addr = `localhost:${serverArgs.port ?? serverArgs.p ?? 4507}`;

  if (serverArgs.h ?? serverArgs.help) {
    console.log(`
    Deno File Server
      Serves a local directory in HTTP.

    INSTALL:
      deno install --allow-net --allow-read -n serve https://x.nest.land/serve/mod.ts

    USAGE:
      serve [path] [options]

    OPTIONS:
      -h, --help          Prints help information
      -p, --port <PORT>   Set port
      -q, --quite         Disable logs
      --verbose           More verbose logging
      --cors              Enable CORS via the "Access-Control-Allow-Origin" header
    `);
    Deno.exit();
  }

  listenAndServe(
    addr,
    async (req): Promise<void> => {
      let normalizedUrl = posix.normalize(req.url);
      try {
        normalizedUrl = decodeURIComponent(normalizedUrl);
      } catch (e) {
        if (!(e instanceof URIError)) {
          throw e;
        }
      }
      const fsPath = posix.join(target, normalizedUrl);

      let response: Response | undefined;
      try {
        const fileInfo = await Deno.stat(fsPath);
        if (fileInfo.isDirectory) {
          response = await serveDir(req, fsPath);
        } else {
          response = await serveFile(req, fsPath);
        }
      } catch (e) {
        console.error(e.message);
        response = await serveFallback(req, e);
      } finally {
        if (CORSEnabled) {
          assert(response);
          setCORS(response);
        }
        serverLog(req, response!);
        try {
          await req.respond(response!);
        } catch (e) {
          console.error(e.message);
        }
      }
    },
  );

  console.log(`\n\tServing on http://${addr}`);
}

if (import.meta.main) {
  main();
}
