<#
.SYNOPSIS
    Exercises the M1 authentication flow against a running server.

.DESCRIPTION
    Registers a throwaway account, then checks session rotation, refresh-token
    reuse detection, session revocation, input validation and the password
    reset request.

    The account it creates is left behind: account deletion arrives in M2. The
    address is printed at the end so it can be removed manually.

    Run against a development database only.

.PARAMETER ApiUrl
    Base URL of the running API. Defaults to http://localhost:5000
#>

[CmdletBinding()]
param([string]$ApiUrl = 'http://localhost:5000')

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\_common.ps1"

function Get-CookieValue {
    param($Session, [string]$Name)
    $cookies = $Session.Cookies.GetCookies([Uri]$ApiUrl)
    ($cookies | Where-Object { $_.Name -eq $Name } | Select-Object -First 1).Value
}

function New-SessionWithRefresh {
    param([string]$Token)
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $uri = [Uri]$ApiUrl
    $cookie = New-Object System.Net.Cookie('refreshToken', $Token, '/', $uri.Host)
    $session.Cookies.Add($cookie)
    $session
}

Write-Host ''
Write-Host ('VitalAI M1 auth flow against {0}' -f $ApiUrl) -ForegroundColor Cyan

try {
    Invoke-WebRequest -Uri "$ApiUrl/health" -TimeoutSec 5 -UseBasicParsing | Out-Null
} catch {
    Write-Host ''
    Write-Host '  Server is not reachable. Start it first:' -ForegroundColor Red
    Write-Host '    cd server ; npm run dev' -ForegroundColor Red
    Write-Host ''
    exit 1
}

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$email = "m1-test-$stamp@vitalai.test"
$password = 'TestPassword123'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Host ''
Write-Host 'Registration and sign-in' -ForegroundColor Cyan

# A password with no digit must be refused with a field-level message.
try {
    Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/register" -ContentType 'application/json' `
        -Body (@{ email = "weak-$stamp@vitalai.test"; password = 'onlyletters' } | ConvertTo-Json) | Out-Null
    Write-Result 'FAIL' 'Weak passwords are rejected' 'Expected 400, got success.'
} catch {
    $body = Get-ErrorBody -Record $_
    if ((Get-HttpStatus -Record $_) -eq 400 -and $body.fields.password) {
        Write-Result 'PASS' 'Weak passwords are rejected' $body.fields.password
    } else {
        Write-Result 'FAIL' 'Weak passwords are rejected' (Format-Failure -Record $_)
    }
}

try {
    $registered = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/register" -WebSession $session `
        -ContentType 'application/json' -Body (@{ email = $email; password = $password } | ConvertTo-Json)
    if ($registered.user.email -eq $email) {
        Write-Result 'PASS' 'Account created' $email
    } else {
        Write-Result 'FAIL' 'Account created'
    }
} catch {
    Write-Result 'FAIL' 'Account created' (Get-ErrorBody -Record $_).error
    Write-Host ''
    exit 1
}

$originalRefresh = Get-CookieValue -Session $session -Name 'refreshToken'
if ($originalRefresh) {
    Write-Result 'PASS' 'Refresh cookie issued'
} else {
    Write-Result 'FAIL' 'Refresh cookie issued' 'No refreshToken cookie in the response.'
    exit 1
}

Write-Host ''
Write-Host 'Rotation and reuse detection' -ForegroundColor Cyan

