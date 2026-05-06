# Attributions

Aletheia bundles or builds upon the following third-party data, fonts,
and software. Each item is reproduced here under the terms of its
upstream license; consult the linked sources for full text.

## Bible texts and lexical data

| Source | Used for | License | Attribution |
|---|---|---|---|
| **King James Version (KJV)** | Base English text, KJV Apocrypha | Public Domain (US). UK: Crown Copyright in perpetuity, royal letters patent. | — |
| **Westminster Leningrad Codex (WLC)** | Hebrew Old Testament base text | [Open Translation License 1.5](https://tanach.us/Pages/About.html#license) | Westminster Leningrad Codex, [tanach.us](https://tanach.us/) |
| **OpenScriptures Hebrew Bible (OSHB)** | Hebrew OT word mappings (Strong's IDs, lemma, morphology) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) | © OpenScriptures, [github.com/openscriptures/morphhb](https://github.com/openscriptures/morphhb) |
| **MorphGNT / SBLGNT morphology** | Greek NT word mappings (Strong's IDs, lemma, morphology) | [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | © MorphGNT contributors, [github.com/morphgnt/sblgnt](https://github.com/morphgnt/sblgnt) |
| **Strong's Greek + Hebrew lexicons** | Word definitions, transliterations, pronunciations | Public Domain (James Strong, 1890) | — |
| **eBible.org KJV2006 USFM (`eng-kjv2006`)** | English-to-Strong's index for the Lexicon's English-lookup feature | Public Domain (KJV text + Strong's tagging both PD; UK Crown Letters Patent only apply inside the UK) | [eBible.org](https://ebible.org/find/details.php?id=eng-kjv2006), upstream Crosswire KJV2003 |
| **1 Enoch** (Ethiopic Apocalypse of Enoch) | Pseudepigrapha section, "Public Domain Pseudepigrapha" translation | Public Domain (US, pre-1929) | Translated by R.H. Charles, *The Book of Enoch*, Oxford: Clarendon Press, 1917. Retrieved from [pseudepigrapha.com](https://www.pseudepigrapha.com/pseudepigrapha/enoch.htm). |
| **Jubilees** | Pseudepigrapha section, "Public Domain Pseudepigrapha" translation | Public Domain (US, pre-1929) | Translated by R.H. Charles, *The Book of Jubilees*, Oxford: Clarendon Press, 1913. Retrieved from [pseudepigrapha.com](https://www.pseudepigrapha.com/jubilees/index.htm). |
| **2 Enoch** (Slavonic Book of the Secrets of Enoch) | Pseudepigrapha section, "Public Domain Pseudepigrapha" translation | Public Domain (US, pre-1929) | Translated from the Slavonic by W.R. Morfill, in R.H. Charles ed., *The Book of the Secrets of Enoch*, Oxford: Clarendon Press, 1896. Retrieved from [pseudepigrapha.com](https://www.pseudepigrapha.com/pseudepigrapha/enochs2.htm). |

### Optionally-installed translations

These are **not** bundled with the default installer. Users may install
their own copies through the rights holders' channels:

| Translation | Rights holder | Notes |
|---|---|---|
| New King James Version (NKJV) | Thomas Nelson / HarperCollins Christian Publishing | Commercial license required; per-installation fee. |
| English Standard Version (ESV) | Crossway Bibles, a publishing ministry of Good News Publishers | Free for limited non-commercial use; commercial software embedding requires written permission. |
| SBL Greek New Testament (SBLGNT) | Society of Biblical Literature & Logos Bible Software | Free for non-commercial use; commercial distribution requires written permission. |

If you have legitimate access to these translations and an Aletheia
build with the optional translation packs, your usage is governed by
the terms of your license with the rights holder.

## Fonts

All fonts are vendored locally via [`@fontsource`](https://fontsource.org/);
the app does not call any web font CDN at runtime.

| Font | License | Source |
|---|---|---|
| Inter | [SIL Open Font License 1.1](https://opensource.org/licenses/OFL-1.1) | [rsms.me/inter](https://rsms.me/inter/) |
| Lora | [SIL Open Font License 1.1](https://opensource.org/licenses/OFL-1.1) | [Cyreal](https://github.com/cyrealtype/Lora-Cyrillic) |
| Noto Serif | [SIL Open Font License 1.1](https://opensource.org/licenses/OFL-1.1) | [Google Fonts / Noto](https://notofonts.github.io/) |
| Noto Serif Hebrew | [SIL Open Font License 1.1](https://opensource.org/licenses/OFL-1.1) | [Google Fonts / Noto](https://notofonts.github.io/) |

## Software dependencies

The application is built with [Tauri 2](https://tauri.app/) (MIT/Apache-2.0),
[React](https://react.dev/) (MIT), [SQLite](https://www.sqlite.org/) (Public
Domain), [rusqlite](https://github.com/rusqlite/rusqlite) (MIT),
[reqwest](https://github.com/seanmonstar/reqwest) (MIT/Apache-2.0),
[keyring](https://github.com/open-source-cooperative/keyring-rs)
(MIT/Apache-2.0), and the rest of the crates listed in
`src-tauri/Cargo.toml` and the Node packages in `package.json`. Run
`cargo tree --no-default-features` and `npm ls` for a full bill of
materials.

## Trademarks

The "Aletheia" name and logo are trademarks of the Aletheia project
authors. AI-provider names (OpenAI, Anthropic, Google, Groq, Ollama)
appear under nominative use to identify those services; their respective
trademarks belong to their owners.

This project is **not** affiliated with, endorsed by, or sponsored by
Faithlife Corporation's Logos Bible Software product line.
