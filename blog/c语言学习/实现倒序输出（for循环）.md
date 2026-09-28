---
title: 实现倒序输出（for循环）
date: 2026-09-28
category: c语言学习
tags:
  - C语言
draft: false
summary:
cover: p4.jpg
cssclasses:
slug:
---
案例代码
![Pasted image 20260922170957](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922170957.png)
其中
![Pasted image 20260922171616](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922171616.png)
它的含义解读为用`int`去定义`len = strlen(str)`
既：
# **`int len`**：
- 声明了一个名为 `len`（length 的缩写）的整型变量，用来准备存放接下来算出的长度。


# **`strlen(str)`**：
- 调用 `strlen` 函数，计算字符串 `str` 的实际字符个数（不含末尾的 `\0`）
- 如果要使用`strlen`则需要写`<string.h>` 头文件

那么接下来的
![Pasted image 20260922172233](https://myblog-1329557458.cos.ap-hongkong.myqcloud.com/imagees/Pasted%20image%2020260922172233.png)
则是实现倒序输出的主要函数内容for循环
# 逐部分拆解

- **`for (int i = len - 1; i >= 0; i--)`**：这是倒序遍历的核心。
    
	- **`int i = len - 1`**：**初始化**。`len` 是 `strlen(str)` 算出的字符串长度。因为 C 语言数组下标从 `0` 开始，所以最后一个字符的下标是 `长度 - 1`。`i` 从这里开始，意味着从字符串的**最后一个字符**出发。
        
    - **`i >= 0`**：**循环条件**。只要 `i` 大于等于 0，循环就继续。当 `i` 变成 -1 时，说明已经过了第一个字符，循环立刻停止。
        
    - **`i--`**：**迭代**。每次循环后 `i` 减 1，实现从后往前倒退。
    
- **`printf(format: "%c", str[i]);`**：
    
    - 这就是[[如何实现把每一位上的数独立输出出来（for循环）既 C 语言中手动遍历字符串的经典写法]]的字符打印。只不过这里的 `i` 是从大变小，所以 `str[i]` 取出的字符依次是最后一个、倒数第二个……直到第一个。


```dataview
LIST FROM #C语言 SORT date DESC
```
