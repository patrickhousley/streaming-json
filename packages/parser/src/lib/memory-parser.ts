import { Parser } from './parser'
import { ParserOptions } from './parser-options'
import { ParserState } from './parser-state'
import { ParserEvent } from './parser-event'

export class MemoryParser extends Parser {
  #input: Uint8Array

  constructor(input: string | Uint8Array, options?: Partial<ParserOptions>) {
    super(options)

    if (input instanceof Uint8Array) {
      this.#input = input
    } else {
      this.#input = new TextEncoder().encode(input)
    }
  }

  /**
   * Generates a series of events based on parsing the provided input.
   */
  *parse(): Generator<ParserEvent, void, boolean> {
    const parserState = new ParserState()

    while (parserState.inputIndex < this.#input.length) {
      const buffer = this.#input.slice(parserState.inputIndex, parserState.inputIndex + this.options.bufferSize)
      const iterator = this.parseBuffer(buffer, parserState)
      let next = iterator.next()

      while (next && !next.done) {
        parserState.done = yield next.value

        if (parserState.done) break
        next = iterator.next()
      }

      if (parserState.done) break

      parserState.inputIndex += buffer.length
    }

    if (!parserState.done) {
      const iterator = this.postParseBuffer(parserState)
      let next = iterator.next()

      while (next && !next.done) {
        if (parserState.done) {
          break
        }

        parserState.done = yield next.value
        next = iterator.next()
      }
    }
  }
}
