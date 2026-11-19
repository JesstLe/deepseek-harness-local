!define NAUMI_WIZARD_DIR "${__FILEDIR__}"
!include "${NAUMI_WIZARD_DIR}\presentation.nsh"
; Official customCheckAppRunning hook runs BEFORE uninstallOldVersion and before
; any installed-file removal. It replaces the builder's force-kill fallback.
!define NAUMI_HELPER_DIR "${__FILEDIR__}\..\app"
!define NAUMI_BUNDLED_NODE "${__FILEDIR__}\..\..\runtime\desktop-backend\node.exe"
; A native update supplies the exact initiating install directory. With both HKCU
; and HKLM installs present, the stock silent section otherwise elevates merely
; because HKLM exists, even after initMultiUser selected CurrentUser.
; Resolve scope only for --updated /D matching an existing registered install.
!macro customInit
  ${If} ${isUpdated}
    !insertmacro GetDParameter $R0
    ${If} $R0 != ""
      ; Node's native spawn quotes a /D argument containing spaces as one token.
      ; The pinned GetDParameter returns the wrapper's closing quote. Strip only
      ; that terminal wrapper before canonical matching; embedded quotes reject.
      StrCpy $R4 $R0 1 -1
      ${If} $R4 == '$\"'
        StrCpy $R0 $R0 -1
      ${EndIf}
      Push $R0
      Call NaumiCanonicalPath
      Pop $R1
      ${If} $R1 == ""
        SetErrorLevel 43
        Quit
      ${EndIf}
      ReadRegStr $R2 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      StrCpy $R3 ""
      ${If} $R2 != ""
        Push $R2
        Call NaumiCanonicalPath
        Pop $R3
      ${EndIf}
      ${If} $R1 == $R3
        StrCpy $hasPerMachineInstallation "0"
        StrCpy $hasPerUserInstallation "1"
        !insertmacro setInstallModePerUser
        StrCpy $INSTDIR $R1
      ${Else}
        ReadRegStr $R2 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
        StrCpy $R3 ""
        ${If} $R2 != ""
          Push $R2
          Call NaumiCanonicalPath
          Pop $R3
        ${EndIf}
        ${If} $R1 == $R3
          StrCpy $hasPerMachineInstallation "1"
          StrCpy $hasPerUserInstallation "0"
          !insertmacro setInstallModePerAllUsers
          StrCpy $INSTDIR $R1
        ${Else}
          SetErrorLevel 43
          Quit
        ${EndIf}
      ${EndIf}
    ${EndIf}
    ; Older clients also pass /S: reveal native progress without a path picker.
    SetSilent normal
    ; Stock assisted mode skips CHECK_APP_RUNNING in elevated inner instances.
    ; Admit/extract here BEFORE old-version removal on that route too.
    ${If} ${UAC_IsInnerInstance}
      !insertmacro customCheckAppRunning
    ${EndIf}
  ${EndIf}
!macroend
!macro customInstallMode
  ${If} ${isUpdated}
    ${If} $installMode == "all"
      StrCpy $isForceMachineInstall "1"
    ${Else}
      StrCpy $isForceCurrentInstall "1"
    ${EndIf}
  ${EndIf}
!macroend
!macro NaumiExtractMaintenance
  InitPluginsDir
  SetOutPath $PLUGINSDIR
  File /oname=naumi-maintenance-node.exe "${NAUMI_BUNDLED_NODE}"
  File /oname=installer-preflight.cjs "${NAUMI_HELPER_DIR}\installer-preflight.cjs"
  File /oname=installer-state.cjs "${NAUMI_HELPER_DIR}\installer-state.cjs"
  File /oname=installer-relaunch.cjs "${NAUMI_HELPER_DIR}\installer-relaunch.cjs"
  File /oname=profile.cjs "${NAUMI_HELPER_DIR}\profile.cjs"
  File /oname=backend.cjs "${NAUMI_HELPER_DIR}\backend.cjs"
  File /oname=linked-service-migration.cjs "${NAUMI_HELPER_DIR}\linked-service-migration.cjs"
  File /oname=linked-service.cjs "${NAUMI_HELPER_DIR}\linked-service.cjs"
  File /oname=service-code.cjs "${NAUMI_HELPER_DIR}\service-code.cjs"
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
      MessageBox MB_OK|MB_ICONEXCLAMATION "安装位置无效或过长，请选择较短的完整本机路径，再重试安装。"
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
  !ifndef BUILD_UNINSTALLER
    ${If} ${isUpdated}
      nsExec::ExecToStack '"$PLUGINSDIR\naumi-maintenance-node.exe" "$PLUGINSDIR\installer-relaunch.cjs" "begin" "$PLUGINSDIR\update-launch.json" "$INSTDIR" "${VERSION}"'
      Pop $R9
      Pop $R8
      ; Missing proof keeps the result page open, never claims false readiness.
    ${EndIf}
  !endif
  Pop $R9
  Pop $R8
  Pop $7
!macroend
!macro customInstall
  ; Self-contained even when the stock UAC route skipped the outer gate.
  !insertmacro NaumiExtractMaintenance
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
