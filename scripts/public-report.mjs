// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Export only an explicit allowlist of test evidence. Raw test reports, credentials and model content stay private.
import { readFile, writeFile } from "node:fs/promises";
const read = (name) =>
  readFile(`.runtime/private-lab/${name}.json`, "utf8").then(JSON.parse);
const [live, backup, fault, outbox, browser, a11y, multi] = await Promise.all(
  [
    "acceptance-report",
    "backup-report",
    "fault-report",
    "outbox-report",
    "browser-report",
    "accessibility-report",
    "multi-node-report",
  ].map(read),
);
if (
  live.checks.some((c) => !c.passed) ||
  browser.stats.unexpected !== 0 ||
  a11y.violations.length ||
  multi.completed !== 2 ||
  multi.overlapping_executions !== 0
)
  throw new Error("A failed campaign cannot be exported as approved");
const report = {
  version: "0.2.0-private-preview",
  observed_at: new Date().toISOString(),
  scope:
    "Private application, single physical Windows host and local LM Studio. Not WAN or economic qualification.",
  tests: {
    postgres_integration: 18,
    rust_runtime: 4,
    rust_f0: 2,
    python_f0: 21,
    browser: browser.stats.expected,
    browser_failed: browser.stats.unexpected,
  },
  live_checks: live.checks,
  real_inference: live.sessions.map(
    ({ state, elapsed_ms, input_tokens, output_tokens, charged_microtu }) => ({
      state,
      elapsed_ms,
      input_tokens,
      output_tokens,
      charged_microtu,
    }),
  ),
  node_restart: {
    recovery_ms: fault.recovery_ms,
    epoch_increased: fault.epoch_after > fault.epoch_before,
    state: fault.state,
    billing_state: fault.billing_state,
    charged_microtu: fault.charged_microtu,
  },
  control_outbox: {
    downtime_ms: outbox.control_downtime_ms,
    stream_completed_while_receipt_pending:
      outbox.stream_completed_while_receipt_pending,
    state: outbox.state,
    billing_state: outbox.billing_state,
  },
  multi_agent_same_host: {
    agents: multi.agents,
    physical_hosts: multi.physical_hosts,
    domain_slots: multi.domain_slots,
    concurrent_requests: multi.concurrent_requests,
    completed: multi.completed,
    overlapping_executions: multi.overlapping_executions,
    operator_profile_contains_authority_secrets:
      multi.operator_profile_contains_authority_secrets,
  },
  backup: {
    journal_entries: backup.journal_entries,
    balance_sum: backup.balance_sum,
    projection_mismatches: backup.projection_mismatches,
    runtime_balance_write_denied: backup.runtime_balance_write_denied,
  },
  accessibility: {
    scope: a11y.scope,
    violations: a11y.violations.length,
    passed_rules: a11y.passed_rules,
  },
  economic_policy_approved: false,
  public_network_approved: false,
  cash_payments_enabled: false,
  unit: "LAB_TU",
};
await writeFile(
  "docs/implementation/validation.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  "Public evidence summary exported without private identifiers or content.",
);
