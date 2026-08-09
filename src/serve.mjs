import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..", "site");
const port = Number.parseInt(process.env.PORT ?? "4180", 10);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

function resolveFilePath(urlPathname) {
  const safePath = path.normalize(decodeURIComponent(urlPathname)).replace(/^(\.\.[/\\])+/, "");
  const relativePath = safePath === path.sep || safePath === "/" ? "index.html" : safePath.replace(/^[/\\]+/, "");
  const filePath = path.join(siteRoot, relativePath);
  if (!filePath.startsWith(siteRoot)) {
    return null;
  }
  return filePath;
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const filePath = resolveFilePath(requestUrl.pathname);

  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const fileStats = await stat(filePath);
  if (fileStats.isDirectory()) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Directory listing is disabled");
    return;
  }
  const extname = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extname] ?? "application/octet-stream";

  res.writeHead(200, {
    "Content-Length": fileStats.size,
    "Content-Type": contentType,
    "Cache-Control": extname === ".pdf" ? "public, max-age=3600" : "no-cache"
  });

  createReadStream(filePath).pipe(res);
});

server.listen(port, () => {
  console.log(`Restaurant quarterly portal: http://localhost:${port}`);
});
