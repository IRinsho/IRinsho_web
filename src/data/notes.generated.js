/* =========================================================
 *  ⚠ 本文件由 tools/build-blog.mjs 从 blog/ 文件夹自动生成，手改会被覆盖！
 *
 *  想加笔记 → 在 blog/ 里新建 .md 文件（用 Obsidian 写最方便）
 *  想改分类 → 放进 blog/ 下不同的子文件夹，或写 category: 字段
 *  想改内容 → 改 blog/ 里对应的 .md 文件，然后运行 npm run sync
 *
 *  生成时间：2026/9/28 18:57:32
 *  共 5 篇
 * ======================================================= */
export default [
  {
    id: "测试",
    title: "测试",
    category: "测试",
    tags: ["测试"],
    date: "2026-09-28",
    summary: "测试",
    content: "行内公式 $a^2+b^2=c^2$，块级：\n\n$$\n\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}\n$$\n\n```mermaid\ngraph LR\n  A[写作] --> B[build-blog] --> C[Astro] --> D[网页]\n```\n\n```dataview\nLIST FROM #C语言 SORT date DESC\n```\n\n见 [[如何输出字符串位数]]。"
  },
  {
    id: "如何输出字符串位数",
    title: "如何输出字符串位数",
    category: "c语言学习",
    tags: ["C语言"],
    date: "2026-09-28",
    summary: "如何输出字符串位数",
    content: "案例代码\n![Pasted image 20260922161730](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922161730.png)这段代码中  ![Pasted image 20260922162223](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922162223.png)这里是通过 “char”去定义字符数组，str代指字符，str[]代指存放字符的大小，图片里![Pasted image 20260922162448](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922162448.png)指最多储存99个字符。\n\n![Pasted image 20260922162534](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922162534.png)\nscanf是从键盘读取信息   `%s` 是 C 语言中用于处理**字符串**的占位符。\n这段代码意思是：从键盘读取一串字符存入str中\n\n![Pasted image 20260922163129](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922163129.png)\n这里的%d最好用%zu去写，strlen它是 **String Length**（字符串长度）的缩写。它是 C 语言标准库提供的一个**函数**。使用时，需要在代码最上面加上 `#include <string.h>`去调用。它返回的是一个整数（`size_t` 类型），表示字符串中**字符的个数**。![Pasted image 20260922163451](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922163451.png)它是**计算字符串 `str` 的实际长度**。这里 的`str` 是作为参数传给 `strlen` 函数，告诉它：“帮我算算这个字符串有多长”。"
  },
  {
    id: "实现倒序输出-for循环",
    title: "实现倒序输出（for循环）",
    category: "c语言学习",
    tags: ["C语言"],
    date: "2026-09-28",
    summary: "",
    content: "案例代码\n![Pasted image 20260922170957](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922170957.png)\n其中\n![Pasted image 20260922171616](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922171616.png)\n它的含义解读为用`int`去定义`len = strlen(str)`\n既：\n# **`int len`**：\n- 声明了一个名为 `len`（length 的缩写）的整型变量，用来准备存放接下来算出的长度。\n\n# **`strlen(str)`**：\n- 调用 `strlen` 函数，计算字符串 `str` 的实际字符个数（不含末尾的 `\\0`）\n- 如果要使用`strlen`则需要写`<string.h>` 头文件\n\n那么接下来的\n![Pasted image 20260922172233](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922172233.png)\n则是实现倒序输出的主要函数内容for循环\n# 逐部分拆解\n\n- **`for (int i = len - 1; i >= 0; i--)`**：这是倒序遍历的核心。\n    \n\t- **`int i = len - 1`**：**初始化**。`len` 是 `strlen(str)` 算出的字符串长度。因为 C 语言数组下标从 `0` 开始，所以最后一个字符的下标是 `长度 - 1`。`i` 从这里开始，意味着从字符串的**最后一个字符**出发。\n        \n    - **`i >= 0`**：**循环条件**。只要 `i` 大于等于 0，循环就继续。当 `i` 变成 -1 时，说明已经过了第一个字符，循环立刻停止。\n        \n    - **`i--`**：**迭代**。每次循环后 `i` 减 1，实现从后往前倒退。\n    \n- **`printf(format: \"%c\", str[i]);`**：\n    \n    - 这就是[[如何实现把每一位上的数独立输出出来（for循环）既 C 语言中手动遍历字符串的经典写法]]的字符打印。只不过这里的 `i` 是从大变小，所以 `str[i]` 取出的字符依次是最后一个、倒数第二个……直到第一个。"
  },
  {
    id: "特殊换行代码",
    title: "特殊换行代码",
    category: "c语言学习",
    tags: ["C语言"],
    date: "2026-09-28",
    summary: "",
    content: "![](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/PixPin_2026-09-23_23-27-17.png)\n\n这个要写在[[如何实现把每一位上的数独立输出出来（for循环）既 C 语言中手动遍历字符串的经典写法]]的for循环体外int main{}函数体内"
  },
  {
    id: "如何实现把每一位上的数独立输出出来-for循环-既-c-语言中手动遍历字符串的经典写法",
    title: "C 语言中手动遍历字符串的经典写法",
    category: "c语言学习",
    tags: ["C语言"],
    date: "2026-09-28",
    summary: "如何实现把每一位上的数独立输出出来（for循环）",
    content: "案例代码\n\n![Pasted image 20260922164034|700](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922164034.png)\n\n其中\n![Pasted image 20260922164209](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922164209.png)\n是主要函数体\n其中 `int i = 0;`意义为：声明一个整数变量 `i`，作为字符串数组的**下标（索引）**。初始化为 `0`，表示从字符串的第一个字符开始访问（C语言数组下标从 0 开始）。\n\n![Pasted image 20260922164528](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922164528.png) 是for循环条件既：**只要当前字符不是结束符（‘\\0’），就继续循环；一旦遇到 `\\0`，循环立刻停止。** 这样就保证了下标 `i` 永远不会越界读取后面的垃圾数据。而`str[i]` 表示当前下标 `i` 对应的那个字符。`'\\0'` 是 C 语言的**字符串结束符**（ASCII码为 0）。在 C 语言中，任何字符串的末尾都会被系统自动加上一个 `\\0`，用来标记“字符串到这里就结束了”。\n\n![Pasted image 20260922164728](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922164728.png)做迭代更新既：每次循环体执行完后，`i` 加 1。这样下一次循环时，`str[i]` 就会去访问下一个字符。\n### ⚠️ 极重要的安全提醒：\n\n这个循环能安全结束的前提是：**`str` 数组中必须含有 `\\0`**。\n\n- 如果你用的是 `scanf(\"%s\", str)`，它是安全的，因为它会自动在末尾补 `\\0`。\n    \n- 但如果你手动定义了一个数组并且填满了 50 个字符（没有留空位），或者直接用指针指向了一块没有结束符的内存，`str[i] != '\\0'` 就会永远成立，导致 `i` 无限增加，**造成数组越界（段错误 / Segmentation Fault）**。这也是为什么 C 语言字符串操作很容易崩溃的原因。\n\n### 💡 常见应用场景：\n\n我们很少写这种循环只是为了数数，通常是为了**处理字符串里的每一个字符**，例如：\n\n1. **转大写**：`str[i] = toupper(str[i]);`\n    \n2. **统计某个字母出现次数**：`if (str[i] == 'a') count++;`\n    \n3. **字符串拷贝**：`dest[i] = src[i];`（在循环外最后补一个 `dest[i] = '\\0';`）\n\n![Pasted image 20260922165116](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922165116.png)\n这段代码必须写在for{}循环里面否则i的定义会失效\n###  `format: \"%c \"` （核心格式控制）\n\n- **`format:`**：这是编辑器（IDE）的提示，告诉你第一个参数是“格式化字符串”。\n    \n- **`%c`**：这是**字符（Character）的占位符**。它告诉 `printf`：“我这里要放一个单独的字符”。（对比之前的 `%s`，`%s` 是用来放整个字符串的）。\n###  `str[i]` （填充的数据）\n\n这是对应 `%c` 的实际参数。`str` 是字符串数组，`i` 是当前循环的下标，`str[i]` 就是当前正在处理的这个字符。`printf` 会把 `str[i]` 的值填到 `%c` 的位置。\n\n### ⚠️ 易错点与注意事项：\n\n1. **`%c` 和 `%s` 绝对不能混用**：\n    \n    - 用 `printf(\"%c\", str)` 会报错或打印出乱码，因为 `%c` 期待一个单字符，而你给了它一个地址。\n        \n    - 用 `printf(\"%s\", str[i])` 会导致程序崩溃/输出错误值，因为 `%s` 期待一个地址（字符串），而你给了它一个字符（ASCII码值，会被当成非法内存地址访问）。\n        \n2. **中文字符问题**：`%c` 通常用于打印 ASCII 字符（英文、数字、标点）。如果 `str` 里有中文，`%c` 打印出来可能会是乱码，因为一个中文字符通常占 2 到 3 个字节（UTF-8 下占 3 字节），而 `%c` 每次只读一个字节。\n\n# 知识串联\n- `for (int i = 0; str[i] != '\\0'; i++)` 逐个遍历。\n    \n- `printf(\"%c \", str[i])` 逐个打印。\n[[特殊换行代码]]"
  },
];
