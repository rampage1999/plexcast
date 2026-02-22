Get-ChildItem H:\plexcast -Recurse -Include *.json,*.js,*.jsx,*.css,*.html -Exclude node_modules | ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        [System.IO.File]::WriteAllBytes($_.FullName, $bytes[3..($bytes.Length-1)])
        Write-Host "Fixed BOM: $($_.Name)" -ForegroundColor Green
    }
}