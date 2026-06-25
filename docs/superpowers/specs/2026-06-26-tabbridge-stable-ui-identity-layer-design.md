# TabBridge Stable UI Identity Layer 设计文档

日期：2026-06-26

## 摘要

本文档定义 TabBridge Snapshot Engine + Ref System + Element Identity Layer v2 的重构设计。当前实现使用 DOM 顺序生成 `@e1`、`@e2`、`@e3`，并通过 `snapshotId + frameRef + ref` 查找元素记录。这种模型在 DOM 插入、删除、重排、React re-render、多步 Agent 执行中会产生 ref 漂移。

本次重构目标是把 TabBridge 从 **MVP DOM flat dump + index ref + snapshot cache** 升级为：

```text
Layer 1: Snapshot View Layer
Layer 2: Stable Identity Layer (Ref System)
Layer 3: Cross-Snapshot Matching Engine
```

核心原则：

```text
snapshotId = observation version / 快照版本上下文
ref        = stable UI identity / 稳定 UI 元素身份
```

本轮明确不实现 selector/xpath 相关增强，也不把 selector/xpath 用作 identity 或 action resolution。

## 目标

- Stable ref：DOM reorder、minor DOM change、snapshot 重建后，原 UI 元素尽可能保持同一 ref。
- Cross-snapshot identity：同一 UI 元素跨 snapshot 复用 ref，支持元素演进、消失、再出现。
- Action stability：`click(ref)` 优先通过 latest identity resolution 和 semantic rematch 找到 live DOM 元素；失败时安全返回 `REF_STALE`。
- Semantic snapshot：snapshot 元素表达 role、accessible name、text、state、bounding box、identity hash、risk。
- 向后兼容：保留 `snapshotId` 作为版本上下文和旧调用辅助字段，但不再把它作为 ref identity 的主键。

## 非目标

- 不实现 selector candidates 增强。
- 不实现 xpath candidates 增强。
- 不使用 selector/xpath 作为 primary identity 或 action resolution 依据。
- 不实现 CDP snapshot。
- 不实现 visual grounding。
- 不实现 action queue / retry queue。
- 不实现 frame/cross-origin deep traversal。
- 不实现 Browser Use / Operator 级 Agent Runtime orchestration。

## 当前问题

### Index ref 不是 identity

当前 `snapshot-extractor.ts` 按 DOM 顺序生成 ref：

```ts
const ref = displayRef(`e${index + 1}`)
```

因此：

```text
snap_1 + @e1 = Save 按钮
snap_2 + @e1 = 新插入的 Banner 关闭按钮
```

同一个 `@e1` 在不同 snapshot 中可能指向不同元素。

### Snapshot 是 stateless dump

当前每次 snapshot 完全重新生成，无 previous records、identity matching、element continuity。

### name/role 语义不足

当前 `nameFor` 只覆盖 `aria-label`、`title`、`textContent`、`placeholder`、fallback role。它缺少 `aria-labelledby` 链式解析和 `label[for]`。当前 `roleFor` 把大部分 input 都归为 `textbox`，无法正确表达 checkbox/radio/file/button 等控件。

### RefStore 只是 snapshot cache

当前 `RefStore` 主要是：

```text
snapshotId -> ElementRefRecord[]
```

它缺少：

```text
ref -> latest ElementRefRecord
tabId/frameRef -> previous identity candidates
```

因此 action 不能稳定地从 ref 找到最新 live element。

## 架构

```text
snapshot request
  ↓
content.ts asks RefStore for previous candidates
  ↓
snapshot-extractor.ts builds semantic fingerprints
  ↓
identity-matcher.ts reuses previous refs or creates new refs
  ↓
snapshot-extractor.ts returns PageSnapshot + ElementRefRecord[]
  ↓
RefStore saves both snapshot records and latest ref registry
  ↓
action(ref) resolves latest record and semantically rematches live DOM
```

### Layer 1: Snapshot View Layer

职责：输出当前页面可见/可交互 UI 的语义视图。

包含：

- `ref`
- `role`
- `name` / `accessibleName`
- `text`
- `states`
- `box`
- `risk`
- `identityHash`

### Layer 2: Stable Identity Layer

职责：生成和维护 stable ref。

包含：

- deterministic `identityHash`
- display ref，例如 `@r_8f3a2b9c`
- `ref -> latest ElementRefRecord`
- `tabId/frameRef -> previous candidates`

