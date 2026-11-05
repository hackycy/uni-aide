import type * as t from '@babel/types'
import type { Diagnostic, Path } from './types'

export interface Anchor {
  container: ContainerInfo
  start: number
  end: number
  line: number
  keyEnd?: number
  colonStart?: number
  valueStart?: number
  path: Path
  hasPath: boolean
  kind: 'property' | 'element' | 'spread'
}

export interface ContainerInfo {
  node: t.Node
  start: number
  end: number
  path: Path
  runtime: object
  kind: 'object' | 'array'
  empty: boolean
  anchors: Anchor[]
}

export interface AnalysisResult {
  rootNode: t.Node | null
  statementStart: number
  statementEnd: number
  containers: ContainerInfo[]
  anchors: Anchor[]
  opaqueRanges: Array<{ start: number, end: number }>
  orderHints: Map<object, string[]>
  warnings: Diagnostic[]
}

const UNRESOLVED: unique symbol = Symbol('unresolved')

const IDENTITY_FIELDS = ['path', 'pagePath', 'name', 'root'] as const

const UNWRAP_TYPES = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSInstantiationExpression',
  'ParenthesizedExpression',
  'TypeCastExpression',
  'ChainExpression',
])

const SKIP_KEYS = new Set([
  'type',
  'loc',
  'start',
  'end',
  'range',
  'extra',
  'comments',
  'tokens',
  'errors',
  'leadingComments',
  'trailingComments',
  'innerComments',
])

interface Ctx {
  file: string
  source: string
  bindings: Map<string, t.Node>
  imports: Set<string>
  warnings: Diagnostic[]
  containers: ContainerInfo[]
  anchors: Anchor[]
  opaqueRanges: Array<{ start: number, end: number }>
  orderHints: Map<object, string[]>
}

export function unwrap(node: t.Node | null | undefined): t.Node | undefined {
  let current = node ?? undefined
  while (current && UNWRAP_TYPES.has(current.type)) {
    current = (current as unknown as { expression?: t.Node }).expression
  }
  return current
}

function isNode(value: unknown): value is t.Node {
  return (
    value !== null
    && typeof value === 'object'
    && typeof (value as { type?: unknown }).type === 'string'
  )
}

function isFunctionNode(node: t.Node): node is t.Function {
  return (
    node.type === 'FunctionDeclaration'
    || node.type === 'FunctionExpression'
    || node.type === 'ArrowFunctionExpression'
    || node.type === 'ObjectMethod'
    || node.type === 'ClassMethod'
    || node.type === 'ClassPrivateMethod'
  )
}

function warning(ctx: Ctx, code: string, message: string, node?: t.Node | null, path?: Path): void {
  ctx.warnings.push({
    severity: 'warning',
    code,
    message,
    file: ctx.file,
    path,
    line: node?.loc?.start.line,
    column: node?.loc?.start.column,
  })
}

function opaque(ctx: Ctx, node: t.Node | null | undefined): void {
  if (node && typeof node.start === 'number' && typeof node.end === 'number') {
    ctx.opaqueRanges.push({ start: node.start, end: node.end })
  }
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key)
}

function isPlainObjectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collectBindings(program: t.Program): { bindings: Map<string, t.Node>, imports: Set<string> } {
  const bindings = new Map<string, t.Node>()
  const imports = new Set<string>()

  const declare = (declaration: t.Node | null | undefined): void => {
    if (!declaration) {
      return
    }
    if (declaration.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        if (declarator.id.type === 'Identifier' && declarator.init) {
          bindings.set(declarator.id.name, declarator.init)
        }
      }
    }
    else if (declaration.type === 'FunctionDeclaration' && declaration.id) {
      bindings.set(declaration.id.name, declaration)
    }
  }

  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) {
        imports.add(specifier.local.name)
      }
    }
    else if (statement.type === 'VariableDeclaration' || statement.type === 'FunctionDeclaration') {
      declare(statement)
    }
    else if (statement.type === 'ExportNamedDeclaration') {
      declare(statement.declaration)
    }
  }

  return { bindings, imports }
}

