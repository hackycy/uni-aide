import MagicString from 'magic-string'

export * from './compare'

export { findConfigFile, parse, parseConfig } from './config-parser'
export { emitJSONC, walkCommentEntries } from './emit'
export { ConfigError } from './errors'
export * from './file'
export { validateRegions } from './regions'
export * from './types'
export { compareStrings } from './utils'

export {
  CommentArray,
  type CommentJSONValue,
  type CommentObject,
  assign as jsoncAssign,
  parse as jsoncParse,
  stringify as jsoncStringify,
} from 'comment-json'

export { MagicString }
