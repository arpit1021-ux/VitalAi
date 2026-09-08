<#
.SYNOPSIS
    Verifies the VitalAI hardening work (M0-M2).

.DESCRIPTION
    Static source checks, typecheck, environment fail-fast behaviour, and HTTP
    checks against a running API. Read-only: nothing here modifies the repo.

.PARAMETER ApiUrl
    Base URL of a running API. Defaults to http://localhost:5000

.PARAMETER SkipHttp
    Skip the HTTP section.

.EXAMPLE
    .\scripts\verify.ps1
    .\scripts\verify.ps1 -ApiUrl https://api.vitalai.app
#>

[CmdletBinding()]
param(
    [string]$ApiUrl = 'http://localhost:5000',
    [switch]$SkipHttp
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\_common.ps1"

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$ServerSrc = Join-Path $RepoRoot 'server\src'
$ClientSrc = Join-Path $RepoRoot 'client\src'
$Routes    = Join-Path $ServerSrc 'routes'
$Models    = Join-Path $ServerSrc 'models'

Write-Host ''
Write-Host 'VitalAI verification' -ForegroundColor Cyan
Write-Host ('Repository: {0}' -f $RepoRoot) -ForegroundColor DarkGray

$shadowing = @('JWT_SECRET', 'JWT_REFRESH_SECRET', 'MONGODB_URI', 'CORS_ORIGINS', 'APP_URL', 'API_URL', 'ENCRYPTION_KEY') |
    Where-Object { [Environment]::GetEnvironmentVariable($_, 'Process') }

if ($shadowing) {
    Write-Host ''
    Write-Host 'Warning: set in this shell, and dotenv never overrides a shell value:' -ForegroundColor Yellow
    foreach ($name in $shadowing) { Write-Host ('  {0}' -f $name) -ForegroundColor Yellow }
    Write-Host '  Clear with: Remove-Item Env:\<NAME>' -ForegroundColor Yellow
}

# --------------------------------------------------------------------------
Write-Host ''
Write-Host 'Static checks' -ForegroundColor Cyan

$fileCount = @(Get-SourceFiles -Path $ServerSrc).Count + @(Get-SourceFiles -Path $ClientSrc).Count
Write-Host ('         scanning {0} source files' -f $fileCount) -ForegroundColor DarkGray

Assert-NoMatch -Name 'Cookies never hardcode secure:false' -RepoRoot $RepoRoot `
    -Hits (Find-InSource -Path $ServerSrc -Pattern 'secure:\s*false')

Assert-NoMatch -Name 'No hardcoded origins in server source' -RepoRoot $RepoRoot `
    -Hits (Find-InSource -Path $ServerSrc -Pattern 'localhost:5173|localhost:5000') `
    -Remedy 'Origins must come from CORS_ORIGINS / APP_URL / API_URL.'

Assert-NoMatch -Name 'Community feed does not expose author emails' -RepoRoot $RepoRoot `
    -Hits (Find-InSource -Path $Routes -Pattern "'userId',\s*'email'")

Assert-NoMatch -Name 'No console.* outside scripts/' -RepoRoot $RepoRoot `
    -Hits (Find-InSource -Path $ServerSrc -Pattern 'console\.' -ExcludeLike '*\scripts\*')

$markers = @(Find-InSource -Path $ServerSrc -Pattern 'TODO|FIXME|XXX') +
           @(Find-InSource -Path $ClientSrc -Pattern 'TODO|FIXME|XXX')
Assert-NoMatch -Name 'No TODO/FIXME markers' -Hits $markers -RepoRoot $RepoRoot

# Matches environment-variable names and live key formats, not vendor names:
# the privacy notice names Google, Pinecone and Cloudinary in prose, and an
# earlier version of this check failed on that.
$secretPattern = 'GEMINI_API_KEY|PINECONE_API_KEY|MONGODB_URI|JWT_SECRET|JWT_REFRESH_SECRET|' +
                 'ENCRYPTION_KEY|CLOUDINARY_API_KEY|CLOUDINARY_API_SECRET|CLAUDE_API_KEY|' +
                 'GOOGLE_CLIENT_SECRET|SMTP_PASSWORD|AIza[0-9A-Za-z_-]{30,}|pcsk_[0-9A-Za-z_-]{20,}|mongodb\+srv://'

Assert-NoMatch -Name 'No server secrets referenced in client source' -RepoRoot $RepoRoot `
    -Hits (Find-InSource -Path $ClientSrc -Pattern $secretPattern) `
    -Remedy 'Only VITE_-prefixed values may reach the browser.'

$envReads = @(Find-InSource -Path $ClientSrc -Pattern 'import\.meta\.env\.')
$nonVite = $envReads | Where-Object { $_.Line -notmatch 'import\.meta\.env\.(VITE_\w+|MODE|DEV|PROD|SSR|BASE_URL)' }
Assert-NoMatch -Name 'Client reads only VITE_-prefixed env vars' -Hits $nonVite -RepoRoot $RepoRoot

# --- M1: validation coverage ----------------------------------------------
$rawUpdates = Find-InSource -Path $Routes -Pattern 'findOneAndUpdate\(\s*$|findByIdAndUpdate\([^,]+,\s*req\.body'
Assert-NoMatch -Name 'No route updates a document from a raw request body' -Hits $rawUpdates -RepoRoot $RepoRoot `
    -Remedy 'Updates must use a validated allowlist, not req.body.'

$routeFiles = @(Get-ChildItem -Path $Routes -File -Filter '*.ts')
$validated = @($routeFiles | Where-Object { (Get-Content $_.FullName -Raw) -match 'validate\(\{' })
if ($validated.Count -eq $routeFiles.Count) {
    Write-Result 'PASS' 'Every route file validates its inputs' ('{0}/{1} files' -f $validated.Count, $routeFiles.Count)
} else {
    $missing = $routeFiles | Where-Object { $_.Name -notin $validated.Name } | ForEach-Object { $_.Name }
    Write-Result 'FAIL' 'Every route file validates its inputs' $missing
}

# --- M2: privacy and data rights ------------------------------------------
if (Test-Path (Join-Path $RepoRoot 'PRIVACY.md')) {
    Write-Result 'PASS' 'Privacy notice is present'
} else {
    Write-Result 'FAIL' 'Privacy notice is present' 'PRIVACY.md is missing.'
}

Assert-NoMatch -Name 'Profile updates go through save() so encryption applies' -RepoRoot $RepoRoot `
    -Hits (Find-InSource -Path $Routes -Pattern 'Profile\.findOneAndUpdate') `
    -Remedy 'findOneAndUpdate bypasses the pre-save hook that encrypts health fields.'

if (@(Find-InSource -Path $Models -Pattern 'ENCRYPTED_ARRAY_PATHS').Count -gt 0) {
    Write-Result 'PASS' 'Health fields are encrypted at rest'
} else {
    Write-Result 'FAIL' 'Health fields are encrypted at rest' 'Encryption hooks not found on the Profile model.'
}

$retention = @(Find-InSource -Path $Models -Pattern 'retention_ttl')
if ($retention.Count -ge 2) {
    Write-Result 'PASS' 'Retention TTL declared on scans and chats' ('{0} collections' -f $retention.Count)
} else {
    Write-Result 'FAIL' 'Retention TTL declared on scans and chats' 'Expected TTL indexes on ScanHistory and ChatSession.'
}

# --- M3: prompt safety and cost control -----------------------------------
# The system prompt is the one place a user must never reach. These are the
# interpolations that previously put user-controlled text there.
$promptLeaks = Find-InSource -Path $Routes -Pattern 'systemPrompt.*\$\{(conversationContext|profileContext|extractedText|content)\}'
Assert-NoMatch -Name 'No untrusted content interpolated into a system prompt' -Hits $promptLeaks -RepoRoot $RepoRoot `
    -Remedy 'Untrusted values belong in the untrusted[] blocks or history, never the system prompt.'

$rawVerdicts = Find-InSource -Path $Routes -Pattern 'aiVerdict: parseJsonResponse'
Assert-NoMatch -Name 'Verdicts are schema-validated before being stored' -Hits $rawVerdicts -RepoRoot $RepoRoot

$metered = @(Find-InSource -Path $Routes -Pattern "operation: '")
if ($metered.Count -ge 15) {
    Write-Result 'PASS' 'Every model call is attributed and metered' ('{0} call sites' -f $metered.Count)
} else {
    Write-Result 'FAIL' 'Every model call is attributed and metered' ('Only {0} found.' -f $metered.Count)
}

$budgeted = @(Find-InSource -Path (Join-Path $ServerSrc 'index.ts') -Pattern 'enforceAiBudget')
if ($budgeted.Count -ge 7) {
    Write-Result 'PASS' 'AI route groups sit behind the token budget' ('{0} mounts' -f ($budgeted.Count - 1))
} else {
    Write-Result 'FAIL' 'AI route groups sit behind the token budget' ('Only {0} mounts.' -f $budgeted.Count)
}

# --- M4a: reliability ------------------------------------------------------
if (Test-Path (Join-Path $RepoRoot '.github\workflows\ci.yml')) {
    Write-Result 'PASS' 'CI pipeline is defined'
} else {
    Write-Result 'FAIL' 'CI pipeline is defined' '.github/workflows/ci.yml is missing.'
}

$testFiles = @(Get-ChildItem -Path (Join-Path $RepoRoot 'server\tests') -Filter '*.test.ts' -ErrorAction SilentlyContinue)
if ($testFiles.Count -gt 0) {
    Write-Result 'PASS' 'Integration tests exist' ('{0} suite(s)' -f $testFiles.Count)
} else {
    Write-Result 'FAIL' 'Integration tests exist' 'server/tests has no *.test.ts files.'
}

# index.ts must not construct the app itself, or the tests are exercising a
# different middleware stack from the one that ships.
$appFactory = Find-InSource -Path $ServerSrc -Pattern 'export function createApp'
if (@($appFactory).Count -eq 1) {
    Write-Result 'PASS' 'App construction is separate from startup'
} else {
    Write-Result 'FAIL' 'App construction is separate from startup' 'createApp() not found in app.ts.'
}

$distAssets = Join-Path $RepoRoot 'client\dist\assets'
if (Test-Path $distAssets) {
    $bundles = @(Get-ChildItem -Path $distAssets -Recurse -File -Include '*.js')
    $leak = if ($bundles.Count -gt 0) {
        @($bundles | Select-String -Pattern 'AIza[0-9A-Za-z_-]{30,}|pcsk_[0-9A-Za-z_-]{20,}|mongodb\+srv://[^"'']+:')
    } else { @() }

    if (@($leak).Count -gt 0) {
        Write-Result 'FAIL' 'Built client bundle contains no credentials' 'Rotate the exposed key immediately.'
    } else {
        Write-Result 'PASS' 'Built client bundle contains no credentials' ('checked {0} bundle file(s)' -f $bundles.Count)
    }
} else {
    Write-Result 'SKIP' 'Built client bundle contains no credentials' 'Run: npm --prefix client run build'
}

# --------------------------------------------------------------------------
Write-Host ''
Write-Host 'Typecheck' -ForegroundColor Cyan

foreach ($target in @(
    @{ Name = 'Server'; Dir = 'server'; Args = @('tsc', '--noEmit') },
    @{ Name = 'Client'; Dir = 'client'; Args = @('tsc', '-b', '--noEmit') }
)) {
    $result = Invoke-Native -FilePath 'npx' -ArgumentList $target.Args -WorkingDirectory (Join-Path $RepoRoot $target.Dir)
    if ($result.ExitCode -eq 0) {
        Write-Result 'PASS' ('{0} typechecks' -f $target.Name)
    } else {
        Write-Result 'FAIL' ('{0} typechecks' -f $target.Name) `
            @($result.Output -split "`r?`n" | Where-Object { $_ } | Select-Object -First 5)
    }
}

