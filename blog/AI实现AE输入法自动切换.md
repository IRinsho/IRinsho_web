---
tags:
  - AI
title: AI实现AE自动动输入法切换
date: 2026-09-30
slug: AEsw
draft: false
cover: p2.png
category: AE插件
---

**以下皆为AI写入仅做参考**


# AE 输入法助手

  

在 After Effects 里按上下文自动切换输入法的中英文状态，不用再手动按 Shift。

  

- **搜索效果 / 素材时 → 自动英文**（这是全自动的，不需要任何设置）

- **输入文字时 → 自动中文**（第一次花 3 秒「教」它一次，之后全自动）

  

配套一个常驻托盘的切换引擎，和一个可以停靠在 AE 里的控制面板。

  

---

  

## 1. 安装

  

发布出去只有一个文件：

  

```

dist\AE输入法助手-安装程序.exe      （约 66 MB，自包含，对方不需要装 .NET）

```

  

**操作：**

  

1. 双击这个 exe

2. 点「安装并启动」（不想装可以点「仅这次运行，不安装」）

3. 完全退出 After Effects 再重新打开

4. 在 AE 里打开：**窗口 → 扩展 → AE 输入法助手**，把面板拖到右侧面板组停靠

  

安装程序会做四件事，**全程不需要管理员权限**（只写 HKCU 和当前用户的 AppData）：

  

| # | 动作 | 位置 |

| --- | --- | --- |

| 1 | 把程序复制到当前用户目录 | `%LOCALAPPDATA%\Programs\AesImeSwitch` |

| 2 | 把控制面板装进 After Effects | `%APPDATA%\Adobe\CEP\extensions\com.aesrtools.imeswitch` |

| 3 | 打开 CEP 调试模式（未签名扩展必需） | `HKCU\SOFTWARE\Adobe\CSXS.9~24` |

| 4 | 写开机自启项与快捷方式 | HKCU Run + 开始菜单 |

  

支持静默安装（批量部署用）：

  

```powershell

.\AE输入法助手-安装程序.exe --install --silent

```

  

### 自己重新打包

  

```powershell

powershell -ExecutionPolicy Bypass -File install\install.ps1            # 只打包

powershell -ExecutionPolicy Bypass -File install\install.ps1 -Install   # 打包并在本机装一份

```

  

产物固定是 `dist\AE输入法助手-安装程序.exe`。AE 内嵌面板的 4 个文件是**编进 exe 里的资源**，

不会出现「exe 和配套文件夹走散」的问题。

  

---

  

## 2. 首次使用：花 3 秒教它一次

  

**搜索框是完全自动的**，不用管。需要教的只有「文字输入」这一种场景：

  

1. 在 AE 里把鼠标点进**合成面板**（或者任何你要打中文的地方）

2. 按一次 **`Ctrl+Shift+C`**（把当前控件记为「中文」）

3. 完成。以后每次焦点回到这个面板，输入法都会自动切成中文。

  

反过来，如果某个地方你想要英文，点进去按 **`Ctrl+Shift+E`**（记为英文）。

  

> 记忆规则会同时保存**绝对坐标**和**相对前台窗口的归一化坐标**，

> 命中任意一套即可。所以你拖动 AE 窗口、改分辨率、换显示器之后不用重新教

> （已实测：把绝对坐标人为破坏掉，规则仍能靠归一化坐标命中）。

> 只有在 AE 内部大幅重排面板布局时才需要再教一次。

  

> 为什么要教一次？

> AE 在**文字编辑状态下不会创建任何可供外部识别的原生控件**（它用自绘文本引擎，

> 连系统插入符都没有）。所以「正在输入文字」这件事对外部程序是不可见的，

> 只能靠一次性的位置记忆来锁定。搜索框则不同 —— 它们是货真价实的原生

> `Edit` 窗口，可以被精确识别，所以完全自动。（这个结论是在你的 AE 2025 上

> 实测得出的，不是推测。）

  

### 更直观的做法：框选区域

  

面板里点 **「标记「中文输入区」…」**，屏幕会变暗，拖拽框选出合成面板那块区域，

然后选择：

  

- **切到**：中文 / 英文

- **触发**：双击区域内时 / 单击区域内时

  

推荐给合成面板选 **「双击触发」**：AE 里双击文字图层就是进入文字编辑，

用双击当开关既能切中文，又不会影响你在合成面板按 `V` / `H` / `Z` 这些单键工具快捷键。

  

---

  

## 3. 热键

  

| 热键 | 作用 |

| --- | --- |

| `Ctrl+Shift+1` | 强制切英文 |

| `Ctrl+Shift+2` | 强制切中文 |

