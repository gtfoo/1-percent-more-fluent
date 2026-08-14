/**
 * The sign-in email.
 *
 * Auth.js ships a default template and it is fine, in the way a system dialog
 * is fine: a bare table, a blue button, the bare host name. This one is the
 * only piece of the product some people will see before deciding whether to
 * trust it with an address, so it is worth more than the default.
 *
 * Written by hand rather than with a React email library. The whole thing is
 * one function returning two strings, and adding a renderer and its build step
 * to produce sixty lines of table markup is not a trade worth making.
 *
 * The constraints are email's, not the web's, and they are why this looks like
 * 2005 HTML:
 *
 *  - TABLES, not flexbox or grid. Outlook renders through Word, which supports
 *    neither, and a div-based layout collapses into a single column there.
 *  - INLINE styles. Gmail strips <style> blocks in some clients, notably the
 *    mobile apps reading a forwarded message.
 *  - No external CSS, no web fonts, no images. Images are blocked by default in
 *    most clients, so anything load-bearing must survive without them - which
 *    is also why the button is a styled link and not a picture of a button.
 *  - The URL is repeated in full as text. Some clients mangle or refuse styled
 *    links, and a sign-in email that cannot be used is worse than an ugly one.
 */

/**
 * How long a sign-in link lives, in minutes.
 *
 * Lives HERE, beside the words that promise it, and is imported by the auth
 * config to mint the token. One constant, because the failure mode of two is
 * silent: an email promising fifteen minutes for a link that dies in five
 * teaches people the app is broken, and nothing anywhere reports a problem.
 *
 * Short deliberately - Auth.js defaults to 24 hours, and a link that works all
 * day is a link that works for whoever reads the inbox tomorrow.
 */
export const LINK_MINUTES = 15;

/** The app's own palette, hardcoded because email cannot read CSS variables. */
const COLOR = {
  background: "#faf8f5",
  surface: "#ffffff",
  border: "#e6e0d6",
  foreground: "#1c1a17",
  muted: "#6f675c",
  accent: "#a4552b",
  accentSoft: "#f3e6dd",
};

/**
 * How long the link lasts, in minutes.
 *
 * Passed in rather than imported from the auth config so the email cannot
 * quietly disagree with the token: a message that promises fifteen minutes for
 * a link that dies in five is worse than saying nothing at all.
 */
export function signInEmail(args: {
  url: string;
  host: string;
  expiresInMinutes: number;
}): { subject: string; html: string; text: string } {
  const { url, host, expiresInMinutes } = args;

  // Escaped because it ends up inside an attribute and in text. The URL is
  // ours, but an unescaped ampersand in a query string is enough to break a
  // link in a strict client.
  const safeUrl = url.replace(/&/g, "&amp;");

  const subject = `Your sign-in link for ${host}`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${subject}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${COLOR.background}; color:${COLOR.foreground}; -webkit-font-smoothing:antialiased;">
    <!-- Shown in the inbox list beside the subject, then hidden. Without it,
         clients preview the first visible text, which is the heading again. -->
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
      One tap to sign in. The link works for ${expiresInMinutes} minutes.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:${COLOR.background}; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:480px; background-color:${COLOR.surface}; border:1px solid ${COLOR.border}; border-radius:12px;">
            <tr>
              <td style="padding:32px 32px 8px 32px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                <p style="margin:0 0 4px 0; font-size:13px; letter-spacing:0.08em; text-transform:uppercase; color:${COLOR.accent};">
                  1 Percent More Fluent
                </p>
                <h1 style="margin:0; font-size:22px; line-height:1.3; font-weight:600; color:${COLOR.foreground};">
                  Sign in
                </h1>
              </td>
            </tr>

            <tr>
              <td style="padding:12px 32px 0 32px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                <p style="margin:0; font-size:16px; line-height:1.6; color:${COLOR.muted};">
                  Tap the button to sign in and bring your reading level and word
                  list with you.
                </p>
              </td>
            </tr>

            <!-- The button is a link with padding, not a table cell with a
                 background, so it stays tappable if styles are stripped. -->
            <tr>
              <td style="padding:24px 32px 8px 32px;" align="left">
                <a href="${safeUrl}"
                   style="display:inline-block; background-color:${COLOR.accent}; color:#ffffff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:16px; font-weight:600; line-height:1; text-decoration:none; padding:14px 28px; border-radius:8px;">
                  Sign in
                </a>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 32px 0 32px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                <p style="margin:0; font-size:14px; line-height:1.6; color:${COLOR.muted};">
                  This link expires in <strong style="color:${COLOR.foreground};">${expiresInMinutes} minutes</strong>
                  and can only be used once.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 32px 0 32px;">
                <div style="height:1px; background-color:${COLOR.border}; line-height:1px;">&nbsp;</div>
              </td>
            </tr>

            <!-- Every client that refuses to render the button above still
                 renders this. word-break matters: a long token in a narrow
                 phone layout otherwise pushes the whole email sideways. -->
            <tr>
              <td style="padding:20px 32px 0 32px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                <p style="margin:0 0 8px 0; font-size:13px; line-height:1.6; color:${COLOR.muted};">
                  If the button does not work, paste this into your browser:
                </p>
                <p style="margin:0; font-size:12px; line-height:1.5; word-break:break-all;">
                  <a href="${safeUrl}" style="color:${COLOR.accent}; text-decoration:underline;">${safeUrl}</a>
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px 32px 32px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                <div style="background-color:${COLOR.accentSoft}; border-radius:8px; padding:14px 16px;">
                  <p style="margin:0; font-size:13px; line-height:1.6; color:${COLOR.muted};">
                    Did not ask for this? Ignore this email — nobody can sign in
                    without the link, and it expires on its own.
                  </p>
                </div>
              </td>
            </tr>
          </table>

          <p style="max-width:480px; margin:16px auto 0 auto; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:1.5; color:${COLOR.muted}; text-align:center;">
            ${host}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  // Not a courtesy. A message with no plain-text part scores worse with spam
  // filters, and this one has to arrive.
  const text = [
    "Sign in to 1 Percent More Fluent",
    "",
    "Open this link to sign in and bring your reading level and word list with you:",
    url,
    "",
    `The link expires in ${expiresInMinutes} minutes and can only be used once.`,
    "",
    "Did not ask for this? Ignore this email - nobody can sign in without the link,",
    "and it expires on its own.",
    "",
    host,
  ].join("\n");

  return { subject, html, text };
}
