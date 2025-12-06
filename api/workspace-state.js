// api/workspace-state.js
// Sync workspace state (tasks, filters, etc.) to Neon Postgres table `workspace_states`

const postgres = require("postgres");

// Force Node.js runtime on Vercel (NOT Edge)
module.exports.config = {
  runtime: "nodejs",
};

if (!process.env.DATABASE_URL) {
  console.error(
    "[workspace-state] Missing DATABASE_URL env var. Set it in Vercel → Settings → Environment Variables."
  );
}

// Create a Postgres client using Neon connection string
const sql = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { ssl: "require" })
  : null;

async function getRole(locationId, workspaceId, userEmail) {
  if (!userEmail) return "admin"; // default fallback when identity missing
  try {
    const rows = await sql`
      SELECT role FROM workspace_roles
      WHERE location_id = ${locationId}
        AND workspace_id = ${workspaceId}
        AND user_email = ${userEmail.toLowerCase()}
      LIMIT 1
    `;
    if (!rows.length) return "admin"; // default to admin when not assigned
    return rows[0].role;
  } catch (err) {
    console.warn("[workspace-state] getRole error", err);
    return "admin";
  }
}

function sanitizeTasksForMember(tasks, userEmail) {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter((t) => (t?.assigneeEmail || "").toLowerCase() === userEmail.toLowerCase());
}

module.exports = async (req, res) => {
  if (!sql) {
    return res.status(500).json({
      ok: false,
      error: "DATABASE_URL is not configured on the server",
    });
  }

  if (req.method === "GET") {
    const { locationId, workspaceId, userEmail } = req.query || {};

    if (!locationId || !workspaceId) {
      return res.status(400).json({
        ok: false,
        error: "locationId and workspaceId query params are required",
      });
    }

    const role = await getRole(locationId, workspaceId, userEmail);

    try {
      const rows = await sql`
        SELECT state_json, updated_at
        FROM workspace_states
        WHERE location_id = ${locationId} AND workspace_id = ${workspaceId}
        LIMIT 1
      `;

      if (!rows.length) {
        return res
          .status(200)
          .json({ ok: true, state: null, updatedAt: null, role });
      }

      const row = rows[0];
      let state = row.state_json || {};

      if (role === "member" && Array.isArray(state.tasks)) {
        state = { ...state, tasks: sanitizeTasksForMember(state.tasks, userEmail) };
      }

      return res.status(200).json({
        ok: true,
        state,
        role,
        updatedAt: row.updated_at,
      });
    } catch (err) {
      console.error("[workspace-state][GET] error:", err);
      return res.status(500).json({
        ok: false,
        error: "DB error (GET /api/workspace-state)",
        detail: err.message || String(err),
      });
    }
  }

  if (req.method === "POST") {
    let body = req.body;

    // Some runtimes hand us a string; normalize to object
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (err) {
        return res
          .status(400)
          .json({ ok: false, error: "Invalid JSON in request body" });
      }
    }

    const { locationId, workspaceId, state, userEmail } = body || {};
    if (!locationId || !workspaceId || !state) {
      return res.status(400).json({
        ok: false,
        error: "locationId, workspaceId, and state are required in body",
      });
    }

    const role = await getRole(locationId, workspaceId, userEmail);

    try {
      let stateToStore = state;

      if (role === "member") {
        // Load existing to preserve others' tasks
        const existingRows = await sql`
          SELECT state_json FROM workspace_states
          WHERE location_id = ${locationId} AND workspace_id = ${workspaceId}
          LIMIT 1
        `;
        const existingState = existingRows.length ? existingRows[0].state_json || {} : {};
        const existingTasks = Array.isArray(existingState.tasks) ? existingState.tasks : [];
        const incomingTasks = Array.isArray(state.tasks) ? state.tasks : [];

        const userTasks = incomingTasks.filter(
          (t) => (t?.assigneeEmail || "").toLowerCase() === (userEmail || "").toLowerCase()
        );

        const preservedOthers = existingTasks.filter(
          (t) => (t?.assigneeEmail || "").toLowerCase() !== (userEmail || "").toLowerCase()
        );

        stateToStore = {
          ...existingState,
          ...state,
          tasks: [...preservedOthers, ...userTasks],
        };
      }

      const rows = await sql`
        INSERT INTO workspace_states (location_id, workspace_id, state_json)
        VALUES (${locationId}, ${workspaceId}, ${sql.json(stateToStore)})
        ON CONFLICT (location_id, workspace_id)
        DO UPDATE SET
          state_json = EXCLUDED.state_json,
          updated_at = now()
        RETURNING state_json, updated_at
      `;

      const row = rows[0];
      return res.status(200).json({
        ok: true,
        role,
        state: role === "member"
          ? { ...row.state_json, tasks: sanitizeTasksForMember(row.state_json.tasks || [], userEmail || "") }
          : row.state_json,
        updatedAt: row.updated_at,
      });
    } catch (err) {
      console.error("[workspace-state][POST] error:", err);
      return res.status(500).json({
        ok: false,
        error: "DB error (POST /api/workspace-state)",
        detail: err.message || String(err),
      });
    }
  }

  // Anything else = method not allowed
  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
