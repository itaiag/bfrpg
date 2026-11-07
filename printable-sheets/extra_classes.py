"""Sheets for the classes in he/extraClasses.qmd: assassin, barbarian, druid, illusionist, ranger, paladin, scout.

Everything level-based (XP, hit dice, spells per day, skill percentages, animal affinity, spell lists)
is read from he/extraClasses.qmd, so the sheets follow the chapter. Attack bonus and saving throws
come from the base class each supplement names (fighter / thief / cleric / magic-user), from data.json.
The rules text on the sheets (strip, "what the class can do", class box) is a short kid-friendly
summary written here.

Called from make_sheets.py: build(ms) returns {key: config} where ms is the make_sheets module.
"""
import re

LTR = '<span class="num-ltr">{}</span>'


# ---------------------------------------------------------------- parsing extraClasses.qmd

def split_sections(text, marker):
    """{heading: body} for headings that start with marker ('## ', '### ', ...)."""
    parts = re.split(rf"^{re.escape(marker)}(.+)$", text, flags=re.M)
    return {parts[i].strip(): parts[i + 1] for i in range(1, len(parts), 2)}


def md_tables(text):
    """Markdown tables in text, each a list of rows (lists of cleaned cells), separator rows dropped."""
    tables, cur = [], []
    for line in text.splitlines() + [""]:
        if line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if not all(set(c) <= set("-: ") for c in cells):  # separator rows and empty header rows
                cur.append(cells)
        elif cur:
            tables.append(cur)
            cur = []
    return tables


def dice(s):
    return re.sub(r"(\d*)d(\d+)", r"\1ק\2", s)


def dash(s):
    return "–" if s.strip() in ("-", "–", "") else s.strip()


def norm(name):
    """Compare spell names across files: letters and digits only."""
    return re.sub(r"[^א-תA-Za-z0-9]", "", name)


def find_table(tables, first_header, contains=None):
    for t in tables:
        head = [c.strip("*").strip() for c in t[0]]
        if head[0] == first_header and (contains is None or contains in head):
            return t
    raise KeyError(first_header)


def level_rows(table):
    """XP table rows -> {level: (xp, hd, [spells...])}."""
    out = {}
    for r in table[1:]:
        if r[0].isdigit():
            out[int(r[0])] = (r[1], dice(r[2]), [dash(x) for x in r[3:]])
    return out


def spell_name(cell):
    """'**אבן לבוץ***' -> ('אבן לבוץ', True); '***מעבר ללא עקבות***' -> (..., False)."""
    cell = cell.strip()
    lead = len(cell) - len(cell.lstrip("*"))
    trail = len(cell) - len(cell.rstrip("*"))
    return cell.strip("*").strip(), trail > lead


def class_spell_list(section):
    """Spell list of a caster section: {level: [(name, reversible)]}, levels in heading order."""
    out = {}
    level = 0
    for heading, body in split_sections(section, "#### ").items():
        if not heading.startswith("עוצמה"):
            continue
        level += 1
        for t in md_tables(body):
            for r in t:
                if len(r) >= 2 and r[0].isdigit():
                    out.setdefault(level, []).append(spell_name(r[1]))
    return out


def new_spell_details(section):
    """{norm(name): (range, duration)} for the spells described in a class section."""
    out = {}
    for heading, body in split_sections(section, "#### ").items():
        rng = re.search(r"^טווח:\s*(.+)$", body, re.M)
        dur = re.search(r"^משך:\s*(.+)$", body, re.M)
        if rng or dur:
            out[norm(spell_name(heading)[0])] = (rng.group(1).strip() if rng else "", dur.group(1).strip() if dur else "")
    return out


# ---------------------------------------------------------------- build

