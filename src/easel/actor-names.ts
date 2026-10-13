/** Resolve only identities already exposed by a role-filtered read model.
 * Native identities are installation-local and intentionally do not restore;
 * this projection never creates them or changes historical attribution. */
export async function actorNames(db: D1Database, visibleEmails: unknown[]): Promise<Record<string, string>> {
 const emails = [...new Set(visibleEmails.filter((email): email is string => typeof email === 'string' && email.length > 0))]
 if (!emails.length) return {}
 const { results } = await db.prepare('SELECT email, display_name AS name FROM oa_operators WHERE email IN (SELECT value FROM json_each(?))').bind(JSON.stringify(emails)).all<{ email: string; name: string }>()
 return Object.fromEntries(results.filter(person => person.name.trim()).map(person => [person.email, person.name]))
}
