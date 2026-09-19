# Boundary Conditions and Edge Cases

Systematic patterns for testing boundary conditions, edge cases, and limit values.
Test explicitly at boundaries — don't rely on random or ad-hoc exploration to find them.

## When to Apply

- Testing minimum and maximum numeric values
- Testing null, empty, and whitespace-only strings
- Testing collections with zero, one, or many items
- Overflow and underflow scenarios
- Verifying behavior at public API input boundaries
- Floating-point precision comparisons
- Date/time limits (leap years, month boundaries, timezone transitions)

## Boundary Identification Checklist

Before writing tests, list all boundaries for the function under test:

| Category | Boundary cases to cover |
|----------|------------------------|
| Numeric | `MIN_VALUE`, `MAX_VALUE`, `0`, `-1`, `1`, overflow/underflow |
| String | `null`, `""`, `" "` (whitespace), single char, very long string, special chars |
| Collection | empty (`0`), single (`1`), many (`>1`), contains `null`, duplicates |
| Array index | `0`, `length-1`, negative index, out-of-bounds |
| Float | `0.0`, `NaN`, `+Infinity`, `-Infinity`, precision tolerance |
| Date/time | `MIN`, `MAX`, leap year day, year boundary, midnight |

---

## JUnit 5 (Java)

### Setup

**Maven**
```xml
<dependency>
  <groupId>org.junit.jupiter</groupId>
  <artifactId>junit-jupiter</artifactId>
  <scope>test</scope>
</dependency>
<dependency>
  <groupId>org.junit.jupiter</groupId>
  <artifactId>junit-jupiter-params</artifactId>
  <scope>test</scope>
</dependency>
<dependency>
  <groupId>org.assertj</groupId>
  <artifactId>assertj-core</artifactId>
  <scope>test</scope>
</dependency>
```

**Gradle**
```kotlin
dependencies {
  testImplementation("org.junit.jupiter:junit-jupiter")
  testImplementation("org.junit.jupiter:junit-jupiter-params")
  testImplementation("org.assertj:assertj-core")
}
```

### Numeric Boundaries

```java
class IntegerBoundaryTest {

  @ParameterizedTest
  @ValueSource(ints = {Integer.MIN_VALUE, Integer.MIN_VALUE + 1, 0, Integer.MAX_VALUE - 1, Integer.MAX_VALUE})
  void shouldHandleIntegerBoundaries(int value) {
    // assert your function handles all of these without throwing
    assertThat(value).isNotNull();
  }

  @Test
  void shouldHandleIntegerOverflow() {
    assertThatThrownBy(() -> Math.addExact(Integer.MAX_VALUE, 1))
      .isInstanceOf(ArithmeticException.class);
  }

  @Test
  void shouldHandleIntegerUnderflow() {
    assertThatThrownBy(() -> Math.subtractExact(Integer.MIN_VALUE, 1))
      .isInstanceOf(ArithmeticException.class);
  }

  @Test
  void shouldHandleZeroDivision() {
    int result = MathUtils.divide(0, 5);
    assertThat(result).isZero();

    assertThatThrownBy(() -> MathUtils.divide(5, 0))
      .isInstanceOf(ArithmeticException.class);
  }
}
```

### String Boundaries

```java
class StringBoundaryTest {

  @ParameterizedTest
  @ValueSource(strings = {"", " ", "  ", "\t", "\n"})
  void shouldConsiderEmptyAndWhitespaceAsInvalid(String input) {
    assertThat(StringUtils.isNotBlank(input)).isFalse();
  }

  @Test
  void shouldHandleNullString() {
    assertThat(StringUtils.trim(null)).isNull();
  }

  @Test
  void shouldHandleSingleCharacter() {
    assertThat(StringUtils.capitalize("a")).isEqualTo("A");
  }

  @Test
  void shouldHandleVeryLongString() {
    String longString = "x".repeat(1_000_000);
    assertThat(StringUtils.isNotBlank(longString)).isTrue();
  }
}
```

### Collection Boundaries

