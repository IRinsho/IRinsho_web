---
tags:
  - C语言
title: 输入某一时刻，输出下一秒
date: 2026-10-08
cover: p3.png
category: c语言学习
summary: 使用 C 语言实现的“输入某一时刻，输出下一秒”
slug:
cssclasses:
aliases:
draft:
---
### 思路（AI仅供参考）

- 定义时间结构体，包含 `hour`、`minute`、`second`。
    
- 读取输入的时间（如 `12:34:56`）。
    
- 秒数加 1，然后依次处理进位：
    
    - 秒满 60 → 秒归 0，分钟加 1
        
    - 分钟满 60 → 分钟归 0，小时加 1
        
    - 小时满 24 → 小时归 0（进入下一天）
        
- 按 `HH:MM:SS` 格式输出，不足两位补前导 0。


```
#include <stdio.h>

// 定义时间结构体
struct Time {
    int hour;
    int minute;
    int second;
};

int main() {
    struct Time t;

    // 输入格式为 HH:MM:SS，例如 12:34:56
    scanf("%d:%d:%d", &t.hour, &t.minute, &t.second);

    // 秒数加 1
    t.second++;

    // 处理进位
    if (t.second == 60) {
        t.second = 0;
        t.minute++;
        if (t.minute == 60) {
            t.minute = 0;
            t.hour++;
            if (t.hour == 24) {
                t.hour = 0;
            }
        }
    }

    // 输出下一秒的时间，不足两位补 0
    printf("%02d:%02d:%02d\n", t.hour, t.minute, t.second);

    return 0;
}
```
### 输入输出示例

**输入：**

```
text

12:34:56
```

**输出：**

```
text

12:34:57
```

**输入：**

```
text

23:59:59
```

**输出：**

```
text

00:00:00
```

### 说明

- 如果题目要求输入用空格分隔（如 `12 34 56`），只需把 `scanf` 改为：
    
```
    scanf("%d %d %d", &t.hour, &t.minute, &t.second);
```
    
- 如果输出不需要前导 0，可将 `%02d` 改为 `%d`。
    
- 该程序默认采用 24 小时制。


### 简写为以下代码依然可以运行（仅供参考）
```
#include <stdio.h>
int main() {
    int hour;
    int minute;
    int second;
  scanf("%d:%d:%d", &hour, &minute, &second);

    second++;
    if (second>=60) {
        second=0;
        minute++;
    }
     if (minute>=60) {
         minute=0;
         hour++;
     }
      if (hour>=24) {
         hour=0;
      }

printf("%d:%d:%d", hour, minute, second);
}
```