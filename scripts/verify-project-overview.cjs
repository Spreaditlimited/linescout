const fs = require("fs");
const ts = require("typescript");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

async function run() {
  const { db } = require("../lib/db.ts");
  const { getProjectOverview } = require("../lib/project-overview.ts");
  const [rows] = await db.query(
    `SELECT
       u.id,
       u.email,
       m.account_id,
       m.role,
       COUNT(DISTINCT c.id) AS project_count
     FROM users u
     JOIN linescout_account_members m
       ON m.user_id = u.id
      AND m.status = 'active'
     JOIN linescout_conversations c
       ON c.account_id = m.account_id
       OR (c.account_id IS NULL AND c.user_id = u.id)
     WHERE c.handoff_id IS NOT NULL
       AND c.chat_mode = 'paid_human'
       AND c.payment_status = 'paid'
     GROUP BY u.id, u.email, m.account_id, m.role
     ORDER BY project_count DESC, (m.role = 'owner') DESC
     LIMIT 1`,
  );
  if (!rows.length) throw new Error("No project-bearing test account found");

  const selected = rows[0];
  const user = {
    id: Number(selected.id),
    email: String(selected.email),
    account_id: Number(selected.account_id),
    account_role: String(selected.role),
  };
  const batchStarted = performance.now();
  const overview = await getProjectOverview(user);
  const batchMs = Math.round(performance.now() - batchStarted);

  if (overview.projects.length !== overview.summaries.length) {
    throw new Error("Project and summary counts differ");
  }

  let singleMs = null;
  if (overview.projects.length) {
    const project = overview.projects[0];
    const singleStarted = performance.now();
    const single = await getProjectOverview(user, {
      handoffId: Number(project.handoff_id) || undefined,
      conversationId: Number(project.conversation_id),
    });
    singleMs = Math.round(performance.now() - singleStarted);
    if (single.summaries.length !== 1) {
      throw new Error("Single summary contract failed");
    }
    if (single.summaries[0].conversation_id !== project.conversation_id) {
      throw new Error("Single summary returned the wrong project");
    }
  }

  console.log(
    JSON.stringify({
      project_count: overview.projects.length,
      summary_count: overview.summaries.length,
      batch_ms: batchMs,
      single_ms: singleMs,
      contract_match: true,
    }),
  );
  await db.end();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
