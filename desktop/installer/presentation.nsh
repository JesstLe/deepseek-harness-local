!ifndef NAUMI_PRESENTATION_INCLUDED
!define NAUMI_PRESENTATION_INCLUDED
!include MUI2.nsh
!include nsDialogs.nsh
!include FileFunc.nsh
; Generated from the final staged payload by build-desktop.mjs. Native fixtures
; use the same pinned-layout fallback when no staged runtime exists.
!if /FileExists "${NAUMI_WIZARD_DIR}\..\..\runtime\installer-path-budget.nsh"
  !include "${NAUMI_WIZARD_DIR}\..\..\runtime\installer-path-budget.nsh"
!endif
!define /IfNDef NAUMI_MAX_INSTALLDIR_CHARS 66
!define /IfNDef MUI_ICON "${NAUMI_WIZARD_DIR}\..\app\assets\naumi.ico"
!define /IfNDef MUI_UNICON "${NAUMI_WIZARD_DIR}\..\app\assets\naumi.ico"
!define MUI_BGCOLOR FFFFFF
!define MUI_TEXTCOLOR 26334B
!define MUI_INSTFILESPAGE_COLORS "26334B FFFFFF"
!define MUI_INSTFILESPAGE_PROGRESSBAR smooth
ShowInstDetails nevershow
ShowUninstDetails nevershow
BrandingText "Naumi ${VERSION}"
XPStyle on
!insertmacro MUI_INSTFILESPAGE_INTERFACE
Var NaumiDpi
Var NaumiPage
!ifndef BUILD_UNINSTALLER
Var NaumiPathField
Var NaumiRunCheck
Var NaumiCandidatePath
!endif
Var NaumiAction
Var NaumiCanonicalTarget

!macro NaumiHideChrome ID
  GetDlgItem $0 $HWNDPARENT ${ID}
  ShowWindow $0 ${SW_HIDE}
!macroend
!macro NaumiScale X Y W H
  IntOp $R4 ${X} * $NaumiDpi
  IntOp $R4 $R4 / 96
  IntOp $R5 ${Y} * $NaumiDpi
  IntOp $R5 $R5 / 96
  IntOp $R6 ${W} * $NaumiDpi
  IntOp $R6 $R6 / 96
  IntOp $R7 ${H} * $NaumiDpi
  IntOp $R7 $R7 / 96
!macroend
!macro NaumiWindowSize
  !insertmacro NaumiHideChrome 1034
  !insertmacro NaumiHideChrome 1035
  !insertmacro NaumiHideChrome 1036
  !insertmacro NaumiHideChrome 1037
  !insertmacro NaumiHideChrome 1038
  !insertmacro NaumiHideChrome 1039
  !insertmacro NaumiHideChrome 1028
  !insertmacro NaumiHideChrome 1256
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i .r0'
  StrCpy $NaumiDpi $0
  ${If} $NaumiDpi < 96
    StrCpy $NaumiDpi 96
  ${EndIf}
  !insertmacro NaumiScale 0 0 820 520
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i 0, i 0, i $R6, i $R7, i 6)'
!macroend
!macro NaumiLabel X Y W H TEXT SIZE WEIGHT
  !insertmacro NaumiScale ${X} ${Y} ${W} ${H}
  ${NSD_CreateLabel} $R4 $R5 $R6 $R7 "${TEXT}"
  Pop $0
  SetCtlColors $0 "26334B" "FFFFFF"
  CreateFont $1 "Microsoft YaHei UI" ${SIZE} ${WEIGHT}
  SendMessage $0 ${WM_SETFONT} $1 1
!macroend

