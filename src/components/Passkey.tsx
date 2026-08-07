"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/webauthn";
import type { UiStrings } from "@/lib/ui-strings";

/**
 * Passkey buttons.
 *
 * `next-auth/webauthn` drives the whole browser side - it fetches the options,
 * calls the platform's WebAuthn prompt, and posts the result back - so this is
 * a button, not a WebAuthn implementation.
 *
 * Two modes, because the two things are genuinely different:
 *
 *   "authenticate" on the sign-in page, for someone who already has a passkey.
 *   "register" on the home page, for someone already signed in who wants this
 *   device to stop asking for email.
 *
 * Registration is only ever offered while signed in. That is not a UI choice -
 * see the getUserInfo override in src/auth.ts, which refuses to create an
 * account from a passkey alone.
 */
export function Passkey({
  mode,
  t,
  className = "",
}: {
  mode: "authenticate" | "register";
  t: UiStrings;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await signIn("passkey", { action: mode, redirectTo: "/" });
      if (mode === "register") {
        setDone(true);
        router.refresh();
      }
    } catch (err) {
      // A cancelled prompt throws too, and telling someone "something went
      // wrong" because they dismissed a dialog they chose to dismiss is noise.
      const name = err instanceof Error ? err.name : "";
      if (name !== "NotAllowedError" && name !== "AbortError") {
        setError(err instanceof Error ? err.message : t.somethingWentWrong);
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="text-sm text-muted">{t.passkeyAdded}</p>;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={
          mode === "authenticate"
            ? "w-full rounded-lg border border-border bg-surface px-5 py-3 font-medium hover:border-accent disabled:opacity-60"
            : "text-sm text-muted underline-offset-4 hover:text-accent hover:underline disabled:opacity-60"
        }
      >
        {busy ? t.passkeyWorking : mode === "authenticate" ? t.passkeySignIn : t.passkeyAdd}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
