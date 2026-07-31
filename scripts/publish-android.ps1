$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw (Join-Path $projectRoot "package.json") | ConvertFrom-Json
$version = [string]$package.version
$tag = "android-v$version"
$apkSource = Join-Path $projectRoot "android\app\build\outputs\apk\release\app-release.apk"
$outputDirectory = Join-Path $projectRoot "outputs"
$apkOutput = Join-Path $outputDirectory "futbobo.apk"

Push-Location $projectRoot
try {
    & npm.cmd run android:apk
    if ($LASTEXITCODE -ne 0) { throw "A geração do APK falhou." }
    if (-not (Test-Path -LiteralPath $apkSource)) { throw "APK assinado não foi encontrado." }

    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    Copy-Item -LiteralPath $apkSource -Destination $apkOutput -Force

    $credentialLines = @("protocol=https", "host=github.com", "") | & git credential fill
    $credentials = @{}
    foreach ($line in $credentialLines) {
        $separator = $line.IndexOf("=")
        if ($separator -gt 0) { $credentials[$line.Substring(0, $separator)] = $line.Substring($separator + 1) }
    }
    if (-not $credentials.password) {
        throw "O GitHub não está autenticado neste computador."
    }

    $headers = @{
        Authorization = "Bearer $($credentials.password)"
        Accept = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "User-Agent" = "Futbobo-Android-Publisher"
    }
    $api = "https://api.github.com/repos/erereck/futbobo"

    $existingTag = & git tag --list $tag
    if (-not $existingTag) {
        & git tag -a $tag -m "Futbobo Android $version"
        if ($LASTEXITCODE -ne 0) { throw "Não foi possível criar a tag $tag." }
        & git push origin $tag
        if ($LASTEXITCODE -ne 0) { throw "Não foi possível publicar a tag $tag." }
    }

    try {
        $release = Invoke-RestMethod -Headers $headers -Uri "$api/releases/tags/$tag"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
        $payload = @{
            tag_name = $tag
            name = "Futbobo Android $version"
            body = "Primeira versão Android offline do Futbobo. O jogo completo fica instalado no aparelho e avisa quando houver atualização."
            draft = $false
            prerelease = $false
        } | ConvertTo-Json
        $release = Invoke-RestMethod -Method Post -Headers $headers -ContentType "application/json" -Body $payload -Uri "$api/releases"
    }

    $existingAssets = Invoke-RestMethod -Headers $headers -Uri "$api/releases/$($release.id)/assets"
    foreach ($asset in $existingAssets) {
        if ($asset.name -eq "futbobo.apk") {
            Invoke-RestMethod -Method Delete -Headers $headers -Uri "$api/releases/assets/$($asset.id)" | Out-Null
        }
    }
    $uploadUrl = ($release.upload_url -replace "\{\?name,label\}", "")
    Invoke-RestMethod -Method Post -Headers $headers -ContentType "application/vnd.android.package-archive" -InFile $apkOutput -Uri "${uploadUrl}?name=futbobo.apk" | Out-Null
    Write-Output "Futbobo Android $version publicado em $($release.html_url)"
} finally {
    Pop-Location
}
