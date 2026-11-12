import { toLikePattern } from './instruments.repository';

describe('toLikePattern', () => {
  it('wraps the term in wildcards', () => {
    expect(toLikePattern('pamp')).toBe('%pamp%');
  });

  it('escapes LIKE metacharacters and the escape char itself', () => {
    expect(toLikePattern('100%')).toBe('%100!%%');
    expect(toLikePattern('a_b')).toBe('%a!_b%');
    expect(toLikePattern('a!b')).toBe('%a!!b%');
  });
});
