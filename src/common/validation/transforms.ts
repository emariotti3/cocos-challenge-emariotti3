/** class-transformer hook: trims string inputs so " 100 " validates and parses the same as "100". */
export const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
