' 林夕的小站 · 专属后台 —— 隐藏启动器
' 双击后：后台在后台跑（不弹黑窗口），浏览器自动打开
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here

' 已经在跑了就直接开浏览器
On Error Resume Next
sh.Run "cmd /c netstat -ano | findstr ""LISTENING"" | findstr "":4322 """, 0, True
On Error GoTo 0

sh.Run "node """ & here & "\admin\server\admin-server.mjs""", 0, False
WScript.Sleep 2500
sh.Run "http://127.0.0.1:4322", 1, False
