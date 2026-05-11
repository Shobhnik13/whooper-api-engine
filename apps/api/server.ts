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

const port = process.env.API_PORT || 3001

const server = http.createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" })
        return res.end(JSON.stringify({ service: "api", status: "ok" }))
    }

    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify({
        service: "api",
        message: "Whooper control-plane API workspace"
    }))
})

server.listen(port, () => {
    console.log(`API is running on port ${port}`)
})
