import { defineSchedule } from "eve/schedules";
import slack from "../channels/slack";
import resend from "../channels/resend";
import { dispatchHits, watchChannelEnv } from "../lib/watch-dispatch";
import { scanPortfolioWatch } from "../lib/watch-scan";

/**
 * Weekday 07:00 UTC portfolio sweep.
 * eve dev never fires cron — dispatch with:
 *   curl -X POST http://localhost:2000/eve/v1/dev/schedules/portfolio-watch
 */
export default defineSchedule({
  cron: "0 7 * * 1-5",
  async run({ to, waitUntil, appAuth }) {
    const hits = await scanPortfolioWatch(8);
    if (hits.length === 0) return; // conditional delivery: nothing to send

    waitUntil(
      dispatchHits({
        hits,
        notify: ["slack", "email"],
        to: to as never,
        appAuth,
        slackChannel: slack,
        resendChannel: resend,
        ...watchChannelEnv(),
      })
    );
  },
});
