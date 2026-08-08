import type { NextRequest } from "next/server";
import { currentUser, passkeysConfigured } from "@/auth";
import { removePasskey } from "@/server/passkeys";

/**
 * Revoke a passkey.
 *
 * Only ever your own: the reader comes from the session, never from the
 * request, so a credential id belonging to somebody else matches nothing.
 */
export async function DELETE(req: NextRequest) {
  if (!passkeysConfigured()) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const user = await currentUser();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });

  const body = (await req.json()) as { credentialId?: string };
  const credentialId = (body.credentialId ?? "").trim();
  if (!credentialId) {
    return Response.json({ error: "credentialId is required" }, { status: 400 });
  }

  const removed = removePasskey(user.id, credentialId);
  if (!removed) return Response.json({ error: "no such passkey" }, { status: 404 });
  return Response.json({ ok: true });
}
