# Transpec 开发规范填充

## Goal

填充 `.trellis/spec/` 下的开发指南，建立 Transpec 项目的开发规范体系，确保 future AI agent 和开发者能正确理解和开发 transpec。

## Requirements

1. **IR 设计原则** - 定义框架无关的中间表示（IR）设计规范
2. **框架适配器结构** - 定义各个框架 adapter 的代码结构和模式
3. **转换管道** - 定义 Parser → IR → Emitter 的转换流程和职责划分
4. **项目代码组织** - 规范目录结构、模块划分、命令设计

## Scope

- **填充内容**：`.trellis/spec/backend/` 和 `.trellis/spec/guides/` 下的规范文件
- **不填充内容**：面向用户的文档（产品使用手册等）
- **依据**：基于当前项目现有代码结构进行规范

## Technical Notes

- Transpec 是框架转换工具，支持 trellis、openspec、spec-kit、superpowers 等框架
- 核心概念：Parser（解析框架特定格式）→ IR（中间表示）→ Emitter（生成目标框架格式）
- 当前项目基于 trellis 框架开发

## Output

- 填充后的规范文件位于 `.trellis/spec/backend/` 和 `.trellis/spec/guides/`
