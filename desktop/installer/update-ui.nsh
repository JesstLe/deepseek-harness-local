; Only presentation + observed post-install startup. The stock engine still
; owns elevation, old-version removal, extraction, registration and shortcuts.
Var NaumiUpdateHeading
Var NaumiUpdateStatus
Var NaumiUpdateRetry
Var NaumiUpdateAttempts
Var NaumiUpdateLaunchPending

Function NaumiUpdateDone
  !insertmacro NaumiShell
  !insertmacro NaumiLabel 248 112 524 44 "正在打开 Naumi" 22 600
  StrCpy $NaumiUpdateHeading $0
  !insertmacro NaumiLabel 248 196 524 48 "${VERSION} 已安装" 10 400
  StrCpy $NaumiUpdateStatus $0
  !insertmacro NaumiButton 248 388 88 44 "关闭" action-close NaumiNext
  !insertmacro NaumiButton 612 388 160 44 "重新打开" action-reopen NaumiUpdateLaunch
  StrCpy $NaumiUpdateRetry $NaumiAction
  EnableWindow $NaumiUpdateRetry 0
  StrCpy $NaumiUpdateLaunchPending "0"
  StrCpy $NaumiUpdateAttempts -1
  ; One stable timer: do not replace a timer from inside its callback.
  ${NSD_CreateTimer} NaumiUpdatePoll 2000
  nsDialogs::Show
  ${NSD_KillTimer} NaumiUpdatePoll
FunctionEnd

Function NaumiUpdateLaunch
  ${If} $NaumiUpdateLaunchPending == "1"
    Return
  ${EndIf}
  StrCpy $NaumiUpdateLaunchPending "1"
  StrCpy $NaumiUpdateAttempts 0
  EnableWindow $NaumiUpdateRetry 0
  ${NSD_SetText} $NaumiUpdateHeading "正在打开 Naumi"
  ${NSD_SetText} $NaumiUpdateStatus "${VERSION} 已安装"
  Call StartApp
FunctionEnd

Function NaumiUpdatePoll
  ${If} $NaumiUpdateAttempts == -1
    Call NaumiUpdateLaunch
    Return
  ${EndIf}
  ${If} $NaumiUpdateLaunchPending != "1"
    Return
  ${EndIf}
  ; Exact target/version + fresh ready receipt + live process identity required.
  ; Unknown, old or missing receipts keep this page open instead of fake success.
  nsExec::ExecToStack /TIMEOUT=5000 '"$PLUGINSDIR\naumi-maintenance-node.exe" "$PLUGINSDIR\installer-relaunch.cjs" "check" "$PLUGINSDIR\update-launch.json"'
  Pop $R9
  Pop $R8
  ${If} $R9 == 0
    ${NSD_KillTimer} NaumiUpdatePoll
    StrCpy $NaumiUpdateLaunchPending "0"
    Call NaumiNext
    Return
  ${EndIf}
  IntOp $NaumiUpdateAttempts $NaumiUpdateAttempts + 1
  ${If} $NaumiUpdateAttempts >= 20
    StrCpy $NaumiUpdateLaunchPending "0"
    ${NSD_SetText} $NaumiUpdateHeading "更新已安装"
    ${NSD_SetText} $NaumiUpdateStatus "Naumi 尚未就绪，可以重新打开"
    EnableWindow $NaumiUpdateRetry 1
  ${EndIf}
FunctionEnd
