/**
 * The in-scope bible.helloao.org catalog: every open-licensed translation from
 * `nativelangauge.txt` except the 6 RTL entries ([DEFERRED-RTL]) and the
 * already-bundled KJV. ~59 translations across ~20 languages.
 *
 * Each entry drives one download → standalone DB → `<slug>.db.zst`. `slug` is
 * the stable identity: manifest id + file stem + R2 key, so never rename one.
 * Slugs are the lowercased helloao id, which keeps them unique and free of any
 * collision with the XML-ingested slugs (kjv, web, dby, …).
 *
 * `licenseName` / `attribution` are surfaced in the Store UI. Every entry here
 * is open-licensed (public domain or CC BY / BY-SA / BY-ND) — we store verbatim
 * text (no modification), so BY-ND is satisfied. Pure data, no I/O.
 */

export interface CatalogEntry {
  /** bible.helloao.org id, used to fetch `/api/<helloaoId>/complete.json`. */
  helloaoId: string
  /** Stable manifest id / file stem / R2 key (lowercased helloao id). */
  slug: string
  abbreviation: string
  title: string
  /** BCP-47-ish language code used by the frontend `languageLabel`. */
  language: string
  languageName: string
  licenseName: string
  /** Attribution line surfaced in the UI; omitted for public-domain works. */
  attribution?: string
}

const PD = "Public Domain"
const BY = "CC BY 4.0"
const BY_SA = "CC BY-SA 4.0"
const BY_ND = "CC BY-ND 4.0"

