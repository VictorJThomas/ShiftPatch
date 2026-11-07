import { ErrorMessage, MeResponse } from "@shiftpatch/contracts";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "../../db/client.js";
import { agencies, userProfiles, users } from "../../db/schema/index.js";

export function meRoutes(app: FastifyInstance, db: () => Db) {
  // Bootstrap call: the web client uses it to learn which agencies it may send as X-Agency-Id, so a stale header must not break it.
  const pre = { onRequest: [app.authenticate, app.loadActor], config: { ignoreAgencyHeader: true } };

  app.get("/api/me", pre, async (req, reply) => {
    const actor = req.actor!;
    const [[user], names] = await Promise.all([
      db()
        .select({ id: users.id, name: userProfiles.fullName, email: users.email, role: users.role })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(users.id, actor.userId)), // explicit columns: no password hash can leak
      actor.agencies.length
        ? db()
            .select({ agencyId: agencies.id, name: agencies.name })
            .from(agencies)
            .where(and(inArray(agencies.id, actor.agencies.map((m) => m.agencyId)), isNull(agencies.deletedAt)))
            .orderBy(asc(agencies.name), asc(agencies.id))
        : [],
    ]);
    // Login inner-joins user_profiles, so a user without a profile can never have signed in: treat a token for one like a stale
    // session (401, same as login's behaviour of refusing them), not a 500.
    if (!user?.name) return reply.code(401).send({ error: ErrorMessage.unauthorized });
    const roleOf = new Map(actor.agencies.map((m) => [m.agencyId, m.role])); // memberships were loaded with the active/not-suspended filter
    return MeResponse.parse({
      user: { ...user, name: user.name },
      agencies: names.map((a) => ({ agencyId: a.agencyId, name: a.name, role: roleOf.get(a.agencyId) })),
    });
  });
}
