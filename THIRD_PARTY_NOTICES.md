# Third-Party Notices

VocabMaster includes or distributes transformed vocabulary data from the
projects and publications listed below. Per-file provenance is recorded in
`open-vocabularies/catalog.json`.

## ECDICT

Source: [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)  
Copyright (c) 2025 Linwei  
License: MIT

The bundled exam vocabulary and Chinese definitions in the open vocabulary
collection are extracted and normalized from ECDICT.

## Most Frequent Technology English Words

Source: [Wei-Xia/most-frequent-technology-english-words](https://github.com/Wei-Xia/most-frequent-technology-english-words)  
Copyright (c) 2019 Wei Xia  
License: MIT

The source records were converted from Markdown front matter to VocabMaster's
eight-field JSON format.

## Medical Abbreviations

Source: [imantsm/medical_abbreviations](https://github.com/imantsm/medical_abbreviations)  
Copyright (c) 2020 imantsm  
License: MIT

The source CSV records were merged by abbreviation and converted to
VocabMaster's JSON format.

## dwyl english-words (build-time filter)

Source: [dwyl/english-words](https://github.com/dwyl/english-words)  
License: The Unlicense

Used only at build time as a spelling lexicon to reject malformed candidate
terms. The word list itself is not redistributed in this repository.

## google-10000-english (build-time filter)

Source: [first20hours/google-10000-english](https://github.com/first20hours/google-10000-english)  
License: MIT

Used only at build time to identify common English words when filtering
two-word domain terms. The word list itself is not redistributed in this
repository.

### MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Computer English Words

Source: [HurleyWong/Computer-English-Words](https://github.com/HurleyWong/Computer-English-Words)  
License: Apache License 2.0

Selected mainstream topic lists were converted from Markdown to VocabMaster's
JSON format and enriched with definitions from ECDICT. No upstream `NOTICE`
file was present when the source was retrieved. A copy of the license is
available at <https://www.apache.org/licenses/LICENSE-2.0>.

## Wikipedia Glossaries

Source: the English Wikipedia pages and revision identifiers listed for each
vocabulary in `open-vocabularies/catalog.json`  
License: Creative Commons Attribution-ShareAlike 4.0 International

Glossary terms and definitions were extracted, cleaned, combined with ECDICT
where a Chinese definition was available, and converted to VocabMaster's JSON
schema. These are modified/adapted versions of the source pages. Redistribution
and adaptations must comply with CC BY-SA 4.0:
<https://creativecommons.org/licenses/by-sa/4.0/>.
