const ARTICLES = /^(el|la|los|las|the|a|an|le|les|lo|il|un|una|unos|unas)\s+/

export function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

function stripArticle(str) {
  return str.replace(ARTICLES, '')
}

export function check(input, movie) {
  const inp = normalize(input)
  if (inp.length < 2) return false

  const title = normalize(movie.title)
  const alts = (movie.alt || []).map(normalize)

  const targets = [title, stripArticle(title), ...alts, ...alts.map(stripArticle)]
  const inputs = [inp, stripArticle(inp)]

  return inputs.some(i => targets.includes(i))
}