```java
class CollectionBoundaryTest {

  @Test
  void shouldHandleEmptyList() {
    List<String> empty = List.of();
    assertThat(empty).isEmpty();
    assertThat(CollectionUtils.first(empty)).isNull();
  }

  @Test
  void shouldHandleSingleElementList() {
    List<String> single = List.of("only");
    assertThat(CollectionUtils.first(single)).isEqualTo("only");
    assertThat(CollectionUtils.last(single)).isEqualTo("only");
  }

  @Test
  void shouldHandleLargeList() {
    List<Integer> large = IntStream.range(0, 100_000).boxed().collect(toList());
    assertThat(CollectionUtils.first(large)).isZero();
    assertThat(CollectionUtils.last(large)).isEqualTo(99_999);
  }

  @Test
  void shouldHandleNullInCollection() {
    List<String> withNull = new ArrayList<>(Arrays.asList("a", null, "c"));
    assertThat(CollectionUtils.filterNonNull(withNull)).hasSize(2);
  }
}
```

### Floating-Point Boundaries

```java
class FloatingPointBoundaryTest {

  @Test
  void shouldHandleFloatingPointPrecision() {
    // Never use exact equality for float/double — always use tolerance
    assertThat(0.1 + 0.2).isCloseTo(0.3, within(0.0001));
  }

  @Test
  void shouldHandleSpecialValues() {
    assertThat(Double.POSITIVE_INFINITY).isGreaterThan(Double.MAX_VALUE);
    assertThat(Double.NaN).isNotEqualTo(Double.NaN); // NaN != NaN by IEEE 754
    assertThat(Double.isNaN(Double.NaN)).isTrue();    // use isNaN() for NaN detection
  }

  @Test
  void shouldHandleZeroDivision() {
    assertThat(1.0 / 0.0).isEqualTo(Double.POSITIVE_INFINITY);
    assertThat(-1.0 / 0.0).isEqualTo(Double.NEGATIVE_INFINITY);
    assertThat(0.0 / 0.0).isNaN();
  }
}
```

### Array Index Boundaries

```java
class ArrayBoundaryTest {

  @Test
  void shouldHandleFirstAndLastAccess() {
    int[] array = {1, 2, 3, 4, 5};
    assertThat(array[0]).isEqualTo(1);
    assertThat(array[array.length - 1]).isEqualTo(5);
  }

  @Test
  void shouldThrowOnOutOfBoundsIndex() {
    int[] array = {1, 2, 3};
    assertThatThrownBy(() -> { int v = array[-1]; }).isInstanceOf(ArrayIndexOutOfBoundsException.class);
    assertThatThrownBy(() -> { int v = array[10]; }).isInstanceOf(ArrayIndexOutOfBoundsException.class);
  }

  @Test
  void shouldHandleEmptyArray() {
    int[] empty = {};
    assertThat(empty.length).isZero();
    assertThatThrownBy(() -> { int v = empty[0]; }).isInstanceOf(ArrayIndexOutOfBoundsException.class);
  }
}
```

### Date/Time Boundaries

```java
class DateTimeBoundaryTest {

  @Test
  void shouldHandleMinAndMaxDates() {
    assertThat(LocalDate.MIN).isBefore(LocalDate.MAX);
  }

  @Test
  void shouldHandleLeapYearBoundary() {
    assertThat(LocalDate.of(2024, 2, 29)).isNotNull(); // valid leap-year date
    assertThatThrownBy(() -> LocalDate.of(2023, 2, 29))
      .isInstanceOf(DateTimeException.class);           // invalid non-leap-year date
  }

  @Test
  void shouldHandleYearBoundaries() {
    LocalDate newYear = LocalDate.of(2024, 1, 1);
    LocalDate lastDay = LocalDate.of(2024, 12, 31);
    assertThat(newYear).isBefore(lastDay);
  }
}
```

### Parameterized Boundary Tests

```java
class ParameterizedBoundaryTest {

  @ParameterizedTest
  @CsvSource({
    "null,  false", // null
    "'',    false", // empty
    "'   ', false", // whitespace
    "a,     true",  // single char
    "abc,   true"   // normal
  })
  void shouldValidateStringBoundaries(String input, boolean expected) {
    assertThat(StringValidator.isValid(input)).isEqualTo(expected);
  }

  @ParameterizedTest
  @ValueSource(ints = {Integer.MIN_VALUE, -1, 0, 1, Integer.MAX_VALUE})
  void shouldHandleNumericBoundaries(int value) {
    // assert your function handles each value correctly
  }
}
```

---

## Jest / Vitest (TypeScript/JavaScript)