export const CATALOG: readonly CatalogEntry[] = [
  // ── English ──
  entry("ENGWEBP", "WEBP", "World English Bible", "en", "English", PD),
  entry("BSB", "BSB", "Berean Standard Bible", "en", "English", PD),
  entry("eng_asv", "ASV", "American Standard Version (1901)", "en", "English", PD), // prettier-ignore
  entry("eng_ylt", "YLT", "Young's Literal Translation", "en", "English", PD),
  entry("eng_bbe", "BBE", "Bible in Basic English", "en", "English", PD),
  entry("eng_dra", "DRA", "Douay-Rheims (1899)", "en", "English", PD),
  entry(
    "eng_bre",
    "Brenton",
    "Brenton English Septuagint",
    "en",
    "English",
    PD
  ),
  entry("eng_lxu", "LXX2012", "British English Septuagint (2012)", "en", "English", PD), // prettier-ignore
  entry("eng_dby", "Darby", "Darby Translation", "en", "English", PD),
  entry("eng_gnv", "Geneva", "Geneva Bible (1599)", "en", "English", PD),
  entry("eng_msb", "MSB", "Majority Standard Bible", "en", "English", PD),
  entry("eng_noy", "Noyes", "Noyes Bible", "en", "English", PD),
  entry("eng_tnt", "Tyndale", "Tyndale New Testament", "en", "English", PD),
  entry("eng_webpb", "WEBBE", "World English Bible (British Edition)", "en", "English", PD), // prettier-ignore
  entry("eng_lsv", "LSV", "Literal Standard Version", "en", "English", BY_SA, "Copyright © 2020 Covenant Press"), // prettier-ignore
  entry("eng_f35", "F35", "Family 35 New Testament", "en", "English", BY_SA, "Copyright © 2016 Wilbur N. Pickering, ThM, PhD"), // prettier-ignore
  entry("eng_glw", "GLW", "God's Living Word", "en", "English", BY_ND, "Copyright © 1996 Michael Paul Johnson"), // prettier-ignore
  entry("eng_our", "OUR", "One Unity Resource Bible", "en", "English", BY_SA, "Copyright © 2016, 2019 Thomas Robinson"), // prettier-ignore
  entry("eng_pev", "PEV", "Plain English Version", "en", "English", BY_SA, "Copyright © Wycliffe Bible Translators Australia"), // prettier-ignore

  // ── Spanish ──
  entry("spa_r09", "RVA1909", "Reina-Valera (1909)", "es", "Spanish", PD),
  entry("spa_blm", "BLM", "Spanish Free Bible for the World", "es", "Spanish", PD), // prettier-ignore
  entry("spa_bes", "BES", "La Biblia en Español Sencillo", "es", "Spanish", BY, "Copyright © 2018, 2019 AudioBiblia.org / Irma Flores"), // prettier-ignore
  entry("spa_pdt", "PDT", "Palabra de Dios para Todos", "es", "Spanish", BY, "Copyright © 2020 Asociación Bíblica Latinoamericana"), // prettier-ignore
  entry("spa_vbl", "VBL", "Spanish Free Bible Version", "es", "Spanish", BY_SA, "Copyright © 2018-2020 Jonathan Gallagher y Shelly Barrios de Ávila"), // prettier-ignore
  entry("spa_onbv", "ONBV", "Spanish Open New Bible Version", "es", "Spanish", BY_SA, "Copyright © 2008 Biblica, Inc."), // prettier-ignore

  // ── French ──
  entry("fra_lsg", "LSG", "Louis Segond (1910)", "fr", "French", PD),
  entry("fra_ost", "Ostervald", "French Ostervald Bible", "fr", "French", PD),
  entry("fra_jnd", "FreJND", "Bible J.N. Darby", "fr", "French", PD),
  entry("fra_ncl", "NCL", "Néo-Crampon Libre", "fr", "French", BY_SA, "Copyright © 2022 Fraternité de Tibériade"), // prettier-ignore

  // ── Portuguese ──
  entry("por_blj", "BLivre", "Bíblia Livre", "pt", "Portuguese", BY, "Bíblia Livre"), // prettier-ignore
  entry("por_bsl", "WPB", "World Portuguese Bible", "pt", "Portuguese", PD),
  entry("por_blt", "BLT", "Portuguese Free Bible for All", "pt", "Portuguese", BY_SA, "Copyright © 2022 Free Bible Ministry, Inc."), // prettier-ignore
  entry("por_onbv", "ONBV", "Portuguese Open New Bible Version", "pt", "Portuguese", BY_SA, "Copyright © 2007, 2010 Biblica, Inc."), // prettier-ignore
  entry("por_tft", "TFT", "Portuguese Translation for Translators", "pt", "Portuguese", BY_SA, "Copyright © 2018 Ellis W. Deibler, Jr."), // prettier-ignore

  // ── German ──
  entry("deu_l12", "Luther1912", "Luther Bible (1912)", "de", "German", PD),
  entry("deu_tkw", "Textbibel", "German Textbibel", "de", "German", PD),
  entry("deu_elo", "Elberfelder", "Unrevised Elberfelder Bible", "de", "German", PD), // prettier-ignore
  entry("deu_sch", "Schlachter", "Schlachter Bible (1951)", "de", "German", BY, "Copyright © 1951 Genfer Bibelgesellschaft"), // prettier-ignore

  // ── Italian ──
  entry("ita_dio", "Diodati", "Italian Diodati Bible", "it", "Italian", PD),

  // ── Dutch ──
  entry("nld_", "NLD1917", "Dutch Bible (1917)", "nl", "Dutch", PD),
  entry("nld_1939", "Canisius", "Dutch Bible, Petrus Canisius", "nl", "Dutch", PD), // prettier-ignore
  entry("nld_gbv", "GodsBoek", "Dutch: Gods Boek", "nl", "Dutch", BY_SA, "Copyright © Operation Mobilization International"), // prettier-ignore

  // ── Russian ──
  entry("rus_syn", "Synodal", "Russian Synodal Bible", "ru", "Russian", PD),

  // ── Chinese ──
  entry("cmn_cuv", "CUVT", "Chinese Union Version (Traditional)", "zh", "Chinese", PD), // prettier-ignore
  entry("cmn_cu1", "CUVS", "Chinese Union Version (Simplified)", "zh", "Chinese", PD), // prettier-ignore

  // ── Korean ──
  entry("kor_old", "KOR1910", "Korean Bible (1910)", "ko", "Korean", PD),

  // ── Swahili ──
  entry("swh_bib", "Swahili", "Kiswahili Contemporary Version", "sw", "Swahili", BY_SA, "Copyright © Biblica, Inc."), // prettier-ignore

  // ── Hindi ──
  entry("hin_cvb", "HCV", "Hindi Contemporary Version", "hi", "Hindi", BY_SA, "Copyright © Biblica, Inc."), // prettier-ignore

  // ── Romanian ──
  entry("ron_924", "RomCyr", "Romanian Bible (Cyrillic)", "ro", "Romanian", PD),
  entry("ron_btf", "BTF", "Romanian BTF Bible", "ro", "Romanian", PD),
  entry("ron_lsb", "RomHoly", "Romanian Free Holy Bible", "ro", "Romanian", PD),
  entry("ron_lud", "Ludari", "Ludari Luke", "ro", "Romanian", BY_SA, "Copyright © 2019 Pioneer"), // prettier-ignore

  // ── Greek (NT) ──
  entry("grc_byz", "Byz", "Byzantine Greek New Testament", "grc", "Greek", PD),

  // ── Latin ──
  entry("lat_clv", "Vulgate", "Clementine Vulgate (1598)", "la", "Latin", PD),

  // ── Hausa ──
  entry("hau_bib", "Hausa", "Hausa Contemporary Bible", "ha", "Hausa", BY_SA, "Copyright © 2009, 2020 Biblica, Inc."), // prettier-ignore
  entry("hau_ulb", "HausaNT", "Hausa New Testament", "ha", "Hausa", BY_SA, "Copyright © 2020 Door43 World Missions Community"), // prettier-ignore

  // ── Polish ──
  entry("pol_bib", "OPLNT", "Polish OPLNT", "pl", "Polish", BY_SA, "Copyright © 1991, 2005, 2016 Biblica, Inc."), // prettier-ignore
  entry("pol_ubg", "UBG", "Updated Gdańsk Bible", "pl", "Polish", BY_ND, "Copyright © 2018 Fundacja Wrota Nadziei"), // prettier-ignore

  // ── Yoruba ──
  entry("yor_bib", "Yoruba", "Yoruba Bible", "yo", "Yoruba", BY_SA, "Copyright © 2009, 2017 Biblica, Inc."), // prettier-ignore

  // ── Igbo ──
  entry("ibo_bib", "Igbo", "Igbo Bible", "ig", "Igbo", BY_SA, "Copyright © 2020 Biblica, Inc."), // prettier-ignore
]

function entry(
  helloaoId: string,
  abbreviation: string,
  title: string,
  language: string,
  languageName: string,
  licenseName: string,
  attribution?: string
): CatalogEntry {
  return {
    helloaoId,
    slug: helloaoId.toLowerCase(),
    abbreviation,
    title,
    language,
    languageName,
    licenseName,
    ...(attribution ? { attribution } : {}),
  }
}
