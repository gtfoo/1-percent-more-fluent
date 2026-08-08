"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/webauthn";
import type { UiStrings } from "@/lib/ui-strings";

export interface PasskeyRow {
  credentialId: string;
  addedOn: string;
  /** Pre-formatted server-side: the interpolating strings are functions. */
  label: string;
}

/**
 * Managing the passkeys on an account: what is registered, add this device,
 * remove one.
 *
 * The first version of this was a single bare link that disappeared the moment
 * one passkey existed - so it was easy to miss, there was no way to add a
 * second device, and no way to revoke a credential on a laptop you no longer
 * have. A way of signing in that cannot be revoked is not one worth offering.
 */
export function Passkeys({
  rows,
  t,
  canAdd,
}: {
  rows: PasskeyRow[];
  t: UiStrings;
  canAdd: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await signIn("passkey", { action: "register", redirectTo: "/" });
      router.refresh();
    } catch (err) {
      // Dismissing the platform prompt throws too. Telling someone something
      // went wrong because they cancelled is noise.
      const name = err instanceof Error ? err.name : "";
      if (name !== "NotAllowedError" && name !== "AbortError") {
        setError(err instanceof Error ? err.message : t.somethingWentWrong);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(credentialId: string) {
    setGone((g) => [...g, credentialId]);
    setError(null);
    try {
      const res = await fetch("/api/passkeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      });
      if (!res.ok) throw new Error(t.couldNotSave);
      router.refresh();
    } catch (err) {
      setGone((g) => g.filter((c) => c !== credentialId));
      setError(err instanceof Error ? err.message : t.somethingWentWrong);
    }
  }

  const visible = rows.filter((r) => !gone.includes(r.credentialId));

  return (
    <section className="rounded-xl border border-border bg-surface px-5 py-4">
      <h2 className="font-semibold">{t.passkeyHeading}</h2>
      <p className="mt-1 text-sm text-muted">{t.passkeyWhy}</p>

      {visible.length > 0 && (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {visible.map((row) => (
            <li
              key={row.credentialId}
              className="flex items-baseline justify-between gap-4 py-2"
            >
              <span className="text-sm">{row.label}</span>
              <button
                type="button"
                onClick={() => remove(row.credentialId)}
                className="shrink-0 text-sm text-muted underline-offset-4 hover:text-accent hover:underline"
              >
                {t.passkeyRemove}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Offered even once one exists: a phone and a laptop are different
          credentials, and registering the second is the whole point. */}
      {canAdd && (
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-60"
        >
          {busy ? t.passkeyWorking : t.passkeyAdd}
        </button>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
