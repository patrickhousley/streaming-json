import { Parser } from './parser'
import { ParserEvent } from './parser-event'
import { ParserOptions } from './parser-options'

class MockParser extends Parser {
  constructor(options?: Partial<ParserOptions>) {
    super(options)
  }

  override *parse(): Generator<ParserEvent, void, boolean> {
    yield { event: 'ARRAY_START' }
    yield { event: 'ARRAY_END' }
  }
}

it('should default options', () => {
  const parser = new MockParser()

  expect(parser.options.bufferSize).toEqual(8 * 1024)
})

it('should fix the buffer size', () => {
  const bufferSize = 8 * 1024 - 6
  const parser = new MockParser({ bufferSize })
  expect(parser.options.bufferSize).toEqual(8 * 1024)
})