function isModuleExports(left: t.MemberExpression): boolean {
  const propertyName
    = !left.computed && left.property.type === 'Identifier'
      ? left.property.name
      : left.property.type === 'StringLiteral'
        ? left.property.value
        : undefined

  return (
    (left.object.type === 'Identifier'
      && left.object.name === 'module'
      && propertyName === 'exports')
    || (left.object.type === 'Identifier'
      && left.object.name === 'exports'
      && propertyName === 'default')
  )
}

export type ExportKind = 'esm-default' | 'cjs-default' | 'cjs-module' | 'none'

/**
 * 判定配置文件的导出形态，供求值器决定是否解包模块命名空间的 default。
 */
export function detectExportKind(program: t.Program): ExportKind {
  for (const statement of program.body) {
    if (statement.type === 'ExportDefaultDeclaration') {
      return 'esm-default'
    }
    if (
      statement.type === 'ExpressionStatement'
      && statement.expression.type === 'AssignmentExpression'
      && statement.expression.left.type === 'MemberExpression'
    ) {
      const left = statement.expression.left
      const propertyName
        = !left.computed && left.property.type === 'Identifier'
          ? left.property.name
          : left.property.type === 'StringLiteral'
            ? left.property.value
            : undefined
      if (left.object.type === 'Identifier' && left.object.name === 'module' && propertyName === 'exports') {
        return 'cjs-module'
      }
      if (left.object.type === 'Identifier' && left.object.name === 'exports' && propertyName === 'default') {
        return 'cjs-default'
      }
    }
  }
  return 'none'
}

function findRoot(program: t.Program): { node: t.Node, statement: t.Node } | undefined {
  for (const statement of program.body) {
    if (statement.type === 'ExportDefaultDeclaration') {
      return { node: statement.declaration, statement }
    }
    if (
      statement.type === 'ExpressionStatement'
      && statement.expression.type === 'AssignmentExpression'
      && statement.expression.left.type === 'MemberExpression'
      && isModuleExports(statement.expression.left)
    ) {
      return { node: statement.expression.right, statement }
    }
  }
  return undefined
}

function staticValue(node: t.Node | null | undefined, ctx: Ctx, depth = 0): unknown {
  if (depth > 32) {
    return UNRESOLVED
  }
  node = unwrap(node)
  if (!node) {
    return UNRESOLVED
  }

  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value
    case 'NullLiteral':
      return null
    case 'TemplateLiteral':
      return node.expressions.length === 0
        ? (node.quasis[0]?.value.cooked ?? UNRESOLVED)
        : UNRESOLVED
    case 'UnaryExpression': {
      const value = staticValue(node.argument, ctx, depth + 1)
      if (value === UNRESOLVED) {
        return UNRESOLVED
      }
      if (node.operator === '-' && typeof value === 'number') {
        return -value
      }
      if (node.operator === '!') {
        return !value
      }
      if (node.operator === 'void') {
        return UNRESOLVED
      }
      return UNRESOLVED
    }
    case 'Identifier': {
      if (ctx.imports.has(node.name)) {
        return UNRESOLVED
      }
      const binding = ctx.bindings.get(node.name)
      return binding ? staticValue(binding, ctx, depth + 1) : UNRESOLVED
    }
  }

  return UNRESOLVED
}

function staticKey(prop: t.ObjectProperty, ctx: Ctx): string | undefined {
  const key = prop.key
  if (!prop.computed) {
    if (key.type === 'Identifier') {
      return key.name
    }
    if (key.type === 'StringLiteral') {
      return key.value
    }
    if (key.type === 'NumericLiteral') {
      return String(key.value)
    }
    if (key.type === 'BigIntLiteral') {
      return String(key.value)
    }
    return undefined
  }

  const value = staticValue(key, ctx)
  return value === UNRESOLVED ? undefined : String(value)
}

