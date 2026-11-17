!define NAUMI_WIZARD_DIR "${__FILEDIR__}"
!include "${NAUMI_WIZARD_DIR}\presentation.nsh"
; Official customCheckAppRunning hook runs BEFORE uninstallOldVersion and before
; any installed-file removal. It replaces the builder's force-kill fallback.
!define NAUMI_HELPER_DIR "${__FILEDIR__}\..\app"
!define NAUMI_BUNDLED_NODE "${__FILEDIR__}\..\..\runtime\desktop-backend\node.exe"
!macro NaumiExtractMaintenance
  InitPluginsDir
  SetOutPath $PLUGINSDIR
  File /oname=naumi-maintenance-node.exe "${NAUMI_BUNDLED_NODE}"
  File /oname=installer-preflight.cjs "${NAUMI_HELPER_DIR}\installer-preflight.cjs"
  File /oname=installer-state.cjs "${NAUMI_HELPER_DIR}\installer-state.cjs"
  File /oname=profile.cjs "${NAUMI_HELPER_DIR}\profile.cjs"
  File /oname=backend.cjs "${NAUMI_HELPER_DIR}\backend.cjs"
  File /oname=workspaces.cjs "${NAUMI_HELPER_DIR}\workspaces.cjs"
  File /oname=enterprise.cjs "${NAUMI_HELPER_DIR}\enterprise.cjs"
!macroend
!macro customCheckAppRunning
  ; Last admission guard before installed files are written, including /S and /D.
  Push $INSTDIR
  !ifdef BUILD_UNINSTALLER
    Call un.NaumiCanonicalPath
  !else
    Call NaumiCanonicalPath
  !endif
  Pop $NaumiCanonicalTarget
  ${If} $NaumiCanonicalTarget == ""
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONEXCLAMATION "请选择完整的本机安装路径，再重试安装。"
    ${EndIf}
    SetErrorLevel 43
    Quit
  ${EndIf}
  StrCpy $INSTDIR $NaumiCanonicalTarget
  !insertmacro NaumiExtractMaintenance
  Push $7
  Push $R8
  Push $R9
  System::Call 'kernel32::GetCurrentProcessId() i .r7'
  !ifdef BUILD_UNINSTALLER
    StrCpy $R8 "uninstall"
    ${if} ${isUpdated}
      StrCpy $R8 "replace"
    ${endif}
  !else
    StrCpy $R8 "install"
  !endif
  nsExec::ExecToStack '"$PLUGINSDIR\naumi-maintenance-node.exe" "$PLUGINSDIR\installer-preflight.cjs" "$INSTDIR" "$APPDATA\Naumi" "$R8" "${VERSION}" "$7"'
  Pop $R9
  Pop $R8
  ${if} $R9 != 0
    DetailPrint "$R8"
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONEXCLAMATION "请先结束运行任务并关闭未完成的操作，再重试安装。$\r$\n$R8"
    ${endif}
    SetErrorLevel 42
    Quit
  ${endif}
  Pop $R9
  Pop $R8
  Pop $7
!macroend
!macro customInstall
  System::Call 'kernel32::GetCurrentProcessId() i .r7'
  nsExec::ExecToStack '"$PLUGINSDIR\naumi-maintenance-node.exe" "$PLUGINSDIR\installer-preflight.cjs" "$INSTDIR" "$APPDATA\Naumi" "finish" "${VERSION}" "$7"'
  Pop $R9
  Pop $R8
  ${if} $R9 != 0
    SetErrorLevel 42
    Quit
  ${endif}
!macroend

; Suppress per-file deletion paths without replacing the removal transaction.
!macro customUnInstall
  SetDetailsPrint none
!macroend
