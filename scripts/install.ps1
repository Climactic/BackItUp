# BackItUp Install Script for Windows
# Usage:
#   Install latest:  irm https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.ps1 | iex
#   Install version: $env:BACKITUP_VERSION="v1.0.0"; irm https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.ps1 | iex
#   Uninstall:       $env:BACKITUP_ACTION="uninstall"; irm https://raw.githubusercontent.com/climactic/backitup/main/scripts/install.ps1 | iex

param(
    [string]$Version = $env:BACKITUP_VERSION,
    [string]$InstallDir = $env:BACKITUP_INSTALL_DIR,
    [switch]$Uninstall = ($env:BACKITUP_ACTION -eq "uninstall")
)

$ErrorActionPreference = "Stop"

$Repo = "climactic/backitup"
$BinaryName = "backitup"

function Write-Info { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Green }
function Write-Warn { param($Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Err { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

function Get-FileWithProgress {
    param(
        [string]$Url,
        [string]$OutFile,
        [string]$Activity = "Downloading"
    )

    # Use HttpClient for streaming download with progress
    $httpClient = New-Object System.Net.Http.HttpClient
    $httpClient.Timeout = [TimeSpan]::FromMinutes(10)

    try {
        $response = $httpClient.GetAsync($Url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).Result
        $response.EnsureSuccessStatusCode() | Out-Null

        $totalBytes = $response.Content.Headers.ContentLength
        $stream = $response.Content.ReadAsStreamAsync().Result
        $fileStream = [System.IO.File]::Create($OutFile)

        try {
            $buffer = New-Object byte[] 8192
            $totalRead = 0
            $lastPercent = -1

            do {
                $read = $stream.Read($buffer, 0, $buffer.Length)
                if ($read -gt 0) {
                    $fileStream.Write($buffer, 0, $read)
                    $totalRead += $read

                    if ($totalBytes -and $totalBytes -gt 0) {
                        $percent = [math]::Floor(($totalRead / $totalBytes) * 100)
                        if ($percent -ne $lastPercent) {
                            $receivedMB = [math]::Round($totalRead / 1MB, 2)
                            $totalMB = [math]::Round($totalBytes / 1MB, 2)
                            Write-Progress -Activity $Activity -Status "$receivedMB MB / $totalMB MB" -PercentComplete $percent
                            $lastPercent = $percent
                        }
                    }
                }
            } while ($read -gt 0)

            Write-Progress -Activity $Activity -Completed
        } finally {
            $fileStream.Close()
            $stream.Close()
        }
    } finally {
        $httpClient.Dispose()
    }
}

function Get-LatestVersion {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    return $response.tag_name
}

function Get-InstallDirectory {
    if ($InstallDir) {
        return $InstallDir
    }

    $defaultDir = Join-Path $env:LOCALAPPDATA "Programs\backitup"
    if (-not (Test-Path $defaultDir)) {
        New-Item -ItemType Directory -Path $defaultDir -Force | Out-Null
    }
    return $defaultDir
}

function Get-Checksum {
    param($FilePath)
    $hash = Get-FileHash -Path $FilePath -Algorithm SHA256
    return $hash.Hash.ToLower()
}

function Find-Binary {
    $locations = @(
        (Join-Path $env:LOCALAPPDATA "Programs\backitup\$BinaryName.exe"),
        (Join-Path $env:USERPROFILE "bin\$BinaryName.exe")
    )

    if ($InstallDir) {
        $locations = @((Join-Path $InstallDir "$BinaryName.exe")) + $locations
    }

    foreach ($loc in $locations) {
        if (Test-Path $loc) {
            return $loc
        }
    }

    # Try PATH
    $cmd = Get-Command $BinaryName -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    return $null
}

function Install-BackItUp {
    Write-Info "Installing BackItUp..."

    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else {
        Write-Err "Only 64-bit Windows is supported"
        exit 1
    }
    Write-Info "Detected: windows-$arch"

    $version = if ($Version) { $Version } else { Get-LatestVersion }
    Write-Info "Version: $version"

    $installDir = Get-InstallDirectory
    Write-Info "Install directory: $installDir"

    $artifactName = "$BinaryName-windows-$arch.exe"
    $downloadUrl = "https://github.com/$Repo/releases/download/$version/$artifactName"
    $checksumUrl = "$downloadUrl.sha256"

    $tmpDir = Join-Path $env:TEMP "backitup-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

    try {
        $binaryPath = Join-Path $tmpDir "$BinaryName.exe"
        $checksumPath = Join-Path $tmpDir "checksum.sha256"

        Write-Info "Downloading $artifactName..."
        Get-FileWithProgress -Url $downloadUrl -OutFile $binaryPath -Activity "Downloading $artifactName"

        Write-Info "Downloading checksum..."
        Invoke-WebRequest -Uri $checksumUrl -OutFile $checksumPath -UseBasicParsing

        $expectedChecksum = (Get-Content $checksumPath).Split(" ")[0].Trim()
        $actualChecksum = Get-Checksum $binaryPath

        if ($actualChecksum -ne $expectedChecksum) {
            Write-Err "Checksum verification failed!"
            Write-Err "Expected: $expectedChecksum"
            Write-Err "Got: $actualChecksum"
            exit 1
        }
        Write-Info "Checksum verified"

        $destPath = Join-Path $installDir "$BinaryName.exe"
        Move-Item -Path $binaryPath -Destination $destPath -Force

        Write-Info "BackItUp installed successfully to $destPath"

        # Check if install directory is in PATH
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($userPath -notlike "*$installDir*") {
            Write-Warn "$installDir is not in your PATH"
            $addToPath = Read-Host "Add to PATH? (y/n)"
            if ($addToPath -eq "y") {
                $newPath = "$userPath;$installDir"
                [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
                $env:Path = "$env:Path;$installDir"
                Write-Info "Added to PATH. Restart your terminal for changes to take effect."
            }
        }

        Write-Info "Testing installation..."
        & $destPath --version
    }
    finally {
        Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Uninstall-BackItUp {
    Write-Info "Uninstalling BackItUp..."

    $binaryPath = Find-Binary
    if (-not $binaryPath) {
        Write-Err "BackItUp is not installed or could not be found"
        exit 1
    }

    Write-Info "Found binary at: $binaryPath"

    Remove-Item -Path $binaryPath -Force

    # Try to remove the directory if empty
    $dir = Split-Path $binaryPath
    if ((Get-ChildItem $dir | Measure-Object).Count -eq 0) {
        Remove-Item -Path $dir -Force -ErrorAction SilentlyContinue
    }

    Write-Info "BackItUp has been uninstalled"
}

# Main
if ($Uninstall) {
    Uninstall-BackItUp
} else {
    Install-BackItUp
}
