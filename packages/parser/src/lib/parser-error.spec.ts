import { faker } from '@faker-js/faker'
import { ParserError } from './parser-error'

it('should mimic a native error', () => {
  const message = faker.lorem.sentence()
  const parserError = new ParserError(message)

  expect(parserError.message).toEqual(message)
  expect(parserError.name).toEqual('ParserError')
  expect(parserError.stack).toContain('parser/src/lib/parser-error.spec.ts:6:23')
})

it('should support providing a causing error', () => {
  const innerMessage = faker.lorem.sentence()
  const outerMessage = faker.lorem.sentence()

  const innerError = new Error(innerMessage)
  const parserError = new ParserError(outerMessage, innerError as Error)

  expect(parserError.message).toEqual(outerMessage)
  expect(parserError.stack).toContain('parser/src/lib/parser-error.spec.ts:18:23')
  expect(parserError.cause).toEqual(innerError)
  expect(parserError.cause?.message).toEqual(innerMessage)
  expect(parserError.cause?.stack).toContain('parser/src/lib/parser-error.spec.ts:17:22')
})
