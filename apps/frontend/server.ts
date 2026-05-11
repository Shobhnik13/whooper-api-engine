import dotenv from "dotenv"
import fs from "fs"
import http from "http"
import path from "path"

const envPath = process.env.DOTENV_CONFIG_PATH
    || [
        path.resolve(__dirname, "../../.env"),
        path.resolve(__dirname, "../../../.env"),
        path.resolve(process.cwd(), ".env"),
    ].find(fs.existsSync)

dotenv.config({
    path: envPath
})

const port = process.env.FRONTEND_PORT || 3002

const server = http.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" })
        return res.end(JSON.stringify({ service: "frontend", status: "ok" }))
    }

    res.writeHead(200, { "content-type": "text/html" })
    return res.end(`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Whooper</title>
</head>
<body>
  <main>
    <h1>Whooper Frontend</h1>
    <p>Management UI workspace.</p>
  </main>
</body>
</html>
`)
})

server.listen(port, () => {
    console.log(`Frontend is running on port ${port}`)
})