function findColon(source: string, keyEnd: number, valueStart: number): number | undefined {
  let index = keyEnd
  while (index < valueStart) {
    const char = source[index]
    if (char === '/' && source[index + 1] === '/') {
      const nextLine = source.indexOf('\n', index)
      if (nextLine === -1 || nextLine >= valueStart) {
        return undefined
      }
      index = nextLine + 1
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2)
      if (close === -1 || close >= valueStart) {
        return undefined
      }
      index = close + 2
      continue
    }
    if (char === ':') {
      return index
    }
    index++
  }
  return undefined
}

function collectReturns(fn: t.Node): t.Expression[] {
  const node = unwrap(fn)
  if (!node || !isFunctionNode(node)) {
    return []
  }
  if (node.type === 'ArrowFunctionExpression' && node.body.type !== 'BlockStatement') {
    return [node.body]
  }

  const returns: t.Expression[] = []
  const visit = (current: t.Node): void => {
    if (isFunctionNode(current)) {
      return
    }
    if (current.type === 'ReturnStatement') {
      if (current.argument) {
        returns.push(current.argument)
      }
      return
    }
    for (const key of Object.keys(current)) {
      if (SKIP_KEYS.has(key)) {
        continue
      }
      const value = (current as unknown as Record<string, unknown>)[key]
      if (Array.isArray(value)) {
        for (const item of value) {
          if (isNode(item)) {
            visit(item)
          }
        }
      }
      else if (isNode(value)) {
        visit(value)
      }
    }
  }

  const body = (node as t.Function).body
  if (body) {
    visit(body)
  }
  return returns
}

interface ResolvedCall {
  node: t.Node
  ambiguous: boolean
}

function resolveCall(
  node: t.CallExpression,
  runtime: unknown,
  ctx: Ctx,
  silent = false,
): ResolvedCall | undefined {
  const callee = unwrap(node.callee)
  if (!callee) {
    return undefined
  }

  if (callee.type === 'Identifier') {
    if (ctx.imports.has(callee.name)) {
      return undefined
    }
    const binding = ctx.bindings.get(callee.name)
    const fn = binding ? unwrap(binding) : undefined
    if (!fn || !isFunctionNode(fn)) {
      return undefined
    }
    const returns = collectReturns(fn)
    if (returns.length === 0) {
      return undefined
    }

    let chosen = returns[0]
    let ambiguous = false
    if (returns.length > 1) {
      const matching = returns.filter(candidate =>
        fingerprintMatches(candidate, runtime, ctx),
      )
      if (matching.length === 1) {
        chosen = matching[0]
      }
      else {
        ambiguous = true
        if (!silent) {
          warning(
            ctx,
            'ambiguous-return',
            `function "${callee.name}" has ${returns.length} return statements; cannot select one for comment attachment`,
            node,
          )
        }
      }
    }

    const parameters: string[] = []
    for (const param of fn.params) {
      if (param.type === 'Identifier') {
        parameters.push(param.name)
      }
    }

    const expression = unwrap(chosen)
    if (!expression) {
      return undefined
    }
    if (expression.type === 'Identifier') {
      const index = parameters.indexOf(expression.name)
      if (index >= 0) {
        const argument = node.arguments[index]
        if (!argument || argument.type === 'SpreadElement' || argument.type === 'ArgumentPlaceholder') {
          return undefined
        }
        return { node: argument, ambiguous }
      }
    }
    return { node: expression, ambiguous }
  }

  if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
    const binding = ctx.bindings.get(callee.object.name)
    if (binding && unwrap(binding)?.type === 'ArrayExpression') {
      return { node: unwrap(binding)!, ambiguous: false }
    }
  }

  return undefined
}

function structuralNode(node: t.Node | null | undefined, ctx: Ctx, depth = 0): t.Node | undefined {
  if (depth > 32) {
    return undefined
  }
  node = unwrap(node)
  if (!node) {
    return undefined
  }

  if (node.type === 'Identifier') {
    if (ctx.imports.has(node.name)) {
      return undefined
    }
    const binding = ctx.bindings.get(node.name)
    return binding ? structuralNode(binding, ctx, depth + 1) : undefined
  }

  if (node.type === 'CallExpression') {
    const resolved = resolveCall(node, undefined, ctx, true)
    if (!resolved || resolved.ambiguous) {
      return undefined
    }
    return structuralNode(resolved.node, ctx, depth + 1)
  }

  return node
}

