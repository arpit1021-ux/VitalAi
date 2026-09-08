<#
    Shared helpers for the VitalAI verification scripts.

    These live in one file because the same two Windows PowerShell quirks bit
    both scripts independently:

      * Invoke-RestMethod consumes the response stream before the exception
        surfaces, so reading GetResponseStream() yields nothing and every error
        body comes back empty. ErrorDetails.Message carries it instead.

      * `try` is a statement, not an expression, in PowerShell 5.1, so it
        cannot be used inline inside a subexpression.

    Dot-source this file: . "$PSScriptRoot\_common.ps1"
#>

Set-Variable -Name VitalAIResults -Scope Script -Value ([pscustomobject]@{
    Passed  = 0
    Failed  = 0
    Skipped = 0
}) -Force

function Write-Result {
    param(
        [ValidateSet('PASS', 'FAIL', 'SKIP')][string]$Status,
        [string]$Name,
        [string[]]$Detail
    )

    $colour = switch ($Status) { 'PASS' { 'Green' } 'FAIL' { 'Red' } default { 'DarkGray' } }
    Write-Host ('  [{0}] ' -f $Status) -ForegroundColor $colour -NoNewline
    Write-Host $Name
    foreach ($line in $Detail) {
        if ($line) { Write-Host ('         {0}' -f $line) -ForegroundColor DarkGray }
    }

    switch ($Status) {
        'PASS' { $script:VitalAIResults.Passed++ }
        'FAIL' { $script:VitalAIResults.Failed++ }
        default { $script:VitalAIResults.Skipped++ }
    }
}

function Write-Summary {
    Write-Host ''
    $results = $script:VitalAIResults
    $colour = if ($results.Failed -gt 0) { 'Red' } else { 'Green' }
    Write-Host ('{0} passed, {1} failed, {2} skipped' -f $results.Passed, $results.Failed, $results.Skipped) `
        -ForegroundColor $colour
    Write-Host ''
    $results.Failed
}

<# HTTP status from a terminating web error. Returns 0 when unavailable. #>
function Get-HttpStatus {
    param($Record)
    try { [int]$Record.Exception.Response.StatusCode } catch { 0 }
}

<# Parsed JSON body of a failed request, or $null. #>
function Get-ErrorBody {
    param($Record)

    $raw = $null
    if ($Record.ErrorDetails -and $Record.ErrorDetails.Message) {
        $raw = $Record.ErrorDetails.Message
    } else {
        try {
            $reader = New-Object System.IO.StreamReader($Record.Exception.Response.GetResponseStream())
            $raw = $reader.ReadToEnd()
        } catch { }
    }

    if (-not $raw) { return $null }
    try { $raw | ConvertFrom-Json } catch { [pscustomobject]@{ error = $raw } }
}

<# Status, message and correlation id, so a failure can be traced to a log line. #>
function Format-Failure {
    param($Record, [string]$Context)

    $status = Get-HttpStatus -Record $Record
    $body = Get-ErrorBody -Record $Record

    $lines = @()
    if ($Context) { $lines += $Context }
    $lines += ('HTTP {0}{1}' -f $status, $(if ($body.code) { " $($body.code)" } else { '' }))
    if ($body.error) { $lines += $body.error }
    if ($body.action) { $lines += $body.action }
    if ($body.fields) {
        foreach ($field in $body.fields.PSObject.Properties) {
            $lines += ('field {0}: {1}' -f $field.Name, $field.Value)
        }
    }
    if ($body.requestId) { $lines += ('requestId {0} — grep the server log for this' -f $body.requestId) }
    if (-not $body) { $lines += ('No response body. Exception: {0}' -f $Record.Exception.Message) }
    $lines
}

<#
    Runs a native command, returning combined output and exit code.

    PowerShell turns native stderr into a terminating error while
    $ErrorActionPreference is 'Stop'; several commands here write to stderr by
    design. Environment overrides are restored in finally, so a crash cannot
    leave a stale variable shadowing server\.env in the caller's session.
#>
function Invoke-Native {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory,
        [hashtable]$Environment = @{}
    )

    $previousPreference = $ErrorActionPreference
    $previousValues = @{}
    $location = Get-Location

    try {
        $ErrorActionPreference = 'Continue'

        foreach ($key in $Environment.Keys) {
            $previousValues[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            [Environment]::SetEnvironmentVariable($key, $Environment[$key], 'Process')
        }

        if ($WorkingDirectory) { Set-Location $WorkingDirectory }

        $output = & $FilePath @ArgumentList 2>&1 | Out-String
        [pscustomobject]@{ Output = $output; ExitCode = $LASTEXITCODE }
    } finally {
        foreach ($key in $previousValues.Keys) {
            [Environment]::SetEnvironmentVariable($key, $previousValues[$key], 'Process')
        }
        Set-Location $location
        $ErrorActionPreference = $previousPreference
    }
}

# PowerShell 5.1 has no recursive ** glob, so the tree is walked explicitly.
function Get-SourceFiles {
    param([string]$Path, [string[]]$Include = @('*.ts', '*.tsx'))

    if (-not (Test-Path $Path)) { return }

    Get-ChildItem -Path $Path -Recurse -File -Include $Include |
        Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\dist\\' }
}

function Find-InSource {
    param([string]$Path, [string]$Pattern, [string]$ExcludeLike)

    $files = Get-SourceFiles -Path $Path
    if ($ExcludeLike) { $files = $files | Where-Object { $_.FullName -notlike $ExcludeLike } }
    if (-not $files) { return }

    $files | Select-String -Pattern $Pattern
}

function Assert-NoMatch {
    param([string]$Name, $Hits, [string]$Remedy, [string]$RepoRoot)

    # Only Select-String results carry Path and LineNumber; filtering on the
    # type keeps a stray null or nested array from reaching the formatter.
    $found = @($Hits) | Where-Object { $_ -is [Microsoft.PowerShell.Commands.MatchInfo] }
    $count = @($found).Count

    if ($count -eq 0) {
        Write-Result 'PASS' $Name
        return
    }

    $detail = @($found | Select-Object -First 4 | ForEach-Object {
        $relative = $_.Path
        if ($RepoRoot -and $relative.StartsWith($RepoRoot)) {
            $relative = $relative.Substring($RepoRoot.Length).TrimStart('\')
        }
        '{0}:{1}' -f $relative, $_.LineNumber
    })

    if ($count -gt 4) { $detail += '...and {0} more' -f ($count - 4) }
    if ($Remedy) { $detail += $Remedy }

    Write-Result 'FAIL' $Name $detail
}
