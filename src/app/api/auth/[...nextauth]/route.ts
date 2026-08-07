import type { NextRequest } from "next/server";
import { handlers, authConfigured } from "@/auth";

/**
 * Auth.js's own endpoints, mounted only when there is auth to serve.
 *
 * Without AUTH_SECRET the handlers do not degrade - they answer every request
 * with a 500 and "There was a problem with the server configuration". That is
 * right for an app whose auth is meant to work and is broken, and wrong here,
 * where having no auth configured is a supported state this app has been in for
 * its whole life. A 404 is the honest answer: this server has no sign-in.
 */
type Handler = (req: NextRequest) => Promise<Response>;

function guard(handler: Handler): Handler {
  return async (req) => {
    if (!authConfigured()) return new Response("Not found", { status: 404 });
    return handler(req);
  };
}

export const GET = guard(handlers.GET);
export const POST = guard(handlers.POST);
