import {
  AllowedWhitespaceToken,
  FalseValueLiteralToken,
  NullValueLiteralToken,
  NumberValueLiteralToken,
  Token,
  TrueValueLiteralToken,
} from './charset'
import { Parser } from './parser'
import { ParserError } from './parser-error'
import {
  ArrayEndParserEvent,
  ArrayStartParserEvent,
  KeyValueSplitParserEvent,
  ObjectStartParserEvent,
  OpeningParserEvent,
  ParserEvent,
  StringStartParserEvent,
  ValueLiteralEndParserEvent,
  ValueLiteralStartParserEvent,
} from './parser-event'
import { ParserOptions } from './parser-options'

export class MemoryParser extends Parser {
  readonly input: Uint8Array

  constructor(input: string | Uint8Array, options?: Partial<ParserOptions>) {
    super(options)

    if (input instanceof Uint8Array) {
      this.input = input
    } else {
      this.input = new TextEncoder().encode(input)
    }
  }

  *read(): Generator<ParserEvent, void, boolean> {
    const eventStack: ParserEvent[] = []
    let openingEvent: ParserEvent | undefined | void
    let done = false
    let inputIndex = 0
    let buffer = this.input.slice(0, this.options.bufferSize)

    while (buffer.length > 0) {
      for (let bufferIndex = 0; bufferIndex < buffer.length; bufferIndex++) {
        if (done) break
        const charCode = buffer[bufferIndex]

        if (Object.values(AllowedWhitespaceToken).includes(charCode)) {
          // Only event on allowed white space characters if inside a string
          if (eventStack[eventStack.length - 1]?.event === 'STRING_START') {
            done = yield { event: 'CHARACTER', charCode }
            continue
          }
          continue
        }

        try {
          this.#checkForInvalidToken(charCode, eventStack)
        } catch (err) {
          throw this.#decorateSyntaxError(err as SyntaxError, inputIndex, bufferIndex)
        }

        if (eventStack.length === 0) {
          try {
            openingEvent = this.#parseOpening(charCode, !!openingEvent)
          } catch (err) {
            if (err instanceof SyntaxError) {
              throw this.#decorateSyntaxError(err, inputIndex, bufferIndex)
            }

            throw err
          }

          if (!openingEvent) {
            continue
          }

          eventStack.push(openingEvent)
          done = yield openingEvent
          continue
        }

        if (charCode === Token.COMMA) {
          if (eventStack[eventStack.length - 1]?.event === 'VALUE_LITERAL_START') {
            const event: ValueLiteralEndParserEvent = { event: 'VALUE_LITERAL_END' }
            eventStack.pop()
            done = yield event

            bufferIndex-- // Reprocess this character
            continue
          }
          if (['OBJECT_START', 'ARRAY_START'].includes(eventStack[eventStack.length - 1]?.event)) {
            done = yield { event: 'PROPERTY_SPLIT' }
            continue
          }
          continue
        }

        if (charCode === Token.COLON) {
          const event: KeyValueSplitParserEvent = { event: 'KEY_VALUE_SPLIT' }
          eventStack.push(event)
          done = yield event
          continue
        }

        if (charCode === Token.LEFT_SQUARE_BRACKET) {
          const event: ArrayStartParserEvent = { event: 'ARRAY_START' }
          eventStack.push(event)
          done = yield event
          continue
        }

        if (charCode === Token.RIGHT_SQUARE_BRACKET) {
          if (eventStack[eventStack.length - 1]?.event === 'VALUE_LITERAL_START') {
            const event: ValueLiteralEndParserEvent = { event: 'VALUE_LITERAL_END' }
            eventStack.pop()
            done = yield event

            bufferIndex-- // Reprocess this character
            continue
          }
          if (eventStack[eventStack.length - 2]?.event === 'KEY_VALUE_SPLIT') {
            eventStack.pop()
          }
          const event: ArrayEndParserEvent = { event: 'ARRAY_END' }
          eventStack.pop()
          done = yield event
          continue
        }

        if (charCode === Token.LEFT_CURLY_BRACKET) {
          const event: ObjectStartParserEvent = { event: 'OBJECT_START' }
          eventStack.push(event)
          done = yield event
          continue
        }

        if (charCode === Token.RIGHT_CURLY_BRACKET) {
          if (eventStack[eventStack.length - 1]?.event === 'VALUE_LITERAL_START') {
            const event: ValueLiteralEndParserEvent = { event: 'VALUE_LITERAL_END' }
            eventStack.pop()
            done = yield event

            bufferIndex-- // Reprocess this character
            continue
          }
          if (eventStack[eventStack.length - 1]?.event === 'KEY_VALUE_SPLIT') {
            eventStack.pop()
          }
          eventStack.pop()
          done = yield { event: 'OBJECT_END' }
          continue
        }

        if (
          this.#isValueLiteralStart(charCode) &&
          !['VALUE_LITERAL_START', 'STRING_START'].includes(eventStack[eventStack.length - 1]?.event)
        ) {
          if (
            eventStack[eventStack.length - 1]?.event === 'KEY_VALUE_SPLIT' &&
            eventStack[eventStack.length - 2]?.event === 'OBJECT_START'
          ) {
            // Starting processing of a value literal as the value of an object property
            eventStack.pop()
          }
          const event: ValueLiteralStartParserEvent = { event: 'VALUE_LITERAL_START', charCode }
          eventStack.push(event)
          done = yield event
          continue
        }

        if (charCode === Token.DOUBLE_QUOTE) {
          if (
            eventStack[eventStack.length - 1]?.event === 'KEY_VALUE_SPLIT' &&
            eventStack[eventStack.length - 2]?.event === 'OBJECT_START'
          ) {
            // Starting processing of a string as the value of an object property
            eventStack.pop()
          }
          if (eventStack[eventStack.length - 1]?.event === 'STRING_START') {
            eventStack.pop()
            done = yield { event: 'STRING_END' }
            continue
          }
          const event: StringStartParserEvent = { event: 'STRING_START' }
          eventStack.push(event)
          done = yield event
          continue
        }

        if (
          !this.#isValueLiteralStart(charCode) &&
          !['STRING_START', 'VALUE_LITERAL_START'].includes(eventStack[eventStack.length - 1]?.event)
        ) {
          // If we are not already parsing a string or value literal and
          // the current character is not a valid start to a value literal
          // it must be an invalid character
          throw this.#decorateSyntaxError(
            new SyntaxError(`Unexpected token '${String.fromCharCode(charCode)}'`),
            inputIndex,
            bufferIndex,
          )
        }

        // If processing gets to this point, just return character events
        // Most likely processing values: true, false, null
        done = yield { event: 'CHARACTER', charCode }
      }

      if (done) break
      inputIndex += buffer.length
      buffer = this.input.slice(inputIndex, inputIndex + this.options.bufferSize)
    }

