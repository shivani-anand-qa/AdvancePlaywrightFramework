/**
 * screenshotFlag — single source of truth for the screenshot attach flag.
 *
 * When ATTACH_SCREENSHOTS=true, visual steps attach screenshots to the report
 * and Playwright captures failure screenshots. When false/unset, nothing is
 * attached and Playwright's own screenshot capture is off.
 *
 * Importing this module loads `.env` (same pattern as ./env.ts) so the value
 * is correct regardless of import order vs. dotenv.config() in the config.
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const ATTACH_SCREENSHOTS = process.env.ATTACH_SCREENSHOTS?.toLowerCase() === 'true';
