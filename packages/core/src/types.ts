/**
 * 配置解析管线的公开类型。
 */

export type Segment = string | number
export type Path = Segment[]

export interface CommentSource {
  file: string
  line: number
  column: number
}

export type DirectiveKind = 'ifdef' | 'ifndef' | 'if' | 'else' | 'endif'

export interface DirectiveInfo {
  kind: DirectiveKind
  /** 原样保留的条件文本（不求值）；`#else` / `#endif` 为空 */
  condition?: string
}

export interface CommentEntry {
  /** 不含 `//` 或 `/* *\/` 分隔符 */
  text: string
  kind: 'line' | 'block'
  /** 注释是否与同一行的其他代码共行 */
  inline: boolean
  /** 是否为条件编译指令 */
  conditional: boolean
  /** 条件编译指令的归一化信息 */
  directive?: DirectiveInfo
  source: CommentSource
  /** 源码起始 offset（内部排序与配对使用） */
  start: number
  /** 源码结束 offset（内部排序与配对使用） */
  end: number
}

export type Slot
  = | 'before-all'
    | 'after-all'
    | 'before'
    | 'after-prop'
    | 'after-colon'
    | 'after-value'
    | 'after'
    | 'inner'
    | 'after-last'

export interface Placement {
  path: Path
  slot: Slot
  comment: CommentEntry
  /** 同一锚点多条注释的稳定顺序 */
  sourceIndex: number
}

export interface Diagnostic {
  severity: 'error' | 'warning'
  code: string
  message: string
  file?: string
  path?: Path
  line?: number
  column?: number
}

/** 单个属性/数组元素上的注释槽位 */
export interface SlotComments {
  before?: CommentEntry[]
  afterProp?: CommentEntry[]
  afterColon?: CommentEntry[]
  afterValue?: CommentEntry[]
  after?: CommentEntry[]
}

/** 容器自身承载的注释槽位 */
export interface ContainerComments {
  beforeAll?: CommentEntry[]
  afterAll?: CommentEntry[]
  inner?: CommentEntry[]
  afterLast?: CommentEntry[]
}

/**
 * 以运行时对象引用为键的注释索引。
 * 排序/合并只移动引用，注释随值移动，不做路径重映射。
 */
export interface CommentIndex {
  container: WeakMap<object, ContainerComments>
  property: WeakMap<object, Map<string, SlotComments>>
  /** 对象类型的数组元素 */
  arrayItem: WeakMap<object, SlotComments>
  /** 原始类型数组元素，只能按下标索引 */
  arrayIndex: WeakMap<any[], Map<number, SlotComments>>
}

export interface ParseOptions {
  /**
   * 工作目录
   * @default process.cwd()
   */
  cwd?: string
}

export interface ParseConfigResult {
  value: unknown
  comments: CommentIndex
  orderHints: WeakMap<object, string[]>
  diagnostics: Diagnostic[]
}

export interface EmitOptions {
  /** 采集之后新增的数组元素 */
  injectedElements?: WeakSet<object>
  /** 采集之后新增的对象 key */
  injectedKeys?: WeakMap<object, Set<string>>
  /** 发射期告警（如块注释降级）的收集器 */
  diagnostics?: Diagnostic[]
}
