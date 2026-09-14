param([string]$OutputPath = "docs/execution/evidence/hardware-inventory.json")
$ErrorActionPreference = 'Stop'
$cpu = Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors
$system = Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory
$os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber
$gpu = & nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,memory.free,compute_cap --format=csv,noheader,nounits
$disk = Get-PSDrive -Name C | Select-Object Used,Free
$report = [ordered]@{
    evidence_type = 'MEASURED_LOCAL'
    observed_at_utc = [DateTime]::UtcNow.ToString('o')
    cpu = $cpu
    ram = $system
    os = $os
    gpu_csv_fields = 'name,driver_version,total_mib,used_mib,free_mib,compute_capability'
    gpu = @($gpu)
    disk_c_bytes = $disk
    versions = [ordered]@{
        python = (& py -3.12 --version)
        rustc = (& rustc --version)
        cargo = (& cargo --version)
        node = (& node --version)
        git = (& git --version)
        wsl_kernel = (& wsl -d Ubuntu --exec uname -r)
    }
    physical_hosts = 1
    other_gpu_applications_present = $true
    hardware_uniqueness_or_ownership_attested = $false
}
$parent = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Output $OutputPath
