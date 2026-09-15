// Copyright 2026 Dev-Encrypted. SPDX-License-Identifier: Apache-2.0
// Own the sole non-inherited handle for the contributor parent's Windows job.
// This process starts before the parent launches any inference/transport child.
use std::io::{self, Write};

#[derive(Debug, PartialEq)]
struct Settings {
    parent_pid: u32,
    boot_id: String,
}
fn settings(args: &[String]) -> Result<Settings, &'static str> {
    if args.len() != 4 || args[0] != "--parent-pid" || args[2] != "--boot-id" {
        return Err("guardian_arguments");
    }
    let parent_pid = args[1]
        .parse::<u32>()
        .ok()
        .filter(|p| *p > 0)
        .ok_or("guardian_parent_pid")?;
    let bytes = args[3].as_bytes();
    if bytes.len() != 36
        || !bytes.iter().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                *b == b'-'
            } else {
                b.is_ascii_digit() || (b'a'..=b'f').contains(b)
            }
        })
    {
        return Err("guardian_boot_id");
    }
    Ok(Settings {
        parent_pid,
        boot_id: args[3].clone(),
    })
}

#[cfg(windows)]
mod windows {
    use super::*;
    use std::{mem::size_of, ptr};
    use windows_sys::Win32::{
        Foundation::{
            CloseHandle, FILETIME, GetHandleInformation, HANDLE, HANDLE_FLAG_INHERIT,
            INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT,
        },
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
                TH32CS_SNAPPROCESS,
            },
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, IsProcessInJob,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JobObjectExtendedLimitInformation, QueryInformationJobObject,
                SetInformationJobObject,
            },
            Threading::{
                GetCurrentProcess, GetCurrentProcessId, GetProcessTimes, INFINITE, OpenProcess,
                PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA, PROCESS_SYNCHRONIZE,
                PROCESS_TERMINATE, WaitForSingleObject,
            },
        },
    };

    struct Handle(HANDLE);
    impl Handle {
        fn take(raw: HANDLE, code: &'static str) -> Result<Self, &'static str> {
            if raw.is_null() || raw == INVALID_HANDLE_VALUE {
                Err(code)
            } else {
                Ok(Self(raw))
            }
        }
    }
    impl Drop for Handle {
        fn drop(&mut self) {
            // SAFETY: Handle owns one valid, non-pseudo handle, closed exactly once.
            unsafe { CloseHandle(self.0) };
        }
    }
    fn actual_parent() -> Result<u32, &'static str> {
        // SAFETY: Snapshot functions use an initialized, correctly sized record.
        unsafe {
            let snapshot = Handle::take(
                CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0),
                "guardian_process_snapshot",
            )?;
            let mut item = PROCESSENTRY32W {
                dwSize: size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };
            let mut found = Process32FirstW(snapshot.0, &mut item);
            let own = GetCurrentProcessId();
            while found != 0 {
                if item.th32ProcessID == own {
                    return Ok(item.th32ParentProcessID);
                }
                found = Process32NextW(snapshot.0, &mut item);
            }
        }
        Err("guardian_parent_missing")
    }
    fn created(process: HANDLE) -> Result<u64, &'static str> {
        let mut start = FILETIME::default();
        let mut exit = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        // SAFETY: Caller holds a valid process handle; output buffers are initialized.
        if unsafe { GetProcessTimes(process, &mut start, &mut exit, &mut kernel, &mut user) } == 0 {
            return Err("guardian_process_creation");
        }
        Ok((u64::from(start.dwHighDateTime) << 32) | u64::from(start.dwLowDateTime))
    }
    pub fn run(c: &Settings) -> Result<(), &'static str> {
        if actual_parent()? != c.parent_pid {
            return Err("guardian_parent_mismatch");
        }
        // SAFETY: Handles are owned by RAII, structures have the exact API size,
        // and the parent identity is fenced by PPID, creation time and a live handle.
        unsafe {
            let parent = Handle::take(
                OpenProcess(
                    PROCESS_SET_QUOTA
                        | PROCESS_TERMINATE
                        | PROCESS_QUERY_LIMITED_INFORMATION
                        | PROCESS_SYNCHRONIZE,
                    0,
                    c.parent_pid,
                ),
                "guardian_parent_open",
            )?;
            let parent_created = created(parent.0)?;
            if parent_created > created(GetCurrentProcess())?
                || WaitForSingleObject(parent.0, 0) != WAIT_TIMEOUT
            {
                return Err("guardian_parent_not_current");
            }
            // Anonymous job, default security and non-inheritable handle. Never
            // enable either breakaway flag, and never pass this handle to children.
            let job = Handle::take(
                CreateJobObjectW(ptr::null(), ptr::null()),
                "guardian_job_create",
            )?;
            let mut flags = 0;
            if GetHandleInformation(job.0, &mut flags) == 0 || flags & HANDLE_FLAG_INHERIT != 0 {
                return Err("guardian_job_handle_inheritable");
            }
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job.0,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
            {
                return Err("guardian_job_limits");
            }
            if AssignProcessToJobObject(job.0, parent.0) == 0 {
                return Err("guardian_job_assignment");
            }
            let mut member = 0;
            let mut own_member = 0;
            let mut observed = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            if IsProcessInJob(parent.0, job.0, &mut member) == 0
                || member == 0
                || IsProcessInJob(GetCurrentProcess(), job.0, &mut own_member) == 0
                || own_member != 0
                || QueryInformationJobObject(
                    job.0,
                    JobObjectExtendedLimitInformation,
                    &mut observed as *mut _ as *mut _,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                    ptr::null_mut(),
                ) == 0
                || observed.BasicLimitInformation.LimitFlags != JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            {
                return Err("guardian_job_verification");
            }
            let ack = serde_json::json!({
                "schema_version": 1,
                "kind": "windows_job",
                "parent_pid": c.parent_pid,
                "guardian_pid": GetCurrentProcessId(),
                "boot_id": c.boot_id,
                "parent_created_100ns": parent_created.to_string(),
                "kill_on_close": true,
                "breakaway_allowed": false,
            });
            writeln!(io::stdout().lock(), "{ack}").map_err(|_| "guardian_ack_write")?;
            io::stdout().flush().map_err(|_| "guardian_ack_flush")?;
            if WaitForSingleObject(parent.0, INFINITE) != WAIT_OBJECT_0 {
                return Err("guardian_parent_wait");
            }
            // The parent has exited. Closing the sole job handle ends its normal
            // CreateProcess descendants, including children it failed to clean up.
            drop(job);
        }
        Ok(())
    }
}
fn main() {
    let result: Result<(), &'static str> = settings(&std::env::args().skip(1).collect::<Vec<_>>())
        .and_then(|c| {
            #[cfg(windows)]
            {
                windows::run(&c)
            }
            #[cfg(not(windows))]
            {
                let _ = c;
                Err("guardian_platform_not_supported")
            }
        });
    if let Err(code) = result {
        let _ = writeln!(io::stderr(), "{}", serde_json::json!({ "error": code }));
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args(pid: &str, boot: &str) -> Vec<String> {
        ["--parent-pid", pid, "--boot-id", boot]
            .map(String::from)
            .to_vec()
    }
    #[test]
    fn explicit_positive_pid_and_canonical_boot_are_required() {
        let boot = "82ef5e77-c819-43b1-868c-6d6231735ac2";
        assert_eq!(settings(&args("123", boot)).unwrap().parent_pid, 123);
        for pid in ["0", "-1", "4294967296", "arbitrary"] {
            assert_eq!(settings(&args(pid, boot)), Err("guardian_parent_pid"));
        }
        for boot in [
            "",
            "private\nvalue",
            "../../job",
            "82ef5e77_C819-43b1-868c-6d6231735ac2",
        ] {
            assert_eq!(settings(&args("123", boot)), Err("guardian_boot_id"));
        }
    }
    #[test]
    fn unknown_options_and_implicit_targets_are_rejected() {
        assert_eq!(settings(&[]), Err("guardian_arguments"));
        let mut a = args("123", "82ef5e77-c819-43b1-868c-6d6231735ac2");
        a.push("--allow-breakaway".into());
        assert_eq!(settings(&a), Err("guardian_arguments"));
        a.remove(4);
        a[0] = "--arbitrary-pid".into();
        assert_eq!(settings(&a), Err("guardian_arguments"));
    }
}
