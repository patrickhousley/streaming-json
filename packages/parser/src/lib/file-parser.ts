import * as fs from 'node:fs'
import { Parser } from './parser'
import { ParserOptions } from './parser-options'
import { ParserEvent } from './parser-event'
import { ParserState } from './parser-state'
import { ParserError } from './parser-error'

export class FileParser extends Parser {
  #filePath: fs.PathLike

  constructor(filePath: fs.PathLike, options?: Partial<ParserOptions>) {
    super(options)

    this.#filePath = filePath
  }

  override async *parse(): AsyncGenerator<ParserEvent, void, boolean> {
    const parserState = new ParserState()
    let fileDescriptor: number | undefined

    try {
      fileDescriptor = await this.#openFile()
      let input = await this.#readFile(fileDescriptor, parserState.inputIndex)

      while (input.data && input.data.length > 0) {
        console.log(input.data)
        const iterator = this.parseBuffer(input.data, parserState)
        let next = iterator.next()

        while (next && !next.done) {
          parserState.done = yield next.value

          if (parserState.done) break
          next = iterator.next()
        }

        if (parserState.done) break

        parserState.inputIndex += input.bytesRead
        input = await this.#readFile(fileDescriptor, parserState.inputIndex)
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
    } finally {
      if (fileDescriptor) {
        await this.#closeFile(fileDescriptor)
      }
    }
  }

  async #openFile(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      fs.open(this.#filePath, 'r', (err, fd) => {
        if (err) {
          reject(new ParserError(`Unable to open file ${this.#filePath}`, err))
        } else {
          resolve(fd)
        }
      })
    })
  }

  async #readFile(fileDescriptor: number, offset: number): Promise<{ data: Uint8Array; bytesRead: number }> {
    return new Promise((resolve, reject) => {
      fs.read(fileDescriptor, { length: this.options.bufferSize, offset }, (err, bytesRead, data) => {
        if (err) {
          reject(new ParserError(`Unable to read file ${this.#filePath}`, err))
        } else {
          resolve({
            data: new Uint8Array(data.buffer),
            bytesRead,
          })
        }
      })
    })
  }

  async #closeFile(fileDescriptor: number): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.close(fileDescriptor, (err) => {
        if (err) {
          reject(new ParserError(`Unable to close file ${this.#filePath}`, err))
        } else {
          resolve()
        }
      })
    })
  }
}