| `Ctrl+Shift+E` | 把当前控件记为「英文」 |

| `Ctrl+Shift+C` | 把当前控件记为「中文」 |

| `Ctrl+Shift+0` | 暂停 / 恢复自动切换 |

  

> 默认值刻意避开了 `Ctrl+Alt+字母/数字` —— 实测在你这台机器上这一整片组合

> 已经被别的程序（输入法或截图工具）抢占了，注册会返回错误 1409。

> 热键被占用时程序会自动降级到备用组合并把实际生效的值写回配置，

> 界面上显示的热键永远是真的能按的那一个。

>

> 想改热键就编辑 `%APPDATA%\AesImeSwitch\config.json` 里的 `hotkeys` 段，

> 然后重启程序。格式如 `"Ctrl+Shift+F1"`。

  

---

  

## 4. 工作原理

  

```

         ┌──────────────────────────┐

         │  焦点变了（每 120ms 探测） │

         └────────────┬─────────────┘

                      ▼

   ┌──────────────────────────────────────────┐

   │ 判定优先级                                │

   │  1. 用户一键记忆的控件规则                 │

   │  2. 焦点是原生 Edit 控件 → 英文（搜索框）   │

   │  3. 用户框选的区域规则（单击 / 双击）       │

   │  4. 宿主内默认策略（默认英文）              │

   └──────────────────┬───────────────────────┘

                      ▼

   ┌──────────────────────────────────────────┐

   │ 写输入法状态                              │

   │  ① IME 影子窗口 WM_IME_CONTROL            │

   │  ② AttachThreadInput + ImmSetConversionStatus │

   │  每次写完都回读校验，失败自动换下一种       │

   └──────────────────────────────────────────┘

```

  

几个实现上的关键点：

  

- **焦点来源**：AE 的界面（DroverLord / Qt）几乎不暴露 UI Automation 信息 ——

  实测 `AutomationElement.FocusedElement` 在 AE 里只能看到 4 个节点。

  所以改用 `GetGUIThreadInfo` 拿 `hwndFocus`，再看窗口类名。

- **搜索框识别**：实测 AE 的项目 / 时间轴 / 效果和预设三个搜索框都是

  `class = "Edit"` 的原生窗口，父级为 `OS_EditTextContainer`。识别它们

  既不依赖坐标也不依赖文字，窗口移动、面板重排都不影响。

- **中英切换**：你的机器上只装了一个键盘布局（`0x08040804`，中文(简体)-美式键盘），

  所以中英切换本质上是输入法的**转换模式**（`IME_CMODE_NATIVE` ↔

  `IME_CMODE_ALPHANUMERIC`），不是切键盘布局。百度输入法和微软拼音都实测可用。

- **DPI 感知**：程序声明了 PerMonitorV2。这很关键 —— 你的屏幕是 150% 缩放，

  非 DPI 感知的进程拿到的 `GetWindowRect` 会被系统虚拟化，而低级鼠标钩子

  给的坐标永远是物理像素，两者混用会让区域标记整体错位 40%。

  

---

  

## 5. 设置项

  

托盘图标右键 → **设置…**，或在面板里点 **打开设置**。

  

| 设置 | 说明 |

| --- | --- |

| 宿主进程 | 默认 `AfterFX`。填 `AfterFX,PremierePro` 就能同时管 Pr |

| 默认策略 | 宿主内没命中任何规则时怎么办。默认「切到英文」—— 保护 AE 大量的单键快捷键 |

| 焦点在搜索框时自动切英文 | 核心功能，别关 |

| 开机自动启动 | 写 HKCU 的 Run 项，不需要管理员权限 |

| 切换时显示托盘气泡提示 | 调试用，平时建议关掉 |

| 切换规则列表 | 可以删除误记的规则 |

  

托盘图标颜色就是当前状态：**绿 = 英文**、**橙 = 中文**、**灰 = 暂停**。

  

---

  

## 6. 常见问题

  

**面板没出现在「窗口 → 扩展」里**

完全退出 AE（任务管理器确认 `AfterFX.exe` 已结束）再打开。还不行的检查

`%APPDATA%\Adobe\CEP\extensions\com.aesrtools.imeswitch\CSXS\manifest.xml`

是否存在，以及注册表 `HKCU\SOFTWARE\Adobe\CSXS.9\PlayerDebugMode` 是不是 `1`。

  

**面板显示「未运行」**

托盘程序没启动。双击 `dist\AesImeSwitch\AesImeSwitch.exe` 即可，

它只会在托盘里出现一个图标。

  

**切了但没生效**

看 `%APPDATA%\AesImeSwitch\aesime.log`，里面会写明每次切换走的是哪条策略、

