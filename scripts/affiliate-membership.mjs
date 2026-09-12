// The caller must hold a transaction; a conflict must roll back the account/import.
export async function reserveAffiliateMembership(connection, emailHash, affiliateId) {
  const subjectId = `affiliate:${affiliateId}`;
  await connection.query(
    `INSERT INTO commercial_program_memberships (emailHash, program, subjectId)
     VALUES (?, 'AFFILIATE', ?) ON DUPLICATE KEY UPDATE emailHash = VALUES(emailHash)`,
    [emailHash, subjectId],
  );
  const [rows] = await connection.query(
    `SELECT program, subjectId FROM commercial_program_memberships WHERE emailHash = ? FOR UPDATE`,
    [emailHash],
  );
  if (rows[0]?.program !== 'AFFILIATE' || rows[0]?.subjectId !== subjectId) {
    throw new Error('Commercial membership conflict. Stop and review before importing this affiliate.');
  }
}
