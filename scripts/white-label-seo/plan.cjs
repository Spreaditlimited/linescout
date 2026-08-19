require("./register-ts.cjs");

async function run() {
  const targetArg = process.argv.find((item) => item.startsWith("--target="));
  const targetSize = targetArg ? Number(targetArg.split("=")[1]) : 5;
  const { scheduleNextWhiteLabelSeoBatch } = require("../../lib/white-label-seo-scheduler.ts");
  const { db } = require("../../lib/db.ts");
  try {
    const result = await scheduleNextWhiteLabelSeoBatch({ targetSize });
    console.log(JSON.stringify({ ok: true, ...result }));
  } finally {
    await db.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
