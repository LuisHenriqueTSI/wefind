$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$versoesDir = Join-Path $scriptDir "versoes_pdf"
if (-not (Test-Path $versoesDir)) {
    New-Item -ItemType Directory -Path $versoesDir | Out-Null
}

$versionFile = Join-Path $versoesDir "version.json"
# Checar se ainda estava na raiz e migrar se necessario
$oldVersionFile = Join-Path $scriptDir "version.json"
if ((Test-Path $oldVersionFile) -and (-not (Test-Path $versionFile))) {
    Move-Item $oldVersionFile $versionFile -Force
}

$mainPdf = Join-Path $scriptDir "main.pdf"
if (-not (Test-Path $mainPdf)) {
    Write-Error "Arquivo principal não encontrado: $mainPdf. Compile o TCC antes de versionar."
    exit 1
}

$versionData = @{ current_version = 0; history = @() }
if (Test-Path $versionFile) {
    try {
        $jsonContent = Get-Content $versionFile -Raw | ConvertFrom-Json
        if ($null -eq $jsonContent.current_version -or $null -eq $jsonContent.history) {
            throw "version.json não contém current_version e history."
        }
        $versionData.current_version = $jsonContent.current_version
        $versionData.history = @($jsonContent.history)
    } catch {
        Write-Error "Não foi possível carregar version.json existente: $_"
        exit 1
    }
}

$nextVersion = $versionData.current_version + 1
$timestamp = Get-Date -Format "dd-MM-yyyy-HH\hmm"
$newPdfName = "TCC_WeFIND_v${nextVersion}_${timestamp}.pdf"
$targetPdf = Join-Path $versoesDir $newPdfName

if (Test-Path $targetPdf) {
    Write-Error "O arquivo de versão já existe: $targetPdf"
    exit 1
}
Copy-Item $mainPdf $targetPdf
Write-Host "Copiado $mainPdf para versoes_pdf\$newPdfName"

$newEntry = [PSCustomObject]@{
    version = $nextVersion
    filename = $newPdfName
    date = (Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz")
}
$versionData.current_version = $nextVersion
$versionData.history += $newEntry

$versionData | ConvertTo-Json -Depth 5 | Set-Content $versionFile -Encoding UTF8
Write-Host "Arquivo versionado gerado com sucesso: versoes_pdf\$newPdfName (Versão $nextVersion)"
