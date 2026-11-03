' Hidden launcher for the desktop shortcut.
' Runs start.cmd without a console window; start.cmd clears ELECTRON_RUN_AS_NODE
' and repairs the resources\app junction before starting the app.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = """" & dir & "\start.cmd"""

For Each arg In WScript.Arguments
  cmd = cmd & " " & arg
Next

shell.Run cmd, 0, False
