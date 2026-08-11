# Third-party data

Data vendored into `src/data/` that came from somewhere else, and the terms it
came under. Kept as its own file because two of these licences require the
notice to travel with the data, which a line in a README does not do.

---

## HSK 3.0 word list — `src/data/zh-CN/placement.json`

The Chinese placement test is built from the vocabulary list of
《国际中文教育中文水平等级标准》 (*Chinese Proficiency Grading Standards for
International Chinese Language Education*), GF 0025—2021, issued by the Ministry
of Education of the PRC and the State Language Commission, effective 1 July
2021.

Obtained from [ivankra/hsk30](https://github.com/ivankra/hsk30), a cleaned and
cross-validated parse of the official PDF, released under the MIT licence
reproduced below. That repository's own data derives from
[elkmovie/hsk30](https://github.com/elkmovie/hsk30), which extracted it from the
[PDF published by the Ministry of Education](http://www.moe.gov.cn/jyb_xwfb/gzdt_gzdt/s5987/202103/t20210329_523304.html).

A note on provenance, because it is worth stating plainly rather than being
discovered later: the MIT grant below is the packagers', not the ministry's. The
underlying list is a Chinese government normative standard, published freely for
reference. Article 5 of the PRC Copyright Law excludes official documents of a
legislative or administrative nature from copyright, and a GF language norm
plausibly falls under it — but that is a reading, not a settled ruling. The
upstream repository raises the same caveat.

```
MIT License

Copyright (c) 2023 Ivan Krasilnikov
Copyright (c) 2021 Shawky
Copyright (c) 2021 Pleco Inc.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

Rebuild with `npm run hsk`.

---

## Frequency lists — `src/data/*/frequency.json`

[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), word
counts derived from the OpenSubtitles 2018 corpus, MIT licensed.

Used as the difficulty ruler the generator aims at, and — for Spanish and
Indonesian — as the source of placement-test items. It is a corpus of film
dialogue, so it counts word *forms* rather than words and its tail is thick with
proper nouns; see the commit that removed vocabulary counts from the interface
for what that cost.

---

## Spanish dictionary — build-time only

[an-array-of-spanish-words](https://github.com/words/an-array-of-spanish-words),
~636k forms. Used by `npm run wordlist` to filter placement items and to check
that a generated pseudoword is not an obscure real word. Not shipped.
