; Keep the builder's capability checks, link migration, extraction and uninstaller.
; A manual same-directory upgrade must ask an existing supporting uninstaller to
; keep shortcuts just as an auto-update does. Otherwise it deletes unrelated
; same-name desktop links even when --no-desktop-shortcut was requested.
!macroundef setIsTryToKeepShortcuts
!macro setIsTryToKeepShortcuts
  StrCpy $isTryToKeepShortcuts "true"
  !ifdef allowToChangeInstallationDirectory
    ${ifNot} ${isUpdated}
      ${IfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
        StrCpy $isTryToKeepShortcuts "false"
      ${EndIf}
    ${endIf}
  !endif
!macroend
