import assert from "node:assert/strict";

export const CI_INTEGRITY_URL = "postgresql://fullcourt_ci:fullcourt_ci@127.0.0.1:55433/fullcourt_ci_disposable";
export const POOL_TEST_URL = "postgresql://correction_owner@127.0.0.1:55434/fullcourt_pool_test";
const RESTORE_URL = "postgresql://michaelju@127.0.0.1:55432/fullcourt_remediation";

export function integrityTestUrl(): string {
  const url = process.env.FULLCOURT_TEST_DATABASE_URL;
  assert.ok(url === RESTORE_URL || url === CI_INTEGRITY_URL || url === POOL_TEST_URL, "explicit disposable PostgreSQL URL required");
  return url;
}
