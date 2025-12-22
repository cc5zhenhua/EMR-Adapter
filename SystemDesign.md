# EMR Adapter System Design

## 概述

本系统旨在构建一个可扩展的 EMR（电子病历）适配器框架，用于统一处理多个不同 EMR 系统的数据写入操作。当前实现以 WellSky 为起点，但架构设计支持未来轻松添加其他 EMR 系统（如 AxisCare、AlayaCare 等）。

## 核心设计原则

### 1. 抽象与分层
- **Canonical Model（规范模型）**: 定义统一的业务数据模型，独立于任何特定 EMR
- **Adapter Layer（适配层）**: 负责将规范模型转换为特定 EMR 的请求格式
- **Transport Layer（传输层）**: 处理认证、会话管理和 HTTP 请求

### 2. 可扩展性
- 新增 EMR 系统时，只需实现新的 Adapter，无需修改核心逻辑
- 通过接口和抽象类确保各 EMR 实现的一致性
- 配置驱动，减少硬编码

### 3. 可测试性
- 使用 Fixture 测试验证请求格式
- 模拟网络层，支持离线测试
- 清晰的错误处理和日志记录

## 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Layer                             │
│  (commander, inquirer, chalk for user interaction)      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Application Layer                           │
│  - VisitNoteService (业务逻辑编排)                       │
│  - AuthenticationService (统一认证接口)                  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Adapter Layer (可扩展)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ WellSky      │  │ AxisCare     │  │ AlayaCare    │  │
│  │ Adapter      │  │ Adapter      │  │ Adapter      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                  │                  │          │
│         └──────────────────┼──────────────────┘          │
│                            │                             │
│              ┌─────────────▼─────────────┐              │
│              │   BaseAdapter (抽象基类)   │              │
│              │  - authenticate()          │              │
│              │  - postVisitNote()        │              │
│              │  - transform()             │              │
│              └────────────────────────────┘              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Transport Layer                           │
│  - HTTPClient (封装 fetch/axios)                        │
│  - SessionManager (管理 cookies/sessions)              │
│  - RetryHandler (重试逻辑)                              │
└─────────────────────────────────────────────────────────┘
```

## 数据模型设计

### Canonical Visit Note Model

```typescript
interface VisitNote {
  // 业务标识
  visitId: string;
  patientId: string;
  caregiverId: string;
  
  // 时间信息
  visitDate: Date;
  startTime: string;
  endTime: string;
  
  // 内容
  note: string;
  tasks?: Task[];
  
  // 元数据
  metadata?: Record<string, any>;
}
```

### EMR-Specific Models

每个 Adapter 定义自己的请求/响应模型，但必须实现从 Canonical Model 的转换：

```typescript
// WellSky 特定格式
interface WellSkyVisitNoteRequest {
  // WellSky 特定的字段结构
  visit_id: number;
  note_text: string;
  // ...
}
```

## 核心组件设计

### 1. BaseAdapter (抽象基类)

```typescript
abstract class BaseAdapter {
  protected httpClient: HTTPClient;
  protected sessionManager: SessionManager;
  
  abstract authenticate(credentials: Credentials): Promise<Session>;
  abstract postVisitNote(note: VisitNote): Promise<PostResult>;
  abstract transform(note: VisitNote): EMRSpecificRequest;
  
  // 通用方法
  protected handleRetry<T>(fn: () => Promise<T>): Promise<T>;
  protected validateResponse(response: Response): void;
}
```

**设计考虑**:
- 抽象方法强制每个 EMR 实现必需功能
- 通用方法（重试、验证）在基类中实现，避免重复

### 2. WellSkyAdapter

```typescript
class WellSkyAdapter extends BaseAdapter {
  // WellSky 特定的认证流程
  async authenticate(credentials: Credentials): Promise<Session> {
    // 1. 登录页面获取 CSRF token
    // 2. 提交登录表单
    // 3. 提取 session cookies
    // 4. 验证登录状态
  }
  
  // WellSky 特定的请求转换
  transform(note: VisitNote): WellSkyVisitNoteRequest {
    return {
      visit_id: parseInt(note.visitId),
      note_text: note.note,
      // WellSky 特定的字段映射
    };
  }
  
  // WellSky 特定的写入逻辑
  async postVisitNote(note: VisitNote): Promise<PostResult> {
    const request = this.transform(note);
    // 1. 可能需要的预请求（获取表单 token）
    // 2. 执行写入请求
    // 3. 验证响应
    // 4. 处理重试逻辑
  }
}
```

**设计考虑**:
- 封装 WellSky 的所有特殊逻辑（CSRF、表单 token、请求顺序）
- 通过 `transform` 方法清晰展示数据转换逻辑
- 错误处理针对 WellSky 的特定错误码

### 3. VisitNoteService (业务编排层)

```typescript
class VisitNoteService {
  private adapter: BaseAdapter;
  
  constructor(emrType: EMRType) {
    this.adapter = AdapterFactory.create(emrType);
  }
  
  async postVisitNote(note: VisitNote): Promise<PostResult> {
    // 1. 验证输入
    // 2. 调用 adapter
    // 3. 统一错误处理
    // 4. 日志记录
  }
}
```

**设计考虑**:
- 业务层不关心具体 EMR 实现
- 通过工厂模式创建适配器
- 统一的错误处理和日志

### 4. AdapterFactory

```typescript
class AdapterFactory {
  static create(emrType: EMRType): BaseAdapter {
    switch (emrType) {
      case EMRType.WellSky:
        return new WellSkyAdapter();
      case EMRType.AxisCare:
        return new AxisCareAdapter();
      case EMRType.AlayaCare:
        return new AlayaCareAdapter();
      default:
        throw new Error(`Unsupported EMR type: ${emrType}`);
    }
  }
}
```

**设计考虑**:
- 集中管理适配器创建逻辑
- 未来可通过配置文件或插件机制扩展

## 认证设计

### 统一认证接口

```typescript
interface Credentials {
  username: string;
  password: string;
  baseUrl?: string; // EMR 特定的配置
}