### Layer 3: Cross-Snapshot Matching Engine

职责：比较 previous record 和 next element fingerprint，决定：

```ts
{ kind: 'reuse', ref, score, reason }
```

或：

```ts
{ kind: 'create', identityHash, score, reason }
```

## 模块设计

### `packages/chrome-extension/src/content/accessible-name.ts`

新增：

```ts
export function computeAccessibleName(element: Element): string
```

规则按优先级执行：

1. `aria-labelledby`
   - 支持多个 id。
   - 按属性声明顺序拼接。
   - 支持引用链。
   - 防止循环引用。
2. `aria-label`
3. `label[for]`
4. `placeholder`
5. `textContent`
6. fallback：normalized role

约束：

- normalize whitespace。
- truncate 到 120 字符以内。
- 不读取 input value。
- deterministic。

### `packages/chrome-extension/src/content/role-normalizer.ts`

新增：

```ts
export type NormalizedRole =
  | 'button'
  | 'link'
  | 'textbox'
  | 'checkbox'
  | 'radio'
  | 'combobox'
  | 'file'
  | 'dialog'

export function normalizeRole(element: Element): NormalizedRole | string
```

规则：

- 显式 `role` 优先，非空 string normalize 后返回。
- `button` -> `button`
- `a[href]` -> `link`
- `textarea` -> `textbox`
- `input[type=checkbox]` -> `checkbox`
- `input[type=radio]` -> `radio`
- `input[type=file]` -> `file`
- `input[type=button|submit|reset]` -> `button`
- 其他文本输入 -> `textbox`
- `select` -> `combobox`
- `dialog` / `[aria-modal="true"]` -> `dialog`

### `packages/chrome-extension/src/content/element-state.ts`

新增：

```ts
export type ElementState = {
  disabled: boolean
  checked: boolean
  selected: boolean
  expanded: boolean
  hidden: boolean
  focused: boolean
}

export function computeElementState(element: Element): ElementState
export function stateLabels(state: ElementState): string[]
```

`stateLabels` 用于兼容 snapshot 中的 `states: string[]`。例如：

```ts
{
  disabled: false,
  checked: true,
  selected: false,
  expanded: false,
  hidden: false,
  focused: false,
}
```

输出：

```ts
['enabled', 'checked']
```

### `packages/chrome-extension/src/content/stable-ref.ts`

新增：

```ts
export type IdentityInput = {
  role: string
  accessibleName: string
  domSignature: string
  keyAttributes: Record<string, string>
  formContext?: string
}

export function createIdentityHash(input: IdentityInput): string
export function createStableRef(identityHash: string): string
```

`identityHash` 输入包含：

- role
- accessibleName
- noise-tolerant domSignature
- keyAttributes
- formContext

`domSignature` 不包含 sibling index，避免 DOM reorder 改变 ref。示例：

```text
main/form/button
form/input[type=email]
dialog/button
```

`keyAttributes` 可包含：

- `type`
- `name`
- `autocomplete`
- `aria-controls`
- `aria-expanded`
- `href` 的 pathname，不含 origin/query/hash
- `id`，只作为弱信号，不作为唯一身份

### `packages/chrome-extension/src/content/element-fingerprint.ts`

新增：

```ts
import type { Rect } from '@tabbridge/shared'
import type { ElementState } from './element-state'

export type ElementFingerprint = {
  identityHash: string
  role: string
  accessibleName: string
  textFingerprint: string
  domSignature: string
  keyAttributes: Record<string, string>
  formContext?: string
  boundingBox: Rect
  states: ElementState
}

export function fingerprintElement(element: Element): ElementFingerprint
```

职责：把 live DOM element 转成 matcher 和 snapshot builder 可用的语义指纹。

### `packages/chrome-extension/src/content/identity-matcher.ts`

新增：

```ts
import type { ElementRefRecord } from '@tabbridge/shared'
import type { ElementFingerprint } from './element-fingerprint'

export type MatchDecision =
  | { kind: 'reuse'; ref: string; score: number; reason: string }
  | { kind: 'create'; identityHash: string; score: number; reason: string }

export function matchElementIdentity(
  previous: ElementRefRecord[],
  next: ElementFingerprint,
): MatchDecision
```

匹配信号：

