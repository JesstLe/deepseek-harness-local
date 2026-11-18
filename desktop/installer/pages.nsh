; Product pages only; application extraction, identity, upgrade rollback,
; registration and maintenance remain in the pinned builder engine.
!define NAUMI_PRODUCT_ENGINE
!include UAC.nsh
!ifndef INSTALL_MODE_PER_ALL_USERS
  !include multiUserUi.nsh
!endif
!ifndef BUILD_UNINSTALLER
  !insertmacro NaumiInstallerFunctions
  !include "${NAUMI_WIZARD_DIR}\update-ui.nsh"
  !ifmacrodef licensePage
    !insertmacro skipPageIfUpdated
    !insertmacro licensePage
  !endif
  !ifndef INSTALL_MODE_PER_ALL_USERS
    !insertmacro PAGE_INSTALL_MODE
  !endif
  Page custom NaumiInstall NaumiInstallLeave
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW NaumiProgressShow
  !insertmacro MUI_PAGE_INSTFILES
  Page custom NaumiDone NaumiDoneLeave
  Function StartApp
    ${If} ${isUpdated}
      StrCpy $1 "--updated"
    ${Else}
      StrCpy $1 ""
    ${EndIf}
    ${If} ${isUpdated}
      ; Open this exact updated installation, not a stale shortcut.
      ${StdUtils.ExecShellAsUser} $0 "$appExe" "open" "$1"
    ${Else}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    ${EndIf}
  FunctionEnd
!else
  !insertmacro NaumiUninstallerFunctions
  UninstPage custom un.NaumiConfirm
  !ifndef INSTALL_MODE_PER_ALL_USERS
    !insertmacro PAGE_INSTALL_MODE
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.NaumiProgressShow
  !insertmacro MUI_UNPAGE_INSTFILES
  UninstPage custom un.NaumiDone
!endif
!include "${NAUMI_WIZARD_DIR}\multiuser-init.nsh"
