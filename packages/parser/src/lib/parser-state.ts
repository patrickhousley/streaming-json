import { ParserEvent } from './parser-event'

/**
 * Holds onto the state of parsing as control flow is exchanged between the
 * abstract parser with the parsing logic and the implementation parser with
 * the input reading logic.
 */
export class ParserState {
  eventStack: ParserEvent[] = []
  openingEvent: ParserEvent | undefined | void
  stringEscapeCharacterSeen = false
  done = false
  inputIndex = 0
}
