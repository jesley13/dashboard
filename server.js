const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT) || 4173;
const host = "127.0.0.1";
const root = __dirname;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

function findWorkbook() {
  return fs.readdirSync(root)
    .filter(file => file.toLowerCase().endsWith(".xlsx"))
    .sort((a, b) => a.localeCompare(b))[0];
}

function resolveRequestPath(urlPath) {
  const requested = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.slice(1));
  const resolved = path.resolve(root, requested);
  const relative = path.relative(root, resolved);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? resolved : null;
}

const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, `http://${host}:${port}`);

  if (pathname === "/workbook") {
    const workbook = findWorkbook();
    if (!workbook) {
      response.writeHead(404);
      response.end("No .xlsx file found in the dashboard folder");
      return;
    }

    const workbookPath = path.join(root, workbook);
    fs.readFile(workbookPath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Workbook not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": contentTypes[".xlsx"],
        "X-Workbook-Name": encodeURIComponent(workbook)
      });
      response.end(data);
    });
    return;
  }

  const filePath = resolveRequestPath(pathname);

  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Dashboard running at http://${host}:${port}/`);
});
