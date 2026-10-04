// Legacy manual entrypoint: now requires --live and fails on tool errors.
// Prefer npm run verify:mcp -- --live [--env-file /private/path/.env].
import { main } from "../scripts/verify-mcp.mjs";
await main();
