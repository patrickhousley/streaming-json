# @streaming-json/parser

This library implements a low-level streaming parser for JSON data, inspired by StAX for Java and XML. The parser acts upon a buffer of character codes and yields events, possibly with `charCode` values, that can be used to reconstruct JavaScript objects, array, and literals. Character codes are used to ensure compatibility with `utf-8`, `utf-16`, and `utf-32` encoding.

## Parsers

All parsers include a `*read()` generator function that should be used to begin parsing. This is a generator function and returns an `Iterator`. Call the `next()` function of the iterator to get the first and subsequent events. If you wish to stop processing before the end of the input, pass `true` as a value to the `next()` function like so: `next(true)`

### MemoryParser

The memory parser is constructed with a `string` or `Uint8Array` as the first argument. As such, this implementation is not memory focused since the entire contents of the JSON string are already in memory. However, it can be beneficial for CPU intensive parsing of large JSON data sets by utilizing an `ArrayBuffer` to transfer the data to a child or worker thread.

## Encoding Support

All parsers operate on `Uint8Array` buffers. For JSON containing only `utf-8` encoded characters, the parser can be expected to emit one event per character within a string value. For JSON containing `utf-16`, two events should be expected, or `utf-32`, four events should be expected.

### Expected Characters

No matter the encoding used, certain JSON control characters are still expected to only be a singe character code. For example, all arrays, no matter the language or encoding, must start with `[` and end with `]`.

- Arrays: `[` and `]`
- Objects: `{` and `}`
- Strings: `"` and `"` (anything in between is fine to the parser)
- Numbers: Western Arabic numerals and `'` for numeric literals, otherwise must be in a string
- Other: `:` to split key from value in objects, `,` to split values in arrays and objects
- Whitespace: ` ` (space), `\t` (tab), `\n` (line feed), and `\r` (carriage return) are the only whitespace character allowed outside a string

As an example, see how JavaScript encodes an emoji. The emoji is represented by four character codes in a `Uint8Array`. The JSON control characters are single character codes.

```js
new TextEncoder().encode('["😫"]')
Uint8Array(8)[(91, 34, 240, 159, 152, 171, 34, 93)]
```

## Events

### Literal Values

Literal values are values that are not contained within double quotes. Only certain values are valid. These values could appear as the only value within the JSON, as values of arrays, or as values of object properties.

**Note**: The parser is dumb to the actual value of the literal and only cares about the first character which must be `t`, `f`, `n`, or a Western Arabic numeral. It is up to the implementor to accumulate the character codes and transform them into a literal value.

#### Booleans

```js
JSON.parse('true')
JSON.parse('false')
JSON.parse('[true, false]')
JSON.parse('{"foo": false})
```

When `t` or `f` is encountered outside a string, a `VALUE_LITERAL_START` event with a `charCode` will be yielded. Subsequent characters will yield the `CHARACTER` event with a `charCode`. Once the end of the JSON, array, object, or `,` is reached, the `VALUE_LITERAL_END` event will be yielded.

#### Null

```js
JSON.parse('null')
JSON.parse('[null]')
JSON.parse('{"foo": null}')
```

When `n` is encountered outside of a string, a `VALUE_LITERAL_START` event with a `charCode` will be yielded. Subsequent characters will yield the `CHARACTER` event with a `charCode`. Once the end of the JSON, array, object, or `,` is reached, the `VALUE_LITERAL_END` event will be yielded.

#### Numbers

```js
JSON.parse('12.34')
```

When any Western Arabic numeral is encountered outside of a string, a `VALUE_LITERAL_START` event with a `charCode` will be yielded. Subsequent characters will yield the `CHARACTER` event with a `charCode`. Once the end of the JSON, array, object, or `,` is reached, the `VALUE_LITERAL_END` event will be yielded.

### Strings

```js
JSON.parse('"some string"')
JSON.parse('["some string"]')
JSON.parse('{"foo": "some string"}')
```

When `"` is encountered, a `STRING_START` event will be yielded. Subsequent characters will yield the `CHARACTER` event with a `charCode`. Once the next `"` is encountered, the `STRING_END` event will be yielded.

### Arrays

```js
JSON.parse('[]')
JSON.parse('[[]]')
JSON.parse('{"foo": []}')
JSON.parse('{"foo": [[]]}')
```

When `[` is encountered, an `ARRAY_START` event will be yielded. Subsequent characters will follow the rules of value literals, strings, arrays, and objects. Once the next `]` is encountered, the `ARRAY_END` event will be yielded.

### Object

```js
JSON.parse('{}')
JSON.parse('{"foo": {}}')
```

When `{` is encountered, an `OBJECT_START` event will be yielded. Subsequent characters will follow the rules of value literals, strings, arrays, and objects. Once the next `}` is encountered, the `OBJECT_END` event will be yielded.

### Colons and Commas

Colons (`:`) and commas (`,`) will produce different events based on where they are found within the JSON. Colons that appear within an object but outside of a string will yield the `KEY_VALUE_SPLIT` event. Commas that appear in an array or object will yield the `PROPERTY_SPLIT`.
