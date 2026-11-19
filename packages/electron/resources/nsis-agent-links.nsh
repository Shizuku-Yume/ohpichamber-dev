!include LogicLib.nsh

!macro AgentLinkCleanupFunctions PREFIX
Function ${PREFIX}RemoveAgentLinks
  Exch $0
  Push $1
  Push $2
  Push $3
  Push $4
  System::Call 'kernel32::GetFileAttributesW(w r0) i .r1'
  IntCmp $1 -1 done
  IntOp $4 $1 & 0x10
  IntCmp $4 0 done
  IntOp $4 $1 & 0x400
  ${If} $4 != 0
    ClearErrors
    RMDir "$0"
    ${If} ${Errors}
      SetErrorLevel 2
      Abort "Unable to remove Agent runtime junction: $0"
    ${EndIf}
    Goto done
  ${EndIf}
  FindFirst $2 $3 "$0\*"
  loop:
    StrCmp $3 "" close
    StrCmp $3 "." next
    StrCmp $3 ".." next
    Push "$0\$3"
    Call ${PREFIX}RemoveAgentLinks
  next:
    FindNext $2 $3
    Goto loop
  close:
    FindClose $2
  done:
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
FunctionEnd

Function ${PREFIX}CleanupAgentLinks
  Push $0
  Push $1
  StrCpy $0 "$INSTDIR\resources"
  System::Call 'kernel32::GetFileAttributesW(w r0) i .r1'
  IntOp $1 $1 & 0x410
  ${If} $1 = 0x10
    StrCpy $0 "$0\agent-runtime"
    System::Call 'kernel32::GetFileAttributesW(w r0) i .r1'
    IntOp $1 $1 & 0x410
    ${If} $1 = 0x10
      Push $0
      Call ${PREFIX}RemoveAgentLinks
    ${EndIf}
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd
!macroend

!ifdef BUILD_UNINSTALLER
  !insertmacro AgentLinkCleanupFunctions "un."
!else
  !insertmacro AgentLinkCleanupFunctions ""
  !include "getProcessInfo.nsh"
  Var pid

  !macro customCheckAppRunning
    !insertmacro IS_POWERSHELL_AVAILABLE
    !insertmacro _CHECK_APP_RUNNING
    Call CleanupAgentLinks
  !macroend
!endif

!macro customUnInstall
  Call un.CleanupAgentLinks
!macroend
