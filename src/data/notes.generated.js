/* =========================================================
 *  ⚠ 本文件由 tools/build-blog.mjs 从 blog/ 文件夹自动生成，手改会被覆盖！
 *
 *  想加笔记 → 在 blog/ 里新建 .md 文件（用 Obsidian 写最方便）
 *  想改分类 → 放进 blog/ 下不同的子文件夹，或写 category: 字段
 *  想改内容 → 改 blog/ 里对应的 .md 文件，然后运行 npm run sync
 *
 *  生成时间：2026/10/17 14:41:05
 *  共 11 篇
 * ======================================================= */
export default [
  {
    id: "maya",
    title: "Maya",
    category: "未分类",
    tags: [],
    date: "2026-10-13",
    summary: "",
    content: "### 🛠️ 基础工具与操作\n\n这些是使用频率最高的基础快捷键，建议优先掌握[](https://help.autodesk.com/cloudhelp/2025/CHS/Maya-KeyboardShortcuts/files/GUID-30CACC9D-8FBE-4B85-8A8F-C5ADF32DDD4E.htm)。\n\n|快捷键|功能|\n|---|---|\n|**Q**|选择工具|\n|**W**|移动工具|\n|**E**|旋转工具|\n|**R**|缩放工具|\n|**Ctrl + Z**|撤销|\n|**Ctrl + Y**|重做|\n|**G**|重复上一次操作|\n|**Ctrl + D**|复制对象|\n|**F**|框显当前选择|\n|**A**|框显全部|\n\n### 🎯 选择模式与组件切换\n\n快速在对象和不同的组件（点、线、面）模式间切换，是建模流畅度的关键。\n\n|快捷键|功能|\n|---|---|\n|**F8**|在**对象模式**和**组件模式**间切换|\n|**F9**|进入**顶点**选择模式|\n|**F10**|进入**边**选择模式|\n|**F11**|进入**面**选择模式|\n|**Ctrl + F9/F10/F11**|将当前多边形选择转化为顶点/边/面|\n\n### ⚡ 核心建模操作\n\n这些快捷键直接对应建模命令，能显著加快操作速度。\n\n|快捷键|功能|备注|\n|---|---|---|\n|**Ctrl + E**|**挤出**（Extrude）|选中面或边后使用|\n|**Ctrl + B**|**倒角**（Bevel）|用于边或面|\n|**Ctrl + Shift + R**|**插入循环边**（Insert Edge Loop）|在多边形上添加循环边|\n|**M**|**合并顶点**（Merge Vertex）|在顶点模式下使用|\n|**Shift + 右键**|打开**建模标记菜单**|可快速访问挤出、倒角、合并、插入循环边等常用命令|\n\n### 🖱️ 视图导航与显示\n\n熟练控制视图是3D建模的基础，这些操作主要依靠 `Alt` 键配合鼠标完成。\n\n|操作|功能|\n|---|---|\n|**Alt + 左键拖动**|旋转/翻滚视图|\n|**Alt + 中键拖动**|平移视图|\n|**Alt + 右键拖动**|缩放/推拉视图|\n|**空格键**|切换单视图/四视图模式|\n\n在显示模式方面，**数字键 1-7** 可以快速切换不同的着色和显示质量，例如按 **4** 显示线框，按 **5** 显示着色，按 **6** 显示带纹理的着色。\n\n### 💡 实用技巧\n\n- **重复操作**：完成一次挤出后，使用 **G** 键可以重复该操作，非常适合制作阶梯或重复的结构。\n    \n- **自定义快捷键**：如果某些命令没有默认快捷键，你可以在 **窗口 > 设置/首选项 > 热键编辑器** 中根据自己的习惯进行设置。"
  },
  {
    id: "求最大公约数以及最小公倍数",
    title: "求最大公约数以及最小公倍数",
    category: "c语言学习",
    tags: ["C语言"],
    date: "2026-10-09",
    summary: "求最大公约数以及最小公倍数",
    content: "# 整体代码\n```\n#include <stdio.h>  \n#include <ctype.h>  \n#include <math.h>  \nint main() {  \n  int m,n;  \n  int c;  \n  \n  scanf(\"%d%d\",&m,&n);  \n  int a=m;  \n  int b=n;  \n  \n  /*辗转相除法 (欧几里得算法)  \n  首先将两个数进行模运算，即a%b  \n  ① 当a能被b整除时即 a%b == θ，直接返回 b，b就是最大公约数。  \n  例如，a=12，b=6，a%b=0，b=6就是这两个数的最大公约数。  \n  ② 当a不能被b整除时 a%b != 0，则进行辗转相除。  \n  用第三个变量来接收 a%b，即 c = a%b，用 a 来接收 b的值，用 b 来接收 c 的值。③ 重复上述①和②*/  \n  if (m%n==0) {  \n    printf(\"%d\",n);  \n  }  \n  else {  \n    while (m%n!=0) {  \n      c=m%n;  \n      m=n;  \n      n=c;  \n    }  \n    printf(\"%d \",n);  \n  }  \n  \n  /*求两个数的最小公倍数  \n  关于最小公倍数与最大公约数，有这样的定理：最小公倍数×最大公约数=两数的乘积。  \n  即：最小公倍数=两数的乘积÷最大公约数*/  \n  int t;  \n  t=a*b/n;  \n  printf(\"%d\",t);  \n  \n  return 0;  \n}\n```\n\n# 最大共公约数\n## **常用方法**\n- **“辗转相除法”**，又名**欧几里得算法**\n ### 如下\n- 设两数为a和b(a>b)，用a除以b，得a÷b=q……….r，若r=0，则最大公约数为b；若r≠0,则再用          b÷r，得b÷r=q……..r'，若r'=0，则最大公约数为r'，若r'≠0，则继续用r÷r'………..直到能够整            除为止，此时的除数即为最大公约数。\n ### 例如\n- a=99，b=18。a÷b=99÷18=5.………..9不能整除，则继续b÷r=18÷9=2可以整除，则此时的              除数9即为a和b两数的最大公约数。\n ### 代码\n```\n- int main() {  \n  int m,n;  \n  int c;  \n  \n  scanf(\"%d%d\",&m,&n);  \n  int a=m;  \n  int b=n;  \n  \n  /*辗转相除法 (欧几里得算法)  \n  首先将两个数进行模运算，即a%b  \n  ① 当a能被b整除时即 a%b == θ，直接返回 b，b就是最大公约数。  \n  例如，a=12，b=6，a%b=0，b=6就是这两个数的最大公约数。  \n  ② 当a不能被b整除时 a%b != 0，则进行辗转相除。  \n  用第三个变量来接收 a%b，即 c = a%b，用 a 来接收 b的值，用 b 来接收 c 的值。③ 重复上述①和②*/  \n  if (m%n==0) {  \n    printf(\"%d\",n);  \n  }  \n  else {  \n    while (m%n!=0) {  \n      c=m%n;  \n      m=n;  \n      n=c;  \n    }  \n    printf(\"%d \",n);  \n  }\n\n```\n\n# 最小公倍数\n## 方法\n- 关于最小公倍数与最大公约数，有这样的定理：最小公倍数×最大公约数=两数的乘积。\n- 即：最小公倍数=两数的乘积÷最大公约数\n### 代码\n```\n/*求两个数的最小公倍数  \n关于最小公倍数与最大公约数，有这样的定理：最小公倍数×最大公约数=两数的乘积。  \n即：最小公倍数=两数的乘积÷最大公约数*/  \nint t;  \nt=a*b/n;  \nprintf(\"%d\",t);\n```"
  },
  {
    id: "去掉末尾的空格",
    title: "去掉末尾空格",
    category: "c语言学习",
    tags: ["C语言"],
    date: "2026-10-08",
    summary: "",
    cover: "media/notes/p4.jpg",
    content: "### 方法一：在循环内判断是否为最后一个字符（推荐，改动最小）\n\n在打印前判断下一个字符是不是结束符 `\\0`。如果是最后一个字符，只打印字符；否则打印字符加空格。\n\n```\nfor (int i = 0; str[i] != '\\0'; i++) {\n    if (str[i + 1] == '\\0') {\n        printf(\"%c\", str[i]);       // 最后一个字符，不加空格\n    } else {\n        printf(\"%c \", str[i]);      // 不是最后一个，加空格\n    }\n}\n```\n\n或者写成一行（利用三元运算符）：\n\n```\nfor (int i = 0; str[i] != '\\0'; i++) {\n    printf(\"%c%s\", str[i], (str[i + 1] != '\\0') ? \" \" : \"\");\n}\n```\n\n### 方法二：先打印第一个字符，从第二个字符开始加空格\n\n如果字符串非空，先单独打印第一个字符。然后循环从 `i = 1` 开始，每次打印 `\" %c\"`（空格在前）。这样最后一个字符自然不会有尾随空格。\n\n```\nif (str[0] != '\\0') {\n    printf(\"%c\", str[0]); // 单独处理第一个字符\n    for (int i = 1; str[i] != '\\0'; i++) {\n        printf(\" %c\", str[i]); // 后续字符前面加空格\n    }\n}\n```\n\n### 方法三：在循环内控制空格打印\n\n判断当前索引 `i` 是否大于 0，如果是，则在打印字符前先打印一个空格。\n\n```\nfor (int i = 0; str[i] != '\\0'; i++) {\n    if (i > 0) {\n        printf(\" \");\n    }\n    printf(\"%c\", str[i]);\n}\n```\n\n最常用的是**方法一**，因为它直接遍历原本的字符串，逻辑很清晰（如果是最后一个字符就不加空格）。**方法二**在处理一些严格的竞赛题或者格式化输出\n\n```dataview\nLIST\nFROM #C语言\nSORT date DESC\n```"
  },
  {
    id: "使用-c-语言实现的-输入某一时刻-输出下一秒",
    title: "输入某一时刻，输出下一秒",
    category: "c语言学习",
    tags: ["C语言"],
    date: "2026-10-08",
    summary: "使用 C 语言实现的“输入某一时刻，输出下一秒”",
    cover: "media/notes/p3.png",
    content: "### 思路（AI仅供参考）\n\n- 定义时间结构体，包含 `hour`、`minute`、`second`。\n    \n- 读取输入的时间（如 `12:34:56`）。\n    \n- 秒数加 1，然后依次处理进位：\n    \n    - 秒满 60 → 秒归 0，分钟加 1\n        \n    - 分钟满 60 → 分钟归 0，小时加 1\n        \n    - 小时满 24 → 小时归 0（进入下一天）\n        \n- 按 `HH:MM:SS` 格式输出，不足两位补前导 0。\n\n```\n#include <stdio.h>\n\n// 定义时间结构体\nstruct Time {\n    int hour;\n    int minute;\n    int second;\n};\n\nint main() {\n    struct Time t;\n\n    // 输入格式为 HH:MM:SS，例如 12:34:56\n    scanf(\"%d:%d:%d\", &t.hour, &t.minute, &t.second);\n\n    // 秒数加 1\n    t.second++;\n\n    // 处理进位\n    if (t.second == 60) {\n        t.second = 0;\n        t.minute++;\n        if (t.minute == 60) {\n            t.minute = 0;\n            t.hour++;\n            if (t.hour == 24) {\n                t.hour = 0;\n            }\n        }\n    }\n\n    // 输出下一秒的时间，不足两位补 0\n    printf(\"%02d:%02d:%02d\\n\", t.hour, t.minute, t.second);\n\n    return 0;\n}\n```\n### 输入输出示例\n\n**输入：**\n\n```\ntext\n\n12:34:56\n```\n\n**输出：**\n\n```\ntext\n\n12:34:57\n```\n\n**输入：**\n\n```\ntext\n\n23:59:59\n```\n\n**输出：**\n\n```\ntext\n\n00:00:00\n```\n\n### 说明\n\n- 如果题目要求输入用空格分隔（如 `12 34 56`），只需把 `scanf` 改为：\n    \n```\n    scanf(\"%d %d %d\", &t.hour, &t.minute, &t.second);\n```\n    \n- 如果输出不需要前导 0，可将 `%02d` 改为 `%d`。\n    \n- 该程序默认采用 24 小时制。\n\n### 简写为以下代码依然可以运行（仅供参考）\n```\n#include <stdio.h>\nint main() {\n    int hour;\n    int minute;\n    int second;\n  scanf(\"%d:%d:%d\", &hour, &minute, &second);\n\n    second++;\n    if (second>=60) {\n        second=0;\n        minute++;\n    }\n     if (minute>=60) {\n         minute=0;\n         hour++;\n     }\n      if (hour>=24) {\n         hour=0;\n      }\n\nprintf(\"%d:%d:%d\", hour, minute, second);\n}\n```"
  },
  {
    id: "练习",
    title: "随笔练习",
    category: "未分类",
    tags: ["C语言"],
    date: "2026-10-08",
    summary: "",
    pinned: true,
    cover: "media/notes/p5.jpg",
    content: "```\r\n#include <stdio.h>\r\n#include <ctype.h>\r\nint main() {\r\n    char a;\r\n    scanf(\"%c\", &a);\r\n    if (isalpha(a)) {\r\n        if (isupper(a)) {\r\n            a = tolower(a);\r\n        }\r\n        else if (islower(a)) {\r\n            a = toupper(a);\r\n        }\r\n        printf(\"%c\", a);\r\n    }\r\n    else\r\n        printf(\"%c\", a);\r\n\r\n\r\n    return 0;\r\n}\r\n```"
  },
  {
    id: "aesw",
    title: "AI实现AE自动动输入法切换",
    category: "AE插件",
    tags: ["AI"],
    date: "2026-09-30",
    summary: "",
    cover: "media/notes/p2.png",
    content: "**以下皆为AI写入仅做参考**\n\n# AE 输入法助手\n\n  \n\n在 After Effects 里按上下文自动切换输入法的中英文状态，不用再手动按 Shift。\n\n  \n\n- **搜索效果 / 素材时 → 自动英文**（这是全自动的，不需要任何设置）\n\n- **输入文字时 → 自动中文**（第一次花 3 秒「教」它一次，之后全自动）\n\n  \n\n配套一个常驻托盘的切换引擎，和一个可以停靠在 AE 里的控制面板。\n\n  \n\n---\n\n  \n\n## 1. 安装\n\n  \n\n发布出去只有一个文件：\n\n  \n\n```\n\ndist\\AE输入法助手-安装程序.exe      （约 66 MB，自包含，对方不需要装 .NET）\n\n```\n\n  \n\n**操作：**\n\n  \n\n1. 双击这个 exe\n\n2. 点「安装并启动」（不想装可以点「仅这次运行，不安装」）\n\n3. 完全退出 After Effects 再重新打开\n\n4. 在 AE 里打开：**窗口 → 扩展 → AE 输入法助手**，把面板拖到右侧面板组停靠\n\n  \n\n安装程序会做四件事，**全程不需要管理员权限**（只写 HKCU 和当前用户的 AppData）：\n\n  \n\n| # | 动作 | 位置 |\n\n| --- | --- | --- |\n\n| 1 | 把程序复制到当前用户目录 | `%LOCALAPPDATA%\\Programs\\AesImeSwitch` |\n\n| 2 | 把控制面板装进 After Effects | `%APPDATA%\\Adobe\\CEP\\extensions\\com.aesrtools.imeswitch` |\n\n| 3 | 打开 CEP 调试模式（未签名扩展必需） | `HKCU\\SOFTWARE\\Adobe\\CSXS.9~24` |\n\n| 4 | 写开机自启项与快捷方式 | HKCU Run + 开始菜单 |\n\n  \n\n支持静默安装（批量部署用）：\n\n  \n\n```powershell\n\n.\\AE输入法助手-安装程序.exe --install --silent\n\n```\n\n  \n\n### 自己重新打包\n\n  \n\n```powershell\n\npowershell -ExecutionPolicy Bypass -File install\\install.ps1            # 只打包\n\npowershell -ExecutionPolicy Bypass -File install\\install.ps1 -Install   # 打包并在本机装一份\n\n```\n\n  \n\n产物固定是 `dist\\AE输入法助手-安装程序.exe`。AE 内嵌面板的 4 个文件是**编进 exe 里的资源**，\n\n不会出现「exe 和配套文件夹走散」的问题。\n\n  \n\n---\n\n  \n\n## 2. 首次使用：花 3 秒教它一次\n\n  \n\n**搜索框是完全自动的**，不用管。需要教的只有「文字输入」这一种场景：\n\n  \n\n1. 在 AE 里把鼠标点进**合成面板**（或者任何你要打中文的地方）\n\n2. 按一次 **`Ctrl+Shift+C`**（把当前控件记为「中文」）\n\n3. 完成。以后每次焦点回到这个面板，输入法都会自动切成中文。\n\n  \n\n反过来，如果某个地方你想要英文，点进去按 **`Ctrl+Shift+E`**（记为英文）。\n\n  \n\n> 记忆规则会同时保存**绝对坐标**和**相对前台窗口的归一化坐标**，\n\n> 命中任意一套即可。所以你拖动 AE 窗口、改分辨率、换显示器之后不用重新教\n\n> （已实测：把绝对坐标人为破坏掉，规则仍能靠归一化坐标命中）。\n\n> 只有在 AE 内部大幅重排面板布局时才需要再教一次。\n\n  \n\n> 为什么要教一次？\n\n> AE 在**文字编辑状态下不会创建任何可供外部识别的原生控件**（它用自绘文本引擎，\n\n> 连系统插入符都没有）。所以「正在输入文字」这件事对外部程序是不可见的，\n\n> 只能靠一次性的位置记忆来锁定。搜索框则不同 —— 它们是货真价实的原生\n\n> `Edit` 窗口，可以被精确识别，所以完全自动。（这个结论是在你的 AE 2025 上\n\n> 实测得出的，不是推测。）\n\n  \n\n### 更直观的做法：框选区域\n\n  \n\n面板里点 **「标记「中文输入区」…」**，屏幕会变暗，拖拽框选出合成面板那块区域，\n\n然后选择：\n\n  \n\n- **切到**：中文 / 英文\n\n- **触发**：双击区域内时 / 单击区域内时\n\n  \n\n推荐给合成面板选 **「双击触发」**：AE 里双击文字图层就是进入文字编辑，\n\n用双击当开关既能切中文，又不会影响你在合成面板按 `V` / `H` / `Z` 这些单键工具快捷键。\n\n  \n\n---\n\n  \n\n## 3. 热键\n\n  \n\n| 热键 | 作用 |\n\n| --- | --- |\n\n| `Ctrl+Shift+1` | 强制切英文 |\n\n| `Ctrl+Shift+2` | 强制切中文 |\n\n| `Ctrl+Shift+E` | 把当前控件记为「英文」 |\n\n| `Ctrl+Shift+C` | 把当前控件记为「中文」 |\n\n| `Ctrl+Shift+0` | 暂停 / 恢复自动切换 |\n\n  \n\n> 默认值刻意避开了 `Ctrl+Alt+字母/数字` —— 实测在你这台机器上这一整片组合\n\n> 已经被别的程序（输入法或截图工具）抢占了，注册会返回错误 1409。\n\n> 热键被占用时程序会自动降级到备用组合并把实际生效的值写回配置，\n\n> 界面上显示的热键永远是真的能按的那一个。\n\n>\n\n> 想改热键就编辑 `%APPDATA%\\AesImeSwitch\\config.json` 里的 `hotkeys` 段，\n\n> 然后重启程序。格式如 `\"Ctrl+Shift+F1\"`。\n\n  \n\n---\n\n  \n\n## 4. 工作原理\n\n  \n\n```\n\n         ┌──────────────────────────┐\n\n         │  焦点变了（每 120ms 探测） │\n\n         └────────────┬─────────────┘\n\n                      ▼\n\n   ┌──────────────────────────────────────────┐\n\n   │ 判定优先级                                │\n\n   │  1. 用户一键记忆的控件规则                 │\n\n   │  2. 焦点是原生 Edit 控件 → 英文（搜索框）   │\n\n   │  3. 用户框选的区域规则（单击 / 双击）       │\n\n   │  4. 宿主内默认策略（默认英文）              │\n\n   └──────────────────┬───────────────────────┘\n\n                      ▼\n\n   ┌──────────────────────────────────────────┐\n\n   │ 写输入法状态                              │\n\n   │  ① IME 影子窗口 WM_IME_CONTROL            │\n\n   │  ② AttachThreadInput + ImmSetConversionStatus │\n\n   │  每次写完都回读校验，失败自动换下一种       │\n\n   └──────────────────────────────────────────┘\n\n```\n\n  \n\n几个实现上的关键点：\n\n  \n\n- **焦点来源**：AE 的界面（DroverLord / Qt）几乎不暴露 UI Automation 信息 ——\n\n  实测 `AutomationElement.FocusedElement` 在 AE 里只能看到 4 个节点。\n\n  所以改用 `GetGUIThreadInfo` 拿 `hwndFocus`，再看窗口类名。\n\n- **搜索框识别**：实测 AE 的项目 / 时间轴 / 效果和预设三个搜索框都是\n\n  `class = \"Edit\"` 的原生窗口，父级为 `OS_EditTextContainer`。识别它们\n\n  既不依赖坐标也不依赖文字，窗口移动、面板重排都不影响。\n\n- **中英切换**：你的机器上只装了一个键盘布局（`0x08040804`，中文(简体)-美式键盘），\n\n  所以中英切换本质上是输入法的**转换模式**（`IME_CMODE_NATIVE` ↔\n\n  `IME_CMODE_ALPHANUMERIC`），不是切键盘布局。百度输入法和微软拼音都实测可用。\n\n- **DPI 感知**：程序声明了 PerMonitorV2。这很关键 —— 你的屏幕是 150% 缩放，\n\n  非 DPI 感知的进程拿到的 `GetWindowRect` 会被系统虚拟化，而低级鼠标钩子\n\n  给的坐标永远是物理像素，两者混用会让区域标记整体错位 40%。\n\n  \n\n---\n\n  \n\n## 5. 设置项\n\n  \n\n托盘图标右键 → **设置…**，或在面板里点 **打开设置**。\n\n  \n\n| 设置 | 说明 |\n\n| --- | --- |\n\n| 宿主进程 | 默认 `AfterFX`。填 `AfterFX,PremierePro` 就能同时管 Pr |\n\n| 默认策略 | 宿主内没命中任何规则时怎么办。默认「切到英文」—— 保护 AE 大量的单键快捷键 |\n\n| 焦点在搜索框时自动切英文 | 核心功能，别关 |\n\n| 开机自动启动 | 写 HKCU 的 Run 项，不需要管理员权限 |\n\n| 切换时显示托盘气泡提示 | 调试用，平时建议关掉 |\n\n| 切换规则列表 | 可以删除误记的规则 |\n\n  \n\n托盘图标颜色就是当前状态：**绿 = 英文**、**橙 = 中文**、**灰 = 暂停**。\n\n  \n\n---\n\n  \n\n## 6. 常见问题\n\n  \n\n**面板没出现在「窗口 → 扩展」里**\n\n完全退出 AE（任务管理器确认 `AfterFX.exe` 已结束）再打开。还不行的检查\n\n`%APPDATA%\\Adobe\\CEP\\extensions\\com.aesrtools.imeswitch\\CSXS\\manifest.xml`\n\n是否存在，以及注册表 `HKCU\\SOFTWARE\\Adobe\\CSXS.9\\PlayerDebugMode` 是不是 `1`。\n\n  \n\n**面板显示「未运行」**\n\n托盘程序没启动。双击 `dist\\AesImeSwitch\\AesImeSwitch.exe` 即可，\n\n它只会在托盘里出现一个图标。\n\n  \n\n**切了但没生效**\n\n看 `%APPDATA%\\AesImeSwitch\\aesime.log`，里面会写明每次切换走的是哪条策略、\n\n成功还是失败、失败原因。设置窗口底部的「当前现场」也会显示当前焦点窗口的类名。\n\n日志超过 1 MB 会自动切成 `aesime.log.1`（只保留一份备份，最多占 2 MB），\n\n这是个常驻程序，不会让它无限增长。\n\n  \n\n**在合成面板按 V 之类的工具键变成了打字**\n\n说明这个区域的规则是「单击触发 → 中文」。改成「双击触发」，或者按\n\n`Ctrl+Shift+1` 手动切回英文。\n\n  \n\n**想换成别的 Adobe 软件**\n\n设置里把「宿主进程」改成 `PremierePro` / `Illustrator` 等即可。\n\n不过「搜索框 = Edit 控件」这条规则是在 AE 上验证过的，别的软件可能需要\n\n自己按一次 `Ctrl+Shift+E` / `Ctrl+Shift+C` 教一下。\n\n  \n\n---\n\n  \n\n## 7. 卸载\n\n  \n\n三种方式，效果完全一样，都会清除程序、AE 面板、开机自启项、快捷方式、\n\n「应用和功能」里的条目、以及切换规则和日志：\n\n  \n\n| 方式 | 操作 |\n\n| --- | --- |\n\n| 开始菜单 | 开始菜单 → **AE 输入法助手** → **卸载 AE 输入法助手** |\n\n| 系统设置 | 设置 → 应用 → 已安装的应用 → 搜「AE 输入法助手」→ 卸载 |\n\n| 命令行 | `\"%LOCALAPPDATA%\\Programs\\AesImeSwitch\\AesImeSwitch.exe\" --uninstall` |\n\n  \n\n静默卸载加 `--silent`。\n\n  \n\n也可以直接跑仓库里的脚本（会优先调用程序自带的卸载逻辑，失败才退化成手工清理）：\n\n  \n\n```powershell\n\npowershell -ExecutionPolicy Bypass -File install\\uninstall.ps1\n\n```\n\n  \n\n> 卸载程序会先把自己复制到 `%TEMP%` 再接手清理 —— 正在运行的 exe 无法删除自己所在的目录。\n\n> 清理完那个 66MB 的临时副本会自己删掉（带重试的批处理，因为 .NET 进程退出和文件锁释放\n\n> 需要一点时间，单次 `del` 经常来不及）。\n\n>\n\n> `PlayerDebugMode` 不会被改回去 —— 你可能还有别的未签名扩展在用它。\n\n  \n\n---\n\n  \n\n## 8. 目录结构\n\n  \n\n```\n\nAES_Rtools/\n\n├─ src/\n\n│  ├─ AesImeSwitch.Core/          核心库（无 UI）\n\n│  │  ├─ Native/                  Win32 / IMM32 / DPI / 热键 P/Invoke\n\n│  │  ├─ Ime/                     输入法状态读写（带回读校验与策略降级）\n\n│  │  ├─ Detect/                  焦点探测、窗口树、UIA 导出、输入模拟\n\n│  │  └─ Hooks/                   全局键鼠钩子\n\n│  ├─ AesImeSwitch.App/           托盘程序 + 安装/卸载（WinForms）\n\n│  │  ├─ SwitchEngine.cs          判定引擎\n\n│  │  ├─ AppConfig.cs             配置与规则模型\n\n│  │  ├─ AppRuntime.cs            开机自启 / 命令文件 / 命令行参数\n\n│  │  ├─ Installer/               安装布局、CEP 资源内嵌、安装与卸载动作\n\n│  │  └─ UI/                      安装向导、设置窗口、区域框选、热键宿主\n\n│  └─ AesImeSwitch.Probe/         诊断命令行工具\n\n├─ cep/com.aesrtools.imeswitch/   AE 内嵌面板（打包时会被编进 exe）\n\n├─ install/\n\n│  ├─ install.ps1                 打包脚本\n\n│  └─ uninstall.ps1               命令行卸载\n\n├─ tools/                         探测脚本与验证截图\n\n├─ build/single/                  打包中间产物\n\n└─ dist/AE输入法助手-安装程序.exe   发布的文件\n\n```\n\n  \n\n### 诊断工具\n\n  \n\n编译后 `src\\AesImeSwitch.Probe\\bin\\Release\\net10.0-windows\\aesime-probe.exe`\n\n是个很有用的排查工具：\n\n  \n\n```\n\naesime-probe env                显示 DPI 感知级别、屏幕尺寸\n\naesime-probe ime                打印前台窗口的输入法现场\n\naesime-probe ime-set en|zh      强制切换（不经过引擎）\n\naesime-probe hwnds --proc AfterFX   打印 AE 的原生窗口树\n\naesime-probe gtinfo             显示当前焦点窗口与类名链\n\naesime-probe hit [x y]          命中测试：某坐标下最深的是哪个 HWND\n\naesime-probe focus [秒]         实时监听焦点变化\n\n```\n\n  \n\n排查「为什么没切换」时的标准流程：\n\n`gtinfo` 看焦点窗口类名 → 对照设置窗口底部的现场信息 → 看 `aesime.log`。\n\n# 下载链接\n\n通过网盘分享的文件：AES_Rtools\n链接: https://pan.baidu.com/s/1cJUJDxatvsWy940KyT3gdw?pwd=p9bm 提取码: p9bm"
  },
  {
    id: "如何输出字符串位数",
    title: "如何输出字符串位数",
    category: "c语言学习",
    tags: ["C语言"],
    date: "2026-09-28",
    summary: "如何输出字符串位数",
    cover: "media/notes/p3.png",
    content: "案例代码\n![Pasted image 20260922161730](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922161730.png)这段代码中  ![Pasted image 20260922162223](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922162223.png)这里是通过 “char”去定义字符数组，str代指字符，str[]代指存放字符的大小，图片里![Pasted image 20260922162448](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922162448.png)指最多储存99个字符。\n\n![Pasted image 20260922162534](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922162534.png)\nscanf是从键盘读取信息   `%s` 是 C 语言中用于处理**字符串**的占位符。\n这段代码意思是：从键盘读取一串字符存入str中\n\n![Pasted image 20260922163129](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922163129.png)\n这里的%d最好用%zu去写，strlen它是 **String Length**（字符串长度）的缩写。它是 C 语言标准库提供的一个**函数**。使用时，需要在代码最上面加上 `#include <string.h>`去调用。它返回的是一个整数（`size_t` 类型），表示字符串中**字符的个数**。![Pasted image 20260922163451](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922163451.png)它是**计算字符串 `str` 的实际长度**。这里 的`str` 是作为参数传给 `strlen` 函数，告诉它：“帮我算算这个字符串有多长”。\n\n```dataview\nLIST\nFROM #C语言\nSORT date DESC\n```"
  },
  {
    id: "实现倒序输出-for循环",
    title: "实现倒序输出（for循环）",
    category: "c语言学习",
    tags: ["C语言"],
    date: "2026-09-28",
    summary: "",
    cover: "media/notes/p4.jpg",
    content: "案例代码\n![Pasted image 20260922170957](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922170957.png)\n其中\n![Pasted image 20260922171616](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922171616.png)\n它的含义解读为用`int`去定义`len = strlen(str)`\n既：\n# **`int len`**：\n- 声明了一个名为 `len`（length 的缩写）的整型变量，用来准备存放接下来算出的长度。\n\n# **`strlen(str)`**：\n- 调用 `strlen` 函数，计算字符串 `str` 的实际字符个数（不含末尾的 `\\0`）\n- 如果要使用`strlen`则需要写`<string.h>` 头文件\n\n那么接下来的\n![Pasted image 20260922172233](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922172233.png)\n则是实现倒序输出的主要函数内容for循环\n# 逐部分拆解\n\n- **`for (int i = len - 1; i >= 0; i--)`**：这是倒序遍历的核心。\n    \n\t- **`int i = len - 1`**：**初始化**。`len` 是 `strlen(str)` 算出的字符串长度。因为 C 语言数组下标从 `0` 开始，所以最后一个字符的下标是 `长度 - 1`。`i` 从这里开始，意味着从字符串的**最后一个字符**出发。\n        \n    - **`i >= 0`**：**循环条件**。只要 `i` 大于等于 0，循环就继续。当 `i` 变成 -1 时，说明已经过了第一个字符，循环立刻停止。\n        \n    - **`i--`**：**迭代**。每次循环后 `i` 减 1，实现从后往前倒退。\n    \n- **`printf(format: \"%c\", str[i]);`**：\n    \n    - 这就是[[如何实现把每一位上的数独立输出出来（for循环）既 C 语言中手动遍历字符串的经典写法]]的字符打印。只不过这里的 `i` 是从大变小，所以 `str[i]` 取出的字符依次是最后一个、倒数第二个……直到第一个。\n\n```dataview\nLIST\nFROM #C语言\nSORT date DESC\n```"
  },
  {
    id: "特殊换行代码",
    title: "特殊换行代码",
    category: "c语言学习",
    tags: ["C语言"],
    date: "2026-09-28",
    summary: "",
    cover: "media/notes/p5.jpg",
    content: "![](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/PixPin_2026-09-23_23-27-17.png)\n\n这个要写在[[如何实现把每一位上的数独立输出出来（for循环）既 C 语言中手动遍历字符串的经典写法]]的for循环体外int main{}函数体内\n\n```dataview\nLIST\nFROM #C语言\nSORT date DESC\n```"
  },
  {
    id: "如何实现把每一位上的数独立输出出来-for循环-既-c-语言中手动遍历字符串的经典写法",
    title: "C 语言中手动遍历字符串的经典写法",
    category: "c语言学习",
    tags: ["C语言"],
    date: "2026-09-28",
    summary: "如何实现把每一位上的数独立输出出来（for循环）",
    cover: "media/notes/p2.png",
    content: "**==*修正案例*==**\n![](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/20261008132137097.png)\n\n~~案例代码~~\n~~![Pasted image 20260922164034|700](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922164034.png)~~\n\n其中\n![Pasted image 20260922164209](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922164209.png)\n是主要函数体\n其中 `int i = 0;`意义为：声明一个整数变量 `i`，作为字符串数组的**下标（索引）**。初始化为 `0`，表示从字符串的第一个字符开始访问（C语言数组下标从 0 开始）。\n\n![Pasted image 20260922164528](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922164528.png) 是for循环条件既：**只要当前字符不是结束符（‘\\0’），就继续循环；一旦遇到 `\\0`，循环立刻停止。** 这样就保证了下标 `i` 永远不会越界读取后面的垃圾数据。而`str[i]` 表示当前下标 `i` 对应的那个字符。`'\\0'` 是 C 语言的**字符串结束符**（ASCII码为 0）。在 C 语言中，任何字符串的末尾都会被系统自动加上一个 `\\0`，用来标记“字符串到这里就结束了”。\n\n![Pasted image 20260922164728](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922164728.png)做迭代更新既：每次循环体执行完后，`i` 加 1。这样下一次循环时，`str[i]` 就会去访问下一个字符。\n### ⚠️ 极重要的安全提醒：\n\n这个循环能安全结束的前提是：**`str` 数组中必须含有 `\\0`**。\n\n- 如果你用的是 `scanf(\"%s\", str)`，它是安全的，因为它会自动在末尾补 `\\0`。\n    \n- 但如果你手动定义了一个数组并且填满了 50 个字符（没有留空位），或者直接用指针指向了一块没有结束符的内存，`str[i] != '\\0'` 就会永远成立，导致 `i` 无限增加，**造成数组越界（段错误 / Segmentation Fault）**。这也是为什么 C 语言字符串操作很容易崩溃的原因。\n\n### 💡 常见应用场景：\n\n我们很少写这种循环只是为了数数，通常是为了**处理字符串里的每一个字符**，例如：\n\n1. **转大写**：`str[i] = toupper(str[i]);`\n    \n2. **统计某个字母出现次数**：`if (str[i] == 'a') count++;`\n    \n3. **字符串拷贝**：`dest[i] = src[i];`（在循环外最后补一个 `dest[i] = '\\0';`）\n\n![Pasted image 20260922165116](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922165116.png)\n这段代码必须写在for{}循环里面否则i的定义会失效\n###  `format: \"%c \"` （核心格式控制）\n\n- **`format:`**：这是编辑器（IDE）的提示，告诉你第一个参数是“格式化字符串”。\n    \n- **`%c`**：这是**字符（Character）的占位符**。它告诉 `printf`：“我这里要放一个单独的字符”。（对比之前的 `%s`，`%s` 是用来放整个字符串的）。\n###  `str[i]` （填充的数据）\n\n这是对应 `%c` 的实际参数。`str` 是字符串数组，`i` 是当前循环的下标，`str[i]` 就是当前正在处理的这个字符。`printf` 会把 `str[i]` 的值填到 `%c` 的位置。\n\n### ⚠️ 易错点与注意事项：\n\n1. **`%c` 和 `%s` 绝对不能混用**：\n    \n    - 用 `printf(\"%c\", str)` 会报错或打印出乱码，因为 `%c` 期待一个单字符，而你给了它一个地址。\n        \n    - 用 `printf(\"%s\", str[i])` 会导致程序崩溃/输出错误值，因为 `%s` 期待一个地址（字符串），而你给了它一个字符（ASCII码值，会被当成非法内存地址访问）。\n        \n2. **中文字符问题**：`%c` 通常用于打印 ASCII 字符（英文、数字、标点）。如果 `str` 里有中文，`%c` 打印出来可能会是乱码，因为一个中文字符通常占 2 到 3 个字节（UTF-8 下占 3 字节），而 `%c` 每次只读一个字节。\n\n# 知识串联\n- `for (int i = 0; str[i] != '\\0'; i++)` 逐个遍历。\n    \n- `printf(\"%c \", str[i])` 逐个打印。\n[[特殊换行代码]]\n[[去掉末尾的空格]]\n\n```dataview\nLIST\nFROM #C语言\nSORT date DESC\n```"
  },
  {
    id: "c语言练习总结",
    title: "c语言练习总结",
    category: "c语言学习",
    tags: [],
    date: "2026-09-28",
    summary: "c语言练习总结",
    pinned: true,
    cover: "media/notes/p1.png",
    content: "```dataview\nLIST\nFROM #C语言\nSORT date DESC\n```"
  },
];