function staticIdentityField(node: t.Node, ctx: Ctx): string | undefined {
  const structural = structuralNode(node, ctx)
  if (!structural || structural.type !== 'ObjectExpression') {
    return undefined
  }
  for (const field of IDENTITY_FIELDS) {
    const prop = structural.properties.find(
      (candidate): candidate is t.ObjectProperty =>
        candidate.type === 'ObjectProperty' && staticKey(candidate, ctx) === field,
    )
    if (prop && staticValue(prop.value, ctx) !== UNRESOLVED) {
      return field
    }
  }
  return undefined
}

function staticIdentityValue(
  node: t.Node,
  field: string,
  ctx: Ctx,
): unknown {
  const structural = structuralNode(node, ctx)
  if (!structural || structural.type !== 'ObjectExpression') {
    return UNRESOLVED
  }
  const prop = structural.properties.find(
    (candidate): candidate is t.ObjectProperty =>
      candidate.type === 'ObjectProperty' && staticKey(candidate, ctx) === field,
  )
  return prop ? staticValue(prop.value, ctx) : UNRESOLVED
}

function runtimeIdentityValue(value: unknown, field: string): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return UNRESOLVED
  }
  return hasOwn(value, field) && (value as Record<string, unknown>)[field] !== undefined
    ? (value as Record<string, unknown>)[field]
    : UNRESOLVED
}

function identityKey(value: unknown): string {
  return `${typeof value}:${String(value)}`
}

function fingerprintMatches(node: t.Node, runtime: unknown, ctx: Ctx): boolean {
  node = unwrap(node) ?? node

  if (node.type === 'Identifier') {
    if (ctx.imports.has(node.name)) {
      return false
    }
    const binding = ctx.bindings.get(node.name)
    return binding ? fingerprintMatches(binding, runtime, ctx) : false
  }

  if (node.type === 'ObjectExpression') {
    if (!isPlainObjectValue(runtime)) {
      return false
    }
    const keys = new Set<string>()
    for (const prop of node.properties) {
      if (prop.type !== 'ObjectProperty') {
        return false
      }
      const key = staticKey(prop, ctx)
      if (key === undefined) {
        return false
      }
      keys.add(key)
      const value = staticValue(prop.value, ctx)
      if (value !== UNRESOLVED && !Object.is(value, runtime[key])) {
        return false
      }
    }
    return Object.keys(runtime).every(key => keys.has(key))
  }

  if (node.type === 'ArrayExpression') {
    if (!Array.isArray(runtime) || runtime.length !== node.elements.length) {
      return false
    }
    return node.elements.every((element, index) => {
      if (!element) {
        return false
      }
      const value = staticValue(element, ctx)
      return value === UNRESOLVED || Object.is(value, runtime[index])
    })
  }

  const value = staticValue(node, ctx)
  return value !== UNRESOLVED && Object.is(value, runtime)
}

export function analyze(program: t.Program, value: unknown, file: string, source: string): AnalysisResult {
  const { bindings, imports } = collectBindings(program)
  const ctx: Ctx = {
    file,
    source,
    bindings,
    imports,
    warnings: [],
    containers: [],
    anchors: [],
    opaqueRanges: [],
    orderHints: new Map(),
  }

  const root = findRoot(program)
  if (root) {
    align(unwrap(root.node), value, [], ctx, 0)
  }

  return {
    rootNode: root ? unwrap(root.node) ?? null : null,
    statementStart: root?.statement.start ?? 0,
    statementEnd: root?.statement.end ?? 0,
    containers: ctx.containers,
    anchors: ctx.anchors,
    opaqueRanges: ctx.opaqueRanges,
    orderHints: ctx.orderHints,
    warnings: ctx.warnings,
  }
}

