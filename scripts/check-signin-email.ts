/**
 * Assert the sign-in email says what the token actually does.
 *
 *   npx tsx scripts/check-signin-email.ts
 *   PREVIEW=/tmp/signin.html npx tsx scripts/check-signin-email.ts   # and look at it
 *
 * Offline: no key, no network, nothing sent. This is the one email the app
 * sends, most people see it once, and a fault in it is invisible from here -
 * you find out because somebody could not sign in and did not tell you.
 */
import { writeFileSync } from "node:fs";
import { signInEmail, LINK_MINUTES } from "../src/server/signin-email";

let failures = 0;

function ok(name: string, condition: boolean, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

// A URL with a query string, because that is what Auth.js sends and the
// ampersand in it is the thing that breaks links in strict clients.
const URL_WITH_TOKEN =
  "https://1-percent-more-fluent.gtfoo.com/api/auth/callback/resend" +
  "?callbackUrl=%2F&token=abc123def456&email=reader%40example.com";

const { subject, html, text } = signInEmail({
  url: URL_WITH_TOKEN,
  host: "1-percent-more-fluent.gtfoo.com",
  expiresInMinutes: LINK_MINUTES,
});

// --- the link has to survive ------------------------------------------------
ok("the button carries the link", html.includes(`href="${URL_WITH_TOKEN.replace(/&/g, "&amp;")}"`));
ok("the ampersands are escaped", !/href="[^"]*&(?!amp;)/.test(html));
// As VISIBLE TEXT, not just as another href. Counting occurrences of the URL
// passed when the fallback link was reworded to "click here" - the address was
// still in the markup twice, in two href attributes, and readable nowhere. A
// client that strips the button leaves that reader with no way in.
ok(
  "the raw URL appears as readable text, for clients that strip the button",
  html.includes(`>${URL_WITH_TOKEN.replace(/&/g, "&amp;")}</a>`),
);
ok("the plain-text part carries the unescaped link", text.includes(URL_WITH_TOKEN));

// --- it says how long it lasts ----------------------------------------------
// The whole point of the exercise: the reader could not tell before.
//
// EVERY duration in the email has to be the real one, not merely one of them.
// Checking that "15 minutes" appears somewhere passed while the sentence the
// reader actually sees said five - the preheader still carried the right number
// and satisfied the assertion on its own.
const minutesClaimed = [...html.matchAll(/(\d+)\s*minutes/g)].map((m) => Number(m[1]));
ok("the email states an expiry at all", minutesClaimed.length > 0);
ok(
  `every duration in the email is ${LINK_MINUTES} minutes`,
  minutesClaimed.every((n) => n === LINK_MINUTES),
  `found ${[...new Set(minutesClaimed)].join(", ")}`,
);
ok("...in the plain-text part as well", text.includes(`${LINK_MINUTES} minutes`));
ok("...and that it is single use", /once/i.test(html) && /once/i.test(text));
ok("...and what to do if you did not ask for it", /ignore/i.test(html) && /ignore/i.test(text));

// --- deliverability ---------------------------------------------------------
ok("there is a subject", subject.length > 0 && subject.length < 120, subject);
ok("there is a plain-text alternative", text.length > 100);
// A styled <style> block would be stripped by some clients; everything visible
// must be inline or it is not styled at all.
ok("no <style> block to be stripped", !/<style/i.test(html));
ok("no external images to be blocked", !/<img/i.test(html));
ok("layout is table-based, for Outlook", html.includes("<table"));

// --- the promise matches the token ------------------------------------------
// Structural rather than textual: LINK_MINUTES is exported from the email
// module and imported by auth.ts to mint the token, so the two cannot drift.
// This asserts the value is sane, which is the part a human still chooses.
ok("the expiry is short enough to be worth having", LINK_MINUTES <= 30, `${LINK_MINUTES} min`);
ok("...and long enough to actually use", LINK_MINUTES >= 5, `${LINK_MINUTES} min`);

if (process.env.PREVIEW) {
  writeFileSync(process.env.PREVIEW, html);
  console.log(`\nwrote ${process.env.PREVIEW}`);
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
