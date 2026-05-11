import { Client } from "pg";
import { loadConfig } from "../config/loader";
import { logger } from "../logger";

export function startConfigListener(
    dbUrl: string,
    onReload: (m: Map<string, any>) => void
) {
    const c = new Client({ connectionString: dbUrl });
    c.connect().then(async () => {
        await c.query("LISTEN gateway_config_changed");
        logger.info("LISTEN gateway_config_changed");
    });

    c.on("notification", async () => {
        const cfg = await loadConfig();
        onReload(cfg);
        logger.info("Gateway config reloaded");
    });

    c.on("error", (e) => logger.error(e));
}
