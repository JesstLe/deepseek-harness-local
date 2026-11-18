Unicode true
Name "Update argument observation"
OutFile "E:\Workspace\naumi-desktop\runtime\update-argv\observe.exe"
RequestExecutionLevel user
SilentInstall silent
!addincludedir "E:\Workspace\naumi-desktop\desktop\node_modules\app-builder-lib\templates\nsis\include"
!addincludedir "E:\Workspace\naumi-desktop\desktop\node_modules\app-builder-lib\templates\nsis"
!addplugindir "C:\Users\13357\AppData\Local\electron-builder\Cache\nsis-resources-3.4.1\nsis-resources-3.4.1-2jx2y\plugins\x86-unicode"
!include StdUtils.nsh
!include "E:\Workspace\naumi-desktop\desktop\node_modules\app-builder-lib\templates\nsis\multiUser.nsh"
Section
  ${StdUtils.GetAllParameters} $R4 "0"
  !insertmacro GetDParameter $R0
  FileOpen $0 "E:\Workspace\naumi-desktop\runtime\update-argv\result.txt" w
  FileWrite $0 "raw=$R4$\r$\ndirectory=$R0$\r$\n"
  FileClose $0
SectionEnd
