// api/workspace-roles.js
// Manage workspace-level roles (admin | manager | member)

const postgres = require("postgres");

module.exports.config = { runtime: "nodejs" };

if (!process.env.DATABASE_URL) {
  console.error(
    "[workspace-roles] Missing DATABASE_URL env var. Set it in Vercel → Settings → Environment Variables."
  );
}

const sql = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { ssl: "require" })
  : null;

function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    body = JSON.parse(body || "{}", (k, v) => v);
  }
  return body || {};
}

module.exports = async (req, res) => {
  if (!sql) {
    return res
      .status(500)
      .json({ ok: false, error: "DATABASE_URL is not configured on the server" });
  }

  // GET: list roles for a workspace
  if (req.method === "GET") {
    const { locationId, workspaceId } = req.query || {};
    if (!locationId || !workspaceId) {
      return res
        .status(400)
        .json({ ok: false, error: "locationId and workspaceId are required" });
    }

    try {
      const rows = await sql`
        SELECT id, location_id, workspace_id, user_email, role, created_at, updated_at
        FROM workspace_roles
        WHERE location_id = ${locationId} AND workspace_id = ${workspaceId}
        ORDER BY role ASC, user_email ASC
      `;
      return res.status(200).json({ ok: true, roles: rows });
    } catch (err) {
      console.error("[workspace-roles][GET] error:", err);
      return res.status(500).json({ ok: false, error: "DB error (GET /api/workspace-roles)", detail: err.message });
    }
  }

  // POST: upsert a role for a user in a workspace
  if (req.method === "POST") {
    let body;
    try {
      body = parseJsonBody(req);
    } catch (err) {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }

    const { locationId, workspaceId, userEmail, role } = body || {};
    const allowed = ["admin", "manager", "member"];
    if (!locationId || !workspaceId || !userEmail || !role) {
      return res
        .status(400)
        .json({ ok: false, error: "locationId, workspaceId, userEmail, and role are required" });
    }
    if (!allowed.includes(role)) {
      return res.status(400).json({ ok: false, error: "Invalid role" });
    }

    try {
      const rows = await sql`
        INSERT INTO workspace_roles (location_id, workspace_id, user_email, role)
        VALUES (${locationId}, ${workspaceId}, ${userEmail.toLowerCase()}, ${role})
        ON CONFLICT (location_id, workspace_id, user_email)
        DO UPDATE SET role = EXCLUDED.role, updated_at = now()
        RETURNING id, location_id, workspace_id, user_email, role, created_at, updated_at
      `;

      return res.status(200).json({ ok: true, role: rows[0] });
    } catch (err) {
      console.error("[workspace-roles][POST] error:", err);
      return res.status(500).json({ ok: false, error: "DB error (POST /api/workspace-roles)", detail: err.message });
    }
  }

  // DELETE: remove a role assignment
  if (req.method === "DELETE") {
    const { locationId, workspaceId, userEmail } = req.query || {};
    if (!locationId || !workspaceId || !userEmail) {
      return res
        .status(400)
        .json({ ok: false, error: "locationId, workspaceId, and userEmail are required" });
    }

    try {
      const rows = await sql`
        DELETE FROM workspace_roles
        WHERE location_id = ${locationId}
          AND workspace_id = ${workspaceId}
          AND user_email = ${userEmail.toLowerCase()}
        RETURNING id
      `;

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "Role not found" });
      }

      return res.status(200).json({ ok: true, deleted: true });
    } catch (err) {
      console.error("[workspace-roles][DELETE] error:", err);
      return res.status(500).json({ ok: false, error: "DB error (DELETE /api/workspace-roles)", detail: err.message });
    }
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
