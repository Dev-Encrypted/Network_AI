// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Bounded OS-environment diagnosis. Prints phase markers, never environment values.
import { execFile } from "node:child_process";
import { join } from "node:path";
import { workerEnvironment } from "../../../packages/contributor/src/profile.mjs";
const lookup = (name) =>
  Object.entries(process.env).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];
const shell = join(
  lookup("SystemRoot"),
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
const script =
  "[Console]::WriteLine('started');Import-Module ($PSHOME+'\\Modules\\CimCmdlets\\CimCmdlets.psd1');[Console]::WriteLine('cim_loaded');$null=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$PID);[Console]::WriteLine('queried');Import-Module ($PSHOME+'\\Modules\\Microsoft.PowerShell.Utility\\Microsoft.PowerShell.Utility.psd1');[Console]::WriteLine('utility_loaded');exit 0";
const systemModules = join(
  lookup("SystemRoot"),
  "System32/WindowsPowerShell/v1.0/Modules",
);
const inheritedSystemModules = lookup("PSModulePath")
  ?.split(";")
  .find((path) =>
    /[\\/]WindowsPowerShell[\\/]v1\.0[\\/]Modules[\\/]?$/i.test(path),
  );
const groups = [
  ["base", []],
  ["system_only", [], { PSModulePath: systemModules }],
  [
    "system_inherited_spelling",
    [],
    { PSModulePath: inheritedSystemModules ?? systemModules },
  ],
  [
    "system_and_all_users",
    [],
    {
      PSModulePath:
        join(lookup("ProgramFiles"), "WindowsPowerShell/Modules") +
        ";" +
        systemModules,
    },
  ],
  ["discovery_disabled", [], { PSModulePath: "" }],
  [
    "analysis_cache_disabled",
    [],
    {
      PSModulePath: systemModules,
      PSModuleAnalysisCachePath: "NUL",
      PSDisableModuleAnalysisCacheCleanup: "1",
    },
  ],
  ["module_path", ["PSModulePath"]],
  ["control_inherited", null],
];
let cursor = 0;
await Promise.all(
  Array.from({ length: 2 }, async () => {
    for (;;) {
      const group = groups[cursor++];
      if (!group) return;
      const [name, variables, overrides = {}] = group;
      const env =
        variables === null
          ? process.env
          : {
              ...workerEnvironment(),
              ...Object.fromEntries(
                variables
                  .map((key) => [key, lookup(key)])
                  .filter(([, value]) => value !== undefined),
              ),
              ...overrides,
            };
      const started = Date.now();
      const result = await new Promise((resolve) => {
        const child = execFile(
          shell,
          ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
          {
            windowsHide: true,
            env,
            timeout: 8000,
            encoding: "utf8",
            maxBuffer: 32768,
          },
          (error, stdout) =>
            resolve({
              case: name,
              success: !error,
              duration_ms: Date.now() - started,
              killed: error?.killed ?? false,
              phases: stdout
                .split(/\r?\n/)
                .filter((line) =>
                  [
                    "started",
                    "cim_loaded",
                    "queried",
                    "utility_loaded",
                  ].includes(line),
                ),
            }),
        );
        child.stdin.end();
      });
      console.log(JSON.stringify(result));
    }
  }),
);