```typescript
describe('boundary conditions', () => {
  // Numeric
  it.each([Number.MIN_SAFE_INTEGER, -1, 0, 1, Number.MAX_SAFE_INTEGER])(
    'handles numeric boundary %i',
    (value) => {
      expect(() => myFn(value)).not.toThrow();
    }
  );

  // String: null / empty / whitespace
  it.each([null, undefined, '', '   ', '\t', '\n'])(
    'rejects empty/whitespace input %j',
    (input) => {
      expect(isValid(input)).toBe(false);
    }
  );

  // Collection: empty, single, many
  it('handles empty array', () => {
    expect(processItems([])).toEqual([]);
  });

  it('handles single-element array', () => {
    expect(processItems(['x'])).toEqual(['x']);
  });

  // Float precision — never use toBe for float comparison
  it('handles floating point precision', () => {
    expect(0.1 + 0.2).toBeCloseTo(0.3, 5);
  });

  // Overflow — JS uses IEEE 754 doubles; test MAX_SAFE_INTEGER + 1
  it('detects unsafe integer boundary', () => {
    expect(Number.isSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });
});
```

---

## pytest (Python)

```python
import pytest
import sys
import math

# Numeric boundaries via parametrize
@pytest.mark.parametrize("value", [sys.maxsize, sys.maxsize - 1, 0, -1, -sys.maxsize - 1])
def test_handles_integer_boundaries(value):
    assert my_fn(value) is not None   # assert whatever is relevant

# String boundaries
@pytest.mark.parametrize("s", [None, "", " ", "\t", "\n"])
def test_rejects_blank_strings(s):
    assert not is_valid(s)

# Collection boundaries
def test_empty_list():
    assert process([]) == []

def test_single_element_list():
    assert process(["x"]) == ["x"]

# Float precision — use pytest.approx
def test_floating_point_precision():
    assert 0.1 + 0.2 == pytest.approx(0.3, rel=1e-5)

# Float special values
def test_special_float_values():
    assert math.isinf(float("inf"))
    assert math.isnan(float("nan"))

# Overflow (Python integers are arbitrary-precision; test domain limits instead)
def test_raises_on_domain_overflow():
    with pytest.raises(ValueError):
        validated_add(sys.maxsize, 1)  # if your function enforces a domain limit
```

---

## Best Practices

- **Test explicitly at boundaries** — don't rely on random testing to find them.
- **Test null and empty separately** — they often fail for different reasons.
- **Use parameterized tests** for multiple boundary values; keep assertions specific per case.
- **Test both sides of every boundary** — just below, at, and just above.
- **Verify error messages** — invalid-boundary errors should be actionable for callers.
- **Document why** each boundary matters for the domain (comment in the test).
- **Test overflow/underflow** for numeric operations that don't use arbitrary-precision types.

## Constraints and Warnings

- **Integer overflow**: Java's `int` and `long` overflow silently; use `Math.addExact()` / `Math.subtractExact()` to detect. JavaScript's `Number` loses precision above `Number.MAX_SAFE_INTEGER`.
- **Floating point precision**: Never use exact equality (`==`, `toBe`, `assertEqual`) for float comparisons; always use tolerance-based assertions (`isCloseTo`, `toBeCloseTo`, `pytest.approx`).
- **NaN behavior**: `NaN != NaN` by IEEE 754 in all languages; use `isNaN()` / `math.isnan()` for detection.
- **Large collections**: Be mindful of memory when testing with very large collections (>100k elements).
- **String encoding**: Test with Unicode characters and whitespace variants (`\t`, `\n`, non-breaking space) for internationalization coverage.
- **Date/time boundaries**: Be aware of leap years, DST transitions, and timezone edge cases.
- **Array indexing**: Always test index `0`, `length-1`, and at least one out-of-bounds scenario.

## Common Pitfalls

- Testing only the happy path without boundary cases.
- Forgetting `null` / `undefined` / `None` as separate cases from empty string.
- Using exact equality for floating-point results.
- Not testing collection boundaries (empty, single element).
- Assuming a boundary value that "looks fine" doesn't need a test — it does.

## Troubleshooting

**Floating point comparison fails:** Use `isCloseTo(expected, within(tolerance))` (Java), `toBeCloseTo(n, precision)` (Jest), or `pytest.approx(n, rel=1e-5)` (Python).

**Collection boundaries unclear:** List cases explicitly — empty (0), single (1), many (>1) — and write one test per case.

**Date boundary confusing:** Use `LocalDate.MIN` / `LocalDate.MAX` (Java) or `datetime.min` / `datetime.max` (Python) for the clearest boundary anchors.

**Integer overflow not detected:** Use `Math.addExact()` / `Math.subtractExact()` (Java). In Python, integers are arbitrary-precision — test domain-level limits instead.
