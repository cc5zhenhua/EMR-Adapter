# EMR Adapter

一个可扩展的 EMR（电子病历）适配器框架，用于统一处理多个不同 EMR 系统的数据写入操作。

## 功能特性

- 🏗️ **分层架构**: Canonical Model → Adapter → Transport
- 🔌 **可扩展设计**: 轻松添加新的 EMR 系统支持
- 🔐 **统一认证**: 标准化的认证接口
- 🔄 **自动重试**: 智能重试机制
- 📝 **CLI 工具**: 命令行界面，支持交互式和文件输入

## 演示

<video width="800" controls>
  <source src="./Demo.mp4" type="video/mp4">
  您的浏览器不支持视频标签。
</video>

## 安装

```bash
# 安装依赖
yarn install

# 构建项目
yarn build
```

## 使用方法

### 1. 登录到 EMR 系统

```bash
# 交互式登录
yarn start login --emr wellsky

# 命令行参数登录
yarn start login --emr wellsky --username <username> --password <password>

# 指定自定义 URL
yarn start login --emr wellsky --username <username> --password <password> --url <base-url>
```

### 2. 发布 Visit Note

#### 从 JSON 文件发布

首先创建一个 JSON 文件 `visit-note.json`:

```json
{
    "carelog": "",
    "visitId": "1234567890",
    "patientId": "1234567890",
    "caregiverId": "1234567890",
    "visitDate": "2025-12-22",
    "startTime": "10:00",
    "endTime": "11:00",
    "shift": "266477302",
    "unavailability": "",
    "date": "12/22/2025",
    "tags": "test-tag",
    "note": "This is a test note",
    "show_with_billing": "on",
    "show_with_payroll": "on"
}
```

然后运行：

```bash
yarn start post-note --emr wellsky --file visit-note.json --username <username> --password <password>
```

#### 交互式发布

```bash
yarn start post-note --emr wellsky --interactive --username <username> --password <password>
```

### 3. 开发模式（使用 ts-node）

```bash
# 直接运行 TypeScript（无需构建）
yarn dev login --emr wellsky
yarn dev post-note --emr wellsky --interactive
```

## 项目结构

```
src/
├── types/              # 类型定义
├── models/            # Canonical Model（规范模型）
├── transport/         # Transport Layer（HTTP、Session、Retry）
├── adapters/          # Adapter Layer（BaseAdapter、WellSkyAdapter）
├── services/           # Application Layer（业务服务）
└── cli.ts             # CLI 入口
```

## 支持的 EMR 系统

- ✅ WellSky
- 🚧 AxisCare (计划中)
- 🚧 AlayaCare (计划中)

## 开发

### 添加新的 EMR 适配器

1. 在 `src/adapters/` 创建新的适配器类，继承 `BaseAdapter`
2. 实现抽象方法：`authenticate()`, `postVisitNote()`, `transform()`, `getEMRType()`
3. 在 `AdapterFactory` 中注册新适配器
4. 在 `EMRType` 枚举中添加新类型

示例：

```typescript
export class AxisCareAdapter extends BaseAdapter {
  getEMRType(): EMRType {
    return EMRType.AxisCare;
  }
  
  async authenticate(credentials: Credentials): Promise<Session> {
    // 实现 AxisCare 特定的认证逻辑
  }
  
  transform(note: VisitNote): AxisCareVisitNoteRequest {
    // 实现数据转换
  }
  
  async postVisitNote(note: VisitNote): Promise<PostResult> {
    // 实现写入逻辑
  }
}
```

## 调试

设置 `DEBUG` 环境变量以查看详细输出：

```bash
DEBUG=1 yarn start login --emr wellsky --username <user> --password <pass>
```

## 许可证

MIT
