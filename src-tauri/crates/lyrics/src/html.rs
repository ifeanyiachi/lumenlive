//! Minimal HTML → plain-text helpers shared by scraping providers. Keeping this
//! separate lets each scraper (Genius now; CeeNaija/SongLyrics/AZLyrics later)
//! select its lyrics container with `scraper` and then flatten it to text with
//! line breaks preserved.

use scraper::{ElementRef, Node};

/// Extract the visible text of an element, turning `<br>` into a newline. HTML
/// entities are already decoded by the parser, so the result is clean plain
/// text — the shape the section splitter expects.
pub fn element_text(el: ElementRef) -> String {
    let mut out = String::new();
    walk(el, &mut out);
    out
}

fn walk(el: ElementRef, out: &mut String) {
    for child in el.children() {
        match child.value() {
            Node::Text(t) => out.push_str(t),
            Node::Element(e) => {
                if e.name() == "br" {
                    out.push('\n');
                }
                if let Some(child_el) = ElementRef::wrap(child) {
                    walk(child_el, out);
                }
            }
            _ => {}
        }
    }
}

/// Normalise scraped lyrics: drop carriage returns, trim trailing spaces on each
/// line, and collapse runs of 3+ blank lines to a single blank-line separator.
pub fn tidy_lyrics(raw: &str) -> String {
    let stripped = raw.replace('\r', "");
    // Collapse runs of 2+ blank lines down to a single blank-line separator.
    let mut collapsed: Vec<&str> = Vec::new();
    let mut blanks = 0usize;
    for line in stripped.lines().map(str::trim_end) {
        if line.is_empty() {
            blanks += 1;
            if blanks <= 1 {
                collapsed.push(line);
            }
        } else {
            blanks = 0;
            collapsed.push(line);
        }
    }
    collapsed.join("\n").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::{element_text, tidy_lyrics};
    use scraper::{Html, Selector};

    #[test]
    fn extracts_text_with_br_as_newline() {
        let frag = Html::parse_fragment(
            r#"<p data-lyrics-container="true"><b>Amazing</b> grace<br>how sweet</p>"#,
        );
        let sel = Selector::parse(r#"[data-lyrics-container="true"]"#).unwrap();
        let el = frag.select(&sel).next().unwrap();
        assert_eq!(element_text(el), "Amazing grace\nhow sweet");
    }

    #[test]
    fn decodes_entities_via_parser() {
        let frag = Html::parse_fragment("<div>Rock &amp; Roll</div>");
        let sel = Selector::parse("div").unwrap();
        let el = frag.select(&sel).next().unwrap();
        assert_eq!(element_text(el), "Rock & Roll");
    }

    #[test]
    fn tidy_collapses_blank_runs_and_trims() {
        assert_eq!(tidy_lyrics("\n\na\n\n\n\nb  \n\n"), "a\n\nb");
    }
}