interface Session {
  cookies: string[];
  tokens?: Record<string, string>; // CSRF tokens, etc.
  expiresAt?: Date;
}
```

### WellSky 认证流程

基于 HAR 文件分析，WellSky 认证流程：

1. **GET 登录页面**: 获取初始 cookies 和可能的 CSRF token
2. **POST 登录表单**: 提交用户名密码，获取 session cookies
3. **验证登录**: 访问受保护页面确认登录成功
4. **会话维护**: 在后续请求中携带 cookies

**实现要点**:
- 使用 `SessionManager` 管理 cookies
- 处理重定向和 cookie 设置
- 检测登录失败（错误页面、重定向到登录页）

## 请求处理设计

### 重试策略

```typescript
interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  retryableErrors: string[];
}

// 针对 WellSky 的重试逻辑
- 网络错误: 重试
- 5xx 错误: 重试
- 4xx 错误（认证相关）: 重新认证后重试
- 4xx 错误（业务逻辑）: 不重试
```

### 错误处理

```typescript
enum ErrorType {
  Authentication = 'AUTHENTICATION',
  Network = 'NETWORK',
  Validation = 'VALIDATION',
  EMRSpecific = 'EMR_SPECIFIC',
}

class EMRAdapterError extends Error {
  type: ErrorType;
  emrType: EMRType;
  originalError?: any;
}
```

**设计考虑**:
- 统一的错误类型，便于上层处理
- 保留原始错误信息用于调试
- 区分可重试和不可重试的错误

## 测试策略

### 1. Fixture-Based Tests

```typescript
describe('WellSkyAdapter', () => {
  it('should transform canonical model to WellSky format', () => {
    const note = loadFixture('visit-note-canonical.json');
    const adapter = new WellSkyAdapter();
    const request = adapter.transform(note);
    
    expect(request).toMatchSnapshot('wellsky-visit-note-request.json');
  });
  
  it('should handle authentication flow', async () => {
    const credentials = loadFixture('wellsky-credentials.json');
    const adapter = new WellSkyAdapter();
    const session = await adapter.authenticate(credentials);
    
    expect(session.cookies).toBeDefined();
  });
});
```

**设计考虑**:
- 使用快照测试验证请求格式
- Fixture 文件作为"契约"，确保格式稳定
- 模拟 HTTP 响应，支持离线测试

### 2. Integration Tests

```typescript
describe('WellSkyAdapter Integration', () => {
  it('should post visit note end-to-end', async () => {
    // 使用真实或 mock 的 HTTP 客户端
    // 验证完整的请求序列
  });
});
```

## CLI 设计

### 命令结构

```bash
emr-adapter login --emr wellsky --username <user> --password <pass>
emr-adapter post-note --emr wellsky --file note.json
emr-adapter post-note --emr wellsky --interactive
```

### 输出格式

```json
{
  "success": true,
  "emr": "wellsky",
  "visitId": "12345",
  "timestamp": "2025-01-10T20:41:05Z",
  "request": { /* 实际发送的请求 */ },
  "response": { /* EMR 响应摘要 */ }
}
```

**设计考虑**:
- 结构化输出便于调试和日志分析
- 支持交互式和文件输入
- 清晰的错误消息

## 扩展性设计

### 添加新 EMR 的步骤

1. **创建新的 Adapter 类**
   ```typescript
   class AxisCareAdapter extends BaseAdapter {
     // 实现抽象方法
   }
   ```

2. **定义 EMR 特定模型**
   ```typescript
   interface AxisCareVisitNoteRequest { ... }
   ```

3. **更新 Factory**
   ```typescript
   case EMRType.AxisCare:
     return new AxisCareAdapter();
   ```

4. **添加测试和 Fixtures**
   - 创建 `axiscare-visit-note-request.json` fixture
   - 编写适配器测试

**关键点**:
- 不需要修改现有代码
- 每个 EMR 的实现完全独立
- 通过接口保证一致性

## 配置管理

### 环境配置

```typescript
interface EMRConfig {
  baseUrl: string;
  timeout: number;
  retry: RetryConfig;
  // EMR 特定的配置
}

// 通过配置文件或环境变量管理
const configs: Record<EMRType, EMRConfig> = {
  [EMRType.WellSky]: {
    baseUrl: 'https://avasandbox.clearcareonline.com',
    timeout: 30000,
    // ...
  },
};
```

## 未来改进方向

### 1. 插件化架构
- 通过动态加载支持运行时添加新 EMR
- 减少核心代码变更

### 2. 配置驱动转换
- 使用 JSON/YAML 配置定义字段映射
- 减少代码重复

### 3. 请求录制与回放
- 支持录制真实请求作为测试用例
- 便于调试和验证

### 4. 监控与可观测性
- 集成日志、指标、追踪
- 便于生产环境问题诊断

## 总结

本设计通过以下方式实现可扩展性：

1. **清晰的抽象层次**: Canonical Model → Adapter → Transport
2. **接口驱动**: 通过抽象基类保证一致性
3. **最小依赖**: 每个 EMR 实现独立，互不影响
4. **测试优先**: Fixture 测试确保格式稳定
5. **配置外置**: 减少硬编码，提高灵活性

当需要添加 AxisCare 或 AlayaCare 时，只需：
- 实现新的 Adapter 类
- 添加相应的测试和 Fixtures
- 在 Factory 中注册

核心架构和业务逻辑无需修改，真正实现了"开闭原则"。