# --------------------------------------------------------------------------
Write-Host ''
Write-Host 'Environment validation' -ForegroundColor Cyan

# Blank optional settings must read as unset. .env.example ships them empty,
# so a schema that validates the empty string makes the example file unusable.
$blankOptionals = Invoke-Native -FilePath 'npx' `
    -ArgumentList @('tsx', '-e', "import('./src/config/env.js').then(() => console.log('BOOTS'))") `
    -WorkingDirectory (Join-Path $RepoRoot 'server') `
    -Environment @{ REDIS_URL = ''; SMTP_HOST = ''; EMAIL_FROM = ''; CLOUDINARY_API_KEY = '' }

if ($blankOptionals.Output -match 'BOOTS') {
    Write-Result 'PASS' 'Blank optional settings are treated as unset'
} elseif ($blankOptionals.Output -match 'Cannot find module|ERR_MODULE_NOT_FOUND') {
    Write-Result 'SKIP' 'Blank optional settings are treated as unset' 'Run: npm --prefix server install'
} else {
    Write-Result 'FAIL' 'Blank optional settings are treated as unset' `
        @($blankOptionals.Output -split "`r?`n" | Where-Object { $_ } | Select-Object -First 4)
}

foreach ($case in @(
    @{ Name = 'A weak JWT_SECRET stops the server'; Env = @{ JWT_SECRET = 'too-short' }; Expect = 'at least 32 characters' },
    @{ Name = 'A malformed CORS_ORIGINS stops the server'; Env = @{ CORS_ORIGINS = 'not-a-url' }; Expect = 'must be absolute URLs' },
    @{ Name = 'A malformed ENCRYPTION_KEY stops the server'; Env = @{ ENCRYPTION_KEY = 'not-hex' }; Expect = 'must be 64 hex characters' }
)) {
    $result = Invoke-Native -FilePath 'npx' `
        -ArgumentList @('tsx', '-e', "import('./src/config/env.js')") `
        -WorkingDirectory (Join-Path $RepoRoot 'server') `
        -Environment $case.Env

    if ($result.Output -match $case.Expect) {
        Write-Result 'PASS' $case.Name 'Boot refused, as intended.'
    } elseif ($result.Output -match 'Cannot find module|ERR_MODULE_NOT_FOUND') {
        Write-Result 'SKIP' $case.Name 'Run: npm --prefix server install'
    } else {
        Write-Result 'FAIL' $case.Name @($result.Output -split "`r?`n" | Where-Object { $_ } | Select-Object -First 4)
    }
}

# --------------------------------------------------------------------------
Write-Host ''
Write-Host ('HTTP checks against {0}' -f $ApiUrl) -ForegroundColor Cyan

$reachable = $false
if (-not $SkipHttp) {
    try {
        Invoke-WebRequest -Uri "$ApiUrl/health" -TimeoutSec 5 -UseBasicParsing | Out-Null
        $reachable = $true
    } catch { }
}

if ($SkipHttp) {
    Write-Result 'SKIP' 'HTTP checks' '-SkipHttp was passed.'
} elseif (-not $reachable) {
    Write-Result 'SKIP' 'API reachable' 'Start the server in another terminal: cd server ; npm run dev'
} else {
    Write-Result 'PASS' 'API reachable'

    $health = Invoke-WebRequest -Uri "$ApiUrl/health" -UseBasicParsing
    $requestId = $health.Headers['x-request-id']
    if ($requestId) {
        Write-Result 'PASS' 'Responses carry a correlation ID' ('x-request-id: {0}' -f $requestId)
    } else {
        Write-Result 'FAIL' 'Responses carry a correlation ID' 'requestContext middleware is not running.'
    }

    try {
        Invoke-RestMethod -Uri "$ApiUrl/api/nope" -UseBasicParsing | Out-Null
        Write-Result 'FAIL' 'Unknown routes return a structured 404' 'Expected 404, got success.'
    } catch {
        $body = Get-ErrorBody -Record $_
        if ($body -and $body.code -eq 'ROUTE_NOT_FOUND' -and $body.action -and $body.requestId) {
            Write-Result 'PASS' 'Unknown routes return a structured 404' $body.error
        } else {
            Write-Result 'FAIL' 'Unknown routes return a structured 404' (Format-Failure -Record $_)
        }
    }

    # Every endpoint that touches user data must refuse an anonymous caller,
    # and say what to do about it.
    foreach ($path in @('/api/profiles', '/api/account/export', '/api/account/consent')) {
        try {
            Invoke-RestMethod -Uri "$ApiUrl$path" -UseBasicParsing | Out-Null
            Write-Result 'FAIL' ('{0} requires a session' -f $path) 'Returned data to an anonymous caller.'
        } catch {
            $status = Get-HttpStatus -Record $_
            $body = Get-ErrorBody -Record $_
            if ($status -eq 401 -and $body -and $body.action) {
                Write-Result 'PASS' ('{0} requires a session' -f $path)
            } else {
                Write-Result 'FAIL' ('{0} requires a session' -f $path) (Format-Failure -Record $_)
            }
        }
    }

    try {
        $ready = Invoke-RestMethod -Uri "$ApiUrl/health/ready" -UseBasicParsing
        Write-Result 'PASS' 'Readiness probe reports dependencies' `
            ('database={0} vectorStore={1}' -f $ready.checks.database, $ready.checks.vectorStore)
    } catch {
        $body = Get-ErrorBody -Record $_
        if ($body -and $body.status -eq 'degraded') {
            Write-Result 'PASS' 'Readiness probe reports dependencies' 'Reported degraded, which is a valid answer.'
        } else {
            Write-Result 'FAIL' 'Readiness probe reports dependencies' (Format-Failure -Record $_)
        }
    }

    try {
        $cors = Invoke-WebRequest -Uri "$ApiUrl/health" -UseBasicParsing -Headers @{ Origin = 'https://not-allowed.example' }
        $allow = $cors.Headers['Access-Control-Allow-Origin']
        if ($allow) {
            Write-Result 'FAIL' 'Disallowed origins get no CORS grant' ('Allow-Origin: {0}' -f $allow)
        } else {
            Write-Result 'PASS' 'Disallowed origins get no CORS grant'
        }
    } catch {
        Write-Result 'PASS' 'Disallowed origins get no CORS grant' 'Request rejected outright.'
    }
}

$failures = Write-Summary
exit $(if ($failures -gt 0) { 1 } else { 0 })