!macro NaumiShell
  !insertmacro NaumiWindowSize
  System::Call 'user32::GetSystemMenu(p $HWNDPARENT, i 0) p .r0'
  System::Call 'user32::EnableMenuItem(p r0, i 0xF060, i 0)'
  System::Call 'user32::DrawMenuBar(p $HWNDPARENT)'
  nsDialogs::Create 1044
  Pop $NaumiPage
  !insertmacro NaumiScale 0 0 820 520
  System::Call 'user32::SetWindowPos(p $NaumiPage, p 0, i 0, i 0, i $R6, i $R7, i 4)'
  SetCtlColors $NaumiPage "26334B" "FFFFFF"
  SetCtlColors $HWNDPARENT "26334B" "FFFFFF"
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  EnableWindow $0 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1034
  ShowWindow $0 ${SW_HIDE}
  InitPluginsDir
  File /oname=$PLUGINSDIR\naumi-wizard.bmp "${NAUMI_WIZARD_DIR}\assets\logo.bmp"
  File /oname=$PLUGINSDIR\action-install.bmp "${NAUMI_WIZARD_DIR}\assets\action-install.bmp"
  File /oname=$PLUGINSDIR\action-uninstall.bmp "${NAUMI_WIZARD_DIR}\assets\action-uninstall.bmp"
  File /oname=$PLUGINSDIR\action-done.bmp "${NAUMI_WIZARD_DIR}\assets\action-done.bmp"
  File /oname=$PLUGINSDIR\action-cancel.bmp "${NAUMI_WIZARD_DIR}\assets\action-cancel.bmp"
  File /oname=$PLUGINSDIR\action-browse.bmp "${NAUMI_WIZARD_DIR}\assets\action-browse.bmp"
  !insertmacro NaumiRail $NaumiPage
  !insertmacro NaumiLabel 716 40 56 20 "${VERSION}" 9 400
!macroend

!macro NaumiRail PARENT
  InitPluginsDir
  File /oname=$PLUGINSDIR\naumi-rail.bmp "${NAUMI_WIZARD_DIR}\assets\rail.bmp"
  !insertmacro NaumiScale 0 0 216 520
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "Naumi", i 0x5000000E, i $R4, i $R5, i $R6, i $R7, p ${PARENT}, p 0, p 0, p 0) p .r2'
  System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\naumi-rail.bmp", i 0, i $R6, i $R7, i 0x10) p .r0'
  SendMessage $2 ${STM_SETIMAGE} 0 $0
!macroend

!macro NaumiButton X Y W H TEXT ASSET CALLBACK
  !insertmacro NaumiScale ${X} ${Y} ${W} ${H}
  ${NSD_CreateButton} $R4 $R5 $R6 $R7 "${TEXT}"
  Pop $NaumiAction
  ${NSD_AddStyle} $NaumiAction 0x8080
  System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\${ASSET}.bmp", i 0, i $R6, i $R7, i 0x10) p .r0'
  SendMessage $NaumiAction ${BM_SETIMAGE} 0 $0
  ${NSD_OnClick} $NaumiAction ${CALLBACK}
!macroend

!macro NaumiNativeLabel X Y W H TEXT SIZE WEIGHT
  !insertmacro NaumiScale ${X} ${Y} ${W} ${H}
  System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "${TEXT}", i 0x50000000, i $R4, i $R5, i $R6, i $R7, p $mui.InstFilesPage, p 0, p 0, p 0) p .r0'
  SetCtlColors $0 "26334B" "FFFFFF"
  CreateFont $1 "Microsoft YaHei UI" ${SIZE} ${WEIGHT}
  SendMessage $0 ${WM_SETFONT} $1 1
!macroend

!macro NaumiFunctions PREFIX MODE
Function ${PREFIX}NaumiNext
  SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
FunctionEnd
Function ${PREFIX}NaumiCancel
  SendMessage $HWNDPARENT ${WM_CLOSE} 0 0
FunctionEnd
Function ${PREFIX}NaumiProgressShow
  SetAutoClose true
  SetDetailsPrint none
  !insertmacro NaumiWindowSize
  !insertmacro NaumiScale 0 0 820 520
  System::Call 'user32::SetWindowPos(p $mui.InstFilesPage, p 0, i 0, i 0, i $R6, i $R7, i 4)'
  SetCtlColors $HWNDPARENT "26334B" "FFFFFF"
  SetCtlColors $mui.InstFilesPage "26334B" "FFFFFF"
  ShowWindow $mui.InstFilesPage.Text ${SW_HIDE}
  ShowWindow $mui.InstFilesPage.ShowLogButton ${SW_HIDE}
  ShowWindow $mui.InstFilesPage.Log ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1034
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  !insertmacro NaumiScale 248 258 524 8
  System::Call 'user32::SetWindowPos(p $mui.InstFilesPage.ProgressBar, p 0, i $R4, i $R5, i $R6, i $R7, i 4)'
  System::Call 'uxtheme::SetWindowTheme(p $mui.InstFilesPage.ProgressBar, w "", w "")'
  SendMessage $mui.InstFilesPage.ProgressBar ${PBM_SETBARCOLOR} 0 0xED5D31
  !insertmacro NaumiRail $mui.InstFilesPage
  !insertmacro NaumiNativeLabel 716 40 56 20 "${VERSION}" 9 400
  !if "${MODE}" == "install"
    !insertmacro NaumiNativeLabel 248 112 524 44 "正在安装 Naumi" 22 600
  !else
    !insertmacro NaumiNativeLabel 248 112 524 44 "正在卸载 Naumi" 22 600
    !insertmacro NaumiNativeLabel 248 196 524 28 "个人数据将保留" 10 400
  !endif
