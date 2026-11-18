Naumi 0.3.9 administrator workspace owner hotfix
1. Close Naumi on the affected computer (all windows).
2. Extract this folder, then run in PowerShell:
   powershell -NoProfile -ExecutionPolicy Bypass -File .\APPLY.ps1 -InstallRoot "F:\Naumi"
3. Require OWNER_HOTFIX_APPLIED ... exit=0, then reopen Naumi.
Rollback after closing Naumi:
   powershell -NoProfile -ExecutionPolicy Bypass -File .\ROLLBACK.ps1 -InstallRoot "F:\Naumi"
Only known .9 code plus runtime inventory are patched; original bytes are kept in .naumi-hotfix-admin-workspace-owner-20261118 under the installation. No AppData/workspace/account/model data are touched. No restart is performed by this package.
