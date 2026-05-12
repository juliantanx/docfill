export type DocumentStatus = 'parsing' | 'ready' | 'filling' | 'paused' | 'filled' | 'error'
export type FieldStatus = 'empty' | 'filled'
export type FieldType = 'bracket' | 'blank' | 'table_cell' | 'inline_paren'
export type AiFillState = 'idle' | 'filling' | 'paused' | 'done'

export interface DocField {
  id: string
  label: string
  value: string
  status: FieldStatus
  field_type: FieldType
  requires_input: boolean
}

export interface OutlineNode {
  id: string
  title: string
  level: number
  bookmarkName: string
  children: OutlineNode[]
}

export interface Reference {
  doc_id: string
  filename: string
}

export interface DocumentInfo {
  doc_id: string
  original_filename: string
  status: DocumentStatus
  fields: DocField[] | null
  outline: OutlineNode[] | null
  references: Reference[] | null
  error_message: string | null
}

export interface UploadResponse {
  doc_id: string
  status: string
  message: string
}

export interface EditorTokenResponse {
  doc_url: string
  doc_key: string
  config: object
}

export interface FieldFilledEvent {
  type: 'field_filled'
  id: string
  label: string
  value: string
  requires_input: false
}

export interface FieldRequiresInputEvent {
  type: 'field_requires_input'
  id: string
  label: string
  requires_input: true
}

export interface ProgressEvent {
  type: 'progress'
  filled: number
  total: number
  percentage: number
}

export interface DoneEvent {
  type: 'done'
  filled_count: number
  empty_count: number
}

export interface ErrorEvent {
  type: 'error'
  message: string
}

export interface CancelledEvent {
  type: 'cancelled'
  message: string
}

export type AiFillEvent =
  | FieldFilledEvent
  | FieldRequiresInputEvent
  | ProgressEvent
  | DoneEvent
  | ErrorEvent
  | CancelledEvent
