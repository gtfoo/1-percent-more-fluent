/**
 * The passkeys a reader has registered, for showing and removing.
 *
 * Auth.js's adapter can list them, but it returns the credential material -
 * public key, counter, transports - which the page has no business carrying to
 * the browser. This returns only what a person needs to recognise one device
 * from another and decide to revoke it.
 */
import { getDb } from "./db";

export interface RegisteredPasskey {
  /** Opaque id, used to revoke. Not secret: the private key never leaves the device. */
  credentialId: string;
  /** "multiDevice" for a synced passkey, "singleDevice" for one tied to hardware. */
  deviceType: string;
  /** Whether the authenticator says it is backed up, i.e. synced. */
  backedUp: boolean;
  addedOn: string;
}

export function listPasskeys(userId: string): RegisteredPasskey[] {
  const rows = getDb()
    .prepare(
      `SELECT credential_id, credential_device_type, credential_backed_up, created_at
         FROM authenticators WHERE user_id = ? ORDER BY created_at`,
    )
    .all(userId) as {
    credential_id: string;
    credential_device_type: string;
    credential_backed_up: number;
    created_at: string;
  }[];

  return rows.map((r) => ({
    credentialId: r.credential_id,
    deviceType: r.credential_device_type,
    backedUp: Boolean(r.credential_backed_up),
    // Date only. A time would imply a precision nobody needs and would have to
    // be localised; a plain ISO date reads the same in every language here.
    addedOn: r.created_at.slice(0, 10),
  }));
}

/**
 * Revoke one.
 *
 * Scoped by user, so a credential id belonging to someone else matches nothing.
 * Without this a passkey on a lost laptop would stay valid forever, which is
 * not a defensible thing to ship as a way of signing in.
 */
export function removePasskey(userId: string, credentialId: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM authenticators WHERE user_id = ? AND credential_id = ?")
    .run(userId, credentialId);
  return result.changes > 0;
}