- exact `identityHash`：直接 reuse。
- role exact match：强信号。
- accessibleName exact / normalized similarity：强信号。
- keyAttributes overlap：中强信号。
- domSignature similarity：中信号。
- boundingBox proximity：弱/中信号。
- state compatibility：弱信号。

建议初始 scoring：

```text
identityHash exact             -> reuse
role exact                     +30
accessibleName exact           +35
accessibleName similarity      +0~25
keyAttributes overlap          +0~20
domSignature similarity        +0~15
boundingBox proximity          +0~10
state compatibility            +0~5
```

复用规则：

```text
score >= 70 且 role 不冲突 -> reuse
score < 70                 -> create/ref stale
ambiguous top scores within 5 points -> ambiguous
```

在 snapshot 生成时：ambiguous 创建新 ref。  
在 action resolution 时：ambiguous 返回 `REF_STALE`。

## Shared type 升级

### `SnapshotElement`

从：

```ts
export type SnapshotElement = {
  ref: string
  role: string
  name: string
  text: string
  states: string[]
  box: Rect
  risk: RiskLevel
}
```

升级为：

```ts
export type SnapshotElement = {
  ref: string
  role: string
  name: string
  accessibleName: string
  text: string
  states: string[]
  box: Rect
  risk: RiskLevel
  identityHash: string
}
```

`name` 暂时保留为 `accessibleName` alias，以兼容旧消费者。

### `ElementRefRecord`

升级为：

```ts
export type ElementRefRecord = {
  snapshotId: string
  tabId: number
  frameRef: string
  ref: string
  identityHash: string
  role: string
  accessibleName: string
  name: string
  textFingerprint: string
  domSignature: string
  keyAttributes: Record<string, string>
  formContext?: string
  states: ElementState
  boundingBox: Rect
  generatedAt: number

  selectorCandidates?: string[]
  xpathCandidates?: string[]
}
```

`selectorCandidates` 和 `xpathCandidates` 仅为 compatibility 字段。本轮新 identity 和 action 逻辑不依赖它们。

## RefStore 升级

当前：

```ts
recordsBySnapshot: Map<string, ElementRefRecord[]>
snapshotOrderByTab: Map<number, string[]>
```

升级为：

```ts
recordsBySnapshot: Map<string, ElementRefRecord[]>
latestRecordByRef: Map<string, ElementRefRecord>
snapshotOrderByTab: Map<number, string[]>
latestRecordsByTab: Map<number, ElementRefRecord[]>
```

新增接口：

```ts
getLatestRecord(tabId: number, frameRef: string, ref: string, now: number): ElementRefRecord | undefined

getPreviousCandidates(tabId: number, frameRef: string, now: number): ElementRefRecord[]
```

保留接口：

```ts
getRecord(snapshotId: string, frameRef: string, ref: string, now: number): ElementRefRecord | undefined
clearForTab(tabId: number): void
saveSnapshot(snapshotId: string, records: ElementRefRecord[], now: number): void
```

`saveSnapshot` 职责：

1. 保存 snapshot records。
2. 更新 `ref -> latest record`。
3. 更新 `tabId -> latest records`，供下一次 snapshot matching。
4. 继续执行 TTL 和 per-tab snapshot 数量限制。

## Snapshot extraction flow

`extractSnapshotFromDocument` 接收 previous records，但不直接依赖 `RefStore`：

```ts
export type ExtractSnapshotInput = {
  tabId: number
  snapshotId: string
  title: string
  url: string
  includeUrl: boolean
  now: number
  previousRecords?: ElementRefRecord[]
}
```

content 层调用：

```ts
const previousRecords = refStore.getPreviousCandidates(tabId, 'f0', now)
const result = extractSnapshotFromDocument({
  tabId,
  snapshotId,
  title,
  url,
  includeUrl,
  now,
  previousRecords,
})
refStore.saveSnapshot(snapshotId, result.records, now)
```

这样 snapshot extractor 仍然容易测试：测试可以直接传入 previous records 来验证 DOM reorder / insertion 是否保持 ref。

## Action resolution flow

`executeRefAction` 升级为优先 latest identity：

```text
getLatestRecord(tabId, frameRef, ref)
  ↓ if missing
fallback getRecord(snapshotId, frameRef, ref)
  ↓
semantic rematch live DOM candidates
  ↓
visible/enabled/state validation
  ↓
perform action
```

由于本轮不做 selector/xpath，live DOM resolve 使用：

