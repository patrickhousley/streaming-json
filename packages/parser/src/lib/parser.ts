import { ParserOptions } from './parser-options'

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
}
