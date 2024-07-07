export type OpeningParserEvent =
  | ObjectStartParserEvent
  | ArrayStartParserEvent
  | StringStartParserEvent
  | ValueLiteralStartParserEvent

export type ClosingParserEvent =
  | ObjectEndParserEvent
  | ArrayEndParserEvent
  | StringEndParserEvent
  | ValueLiteralEndParserEvent

export type ParserEvent =
  | OpeningParserEvent
  | ClosingParserEvent
  | CharacterParserEvent
  | KeyValueSplitParserEvent
  | PropertySplitParserEvent

export interface BaseParserEvent {
  event: string
  charCode?: unknown
}

/**
 * Represents the start processing of an object.
 */
export interface ObjectStartParserEvent extends BaseParserEvent {
  event: 'OBJECT_START'
}

/**
 * Represents the start processing of an array.
 */
export interface ArrayStartParserEvent extends BaseParserEvent {
  event: 'ARRAY_START'
}

/**
 * Represents the start processing of a string.
 */
export interface StringStartParserEvent extends BaseParserEvent {
  event: 'STRING_START'
}

/**
 * Represents the start processing of a value literal.
 * Ex. true, false, null
 */
export interface ValueLiteralStartParserEvent extends BaseParserEvent {
  event: 'VALUE_LITERAL_START'
}

/**
 * Represents the end processing of an array.
 */
export interface ArrayEndParserEvent extends BaseParserEvent {
  event: 'ARRAY_END'
}

/**
 * Represents the end processing of an object.
 */
export interface ObjectEndParserEvent extends BaseParserEvent {
  event: 'OBJECT_END'
}

/**
 * Represents the end processing of a string.
 */
export interface StringEndParserEvent extends BaseParserEvent {
  event: 'STRING_END'
}

/**
 * Represents the end processing of a value literal.
 * Ex. true, false, null
 */
export interface ValueLiteralEndParserEvent extends BaseParserEvent {
  event: 'VALUE_LITERAL_END'
}

/**
 * Represents a generic character parsed from the input
 * in character code format. Only relevant for value literals
 * and strings.
 */
export interface CharacterParserEvent extends BaseParserEvent {
  event: 'CHARACTER'
  charCode: number
}

/**
 * Represents the transition from parsing the key to the value
 * of an object property.
 */
export interface KeyValueSplitParserEvent extends BaseParserEvent {
  event: 'KEY_VALUE_SPLIT'
}

/**
 * Represents the transition to a new property of an object or
 * index of an array.
 */
export interface PropertySplitParserEvent extends BaseParserEvent {
  event: 'PROPERTY_SPLIT'
}