- 当前 document 的 interactable candidates。
- 对每个 candidate 计算 `ElementFingerprint`。
- 与 stored `ElementRefRecord` 匹配。
- 分数足够且不 ambiguous 才执行。
- 分数不足或 ambiguous 返回 `REF_STALE`。

`RefActionInput.snapshotId` 可继续保留以兼容旧调用，但新逻辑不把它作为主身份字段。

## 错误处理规则

### 匹配失败

返回：

```text
REF_STALE
```

不要 fallback 到“第一个按钮”或“相似 selector”。宁可失败，不误操作。

### 多个强候选冲突

返回：

```text
REF_STALE
```

原因：ambiguous click 比 stale 更危险。

### 元素不可见

保留：

```text
ELEMENT_NOT_VISIBLE
```

### 元素 disabled

保留：

```text
ELEMENT_DISABLED
```

### form 状态不兼容

例如旧 record 是 checkbox，但 live candidate 是 textbox，返回：

```text
REF_STALE
```

## 测试策略

采用 TDD。每个核心模块先写失败测试，再写最小实现。

### Accessible Name Resolver

覆盖：

- `aria-labelledby` 单 id。
- `aria-labelledby` 多 id，按声明顺序拼接。
- `aria-labelledby` 链式引用。
- `aria-labelledby` 循环引用不会无限递归。
- `aria-label` 优先于 `label[for]` / placeholder / text。
- `label[for]` 能命名 input。
- placeholder 作为 fallback。
- textContent normalize whitespace。
- 长文本截断到 120 字符以内。
- 不读取 input value。

### Role Normalizer

覆盖：

- `button`。
- `a[href]`。
- `textarea`。
- `input[type=text|email|search|password]` -> `textbox`。
- `input[type=checkbox]` -> `checkbox`。
- `input[type=radio]` -> `radio`。
- `input[type=file]` -> `file`。
- `input[type=submit|button|reset]` -> `button`。
- `select` -> `combobox`。
- `dialog` / `[aria-modal=true]` -> `dialog`。
- 显式 role 优先。

### Stable Ref / Matching

覆盖：

- DOM reorder 不改变 ref。
- DOM insertion 不改变已有元素 ref。
- same role + same accessibleName + similar structure 复用 ref。
- role mismatch 不复用 ref。
- strong accessibleName mismatch 不复用 ref。
- minor layout movement 仍复用 ref。

### RefStore

覆盖：

- `saveSnapshot` 同时写入 `recordsBySnapshot` 和 `latestRecordByRef`。
- `getLatestRecord(tabId, frameRef, ref)` 不需要 snapshotId。
- 旧 `getRecord(snapshotId, frameRef, ref)` 仍可用。
- TTL 后 latest record 和 snapshot record 都不可用。
- tab clear 后两个索引都清除。
- snapshot 数量限制仍生效。

### Action Resolution

覆盖：

- 旧模式：`snapshotId + ref` 仍能执行。
- 新模式：优先 latest ref 执行。
- DOM reorder 后 click stable ref 仍点到同一按钮。
- DOM insertion 后 click stable ref 仍点到同一按钮。
- role/name 强冲突时返回 `REF_STALE`，不误点。
- disabled/hidden 时返回对应错误，不执行 action。
- checkbox `check/uncheck` 使用 state-aware 行为。

## 实施顺序

1. `accessible-name.ts`
2. `role-normalizer.ts`
3. `element-state.ts`
4. `stable-ref.ts`
5. `element-fingerprint.ts`
6. `identity-matcher.ts`
7. `ref-store.ts` dual index upgrade
8. `snapshot-extractor.ts` 接入 identity layer
9. `actions.ts` 接入 latest ref + semantic rematch
10. shared types / compatibility cleanup
11. full test + typecheck

## 验收标准

- DOM reorder 不改变已有 ref。
- DOM insertion 不改变已有 ref。
- same semantic element across snapshots 复用 ref。
- semantic mismatch 生成新 ref 或返回 `REF_STALE`。
- action 优先通过 `ref -> latest identity` 解析。
- `snapshotId` 只作为版本上下文/兼容字段。
- selector/xpath 不参与 identity 或 action resolution。
- snapshot element 包含 role/name/accessibleName/states/box/identityHash。
- role/name/state 逻辑独立模块化且有测试覆盖。
