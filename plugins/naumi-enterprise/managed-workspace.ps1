param([Parameter(Mandatory=$true)][string]$Directory,[Parameter(Mandatory=$true)][string]$Parent)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$OutputEncoding=[Console]::OutputEncoding
function Test-ManagedWorkspaceOwner {
  param([string]$DirectoryOwner,[string]$UserSid,[string]$TokenOwnerSid)
  # Windows can assign the token's default owner (e.g. enabled Administrators
  # for an elevated process), not TokenUser. Never accept arbitrary group SIDs.
  return (-not [string]::IsNullOrEmpty($DirectoryOwner) -and
    ($DirectoryOwner -eq $UserSid -or
      (-not [string]::IsNullOrEmpty($TokenOwnerSid) -and $DirectoryOwner -eq $TokenOwnerSid)))
}
$item=Get-Item -LiteralPath $Directory -Force
$base=Get-Item -LiteralPath $Parent -Force
if(-not $item.PSIsContainer -or -not $base.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ($base.Attributes -band [IO.FileAttributes]::ReparsePoint)) {throw 'MANAGED_WORKSPACE_UNMANAGED'}
if($item.Parent.FullName -ne $base.FullName -or -not $item.Name.StartsWith('.naumi-workspace-') -or @(Get-ChildItem -LiteralPath $Directory -Force).Count -ne 0) {throw 'MANAGED_WORKSPACE_BOUNDARY'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$user=$identity.User
$tokenOwner=$identity.Owner
$acl=Get-Acl -LiteralPath $Directory
$originalOwner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
if(-not (Test-ManagedWorkspaceOwner $originalOwner $user.Value $tokenOwner.Value)) {throw 'MANAGED_WORKSPACE_OWNER_MISMATCH'}
$before=$acl.Sddl
# The user/token owner has WRITE_DAC. Only WRITE_OWNER is missing on some
# inherited Modify-only drives; native Low-label setup needs this right.
# No Everyone/Users grant, ownership change, inheritance reset, or elevation.
$rule=New-Object Security.AccessControl.FileSystemAccessRule($user,[Security.AccessControl.FileSystemRights]::TakeOwnership,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $Directory -AclObject $acl
$after=Get-Acl -LiteralPath $Directory
if($after.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $originalOwner) {throw 'MANAGED_WORKSPACE_OWNER_CHANGED'}
@{status='OWNER_LABEL_READY';sid=$user.Value;owner=$originalOwner;tokenOwner=$tokenOwner.Value;ownerMode=$(if($originalOwner -eq $user.Value){'user'}else{'token-default'});before=$before;after=$after.Sddl;right='WRITE_OWNER';elevated=([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)}|ConvertTo-Json -Compress