def build(ms):
    qmd = (ms.REPO / "he" / "extraClasses.qmd").read_text(encoding="utf-8")
    top = split_sections(qmd, "## ")
    D = ms.DATA

    # range/duration for every spell: core rulebook first, then the supplements' new spells
    details = {}
    for key in ("magic_user_level", "cleric_level"):
        for lv_spells in ms.load_spells(key).values():
            for name, rng, dur, _ in lv_spells:
                details[norm(name)] = (rng, dur)
    for sec in top.values():
        details.update(new_spell_details(sec))
    missing = []

    def with_details(lst):
        out = {}
        for lv, spells in lst.items():
            for name, rev in spells:
                rng, dur = details.get(norm(name), ("", ""))
                if norm(name) not in details:
                    missing.append(name)
                out.setdefault(lv, []).append((name, rng, dur, rev))
        return out

    def levels(own, base, spell_cols=0):
        """Merge the class's own XP/HD (and spells) with the base class's attack bonus and saves."""
        base_lv = {r["level"]: r for r in D[base]["levels"]}
        out = []
        for lv, (xp, hd, sp) in sorted(own.items()):
            r = {"level": lv, "xp": xp, "hd": hd, "ab": base_lv[lv]["ab"], "saves": base_lv[lv]["saves"]}
            if spell_cols:
                r["spells"] = sp[:spell_cols]
            out.append(r)
        return out

    def skills_of(table):
        names = table[0][1:]
        return names, {r[0]: r[1:] for r in table[1:] if r[0].isdigit()}

    def note(html):
        return f'<div class="note-box">{html}</div>'

    def powers(title, rows, hint=""):
        h = f' <span class="hint">{hint}</span>' if hint else ""
        body = "".join(
            f'<div class="row"><span class="lv">{lv}</span><span class="what"><b>{n}</b><span>{d}</span></span>'
            f'<span class="dots">{"<i></i>" * uses}</span></div>'
            for lv, n, d, uses in rows)
        return f'<div class="panel ability-list"><h2 class="box-title">{title}{h}</h2>{body}</div>'

    def field(label):
        return f'<div class="turn"><span class="label">{label}</span><div class="write"></div></div>'

    plus = lambda n: LTR.format(f"+{n}")
    minus = lambda n: LTR.format(f"-{n}")
    archery = (f"<b>קשת מומחה:</b> {plus(2)} להתקפה עם קשת קצרה או ארוכה (לא רובה קשת). "
               "מדרגה 5: 3 חצים בכל 2 סיבובים. מדרגה 9: 2 חצים בכל סיבוב.")
    C = {}

    # -------- assassin
    sec = top["מתנקש"]
    tables = md_tables(sec)
    names, table = skills_of(find_table(tables, "דרגה", "רעל"))
    C["assassin"] = dict(
        name="מתנקש", file="assassin.html",
        hd="ק4", prime="זריזות 9 ותבונה 9 לפחות", armor="שריון עור בלבד, בלי מגן", weapons="כל נשק",
        levels=levels(level_rows(find_table(tables, "דרגה", "נקודות ניסיון")), "thief"),
        second=("יכולות המתנקש (אחוזים)", ms.skills_table(names, table), ""),
        about=[
            "<b>רק בני אדם</b> יכולים להיות מתנקשים. מגבלות הנשק והשריון כמו של גנב.",
            f"<b>התנקשות:</b> מאחורי יריב שלא יודע שאתם שם, בנשק דקירה חד-ידני: {plus(4)} להתקפה. "
            "פגעתם? היריב מגלגל הצלה נגד קרן מוות, ואם נכשל הוא נהרג מיד. אם הצליח, הוא סופג נזק רגיל.",
            "<b>נטרול:</b> כמו התנקשות, אבל בנשק שגורם נזק הכנעה (אלה או מקל). מי שנכשל בהצלה מאבד הכרה ל-2ק8 תורות.",
            "<b>רעל:</b> המתנקש יודע להכין רעלים. הם יקרים מאוד: שימוש אחד ברעל מגע יכול לעלות 500 מ״ז ויותר.",
            "<b>תוסף התקפה וגלגולי הצלה</b> בטבלה הם של הגנב.",
        ],
        box=lambda cfg, n=names: ms.thief_skills_panel(2, n, "יכולות המתנקש") + note(
            f"<b>התנקשות:</b> מאחורי יריב שלא שם לב, בנשק דקירה: {plus(4)} להתקפה, "
            "והיריב מגלגל הצלה נגד קרן מוות או נהרג. <b>נטרול:</b> אותו דבר באלה, ומאבד הכרה."),
    )

    # -------- barbarian
    sec = top["ברברי"]
    C["barbarian"] = dict(
        name="ברברי", file="barbarian.html",
        hd="ק10", prime="כוח, זריזות וחוסן 9 לפחות", armor="כל שריון ומגן", weapons="כל נשק",
        levels=levels(level_rows(find_table(md_tables(sec), "דרגה", "נקודות ניסיון")), "fighter"),
        about=[
            "<b>סוג של לוחם:</b> אותו תוסף התקפה ואותם גלגולי הצלה כמו לוחם. גמדים ובני אדם יכולים להיות ברברים.",
            "<b>בלי שריון או בשריון עור בלבד:</b> ערנות, רפלקסים חייתיים, צייד ורץ (ראו עמוד 1).",
            f"<b>זעם:</b> 10 סיבובים. {plus(2)} להתקפה, לנזק ולהצלה נגד לחשים שמשנים את התודעה, "
            f"אבל {minus(2)} לדירוג השריון. חייבים להסתער על האויב הקרוב. אי אפשר להשתמש בחפצי קסם, גם לא בשיקויים.",
            f"<b>אחרי הזעם:</b> עייפים שעה: {minus(2)} להתקפה, לנזק, לדירוג השריון ולהצלה, בלי הסתערות ובלי ריצה. "
            "אפשר לעצור זעם מוקדם בהצלחה בגלגול הצלה נגד לחשים.",
        ],
        box=lambda cfg: powers("כוחות הברברי", [
            ("1", "זעם", "פעם ביום. פעמיים מדרגה 6, שלוש פעמים מדרגה 12", 3),
            ("1", "ערנות", "רק גנב בדרגה גבוהה יותר יכול לדקור אותך מאחור", 0),
            ("1", "רפלקסים חייתיים", "מופתע רק ב-1 בק6", 0),
            ("1", "צייד", "בשטח פתוח מפתיע אויבים ב-1–3 בק6", 0),
            ("1", "רץ", "מוסיף 1.5 מ׳ לתנועה בקרב", 0),
        ], "ערנות עד רץ: רק בלי שריון או בשריון עור"),
    )

    # -------- druid
    sec = top["דרואיד"]
    tables = md_tables(sec)
    own = level_rows(find_table(tables, "דרגה", "נקודות ניסיון"))
    aff = find_table(tables, "דרגת דרואיד")
    hd_heads = [h.strip("*").strip().replace(" קוביות פגיעה", "").replace(" קוביית פגיעה", "") for h in aff[0][1:]]
    hd_heads = [LTR.format(h.replace("< ", "&lt;")) for h in hd_heads]
    aff_head = ('<tr><th rowspan=2>דרגת<br>דרואיד</th>'
                f'<th class="grp" colspan={len(hd_heads)}>קוביות הפגיעה של החיה</th></tr><tr>'
                + "".join(f"<th>{h}</th>" for h in hd_heads) + "</tr>")
    aff_body = "".join(f'<tr><td class="lv">{r[0]}</td>' + "".join(f"<td>{v}</td>" for v in r[1:]) + "</tr>"
                       for r in aff[1:] if r[0].isdigit())
    C["druid"] = dict(
        name="דרואיד", file="druid.html",
        hd="ק6", prime="חוכמה 9 ומעלה", armor="בלי שריון מתכת; מגן עץ בלבד",
        weapons="נשק חד-ידני לקרב פנים אל פנים, מטה, קלע, קשת קצרה",
        levels=levels(own, "cleric", 6),
        second=("זיקה לחיות", f"<table><thead>{aff_head}</thead><tbody>{aff_body}</tbody></table>",
                "מספר = צריך לגלגל בק20 לפחות את המספר. <b>C</b> = נרגעות אוטומטית. "
                "<b>B</b> = מתיידדות אוטומטית. <b>לא</b> = אי אפשר."),
        about=[
            "<b>כוהן של הטבע:</b> אותן טבלאות קרב וגלגולי הצלה כמו כוהן. מטיל לחשים החל מדרגה 2.",
            "<b>זיקה לחיות:</b> מגלגלים ק20 ובודקים בטבלה למטה מול קוביות הפגיעה של החיה. "
            "הצלחה: חיות עם סך של 2ק6 קוביות פגיעה נרגעות או מתיידדות.",
            "<b>חיות מבויתות</b> נחשבות כבעלות חצי מקוביות הפגיעה שלהן. <b>חיות מפלצתיות</b> נחשבות כבעלות קובייה אחת יותר.",
            "<b>מזהה</b> כל חיה או צמח טבעיים, ויודע לזהות מים נקיים.",
        ],
        box=lambda cfg: ms.spells_day_panel(field("אל הטבע שלי"), "מדרגה 2, לפי עמוד 2") + note(
            "<b>זיקה לחיות:</b> מגלגלים ק20 ובודקים בטבלה בעמוד 2. ") + note(
            f"<b>רשימת הלחשים</b> נמצאת {cfg['spell_where']}."),
        spells=with_details(class_spell_list(top["דרואיד"].split("### תיאור לחשים חדשים")[0])),
        spell_mode="prepared", spell_title="הלחשים שלי",
        spell_hint=("הדרואיד מקבל את לחשיו מאלי הטבע, החל מדרגה 2. "
                    "<b>הכנתי היום:</b> סמנו בעיפרון את הלחשים שבחרתם להיום, לפי מספר הלחשים ליום בעמוד 1. "
                    "לחש שהוטל נעלם, אז מוחקים את הסימון."),
        custom=("מתנות מהטבע", "לחש מיוחד שאלי הטבע העניקו רק לך"),
    )

    # -------- illusionist
    sec = top["אשליין"]
    ill_spells = class_spell_list(sec.split("### תיאור לחשים חדשים")[0])
    if not any(norm(n) == norm("קריאת קסם") for n, _ in ill_spells.get(1, [])):
        ill_spells.setdefault(1, []).append(("קריאת קסם", False))  # every illusionist starts with it
    ill_spells = with_details(ill_spells)
    for lv in ill_spells:
        ill_spells[lv].sort(key=lambda s: s[0])
    C["illusionist"] = dict(
        name="אשליין", file="illusionist.html",
        hd="ק4", prime="תבונה 13 ומעלה", armor="אסור שריון ואסור מגן", weapons="פגיון ומטה הליכה (או אלה)",
        levels=levels(level_rows(find_table(md_tables(sec), "דרגה", "נקודות ניסיון")), "mu", 6),
        about=[
            "<b>קוסם מומחה לאשליות:</b> תוסף התקפה וגלגולי הצלה כמו קוסם.",
            f"<b>{plus(2)} להצלה</b> נגד כל אשליה או תעתוע.",
            "<b>ספר הלחשים:</b> מתחיל עם קריאת קסם ועוד לחש אחד מעוצמה 1. "
            "אפשר ללמוד מקוסמים לחשים שמופיעים גם ברשימה של האשליין.",
            "<b>לא מאמינים?</b> מי שחושד שמשהו הוא אשליה אומר זאת למנחה, והמנחה מגלגלת לו בסוד הצלה נגד לחשים.",
        ],
        box=lambda cfg: ms.spells_day_panel(field("המורה שלי"), "לפי עמוד 2") + note(
            f"<b>ספר הלחשים</b> נמצא {cfg['spell_where']}. {plus(2)} להצלה נגד אשליות. בלי שריון ובלי מגן!"),
        spells=ill_spells,
        spell_mode="book", spell_title="ספר הלחשים", spell_hint=ms.BOOK_HINT,
        start_spell=("קריאת קסם", "כל אשליין מתחיל איתו"),
        spell_capacity=30, custom_rows=10,  # long names and durations wrap, so fewer rows per page
        custom=("לחשים מיוחדים", "לחש שהאשליין המציא בעצמו, או מצא במגילה או בספר עתיק"),
    )

    # -------- ranger and paladin
    rp = split_sections(top["סייר ופלדין"], "### ")
    tables = md_tables(rp["סייר"])
    names, table = skills_of(find_table(tables, "דרגה", "מעקב"))
    C["ranger"] = dict(
        name="סייר", file="ranger.html",
        hd="ק8", prime="כוח 9, חוכמה 11 וזריזות 11 לפחות", armor="כל שריון ומגן", weapons="כל נשק",
        levels=levels(level_rows(find_table(tables, "דרגה", "נקודות ניסיון")), "fighter"),
        second=("מיומנויות הסייר (אחוזים)", ms.skills_table(names, table), ""),
        about=[
            "<b>סוג של לוחם:</b> אותו תוסף התקפה ואותם גלגולי הצלה כמו לוחם. בני אדם, אלפים ובני-מחצית יכולים להיות סיירים.",
            f"<b>מיומנויות בשטח פתוח:</b> תנועה חרישית, התחבאות ומעקב. בעיר: {minus(20)}%. "
            "תנועה חרישית והתחבאות לא עובדות בשריון כבד משריון עור.",
            "<b>מעקב:</b> מגלגלים פעם אחת לכל שעת תנועה, אחרת העקבות אובדים.",
            f"<b>אויב נבחר:</b> {plus(3)} לנזק נגד סוג אחד של יצורים, למשל ענקים או דרקונים.",
            archery,
        ],
        box=lambda cfg, n=names: ms.thief_skills_panel(2, n, "מיומנויות הסייר") + note(
            f"<b>אויב נבחר:</b> {plus(3)} לנזק נגדו.") + field("האויב הנבחר שלי") + note(archery),
    )

    tables = md_tables(rp["פלדין"])
    own = level_rows(find_table(tables, "דרגה", "נקודות ניסיון"))
    pal_spells = {lv: s for lv, s in ms.load_spells("cleric_level").items() if lv <= 2}
    C["paladin"] = dict(
        name="פלדין", file="paladin.html",
        hd="ק8", prime="כוח 9, חוכמה 11 וכריזמה 11 לפחות", armor="כל שריון ומגן", weapons="כל נשק",
        levels=levels(own, "fighter", 2),
        about=[
            "<b>סוג של לוחם:</b> אותו תוסף התקפה ואותם גלגולי הצלה כמו לוחם.",
            "<b>קוד כבוד:</b> פלדין שמפר אותו מאבד את כל הכוחות שלו עד שיכפר. נותן לאל שלו לפחות 10% מכל אוצר.",
            "<b>גירוש אל-מתים</b> מדרגה 2, כמו כוהן בחצי מהדרגה (מעגלים למטה). משתמשים בטבלה של הכוהן.",
            "<b>לחשי כוהן</b> מדרגה 10. לחש שתלוי בדרגה פועל לפי חצי מדרגת הפלדין.",
        ],
        box=lambda cfg: powers("כוחות הפלדין", [
            ("1", "הגנה מרוע", "הילה ברדיוס 3 מ׳, תמיד", 0),
            ("1", "גילוי רוע", "מתי שרוצים", 0),
            ("1", "נשק קסום", "פעם ביום לכל דרגה, לתור אחד", 0),
            ("1", "הנחת ידיים", "מרפא 2 + תוסף כריזמה. פעם נוספת בכל דרגה אי-זוגית", 0),
            ("2", "גירוש אל-מתים", "כמו כוהן בחצי מהדרגה", 0),
            ("7", "ריפוי מחלה", "במקום הנחת ידיים", 0),
            ("11", "ניטרול רעל", "במקום הנחת ידיים", 0),
        ]) + ms.spells_day_panel("", f"מדרגה 10. הרשימה {cfg['spell_where']}", 2),
        spells=pal_spells,
        spell_mode="prepared", spell_title="הלחשים שלי",
        spell_hint=("מדרגה 10 הפלדין יכול להטיל לחשי כוהן מתאימים, לפי החלטת המנחה. "
                    "<b>הכנתי היום:</b> סמנו בעיפרון את הלחשים שבחרתם להיום, לפי מספר הלחשים ליום בעמוד 1. "
                    "לחש שהוטל נעלם, אז מוחקים את הסימון."),
        custom=("מתנות מהאל", "לחש מיוחד שהאל העניק רק לך"),
    )

    # -------- scout
    sec = top["גשש"]
    tables = md_tables(sec)
    names, table = skills_of(find_table(tables, "דרגה", "מעקב"))
    C["scout"] = dict(
        name="גשש", file="scout.html",
        hd="ק6", prime="כוח 9, חוכמה 11 וזריזות 11 לפחות", armor="שריון עור בלבד, בלי מגן",
        weapons="נשקים קטנים לקרב פנים אל פנים, קשת קצרה וקשת ארוכה",
        levels=levels(level_rows(find_table(tables, "דרגה", "נקודות ניסיון")), "thief"),
        second=("מיומנויות הגשש (אחוזים)", ms.skills_table(names, table), ""),
        about=[
            "<b>סוג של גנב:</b> אותו תוסף התקפה ואותם גלגולי הצלה כמו גנב. בני אדם, אלפים ובני-מחצית יכולים להיות גששים.",
            "<b>מיומנויות:</b> מעקב דורש גלגול בכל שעת תנועה. מגלה מלכודות אבל לא יודע לנטרל אותן. לא מכייס, ואין לו דקירה מאחור.",
            archery,
            f"<b>שני נשקים:</b> הנשק ביד השנייה נותן {plus(1)} לדירוג השריון מול תוקף אחד. "
            f"או תוקפים בשניהם: {minus(2)} בנשק הראשי ו-{minus(5)} בשני, פחות תוסף הזריזות.",
            "<b>הפתעה:</b> לבד, יותר מ-9 מ׳ מהקבוצה או בקבוצה של גששים בלבד: מפתיע אויבים ב-1–3 בק6.",
        ],
        box=lambda cfg, n=names: ms.thief_skills_panel(2, n, "מיומנויות הגשש") + note(archery),
    )

    if missing:
        print("warning: no range/duration found for:", ", ".join(sorted(set(missing))))
    return C
