/// Book numbers are stable across translations; source files can use longer
/// titles, but the app presents book 66 consistently as "Revelation".
pub(crate) fn display_name(book_number: i32, stored_name: String) -> String {
    if book_number == 66 {
        "Revelation".to_owned()
    } else {
        stored_name
    }
}