FunctionEnd
Function ${PREFIX}NaumiDone
  !insertmacro NaumiShell
  !if "${MODE}" == "install"
    !insertmacro NaumiLabel 248 112 524 44 "安装完成" 22 600
    !insertmacro NaumiScale 248 196 524 28
    ${NSD_CreateCheckbox} $R4 $R5 $R6 $R7 "完成后打开 Naumi"
    Pop $NaumiRunCheck
    SetCtlColors $NaumiRunCheck "526078" "FFFFFF"
    CreateFont $1 "Microsoft YaHei UI" 10 400
    SendMessage $NaumiRunCheck ${WM_SETFONT} $1 1
    ${NSD_Check} $NaumiRunCheck
  !else
    !insertmacro NaumiLabel 248 112 524 44 "卸载完成" 22 600
    !insertmacro NaumiLabel 248 196 524 28 "个人数据已保留" 10 400
  !endif
  !insertmacro NaumiButton 612 388 160 44 "完成" action-done ${PREFIX}NaumiNext
  nsDialogs::Show
FunctionEnd
!macroend

!macro NaumiFailure PREFIX EVENT
Function ${PREFIX}${EVENT}
  SetAutoClose false
  ${IfNot} ${Silent}
    GetDlgItem $0 $HWNDPARENT 2
    EnableWindow $0 1
    ShowWindow $0 ${SW_SHOW}
    SendMessage $0 ${WM_SETTEXT} 0 "STR:关闭"
    MessageBox MB_OK|MB_ICONEXCLAMATION "操作未完成。请检查磁盘空间和文件占用后重试。"
  ${EndIf}
FunctionEnd
!macroend

; Stack contract: path -> canonical drive-absolute path, or empty on rejection.
; Preserve scratch registers and never create a directory during validation.
!macro NaumiPathFunctions PREFIX
Function ${PREFIX}NaumiCanonicalPath
  Exch $R0
  Push $0
  Push $1
  Push $2
  Push $3
  StrCpy $0 $R0 1 1
  StrCpy $1 $R0 1 2
  ${If} $0 != ":"
  ${OrIf} $1 != "\"
    Goto naumi_path_invalid
  ${EndIf}
  System::Call 'shlwapi::PathGetDriveNumberW(w "$R0")i.r1'
  ${If} $1 < 0
    Goto naumi_path_invalid
  ${EndIf}
  StrLen $3 $R0
  StrCpy $1 2
  naumi_path_chars:
    ${If} $1 >= $3
      Goto naumi_path_resolve
    ${EndIf}
    StrCpy $2 $R0 1 $1
    ${If} $2 == "*"
    ${OrIf} $2 == "?"
    ${OrIf} $2 == "<"
    ${OrIf} $2 == ">"
    ${OrIf} $2 == "|"
    ${OrIf} $2 == "$\""
    ${OrIf} $2 == ":"
      Goto naumi_path_invalid
    ${EndIf}
    IntOp $1 $1 + 1
    Goto naumi_path_chars
  naumi_path_resolve:
  System::Call 'kernel32::GetFullPathNameW(w "$R0",i ${NSIS_MAX_STRLEN},w .r0,p 0)i.r1'
  ${If} $1 == 0
  ${OrIf} $1 >= ${NSIS_MAX_STRLEN}
    Goto naumi_path_invalid
  ${EndIf}
  StrCpy $2 $0 1 1
  StrCpy $3 $0 1 2
  ${If} $2 != ":"
  ${OrIf} $3 != "\"
    Goto naumi_path_invalid
  ${EndIf}
  ; Ignore a trailing separator when checking the final Naumi directory name.
  StrLen $1 $0
  ${If} $1 > 3
    StrCpy $2 $0 1 -1
    ${If} $2 == "\"
      StrCpy $0 $0 -1
    ${EndIf}
  ${EndIf}
  !if "${PREFIX}" == ""
    StrLen $1 $0
    ${If} $1 > ${NAUMI_MAX_INSTALLDIR_CHARS}
      Goto naumi_path_invalid
    ${EndIf}
  !endif
  StrCpy $R0 $0
  Goto naumi_path_return
  naumi_path_invalid:
  StrCpy $R0 ""
  naumi_path_return:
  Pop $3
  Pop $2
  Pop $1
  Pop $0
  Exch $R0
