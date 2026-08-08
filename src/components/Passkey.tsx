"use client";

import { useState } from "react";
import { signIn } from "next-auth/webauthn";
import type { UiStrings } from "@/lib/ui-strings";

/**
 * Sign in with a passkey already registered on this device.
 *
 * `next-auth/webauthn` drives the whole browser side - it fetches the options,
 * raises the platform's prompt, and posts the result back - so this is a
 * button, not a WebAuthn implementation.
 *
 * Registering is deliberately NOT here. It lives in Passkeys.tsx, behind a
 * session, because a passkey must never create an account on its own: see the
 * getUserInfo override in src/auth.ts.
 */
export function Passkey({ t }: { t: UiStrings }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await signIn("passkey", { action: "authenticate", redirectTo: "/" });
    } catch (err) {
      // Dismissing the platform prompt throws too, and telling someone
      // something went wrong because they cancelled is noise.
      const name = err instanceof Error ? err.name : "";
      if (name !== "NotAllowedError" && name !== "AbortError") {
        setError(err instanceof Error ? err.message : t.somethingWentWrong);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="w-full rounded-lg border border-border bg-surface px-5 py-3 font-medium hover:border-accent disabled:opacity-60"
      >
        {busy ? t.passkeyWorking : t.passkeySignIn}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