function createContainer(
  ctx: Ctx,
  node: t.Node,
  path: Path,
  runtime: object,
  kind: 'object' | 'array',
  empty: boolean,
): ContainerInfo {
  const container: ContainerInfo = {
    node,
    start: node.start ?? 0,
    end: node.end ?? 0,
    path,
    runtime,
    kind,
    empty,
    anchors: [],
  }
  ctx.containers.push(container)
  return container
}

function addAnchor(
  ctx: Ctx,
  container: ContainerInfo,
  node: t.Node,
  path: Path,
  hasPath: boolean,
  kind: Anchor['kind'],
  extras: {
    keyEnd?: number
    colonStart?: number
    valueStart?: number
    line?: number
  } = {},
): Anchor | undefined {
  if (typeof node.start !== 'number' || typeof node.end !== 'number') {
    return undefined
  }
  const anchor: Anchor = {
    container,
    start: node.start,
    end: node.end,
    line: extras.line ?? node.loc?.end.line ?? 0,
    keyEnd: extras.keyEnd,
    colonStart: extras.colonStart,
    valueStart: extras.valueStart,
    path,
    hasPath,
    kind,
  }
  container.anchors.push(anchor)
  ctx.anchors.push(anchor)
  return anchor
}

function addPropertyAnchor(
  ctx: Ctx,
  container: ContainerInfo | undefined,
  prop: t.ObjectProperty,
  path: Path,
  hasPath: boolean,
  source: string,
): Anchor | undefined {
  if (!container) {
    return undefined
  }
  const keyEnd = prop.key.end ?? undefined
  const valueStart = prop.value.start ?? undefined
  const colonStart
    = typeof keyEnd === 'number' && typeof valueStart === 'number'
      ? findColon(source, keyEnd, valueStart)
      : undefined
  return addAnchor(ctx, container, prop, path, hasPath, 'property', {
    keyEnd,
    colonStart,
    valueStart,
  })
}

function align(
  node: t.Node | null | undefined,
  runtime: unknown,
  path: Path,
  ctx: Ctx,
  depth: number,
): void {
  if (depth > 64) {
    opaque(ctx, node ?? undefined)
    return
  }
  node = unwrap(node)
  if (!node) {
    return
  }

  switch (node.type) {
    case 'Identifier': {
      if (ctx.imports.has(node.name)) {
        opaque(ctx, node)
        return
      }
      const binding = ctx.bindings.get(node.name)
      if (!binding) {
        opaque(ctx, node)
        return
      }
      align(binding, runtime, path, ctx, depth + 1)
      return
    }

    case 'ObjectExpression':
      alignObject(node, runtime, path, ctx, depth)
      return

    case 'ArrayExpression':
      alignArray(node, runtime, path, ctx, depth)
      return

    case 'CallExpression': {
      const resolved = resolveCall(node, runtime, ctx)
      if (resolved && !resolved.ambiguous) {
        align(resolved.node, runtime, path, ctx, depth + 1)
        return
      }
      // 未解析的单参数调用可能是 identity 包装器（导入或 require 的 defineConfig）。
      // 仅当实参与求值结果结构指纹一致时才对齐，避免把注释挂到无关对象上。
      if (!resolved && node.arguments.length === 1) {
        const argument = node.arguments[0]
        if (
          argument.type !== 'SpreadElement'
          && argument.type !== 'ArgumentPlaceholder'
          && fingerprintMatches(argument, runtime, ctx)
        ) {
          align(argument, runtime, path, ctx, depth + 1)
          return
        }
      }
      opaque(ctx, node)
      return
    }

    case 'ConditionalExpression':
    case 'LogicalExpression': {
      const branches
        = node.type === 'ConditionalExpression'
          ? [node.consequent, node.alternate]
          : [node.left, node.right]
      const matching = branches.filter(branch =>
        fingerprintMatches(branch, runtime, ctx),
      )
      if (matching.length === 1) {
        align(matching[0], runtime, path, ctx, depth + 1)
        return
      }
      warning(
        ctx,
        'ambiguous-branch',
        `${node.type} branch cannot be uniquely matched to the runtime value; comments inside the branch are dropped`,
        node,
        path,
      )
      opaque(ctx, node)
      return
    }

    default:
      opaque(ctx, node)
  }
}