FunctionEnd
!macroend

!macro NaumiInstallerFunctions
!insertmacro NaumiPathFunctions ""
!insertmacro NaumiFailure "" ".onInstFailed"
!insertmacro NaumiFunctions "" "install"
Function NaumiBrowse
  nsDialogs::SelectFolderDialog "选择 Naumi 安装位置" "$INSTDIR"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $NaumiPathField $0
  ${EndIf}
FunctionEnd
Function NaumiInstall
  !ifdef NAUMI_PRODUCT_ENGINE
    ${If} ${isUpdated}
      Abort
    ${EndIf}
  !endif
  !insertmacro NaumiShell
  !insertmacro NaumiLabel 248 112 524 44 "安装 Naumi" 22 600
  !insertmacro NaumiLabel 248 190 524 24 "安装位置" 10 400
  !insertmacro NaumiScale 248 224 428 40
  ${NSD_CreateText} $R4 $R5 $R6 $R7 "$INSTDIR"
  Pop $NaumiPathField
  CreateFont $1 "Microsoft YaHei UI" 10 400
  SendMessage $NaumiPathField ${WM_SETFONT} $1 1
  !insertmacro NaumiButton 688 224 84 40 "更改" action-browse NaumiBrowse
  !insertmacro NaumiButton 248 388 88 44 "取消" action-cancel NaumiCancel
  !insertmacro NaumiButton 612 388 160 44 "安装 Naumi" action-install NaumiNext
  nsDialogs::Show
FunctionEnd
Function NaumiInstallLeave
  ${NSD_GetText} $NaumiPathField $NaumiCandidatePath
  Push $NaumiCandidatePath
  Call NaumiCanonicalPath
  Pop $NaumiCandidatePath
  ${If} $NaumiCandidatePath == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "安装位置无效或过长，请选择较短的完整本机路径（最多 ${NAUMI_MAX_INSTALLDIR_CHARS} 个字符）。"
    Abort
  ${EndIf}
  ${GetFileName} "$NaumiCandidatePath" $0
  ${If} $0 != "Naumi"
    Push "$NaumiCandidatePath\Naumi"
    Call NaumiCanonicalPath
    Pop $NaumiCandidatePath
  ${EndIf}
  ${If} $NaumiCandidatePath == ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "安装位置无效或过长，请选择较短的完整本机路径（最多 ${NAUMI_MAX_INSTALLDIR_CHARS} 个字符）。"
    Abort
  ${EndIf}
  ; Commit only a checked, nonempty, drive-absolute result. NSIS GetFullPathName
  ; returns empty for a new directory; Win32 GetFullPathNameW does not require it.
  StrCpy $INSTDIR $NaumiCandidatePath
FunctionEnd
Function NaumiDoneLeave
  ${NSD_GetState} $NaumiRunCheck $0
  ${If} $0 == ${BST_CHECKED}
    Call StartApp
  ${EndIf}
FunctionEnd
!macroend

!macro NaumiUninstallPage PREFIX
Function ${PREFIX}NaumiConfirm
  !insertmacro NaumiShell
  !insertmacro NaumiLabel 248 112 524 44 "卸载 Naumi" 22 600
  !insertmacro NaumiLabel 248 196 524 28 "个人数据将保留" 10 400
  !insertmacro NaumiButton 248 388 88 44 "取消" action-cancel ${PREFIX}NaumiCancel
  !insertmacro NaumiButton 612 388 160 44 "卸载 Naumi" action-uninstall ${PREFIX}NaumiNext
  nsDialogs::Show
FunctionEnd
!macroend
!macro NaumiUninstallerFunctions
!insertmacro NaumiPathFunctions "un."
!insertmacro NaumiFailure "un." "onUninstFailed"
!insertmacro NaumiFunctions "un." "uninstall"
!insertmacro NaumiUninstallPage "un."
!macroend
!endif