成功还是失败、失败原因。设置窗口底部的「当前现场」也会显示当前焦点窗口的类名。

日志超过 1 MB 会自动切成 `aesime.log.1`（只保留一份备份，最多占 2 MB），

这是个常驻程序，不会让它无限增长。

  

**在合成面板按 V 之类的工具键变成了打字**

说明这个区域的规则是「单击触发 → 中文」。改成「双击触发」，或者按

`Ctrl+Shift+1` 手动切回英文。

  

**想换成别的 Adobe 软件**

设置里把「宿主进程」改成 `PremierePro` / `Illustrator` 等即可。

不过「搜索框 = Edit 控件」这条规则是在 AE 上验证过的，别的软件可能需要

自己按一次 `Ctrl+Shift+E` / `Ctrl+Shift+C` 教一下。

  

---

  

## 7. 卸载

  

三种方式，效果完全一样，都会清除程序、AE 面板、开机自启项、快捷方式、

「应用和功能」里的条目、以及切换规则和日志：

  

| 方式 | 操作 |

| --- | --- |

| 开始菜单 | 开始菜单 → **AE 输入法助手** → **卸载 AE 输入法助手** |

| 系统设置 | 设置 → 应用 → 已安装的应用 → 搜「AE 输入法助手」→ 卸载 |

| 命令行 | `"%LOCALAPPDATA%\Programs\AesImeSwitch\AesImeSwitch.exe" --uninstall` |

  

静默卸载加 `--silent`。

  

也可以直接跑仓库里的脚本（会优先调用程序自带的卸载逻辑，失败才退化成手工清理）：

  

```powershell

powershell -ExecutionPolicy Bypass -File install\uninstall.ps1

```

  

> 卸载程序会先把自己复制到 `%TEMP%` 再接手清理 —— 正在运行的 exe 无法删除自己所在的目录。

> 清理完那个 66MB 的临时副本会自己删掉（带重试的批处理，因为 .NET 进程退出和文件锁释放

> 需要一点时间，单次 `del` 经常来不及）。

>

> `PlayerDebugMode` 不会被改回去 —— 你可能还有别的未签名扩展在用它。

  

---

  

## 8. 目录结构

  

```

AES_Rtools/

├─ src/

│  ├─ AesImeSwitch.Core/          核心库（无 UI）

│  │  ├─ Native/                  Win32 / IMM32 / DPI / 热键 P/Invoke

│  │  ├─ Ime/                     输入法状态读写（带回读校验与策略降级）

│  │  ├─ Detect/                  焦点探测、窗口树、UIA 导出、输入模拟

│  │  └─ Hooks/                   全局键鼠钩子

│  ├─ AesImeSwitch.App/           托盘程序 + 安装/卸载（WinForms）

│  │  ├─ SwitchEngine.cs          判定引擎

│  │  ├─ AppConfig.cs             配置与规则模型

│  │  ├─ AppRuntime.cs            开机自启 / 命令文件 / 命令行参数

│  │  ├─ Installer/               安装布局、CEP 资源内嵌、安装与卸载动作

│  │  └─ UI/                      安装向导、设置窗口、区域框选、热键宿主

│  └─ AesImeSwitch.Probe/         诊断命令行工具

├─ cep/com.aesrtools.imeswitch/   AE 内嵌面板（打包时会被编进 exe）

├─ install/

│  ├─ install.ps1                 打包脚本

│  └─ uninstall.ps1               命令行卸载

├─ tools/                         探测脚本与验证截图

├─ build/single/                  打包中间产物

└─ dist/AE输入法助手-安装程序.exe   发布的文件

```

  

### 诊断工具

  

编译后 `src\AesImeSwitch.Probe\bin\Release\net10.0-windows\aesime-probe.exe`

是个很有用的排查工具：

  

```

aesime-probe env                显示 DPI 感知级别、屏幕尺寸

aesime-probe ime                打印前台窗口的输入法现场

aesime-probe ime-set en|zh      强制切换（不经过引擎）

aesime-probe hwnds --proc AfterFX   打印 AE 的原生窗口树

aesime-probe gtinfo             显示当前焦点窗口与类名链

aesime-probe hit [x y]          命中测试：某坐标下最深的是哪个 HWND

aesime-probe focus [秒]         实时监听焦点变化

```

  

排查「为什么没切换」时的标准流程：

`gtinfo` 看焦点窗口类名 → 对照设置窗口底部的现场信息 → 看 `aesime.log`。


# 下载链接

通过网盘分享的文件：AES_Rtools
链接: https://pan.baidu.com/s/1cJUJDxatvsWy940KyT3gdw?pwd=p9bm 提取码: p9bm 