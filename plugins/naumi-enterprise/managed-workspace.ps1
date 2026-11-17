param([Parameter(Mandatory=$true)][string]$Directory,[Parameter(Mandatory=$true)][string]$Parent)
$ErrorActionPreference='Stop'
$item=Get-Item -LiteralPath $Directory -Force
$base=Get-Item -LiteralPath $Parent -Force
if(-not $item.PSIsContainer -or -not $base.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ($base.Attributes -band [IO.FileAttributes]::ReparsePoint)) {throw 'MANAGED_WORKSPACE_UNMANAGED'}
if($item.Parent.FullName -ne $base.FullName -or -not $item.Name.StartsWith('.naumi-workspace-') -or @(Get-ChildItem -LiteralPath $Directory -Force).Count -ne 0) {throw 'MANAGED_WORKSPACE_BOUNDARY'}
$user=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=Get-Acl -LiteralPath $Directory
if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $user.Value) {throw 'MANAGED_WORKSPACE_OWNER_MISMATCH'}
$before=$acl.Sddl
# Owner already has implicit WRITE_DAC. Only WRITE_OWNER is missing on some
# inherited Modify-only drives; native Low-label setup needs this right.
# No Everyone/Users grant, ownership change, inheritance reset, or elevation.
$rule=New-Object Security.AccessControl.FileSystemAccessRule($user,[Security.AccessControl.FileSystemRights]::TakeOwnership,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $Directory -AclObject $acl
$after=Get-Acl -LiteralPath $Directory
if($after.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $user.Value) {throw 'MANAGED_WORKSPACE_OWNER_CHANGED'}
@{status='OWNER_LABEL_READY';sid=$user.Value;before=$before;after=$after.Sddl;right='WRITE_OWNER';elevated=$false}|ConvertTo-Json -Compress
