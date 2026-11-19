param([string]$Ready)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition 'public class CaptureFixture : System.Windows.Forms.Form { protected override bool ShowWithoutActivation { get { return true; } } }'
$form=New-Object CaptureFixture
$form.Text='Naumi CUA Image Admission - Test Window'
$form.ClientSize=New-Object Drawing.Size(760,430)
$form.StartPosition='CenterScreen'
$form.BackColor=[Drawing.Color]::FromArgb(246,249,253)
$font=New-Object Drawing.Font('Segoe UI',13)
$form.Font=$font
$heading=New-Object Windows.Forms.Label
$heading.Text='CUA Image Admission'
$heading.Font=New-Object Drawing.Font('Segoe UI',24,[Drawing.FontStyle]::Bold)
$heading.Location=New-Object Drawing.Point(34,30)
$heading.Size=New-Object Drawing.Size(690,56)
$form.Controls.Add($heading)
$lines=@('Model input: text + image','Native attachment store: mounted','Capture target: isolated test window','Desktop writes: 0')
for($i=0;$i -lt $lines.Count;$i++){$label=New-Object Windows.Forms.Label;$label.Text=$lines[$i];$label.Location=New-Object Drawing.Point(38,(112+$i*53));$label.Size=New-Object Drawing.Size(680,40);$form.Controls.Add($label)}
$form.Add_Shown({[IO.File]::WriteAllText($Ready,([string]$PID+':'+$form.Handle.ToInt64()))})
[Windows.Forms.Application]::Run($form)
