param([string]$Log)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
function Record($v) { Add-Content -LiteralPath $Log -Value $v -Encoding UTF8 }
$form=New-Object System.Windows.Forms.Form
$form.Text='Naumi CUA Acceptance (isolated)'
$form.ClientSize=New-Object System.Drawing.Size(680,480)
$form.StartPosition='CenterScreen'
$form.BackColor=[Drawing.Color]::White
$form.TopMost=$true
$font=New-Object Drawing.Font('Segoe UI',12)
$form.Font=$font
$editor=New-Object Windows.Forms.TextBox
$editor.Location=New-Object Drawing.Point(30,35)
$editor.Size=New-Object Drawing.Size(420,35)
$editor.Add_TextChanged({Record ('TEXT='+$editor.Text)})
$editor.Add_KeyDown({param($sender,$e) Record ('KEY='+$e.KeyCode+';CTRL='+$e.Control);if($e.Control -and $e.KeyCode -eq 'A'){$editor.SelectAll();Record 'HOTKEY=select_all';$e.SuppressKeyPress=$true}})
$form.Controls.Add($editor)
$button=New-Object Windows.Forms.Button
$button.Text='Confirm'
$button.Location=New-Object Drawing.Point(30,90)
$button.Size=New-Object Drawing.Size(180,40)
$button.Add_Click({$button.Text='Confirmed';Record 'CLICK=confirmed'})
$form.Controls.Add($button)
$list=New-Object Windows.Forms.ListBox
$list.Location=New-Object Drawing.Point(30,155)
$list.Size=New-Object Drawing.Size(280,270)
1..60 | ForEach-Object {$list.Items.Add("Item $_") | Out-Null}
$form.Controls.Add($list)
$panel=New-Object Windows.Forms.Panel
$panel.Location=New-Object Drawing.Point(350,155)
$panel.Size=New-Object Drawing.Size(280,270)
$panel.BackColor=[Drawing.Color]::AliceBlue
$script:down=$false
$panel.Add_MouseDown({$script:down=$true;Record 'DRAG=down'})
$panel.Add_MouseUp({$script:down=$false;Record 'DRAG=up'})
$panel.Add_MouseMove({if($script:down){$panel.BackColor=[Drawing.Color]::LightGreen;Record 'DRAG=moved'}})
$form.Controls.Add($panel)
$script:top=0
$timer=New-Object Windows.Forms.Timer
$timer.Interval=100
$timer.Add_Tick({if($list.TopIndex -ne $script:top){$script:top=$list.TopIndex;Record ('SCROLL='+$script:top)}})
$timer.Start()
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class FixtureWindow{[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int cmd);}'
$form.Add_Shown({[FixtureWindow]::ShowWindow($form.Handle,5)|Out-Null;$form.Activate();$editor.Focus()|Out-Null;Record ('HWND='+$form.Handle.ToInt64());Record ('READY='+$PID)})
[Windows.Forms.Application]::Run($form)
$timer.Dispose()
