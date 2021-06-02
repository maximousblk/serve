// deps
import { assert, extname, listenAndServe, parse, posix } from "../../deps.ts";

// types
import type { Args, EntryInfo } from "./types.ts";
import type { Response, ServerRequest } from "../../deps.ts";

// pages
import errPage from "../pages/err.ts";
import dirPage from "../pages/dir.ts";

const args = parse(Deno.args) as Args;
const target = posix.resolve(args._[0] ?? "");
const CORSEnabled = args.cors ? true : false;

const encoder = new TextEncoder();

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

async function serveFile(
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
  if (!args.q && !args.quite) {
    const d = new Date().toISOString();
    const dateFmt = `[${d.slice(0, 10)} ${d.slice(11, 19)}]`;
    const s = args.verbose
      ? `${dateFmt} ${req.proto} ${req.method} ${res.status} "${req.url}"`
      : `[${res.status}] ${req.method} "${req.url}"`;
    console.log(s);
  }
}

export default function serve() {
  const addr = `${args.host ?? args.H ?? 'localhost'}:${args.port ?? args.p ?? 4507}`;
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
  console.log(`\n\tServing on http://${addr}\n`);
}
