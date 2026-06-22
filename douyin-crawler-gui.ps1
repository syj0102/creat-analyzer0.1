Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DefaultOutput = Join-Path $Root "output"
$ChromeProfile = "D:\UserCaches\douyin-cdp-profile"
$ChromePort = 9222

function Ensure-Dir($path) {
    if (-not (Test-Path -LiteralPath $path)) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }
}

function Find-Chrome {
    $candidates = @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw "找不到 Chrome/Edge 浏览器"
}

function Test-CDP {
    try {
        $resp = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$ChromePort/json/version" -TimeoutSec 2
        return $resp.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Stop-CDP-Browser {
    Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*--remote-debugging-port=$ChromePort*" -and $_.CommandLine -like "*$ChromeProfile*" } |
        ForEach-Object {
            try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        }
}

function Start-CDP-Browser($url) {
    Ensure-Dir $ChromeProfile
    $chrome = Find-Chrome
    Start-Process -FilePath $chrome -ArgumentList @(
        "--remote-debugging-port=$ChromePort",
        "--user-data-dir=$ChromeProfile",
        $url
    ) | Out-Null
}

function Append-Log($text) {
    $logBox.AppendText("[$(Get-Date -Format 'HH:mm:ss')] $text`r`n")
    $logBox.SelectionStart = $logBox.Text.Length
    $logBox.ScrollToCaret()
    [System.Windows.Forms.Application]::DoEvents()
}

function Quote-ProcessArg($arg) {
    $text = [string]$arg
    if ($text -notmatch '[\s"]') { return $text }
    return '"' + $text.Replace('\', '\\').Replace('"', '\"') + '"'
}

function Run-ProcessCapture($file, [string[]]$arguments, $workingDirectory) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $file
    $psi.Arguments = ($arguments | ForEach-Object { Quote-ProcessArg $_ }) -join " "
    $psi.WorkingDirectory = $workingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $psi.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8"
    $psi.EnvironmentVariables["HF_HOME"] = "D:\UserCaches\huggingface"
    $psi.EnvironmentVariables["HUGGINGFACE_HUB_CACHE"] = "D:\UserCaches\huggingface\hub"
    $psi.EnvironmentVariables["HF_HUB_DISABLE_XET"] = "1"
    $psi.EnvironmentVariables["TEMP"] = "D:\tmp"
    $psi.EnvironmentVariables["TMP"] = "D:\tmp"
    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    [void]$proc.Start()
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    if ($stdout.Trim()) { Append-Log $stdout.Trim() }
    if ($stderr.Trim()) { Append-Log $stderr.Trim() }
    if ($proc.ExitCode -ne 0) {
        throw "命令失败，退出码 $($proc.ExitCode)"
    }
    return $stdout
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "抖音博主采集器"
$form.Size = New-Object System.Drawing.Size(820, 620)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10)

$targetLabel = New-Object System.Windows.Forms.Label
$targetLabel.Text = "抖音链接 / 主页 / sec_uid"
$targetLabel.Location = New-Object System.Drawing.Point(18, 20)
$targetLabel.Size = New-Object System.Drawing.Size(180, 28)
$form.Controls.Add($targetLabel)

$targetBox = New-Object System.Windows.Forms.TextBox
$targetBox.Location = New-Object System.Drawing.Point(200, 18)
$targetBox.Size = New-Object System.Drawing.Size(580, 28)
$form.Controls.Add($targetBox)

$outputLabel = New-Object System.Windows.Forms.Label
$outputLabel.Text = "输出目录"
$outputLabel.Location = New-Object System.Drawing.Point(18, 62)
$outputLabel.Size = New-Object System.Drawing.Size(180, 28)
$form.Controls.Add($outputLabel)

$outputBox = New-Object System.Windows.Forms.TextBox
$outputBox.Location = New-Object System.Drawing.Point(200, 60)
$outputBox.Size = New-Object System.Drawing.Size(482, 28)
$outputBox.Text = $DefaultOutput
$form.Controls.Add($outputBox)

$browseButton = New-Object System.Windows.Forms.Button
$browseButton.Text = "选择..."
$browseButton.Location = New-Object System.Drawing.Point(694, 58)
$browseButton.Size = New-Object System.Drawing.Size(86, 32)
$browseButton.Add_Click({
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.SelectedPath = $outputBox.Text
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $outputBox.Text = $dialog.SelectedPath
    }
})
$form.Controls.Add($browseButton)

$maxLabel = New-Object System.Windows.Forms.Label
$maxLabel.Text = "最大作品数"
$maxLabel.Location = New-Object System.Drawing.Point(18, 104)
$maxLabel.Size = New-Object System.Drawing.Size(180, 28)
$form.Controls.Add($maxLabel)

$maxBox = New-Object System.Windows.Forms.NumericUpDown
$maxBox.Location = New-Object System.Drawing.Point(200, 102)
$maxBox.Size = New-Object System.Drawing.Size(100, 28)
$maxBox.Minimum = 1
$maxBox.Maximum = 500
$maxBox.Value = 60
$form.Controls.Add($maxBox)

$transcribeCheck = New-Object System.Windows.Forms.CheckBox
$transcribeCheck.Text = "抓取后转写口播"
$transcribeCheck.Location = New-Object System.Drawing.Point(330, 103)
$transcribeCheck.Size = New-Object System.Drawing.Size(160, 28)
$transcribeCheck.Checked = $true
$form.Controls.Add($transcribeCheck)

$modelLabel = New-Object System.Windows.Forms.Label
$modelLabel.Text = "转写模型"
$modelLabel.Location = New-Object System.Drawing.Point(510, 104)
$modelLabel.Size = New-Object System.Drawing.Size(80, 28)
$form.Controls.Add($modelLabel)

$modelBox = New-Object System.Windows.Forms.ComboBox
$modelBox.Location = New-Object System.Drawing.Point(590, 102)
$modelBox.Size = New-Object System.Drawing.Size(110, 28)
$modelBox.DropDownStyle = "DropDownList"
[void]$modelBox.Items.Add("tiny")
[void]$modelBox.Items.Add("base")
[void]$modelBox.Items.Add("small")
$modelBox.SelectedItem = "tiny"
$form.Controls.Add($modelBox)

$openChromeButton = New-Object System.Windows.Forms.Button
$openChromeButton.Text = "打开/登录浏览器"
$openChromeButton.Location = New-Object System.Drawing.Point(18, 148)
$openChromeButton.Size = New-Object System.Drawing.Size(160, 36)
$openChromeButton.Add_Click({
    try {
        $target = $targetBox.Text.Trim()
        $url = if ($target -match "^https?://") { $target } else { "https://www.douyin.com/" }
        Start-CDP-Browser $url
        Append-Log "已打开调试浏览器。请在里面登录抖音/完成验证码，然后点“开始抓取”。"
    } catch {
        Append-Log "打开浏览器失败：$($_.Exception.Message)"
    }
})
$form.Controls.Add($openChromeButton)

$restartChromeButton = New-Object System.Windows.Forms.Button
$restartChromeButton.Text = "重启调试浏览器"
$restartChromeButton.Location = New-Object System.Drawing.Point(196, 148)
$restartChromeButton.Size = New-Object System.Drawing.Size(140, 36)
$restartChromeButton.Add_Click({
    try {
        Stop-CDP-Browser
        Start-Sleep -Seconds 1
        $target = $targetBox.Text.Trim()
        $url = if ($target -match "^https?://") { $target } else { "https://www.douyin.com/" }
        Start-CDP-Browser $url
        Append-Log "已重启调试浏览器。请确认已登录/完成验证码。"
    } catch {
        Append-Log "重启浏览器失败：$($_.Exception.Message)"
    }
})
$form.Controls.Add($restartChromeButton)

$startButton = New-Object System.Windows.Forms.Button
$startButton.Text = "开始抓取"
$startButton.Location = New-Object System.Drawing.Point(354, 148)
$startButton.Size = New-Object System.Drawing.Size(130, 36)
$startButton.Add_Click({
    try {
        $startButton.Enabled = $false
        $target = $targetBox.Text.Trim()
        $outDir = $outputBox.Text.Trim()
        if (-not $target) { throw "请先输入抖音链接/主页/sec_uid" }
        if (-not $outDir) { throw "请先选择输出目录" }
        Ensure-Dir $outDir

        if (-not (Test-CDP)) {
            Append-Log "未检测到 9222 调试浏览器，正在打开..."
            $url = if ($target -match "^https?://") { $target } else { "https://www.douyin.com/" }
            Start-CDP-Browser $url
            [System.Windows.Forms.MessageBox]::Show("请在打开的浏览器中登录抖音/完成验证码，然后点确定继续。", "需要登录")
        }

        Append-Log "开始抓取作品数据..."
        $nodeOut = Run-ProcessCapture "node" @(
            (Join-Path $Root "scrape-dy-creator-cdp.js"),
            $target,
            [string][int]$maxBox.Value,
            "--output-dir",
            $outDir
        ) $Root

        $csvPath = $null
        try {
            $jsonText = $nodeOut.Substring($nodeOut.IndexOf("{"))
            $result = $jsonText | ConvertFrom-Json
            $csvPath = [string]$result.file
            Append-Log "采集完成：$csvPath"
        } catch {
            Append-Log "采集完成，但未能自动解析输出文件路径。请查看日志 JSON。"
        }

        if ($transcribeCheck.Checked -and $csvPath -and (Test-Path -LiteralPath $csvPath)) {
            $py = Join-Path $Root ".venv-transcribe\Scripts\python.exe"
            if (-not (Test-Path -LiteralPath $py)) { $py = "python" }
            $transcriptDir = Join-Path $outDir "transcripts"
            Ensure-Dir $transcriptDir
            Append-Log "开始转写口播，模型：$($modelBox.SelectedItem)。这一步可能较久..."
            Run-ProcessCapture $py @(
                (Join-Path $Root "transcribe-dy-videos.py"),
                $csvPath,
                "--model",
                [string]$modelBox.SelectedItem,
                "--device",
                "cpu",
                "--compute-type",
                "int8",
                "--output-dir",
                $transcriptDir
            ) $Root | Out-Null
            Append-Log "口播转写完成：$transcriptDir"
        }

        Append-Log "全部完成。输出目录：$outDir"
        Start-Process explorer.exe $outDir
    } catch {
        Append-Log "错误：$($_.Exception.Message)"
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "运行失败")
    } finally {
        $startButton.Enabled = $true
    }
})
$form.Controls.Add($startButton)

$openOutButton = New-Object System.Windows.Forms.Button
$openOutButton.Text = "打开输出目录"
$openOutButton.Location = New-Object System.Drawing.Point(502, 148)
$openOutButton.Size = New-Object System.Drawing.Size(130, 36)
$openOutButton.Add_Click({
    Ensure-Dir $outputBox.Text
    Start-Process explorer.exe $outputBox.Text
})
$form.Controls.Add($openOutButton)

$hint = New-Object System.Windows.Forms.Label
$hint.Text = '提示：首次使用先点 [打开/登录浏览器]，扫码/验证后再开始。输出 CSV 含标题、封面、赞藏评、视频 URL；勾选后会生成口播转写。'
$hint.Location = New-Object System.Drawing.Point(18, 198)
$hint.Size = New-Object System.Drawing.Size(762, 42)
$form.Controls.Add($hint)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(18, 250)
$logBox.Size = New-Object System.Drawing.Size(762, 300)
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$logBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$form.Controls.Add($logBox)

Ensure-Dir $DefaultOutput
Append-Log "就绪。默认输出：$DefaultOutput"
[void]$form.ShowDialog()