function alignObject(
  node: t.ObjectExpression,
  runtime: unknown,
  path: Path,
  ctx: Ctx,
  depth: number,
): void {
  if (!isPlainObjectValue(runtime)) {
    opaque(ctx, node)
    return
  }

  const container = createContainer(
    ctx,
    node,
    path,
    runtime,
    'object',
    node.properties.length === 0,
  )
  const hintKeys: string[] = []
  const seen = new Set<string>()
  const computed: Array<{ prop: t.ObjectProperty, anchor?: Anchor }> = []

  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') {
      const structural = structuralNode(prop.argument, ctx)
      let firstKey: string | undefined
      if (structural && structural.type === 'ObjectExpression') {
        const innerContainer = createContainer(
          ctx,
          structural,
          path,
          runtime,
          'object',
          structural.properties.length === 0,
        )
        for (const innerProp of structural.properties) {
          if (innerProp.type !== 'ObjectProperty') {
            opaque(ctx, innerProp)
            continue
          }
          const key = staticKey(innerProp, ctx)
          if (key === undefined) {
            opaque(ctx, innerProp.value)
            continue
          }
          if (firstKey === undefined) {
            firstKey = key
          }
          if (!seen.has(key)) {
            seen.add(key)
            hintKeys.push(key)
          }
          addPropertyAnchor(
            ctx,
            innerContainer,
            innerProp,
            [...path, key],
            true,
            ctx.source,
          )
          if (hasOwn(runtime, key)) {
            align(innerProp.value, runtime[key], [...path, key], ctx, depth + 1)
          }
          else {
            opaque(ctx, innerProp.value)
          }
        }
      }
      else {
        opaque(ctx, prop.argument)
      }
      addAnchor(
        ctx,
        container,
        prop,
        firstKey === undefined ? [] : [...path, firstKey],
        firstKey !== undefined,
        'spread',
      )
      continue
    }

    if (prop.type !== 'ObjectProperty') {
      opaque(ctx, prop)
      continue
    }

    const key = staticKey(prop, ctx)
    if (key === undefined) {
      const anchor = addPropertyAnchor(ctx, container, prop, [], false, ctx.source)
      opaque(ctx, prop.value)
      computed.push({ prop, anchor })
      continue
    }

    if (seen.has(key)) {
      warning(
        ctx,
        'duplicate-key',
        `duplicate key "${key}" at ${pathString([...path, key])}; comments are merged onto the surviving property`,
        prop,
        [...path, key],
      )
    }
    else {
      seen.add(key)
      hintKeys.push(key)
    }

    addPropertyAnchor(ctx, container, prop, [...path, key], true, ctx.source)
    if (hasOwn(runtime, key)) {
      align(prop.value, runtime[key], [...path, key], ctx, depth + 1)
    }
    else {
      opaque(ctx, prop.value)
    }
  }

  if (computed.length > 0) {
    const unclaimed = Object.keys(runtime).filter(key => !seen.has(key))
    if (computed.length === 1 && unclaimed.length === 1) {
      const key = unclaimed[0]
      const entry = computed[0]
      seen.add(key)
      hintKeys.push(key)
      if (entry.anchor) {
        entry.anchor.path = [...path, key]
        entry.anchor.hasPath = true
      }
      align(entry.prop.value, runtime[key], [...path, key], ctx, depth + 1)
    }
    else {
      for (const entry of computed) {
        warning(
          ctx,
          'computed-key-ambiguous',
          `${computed.length} computed keys cannot be matched to the remaining runtime keys; comments on this property are dropped`,
          entry.prop,
          path,
        )
      }
    }
  }

  ctx.orderHints.set(runtime, hintKeys)
}

