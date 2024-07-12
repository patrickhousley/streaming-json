import {
  AllowedWhitespaceToken,
  Token,
  TrueValueLiteralToken,
  FalseValueLiteralToken,
  NullValueLiteralToken,
  NumberValueLiteralToken,
} from './charset'
import { ParserError } from './parser-error'
import {
  ParserEvent,
  ValueLiteralEndParserEvent,
  KeyValueSplitParserEvent,
  ArrayStartParserEvent,
  ArrayEndParserEvent,
  ObjectStartParserEvent,
  ValueLiteralStartParserEvent,
  StringStartParserEvent,
  OpeningParserEvent,
} from './parser-event'
import { ParserOptions } from './parser-options'
import { ParserState } from './parser-state'

export abstract class Parser {
  readonly options: ParserOptions

  constructor(option: Partial<ParserOptions> = {}) {
    this.options = {
      bufferSize: 8 * 1024,
      ...option,
    }

    if (this.options.bufferSize % 8 !== 0) {
      this.options.bufferSize = (Math.floor(this.options.bufferSize / 8) + 1) * 8
    }
  }

  protected abstract parse(): Generator<ParserEvent, void, boolean> | AsyncGenerator<ParserEvent, void, boolean>

  /**
   * Main logic of parsing the input into a set of events.
   * @param buffer A subset of the input
   * @param parserState Current state of parsing the input
   */
  protected *parseBuffer(buffer: Uint8Array, parserState: ParserState): Generator<ParserEvent, void, boolean> {
    for (let bufferIndex = 0; bufferIndex < buffer.length; bufferIndex++) {
      if (parserState.done) break
      const charCode = buffer[bufferIndex]

      if (Object.values(AllowedWhitespaceToken).includes(charCode)) {
        // Only event on allowed white space characters if inside a string
        if (parserState.eventStack[parserState.eventStack.length - 1]?.event === 'STRING_START') {
          parserState.done = yield { event: 'CHARACTER', charCode }
          continue
        }
        continue
      }

      try {
        this.#checkForInvalidToken(charCode, parserState.eventStack)
      } catch (err) {
        throw this.#decorateSyntaxError(err as SyntaxError, parserState.inputIndex, bufferIndex)
      }

      if (parserState.eventStack.length === 0) {
        try {
          parserState.openingEvent = this.#parseOpening(charCode, !!parserState.openingEvent)
        } catch (err) {
          if (err instanceof SyntaxError) {
            throw this.#decorateSyntaxError(err, parserState.inputIndex, bufferIndex)
          }

          throw err
        }

        if (!parserState.openingEvent) {
          continue
        }

        parserState.eventStack.push(parserState.openingEvent)
        parserState.done = yield parserState.openingEvent
        continue
      }

      if (charCode === Token.COMMA && !this.#isInString(parserState.eventStack)) {
        if (parserState.eventStack[parserState.eventStack.length - 1]?.event === 'VALUE_LITERAL_START') {
          const event: ValueLiteralEndParserEvent = { event: 'VALUE_LITERAL_END' }
          parserState.eventStack.pop()
          parserState.done = yield event

          bufferIndex-- // Reprocess this character
          continue
        }
        if (
          ['OBJECT_START', 'ARRAY_START'].includes(parserState.eventStack[parserState.eventStack.length - 1]?.event)
        ) {
          parserState.done = yield { event: 'PROPERTY_SPLIT' }
          continue
        }
        continue
      }

      if (charCode === Token.COLON && !this.#isInString(parserState.eventStack)) {
        const event: KeyValueSplitParserEvent = { event: 'KEY_VALUE_SPLIT' }
        parserState.eventStack.push(event)
        parserState.done = yield event
        continue
      }

      if (charCode === Token.LEFT_SQUARE_BRACKET && !this.#isInString(parserState.eventStack)) {
        const event: ArrayStartParserEvent = { event: 'ARRAY_START' }
        parserState.eventStack.push(event)
        parserState.done = yield event
        continue
      }

      if (charCode === Token.RIGHT_SQUARE_BRACKET && !this.#isInString(parserState.eventStack)) {
        if (parserState.eventStack[parserState.eventStack.length - 1]?.event === 'VALUE_LITERAL_START') {
          const event: ValueLiteralEndParserEvent = { event: 'VALUE_LITERAL_END' }
          parserState.eventStack.pop()
          parserState.done = yield event

          bufferIndex-- // Reprocess this character
          continue
        }
        if (parserState.eventStack[parserState.eventStack.length - 2]?.event === 'KEY_VALUE_SPLIT') {
          parserState.eventStack.pop()
        }
        const event: ArrayEndParserEvent = { event: 'ARRAY_END' }
        parserState.eventStack.pop()
        parserState.done = yield event
        continue
      }

      if (charCode === Token.LEFT_CURLY_BRACKET && !this.#isInString(parserState.eventStack)) {
        const event: ObjectStartParserEvent = { event: 'OBJECT_START' }
        parserState.eventStack.push(event)
        parserState.done = yield event
        continue
      }

      if (charCode === Token.RIGHT_CURLY_BRACKET && !this.#isInString(parserState.eventStack)) {
        if (parserState.eventStack[parserState.eventStack.length - 1]?.event === 'VALUE_LITERAL_START') {
          const event: ValueLiteralEndParserEvent = { event: 'VALUE_LITERAL_END' }
          parserState.eventStack.pop()
          parserState.done = yield event

          bufferIndex-- // Reprocess this character
          continue
        }
        if (parserState.eventStack[parserState.eventStack.length - 1]?.event === 'KEY_VALUE_SPLIT') {
          parserState.eventStack.pop()
        }
        parserState.eventStack.pop()
        parserState.done = yield { event: 'OBJECT_END' }
        continue
      }

      if (
        this.#isValueLiteralStart(charCode) &&
        !['VALUE_LITERAL_START', 'STRING_START'].includes(
          parserState.eventStack[parserState.eventStack.length - 1]?.event,
        )
      ) {
        if (
          parserState.eventStack[parserState.eventStack.length - 1]?.event === 'KEY_VALUE_SPLIT' &&
          parserState.eventStack[parserState.eventStack.length - 2]?.event === 'OBJECT_START'
        ) {
          // Starting processing of a value literal as the value of an object property
          parserState.eventStack.pop()
        }
        const event: ValueLiteralStartParserEvent = { event: 'VALUE_LITERAL_START', charCode }
        parserState.eventStack.push(event)
        parserState.done = yield event
        continue
      }

      if (
        charCode === Token.DOUBLE_QUOTE &&
        (!this.#isInString(parserState.eventStack) || !parserState.stringEscapeCharacterSeen)
      ) {
        if (
          parserState.eventStack[parserState.eventStack.length - 1]?.event === 'KEY_VALUE_SPLIT' &&
          parserState.eventStack[parserState.eventStack.length - 2]?.event === 'OBJECT_START'
        ) {
          // Starting processing of a string as the value of an object property
          parserState.eventStack.pop()
        }
        if (parserState.eventStack[parserState.eventStack.length - 1]?.event === 'STRING_START') {
          parserState.stringEscapeCharacterSeen = false
          parserState.eventStack.pop()
          parserState.done = yield { event: 'STRING_END' }
          continue
        }
        const event: StringStartParserEvent = { event: 'STRING_START' }
        parserState.eventStack.push(event)
        parserState.done = yield event
        continue
      }

      if (
        !this.#isValueLiteralStart(charCode) &&
        !['STRING_START', 'VALUE_LITERAL_START'].includes(
          parserState.eventStack[parserState.eventStack.length - 1]?.event,
        )
      ) {
        // If we are not already parsing a string or value literal and
        // the current character is not a valid start to a value literal
        // it must be an invalid character
        throw this.#decorateSyntaxError(
          new SyntaxError(`Unexpected token '${String.fromCharCode(charCode)}'`),
          parserState.inputIndex,
          bufferIndex,
        )
      }

      // If processing gets to this point, just return character events
      if (
        charCode === Token.BACKWARD_SLASH &&
        this.#isInString(parserState.eventStack) &&
        !parserState.stringEscapeCharacterSeen
      ) {
        parserState.stringEscapeCharacterSeen = true
      } else {
        parserState.stringEscapeCharacterSeen = false
      }
      parserState.done = yield { event: 'CHARACTER', charCode }
    }
  }

