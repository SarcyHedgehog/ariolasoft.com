param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$catalogPath = Join-Path $RepositoryRoot 'titles.html'
$catalog = Get-Content -LiteralPath $catalogPath -Raw
$platformNames = @(
    'Commodore 64',
    'Amstrad CPC',
    'ZX Spectrum',
    'Atari 8-bit',
    'MSX',
    'MS-DOS',
    'PC Booter',
    'Atari ST',
    'Amiga',
    'Apple II',
    'Amstrad PCW',
    'Commodore 16'
)

function ConvertFrom-CatalogHtml([string]$Value) {
    $plain = [regex]::Replace($Value, '<[^>]+>', '')
    $plain = [System.Net.WebUtility]::HtmlDecode($plain).Trim()
    return $plain.Replace('BrÃ¸derbund', 'Brøderbund')
}

$rowPattern = '(?s)<tr>\s*<td><a href="#" onclick="openPopup\(''(?<ref>titles/[^'']+\.html)''\)">(?<title>.*?)</a></td>(?<rest>.*?)</tr>'
$rows = [regex]::Matches($catalog, $rowPattern)
$updated = 0

foreach ($row in $rows) {
    $relativePath = $row.Groups['ref'].Value -replace '/', '\'
    $pagePath = Join-Path $RepositoryRoot $relativePath
    if (-not (Test-Path -LiteralPath $pagePath)) {
        continue
    }

    $existing = Get-Content -LiteralPath $pagePath -Raw
    if ($existing -notmatch 'Details about\s+[A-Za-z0-9_-]+\s*') {
        continue
    }

    $title = ConvertFrom-CatalogHtml $row.Groups['title'].Value
    $cellMatches = [regex]::Matches($row.Groups['rest'].Value, '(?s)<td>(.*?)</td>')
    $cells = @($cellMatches | ForEach-Object { ConvertFrom-CatalogHtml $_.Groups[1].Value })
    if ($cells.Count -lt 15) {
        throw "Unexpected catalogue row structure for $title"
    }

    $year = $cells[0]
    $developer = $cells[1]
    $label = $cells[2]
    $formats = for ($index = 0; $index -lt $platformNames.Count; $index++) {
        if ($cells[$index + 3] -eq 'Yes') {
            $platformNames[$index]
        }
    }
    $formatText = if ($formats.Count) { $formats -join ', ' } else { 'Not yet confirmed' }

    $note = ''
    if ($title -in @('Challenge of the Gobots', 'Killer Ring')) {
        $note = "`r`n`r`nByte Engineers was the credited name used by Tony Crowther for this work while he was contracted to Alligata Software."
    }

    $description = @"
Research in progress.

$title appeared in $year under the $label label. The catalogue credits $developer.

Known catalogue formats: $formatText.$note

This holding page will be expanded as contemporary material and first-hand recollections are reviewed.
"@.Trim()

    $encodedTitle = [System.Net.WebUtility]::HtmlEncode($title)
    $encodedDescription = [System.Net.WebUtility]::HtmlEncode($description)
    $page = @"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$encodedTitle</title>
    <link rel="stylesheet" href="titles.css">
</head>
<body>
    <div id="text-container">
        <h2 id="text-header">$encodedTitle</h2>
        <textarea id="text-box" readonly>$encodedDescription</textarea>
    </div>
</body>
</html>
"@

    [System.IO.File]::WriteAllText($pagePath, $page, [System.Text.UTF8Encoding]::new($false))
    $updated++
}

Write-Output "Updated $updated holding pages."