function alignArray(
  node: t.ArrayExpression,
  runtime: unknown,
  path: Path,
  ctx: Ctx,
  depth: number,
): void {
  if (!Array.isArray(runtime)) {
    opaque(ctx, node)
    return
  }

  const container = createContainer(
    ctx,
    node,
    path,
    runtime,
    'array',
    node.elements.length === 0,
  )
  const hasSpread = node.elements.some(element => element?.type === 'SpreadElement')
  const elements = node.elements.filter(
    (element): element is t.Expression => !!element && element.type !== 'SpreadElement',
  )

  const field = elements.length > 0 ? staticIdentityField(elements[0], ctx) : undefined
  let identityValues: unknown[] = []
  let identityMode = false

  if (field) {
    identityValues = elements.map(element => staticIdentityValue(element, field, ctx))
    if (identityValues.every(value => value !== UNRESOLVED)) {
      const keys = identityValues.map(identityKey)
      if (new Set(keys).size === keys.length) {
        identityMode = true
      }
      else {
        warning(
          ctx,
          'duplicate-identity',
          `array elements share the same "${field}" value; falling back to index alignment`,
          node,
          path,
        )
      }
    }
  }

  if (identityMode) {
    const byIdentity = new Map<string, t.Expression>()
    elements.forEach((element, index) => {
      byIdentity.set(identityKey(identityValues[index]), element)
    })

    const used = new Set<t.Expression>()
    for (let index = 0; index < runtime.length; index++) {
      const item = runtime[index]
      const identity = runtimeIdentityValue(item, field!)
      const element = identity === UNRESOLVED ? undefined : byIdentity.get(identityKey(identity))
      if (element && !used.has(element)) {
        used.add(element)
        addAnchor(ctx, container, element, [...path, index], true, 'element')
        align(element, item, [...path, index], ctx, depth + 1)
      }
    }
    for (const element of elements) {
      if (!used.has(element)) {
        opaque(ctx, element)
      }
    }
    return
  }

  if (hasSpread || elements.length !== runtime.length) {
    warning(
      ctx,
      'array-reordered-unverifiable',
      `array length or order cannot be verified (source ${elements.length}, runtime ${runtime.length}); element comments are dropped`,
      node,
      path,
    )
    opaque(ctx, node)
    return
  }

  if (field) {
    const reordered = elements.some((element, index) => {
      const expected = identityValues[index]
      const actual = runtimeIdentityValue(runtime[index], field)
      return (
        expected !== UNRESOLVED
        && actual !== UNRESOLVED
        && identityKey(expected) !== identityKey(actual)
      )
    })
    if (reordered) {
      warning(
        ctx,
        'array-reordered-unverifiable',
        `array "${field}" values do not match at the same index; element comments are dropped`,
        node,
        path,
      )
      opaque(ctx, node)
      return
    }
  }
  else {
    let reordered = false
    let unverifiable = false
    elements.forEach((element, index) => {
      const expected = staticValue(element, ctx)
      const actual = runtime[index]
      if (expected !== UNRESOLVED) {
        if (!Object.is(expected, actual)) {
          reordered = true
        }
      }
      else if (actual === null || typeof actual !== 'object') {
        // 原始类型元素无法静态比运行时顺序
        unverifiable = true
      }
    })
    if (reordered || unverifiable) {
      warning(
        ctx,
        'array-reordered-unverifiable',
        'array order cannot be verified from static values; element comments are dropped',
        node,
        path,
      )
      opaque(ctx, node)
      return
    }
    if (runtime.some(item => item !== null && typeof item === 'object')) {
      warning(
        ctx,
        'array-reordered-unverifiable',
        'array elements have no identity field; comments are aligned by index',
        node,
        path,
      )
    }
  }

  elements.forEach((element, index) => {
    addAnchor(ctx, container, element, [...path, index], true, 'element')
    align(element, runtime[index], [...path, index], ctx, depth + 1)
  })
}

function pathString(path: Path): string {
  return path.length === 0
    ? '$'
    : `$${path
      .map(segment =>
        typeof segment === 'number'
          ? `[${segment}]`
          : `[${JSON.stringify(segment)}]`,
      )
      .join('')}`
}