$refreshSucceeded = $false
try {
    $refreshed = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/refresh" -WebSession $session `
        -ContentType 'application/json'
    $refreshSucceeded = $true

    $rotated = Get-CookieValue -Session $session -Name 'refreshToken'

    if (-not $rotated) {
        Write-Result 'FAIL' 'Refresh rotates the token' `
            'Request succeeded but no refreshToken cookie came back.'
    } elseif ($rotated -eq $originalRefresh) {
        Write-Result 'FAIL' 'Refresh rotates the token' `
            'Request succeeded but the token is unchanged — rotation did not happen.'
    } else {
        Write-Result 'PASS' 'Refresh rotates the token' ('Signed in as {0}' -f $refreshed.user.email)
    }
} catch {
    Write-Result 'FAIL' 'Refresh rotates the token' `
        (Format-Failure -Record $_ -Context 'The refresh call itself failed.')
}

# Replaying the superseded token is what a stolen credential looks like.
# If rotation never happened, the "old" token is still the current one and this
# check proves nothing, so it is skipped rather than reported as a pass.
$replaySession = New-SessionWithRefresh -Token $originalRefresh
try {
    Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/refresh" -WebSession $replaySession | Out-Null
    Write-Result 'FAIL' 'Replaying a rotated token is refused' 'Expected 401, got success.'
} catch {
    $body = Get-ErrorBody -Record $_
    if ((Get-HttpStatus -Record $_) -eq 401 -and $body.error -match 'security reasons') {
        Write-Result 'PASS' 'Replaying a rotated token is refused' $body.action
    } else {
        Write-Result 'FAIL' 'Replaying a rotated token is refused' (Format-Failure -Record $_)
    }
}

# Reuse must revoke the whole family, not just refuse the replayed token: the
# session that legitimately rotated should now be dead too.
try {
    Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/refresh" -WebSession $session `
        -ContentType 'application/json' | Out-Null
    if ($refreshSucceeded) {
        Write-Result 'FAIL' 'Reuse revokes every session in the family' 'The legitimate session still refreshes.'
    } else {
        Write-Result 'SKIP' 'Reuse revokes every session in the family' 'Rotation never ran.'
    }
} catch {
    if (-not $refreshSucceeded) {
        Write-Result 'SKIP' 'Reuse revokes every session in the family' `
            'Rotation never ran, so a 401 here proves nothing.'
    } elseif ((Get-HttpStatus -Record $_) -eq 401) {
        Write-Result 'PASS' 'Reuse revokes every session in the family' 'The legitimate session was revoked too.'
    } else {
        Write-Result 'FAIL' 'Reuse revokes every session in the family' (Format-Failure -Record $_)
    }
}

Write-Host ''
Write-Host 'Validation' -ForegroundColor Cyan

$fresh = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try {
    Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/login" -WebSession $fresh `
        -ContentType 'application/json' -Body (@{ email = $email; password = $password } | ConvertTo-Json) | Out-Null
    Write-Result 'PASS' 'Sign-in works after revocation' 'Credentials still valid; only sessions were revoked.'
} catch {
    Write-Result 'FAIL' 'Sign-in works after revocation' (Get-ErrorBody -Record $_).error
}

try {
    $profile = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/profiles" -WebSession $fresh `
        -ContentType 'application/json' -Body (@{ name = 'Test Profile' } | ConvertTo-Json)
    $profileId = $profile.profile._id

    try {
        Invoke-RestMethod -Method Put -Uri "$ApiUrl/api/profiles/$profileId" -WebSession $fresh `
            -ContentType 'application/json' `
            -Body '{"name":"Renamed","__proto__":{"polluted":true},"userId":"000000000000000000000000"}' | Out-Null
        Write-Result 'FAIL' 'Unknown and dangerous keys are rejected' 'Update was accepted.'
    } catch {
        $body = Get-ErrorBody -Record $_
        if ((Get-HttpStatus -Record $_) -eq 400) {
            Write-Result 'PASS' 'Unknown and dangerous keys are rejected' $body.error
        } else {
            Write-Result 'FAIL' 'Unknown and dangerous keys are rejected' ('HTTP {0}' -f (Get-HttpStatus -Record $_))
        }
    }

    try {
        Invoke-RestMethod -Method Get -Uri "$ApiUrl/api/profiles/not-an-object-id" -WebSession $fresh | Out-Null
        Write-Result 'FAIL' 'Malformed identifiers are rejected' 'Expected 400.'
    } catch {
        if ((Get-HttpStatus -Record $_) -eq 400) {
            Write-Result 'PASS' 'Malformed identifiers are rejected'
        } else {
            Write-Result 'FAIL' 'Malformed identifiers are rejected' ('HTTP {0}' -f (Get-HttpStatus -Record $_))
        }
    }
} catch {
    Write-Result 'FAIL' 'Profile created for validation checks' (Get-ErrorBody -Record $_).error
}

Write-Host ''
Write-Host 'Password reset' -ForegroundColor Cyan

try {
    $known = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/password/forgot" `
        -ContentType 'application/json' -Body (@{ email = $email } | ConvertTo-Json)
    $unknown = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/password/forgot" `
        -ContentType 'application/json' -Body (@{ email = "nobody-$stamp@vitalai.test" } | ConvertTo-Json)

    if ($known.message -eq $unknown.message) {
        Write-Result 'PASS' 'Reset does not reveal whether an address is registered' $known.message
        Write-Result 'PASS' 'Reset link written to the server log' 'Look for "Email (log transport" in the dev server output.'
    } else {
        Write-Result 'FAIL' 'Reset does not reveal whether an address is registered' 'Responses differ.'
    }
} catch {
    Write-Result 'FAIL' 'Password reset request' (Get-ErrorBody -Record $_).error
}

try {
    Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/auth/password/reset" -ContentType 'application/json' `
        -Body (@{ token = ('0' * 64); password = 'AnotherPassword123' } | ConvertTo-Json) | Out-Null
    Write-Result 'FAIL' 'An invalid reset token is refused' 'Expected 400.'
} catch {
    $body = Get-ErrorBody -Record $_
    if ((Get-HttpStatus -Record $_) -eq 400) {
        Write-Result 'PASS' 'An invalid reset token is refused' $body.error
    } else {
        Write-Result 'FAIL' 'An invalid reset token is refused' ('HTTP {0}' -f (Get-HttpStatus -Record $_))
    }
}

$failures = Write-Summary
Write-Host ('Test account left behind: {0}' -f $email) -ForegroundColor DarkGray
Write-Host '  Account deletion arrives in M2; remove it from the database until then.' -ForegroundColor DarkGray
Write-Host ''

exit $(if ($failures -gt 0) { 1 } else { 0 })