    if (!done) {
      // Processing was not forcibly ended but the input was fully processed
      // Check for possible errors

      if (!openingEvent) {
        throw new ParserError('Unexpected end of JSON input')
      }

      for (let closingIndex = eventStack.length - 1; closingIndex >= 0; closingIndex--) {
        if (done) {
          break
        }

        if (eventStack[closingIndex]?.event === 'VALUE_LITERAL_START') {
          done = yield { event: 'VALUE_LITERAL_END' }
          continue
        }
        if (eventStack[eventStack.length - 1]?.event === 'STRING_START') {
          throw this.#decorateSyntaxError(new SyntaxError('Unterminated string in JSON'), inputIndex, buffer.length)
        }
        if (['ARRAY_START', 'OBJECT_START'].includes(eventStack[eventStack.length - 1]?.event)) {
          throw new ParserError('Unexpected end of JSON input')
        }
      }

      // if (eventStack[eventStack.length - 1]?.event === 'STRING_START') {
      //   throw new ParserError('String never closed.')
      // } else if (eventStack[eventStack.length - 1]?.event === 'ARRAY_START') {
      //   throw new ParserError('Array never closed.')
      // } else if (
      //   eventStack[eventStack.length - 1]?.event === 'NUMBER_START' ||
      //   eventStack[eventStack.length - 1]?.event === 'NUMBER_FLOAT_SPLITTER_CHARACTER'
      // ) {
      //   yield { event: 'NUMBER_END' }
      // }
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
    if (eventStack.length === 0) {
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
}