  /**
   * Checks the parserState to ensure events are closed properly when the parsing
   * was not forcibly ended.
   * @param parserState Current state of parsing the input
   */
  protected *postParseBuffer(parserState: ParserState): Generator<ParserEvent, void, boolean> {
    if (!parserState.done) {
      // Processing was not forcibly ended but the input was fully processed
      // Check for possible errors

      if (!parserState.openingEvent) {
        throw new ParserError('Unexpected end of JSON input')
      }

      for (let closingIndex = parserState.eventStack.length - 1; closingIndex >= 0; closingIndex--) {
        if (parserState.done) {
          break
        }

        if (parserState.eventStack[closingIndex]?.event === 'VALUE_LITERAL_START') {
          parserState.done = yield { event: 'VALUE_LITERAL_END' }
          continue
        }
        if (parserState.eventStack[parserState.eventStack.length - 1]?.event === 'STRING_START') {
          throw this.#decorateSyntaxError(new SyntaxError('Unterminated string in JSON'), parserState.inputIndex, 0)
        }
        if (
          ['ARRAY_START', 'OBJECT_START'].includes(parserState.eventStack[parserState.eventStack.length - 1]?.event)
        ) {
          throw new ParserError('Unexpected end of JSON input')
        }
      }
    }
  }

  /**
   * Decorate a syntax error with positional information.
   * @param err The syntax error being thrown
   * @param inputIndex The number of time the reading buffer has been filled minus 1
   * @param bufferIndex The position of the buffer index when the error was thrown
   * @returns New ParserError wrapping the SyntaxError instance
   */
  #decorateSyntaxError(err: SyntaxError, inputIndex: number, bufferIndex: number): ParserError {
    return new ParserError(err.message + ` at position ${inputIndex + bufferIndex}`, err)
  }

  #parseOpening(charCode: number, previouslyOpened: boolean): OpeningParserEvent | void {
    if (previouslyOpened) {
      throw new SyntaxError(`Unexpected token '${String.fromCharCode(charCode)}'`)
    }
    if (charCode === Token.LEFT_CURLY_BRACKET) {
      return { event: 'OBJECT_START' }
    }
    if (charCode === Token.LEFT_SQUARE_BRACKET) {
      return { event: 'ARRAY_START' }
    }
    if (charCode === Token.DOUBLE_QUOTE) {
      return { event: 'STRING_START' }
    }
    if (this.#isValueLiteralStart(charCode)) {
      return { event: 'VALUE_LITERAL_START', charCode }
    }

    throw new SyntaxError(`Unexpected token '${String.fromCharCode(charCode)}'`)
  }

  #isValueLiteralStart(charCode: number): boolean {
    return [
      TrueValueLiteralToken.T,
      FalseValueLiteralToken.F,
      NullValueLiteralToken.N,
      ...Object.values(NumberValueLiteralToken).filter((c) => String.fromCharCode(c as number) !== '.'),
    ].includes(charCode)
  }

  #checkForInvalidToken(charCode: number, eventStack: ParserEvent[]): void {
    if (eventStack.length === 0 || this.#isInString(eventStack)) {
      // Let the parser logic process
      return
    }

    if (
      eventStack[eventStack.length - 1]?.event === 'KEY_VALUE_SPLIT' &&
      eventStack[eventStack.length - 2]?.event === 'OBJECT_START' &&
      (this.#isValueLiteralStart(charCode) || [Token.DOUBLE_QUOTE, Token.COMMA].includes(charCode))
    ) {
      // Don't throw error when starting a value literal or string value of an object property
      return
    }

    if (eventStack[eventStack.length - 1]?.event === 'OBJECT_START' && charCode === Token.COLON) {
      // Don't throw error when splitting a key/value pair inside an object
      return
    }

    if (charCode === Token.COMMA) {
      if (
        ['OBJECT_START', 'ARRAY_START'].includes(eventStack[eventStack.length - 2]?.event) &&
        eventStack[eventStack.length - 1]?.event === 'VALUE_LITERAL_START'
      ) {
        // A value literal has no defining end. A comma is valid to end a value literal when inside
        // an array or object
        return
      }
      if (['OBJECT_START', 'ARRAY_START'].includes(eventStack[eventStack.length - 1]?.event)) {
        // A comma is used to split properties within arrays and objects
        return
      }

      // If not inside an array or object OR inside an array or object but not parsing
      // a value literal (which has no defining end except a comma), the comma is unexpected
      throw new SyntaxError(`Unexpected token '${String.fromCharCode(charCode)}'`)
    }

    if (charCode === Token.COLON && eventStack[eventStack.length - 1]?.event !== 'OBJECT_START') {
      // A colon is only valid inside an object for splitting key and value pairs
      throw new SyntaxError("Expected property name or '}' in JSON")
    }

    if (
      [Token.RIGHT_CURLY_BRACKET, Token.RIGHT_SQUARE_BRACKET].includes(charCode) &&
      eventStack[eventStack.length - 1]?.event === 'STRING_START'
    ) {
      // A string inside an array or object must be terminated before the
      // object or array is closed
      throw new SyntaxError('Unterminated string in JSON')
    }

    if (
      eventStack[eventStack.length - 1]?.event === 'OBJECT_START' &&
      charCode !== Token.DOUBLE_QUOTE &&
      charCode !== Token.RIGHT_CURLY_BRACKET
    ) {
      // An object property must start with a double quote or the object must be closed
      throw new SyntaxError("Expected property name or '}' in JSON")
    }
  }

  #isInString(eventStack: ParserEvent[]): boolean {
    return eventStack.map((e) => e.event).includes('STRING_START')
  }
}
