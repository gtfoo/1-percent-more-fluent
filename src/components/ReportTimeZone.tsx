"use client";

import { useEffect } from "react";
import { TZ_COOKIE } from "@/lib/cookies";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Tell the server which midnight is the reader's.
 *
 * Renders nothing. It exists because the server genuinely cannot know this:
 * timestamps are stored in UTC, and an HTTP request carries no timezone. The
 * only party that knows is the browser, so the browser has to say.
 *
 * It sits in the root layout rather than on /progress, so the answer is already
 * on file long before anyone opens the page that needs it. On a first ever
 * visit the very first render still has no cookie and falls back to UTC; the
 * alternative is blocking the first paint on a round trip to learn something
 * that only matters on one page.
 *
 * Written on every mount, not only when absent, because the answer expires
 * without anyone changing a setting: daylight saving moves it twice a year, and
 * so does getting on a plane.
 *
 * Not httpOnly - it has to be written from here. Nothing is protected by it:
 * the worst a forged value does is draw someone's own calendar against the
 * wrong midnight, and dayShift range-checks it before it reaches SQL.
 */
export function ReportTimeZone() {
  useEffect(() => {
    // Minutes EAST of UTC. getTimezoneOffset returns the opposite sign to
    // everything else that describes a timezone - it is minutes to ADD to local
    // time to get UTC - so it is negated once, here, rather than everywhere it
    // is read.
    const minutes = -new Date().getTimezoneOffset();
    document.cookie = `${TZ_COOKIE}=${minutes}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  }, []);

  return null;
}
