"""Generate the printable Hebrew character sheets (A4, RTL) for the Hebrew site.

Writes into he/sheets/ (copied to docs/he/sheets/ by the Hebrew build as project resources):
    blank.html        blank sheet for any class (2 pages)
    fighter.html      fighter (3 pages)
    thief.html        thief (3 pages)
    cleric.html       cleric, with a checklist of all cleric spells
    magic-user.html   magic-user, with a spellbook checklist of all magic-user spells
    assassin.html, barbarian.html, druid.html, illusionist.html, ranger.html, paladin.html, scout.html
                      the classes of he/extraClasses.qmd (see extra_classes.py)

Class tables come from data.json (copied from the rules in class.qmd and combat.qmd);
spells are read from he/allSpells.qmd. Styles live in sheet.css.
The page he/printable_sheets.qmd links to these files.

Usage:
    python printable-sheets/make_sheets.py
"""
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
OUT = REPO / "he" / "sheets"
SPELLS = REPO / "he" / "allSpells.qmd"
DATA = json.loads((HERE / "data.json").read_text(encoding="utf-8"))
CSS = (HERE / "sheet.css").read_text(encoding="utf-8")

STD_SAVES = ["קרן מוות / רעל", "שרביטי קסם", "שיתוק / התאבנות", "נשיפת דרקון", "לחשים"]
SKILLS = ["פריצת מנעולים", "נטרול מלכודות", "כייסות", "תנועה חרישית", "טיפוס על קירות", "התחבאות", "האזנה"]


def signed(v):
    """'+5', '5+', '0+' -> '+5' shown left-to-right so the sign never flips in RTL."""
    v = v.strip()
    if v.endswith("+") or v.endswith("-"):
        v = v[-1] + v[:-1]
    return f'<span class="num-ltr">{v}</span>'


def cells(n, cls=""):
    c = f' class="{cls}"' if cls else ""
    return "".join(f"<td{c}></td>" for _ in range(n))


# ---------------------------------------------------------------- classes

BOOK_HINT = ("<b>בספר:</b> סמנו בעט כל לחש שכתוב בספר הלחשים שלכם. "
             "<b>שיננתי:</b> בכל בוקר סמנו בעיפרון את הלחשים שבחרתם להיום, רק מתוך הלחשים שבספר, "
             "ולפי מספר הלחשים ליום בעמוד 1. לחש שהוטל נשכח, אז מוחקים את הסימון.")

CLASSES = {
    "fighter": dict(
        name="לוחם", file="fighter.html", slug="fighter",
        hd="ק8", prime="כוח 9 ומעלה", armor="כל שריון ומגן", weapons="כל נשק",
        about=[
            "<b>הכי טוב בקרב:</b> תוסף ההתקפה של הלוחם עולה מהר יותר מכל מקצוע אחר.",
            "<b>הכי קשוח:</b> קוביית פגיעה ק8, יותר נקודות פגיעה מכל מקצוע אחר.",
            "<b>כל ציוד:</b> לובש כל שריון, משתמש בכל נשק, ויכול להשתמש בנשקים ובשריונות קסומים.",
        ],
    ),
    "thief": dict(
        name="גנב", file="thief.html", slug="thief",
        hd="ק4", prime="זריזות 9 ומעלה", armor="שריון עור בלבד, בלי מגן", weapons="כל נשק",
        about=[
            "<b>מיומנויות גנב:</b> מגלגלים ק100 (שתי קוביות ק10). הצלחה אם התוצאה שווה לאחוז או נמוכה ממנו.",
            "<b>מי מגלגל:</b> את נטרול מלכודות, תנועה חרישית, התחבאות והאזנה המנחה מגלגלת בסוד.",
            "<b>פריצת מנעולים:</b> ניסיון אחד לכל מנעול. נכשלתם? אפשר לנסות שוב רק בדרגה הבאה.",
            "<b>דקירה מאחור:</b> מאחורי יריב שלא שם לב: <span class=\"num-ltr\">+4</span> להתקפה ונזק כפול.",
        ],
    ),
    "cleric": dict(
        name="כוהן", file="cleric.html", slug="cleric",
        spell_mode="prepared", spell_title="הלחשים שלי", custom=("מתנות מהאל", "לחש מיוחד שהאל העניק רק לך"),
        spell_hint=("לכוהן אין ספר לחשים: הוא מתפלל בכל בוקר ומקבל את לחשיו מהאל שלו, החל מדרגה 2. "
                    "<b>הכנתי היום:</b> סמנו בעיפרון את הלחשים שבחרתם להיום, לפי מספר הלחשים ליום בעמוד 1. "
                    "לחש שהוטל נעלם, אז מוחקים את הסימון."),
        hd="ק6", prime="חוכמה 9 ומעלה", armor="כל שריון ומגן",
        weapons="נשקים קהים בלבד: פטיש מלחמה, אלה, מקבת, אלה פשוטה, מטה קרב, קלע",
        about=[
            "<b>לחשים:</b> הכוהן מטיל לחשים החל מדרגה 2. כמה לחשים ביום, לפי הטבלה.",
            "<b>גירוש אל-מתים:</b> מניפים את הסמל הקדוש ומגלגלים ק20. מצליבים את הדרגה עם סוג האל-מת בטבלה למטה.",
            "<b>הצלחה:</b> 2ק6 קוביות פגיעה של אל-מתים בורחים. <b>ג</b> = גירוש אוטומטי. <b>נ</b> = גם נזק: 1ק8 לכל דרגה של הכוהן.",
            "<b>כישלון:</b> אי אפשר לנסות לגרש שוב במשך תור שלם.",
        ],
    ),
    "mu": dict(
        name="קוסם", file="magic-user.html", slug="magic-user",
        spell_mode="book", spell_title="ספר הלחשים", start_spell=("קריאת קסם", "כל קוסם מתחיל איתו"),
        custom=("לחשים מיוחדים", "לחש שהקוסם המציא בעצמו, או מצא במגילה או בספר עתיק"),
        spell_hint=BOOK_HINT,
        hd="ק4", prime="תבונה 9 ומעלה", armor="אסור שריון ואסור מגן", weapons="פגיון ומטה הליכה (או אלה)",
        about=[
            "<b>ספר הלחשים:</b> קוסם בדרגה 1 יודע את <b>קריאת קסם</b> ועוד לחש אחד מעוצמה 1, כתובים בספר שקיבל ממורו.",
            "<b>לחשים ביום:</b> לפי הטבלה. כל לחש שמוטל נשכח עד שלומדים אותו שוב מהספר.",
            "<b>בלי שריון:</b> שריון ומגן מפריעים להטלת לחשים.",
            "<b>זהירות בקרב:</b> הקוסם הכי חלש בקרב ויש לו הכי מעט נקודות פגיעה.",
        ],
    ),
}

# ---------------------------------------------------------------- page parts

def field(label, value=None):
    inner = f'<div class="filled">{value}</div>' if value else '<div class="write"></div>'
    return f'<div class="field"><span class="label">{label}</span>{inner}</div>'


def page(n, total, inner, label):
    return f"""
  <section class="sheet" aria-label="עמוד {n}: {label}">
    <div class="page">
{inner}
      <div class="foot"><span>בייסיק פנטזי, מהדורה עברית</span><span>עמוד {n} מתוך {total}</span></div>
    </div>
  </section>"""


def abilities_panel():
    rows = [
        ("כוח", "פגיעה ונזק בקרב פנים אל פנים"),
        ("זריזות", "קליעה, דירוג שריון ויוזמה"),
        ("חוסן", "נקודות פגיעה"),
        ("תבונה", "שפות; התכונה של הקוסם"),
        ("חוכמה", "התכונה של הכוהן"),
        ("כריזמה", "איך אחרים מגיבים אליך"),
    ]
    abs_ = "".join(
        f'<div class="ab"><div class="ab-name">{n}<span class="hint">{h}</span></div><div class="cell score"></div><div class="mod"></div></div>'
        for n, h in rows)
    return f"""<div class="panel">
            <h2 class="box-title">תכונות</h2>
            <div class="ab-head label"><span></span><span>ערך</span><span>תוסף</span></div>
            <div class="abilities">{abs_}</div>
          </div>"""


def saves_panel(names, ref_page):
    hint = f"ק20, שווה או יותר. הערכים בעמוד {ref_page}" if ref_page else "ק20, שווה או יותר"
    rows = "".join(f'<div class="row"><span>{n}</span><div class="cell"></div></div>' for n in names)
    return f"""<div class="panel saves">
            <h2 class="box-title">גלגולי הצלה <span class="hint">{hint}</span></h2>
            {rows}
            <div class="note"><span class="label">תוספי גזע</span><div class="write"></div></div>
          </div>"""


def combat_strip(attack_label="תוסף התקפה"):
    return f"""<div class="combat">
            <div class="stat">
              <span class="label">דירוג שריון</span>
              <div class="shield" aria-hidden="true">
                <svg viewBox="0 0 46 50"><path d="M23 2 L43 8 V24 C43 36 34 44 23 48 C12 44 3 36 3 24 V8 Z" fill="#fff" stroke="#221c18" stroke-width="2.2" stroke-linejoin="round"/></svg>
              </div>
            </div>
            <div class="stat">
              <span class="label">נקודות פגיעה</span>
              <div class="hp">
                <div class="field"><div class="cell"></div><span class="hint">מרבי</span></div>
                <div class="field"><div class="cell"></div><span class="hint">עכשיו (בעיפרון)</span></div>
              </div>
            </div>
            <div class="stat"><span class="label">{attack_label}</span><div class="cell big"></div></div>
            <div class="stat"><span class="label">תנועה</span><div class="cell big"></div></div>
          </div>"""


HOWTO = """<p class="howto"><b>איך תוקפים?</b> מגלגלים ק20 ומוסיפים את תוסף ההתקפה, ועוד תוסף <b>כוח</b> בקרב פנים אל פנים או תוסף <b>זריזות</b> בקליעה. אם התוצאה שווה לדירוג השריון של היריב או גבוהה ממנו, פגעתם. בקרב פנים אל פנים מוסיפים את תוסף הכוח גם לנזק.</p>"""


def weapons_panel(rows=5):
    body = "".join(f"<tr>{cells(7)}</tr>" for _ in range(rows))
    return f"""<div class="panel">
            <h2 class="box-title">נשקים</h2>
            <table class="weapons">
              <thead>
                <tr>
                  <th rowspan="2">נשק</th>
                  <th class="c" rowspan="2" style="width:4.2em">התקפה</th>
                  <th class="c" rowspan="2" style="width:4.6em">נזק</th>
                  <th class="c" colspan="3">טווח (מ׳)</th>
                  <th rowspan="2" style="width:7em">הערות</th>
                </tr>
                <tr class="sub">
                  <th class="c" style="width:3em">קצר</th>
                  <th class="c" style="width:3em">בינוני</th>
                  <th class="c" style="width:3em">ארוך</th>
                </tr>
              </thead>
              <tbody>{body}</tbody>
            </table>
          </div>"""


def race_panel(title="יכולות גזע ומקצוע"):
    return f"""<div class="panel" style="display:flex; flex-direction:column">
              <h2 class="box-title">{title}</h2>
              <div class="lined-box"><div class="lines"></div></div>
              <div class="field" style="margin-top:.4em"><span class="label">שפות</span><div class="write"></div></div>
            </div>"""


def thief_skills_panel(ref_page=None, names=SKILLS, title="מיומנויות גנב"):
    hint = f'<span class="hint">האחוזים בעמוד {ref_page}</span>' if ref_page else ""
    rows = "".join(f'<div class="row"><span>{s}</span><div class="cell"></div></div>' for s in names)
    return f"""<div class="panel skills">
                <h2 class="box-title">{title} {hint}</h2>
                {rows}
              </div>"""


def spells_day_panel(extra="", hint="לפי עוצמת לחש", levels=6):
    lv = "".join(f'<span class="lvl">{i}</span>' for i in range(1, levels + 1))
    boxes = '<div class="cell"></div>' * levels
    style = f' style="grid-template-columns: repeat({levels}, 1fr)"' if levels != 6 else ""
    return f"""<div class="panel">
                <h2 class="box-title">לחשים ליום <span class="hint">{hint}</span></h2>
                <div class="spells-day"{style}>{lv}{boxes}</div>
                {extra}
              </div>"""


def class_box(key, total, cfg=None):
    """Right-hand column in the bottom of page 1."""
    if cfg and cfg.get("box"):
        return cfg["box"](cfg)
    if key is None:  # blank sheet for any class
        rows = '<div class="row"><div class="write"></div><div class="cell"></div></div>' * 7
        return f"""<div class="panel skills">
                <h2 class="box-title">מיומנויות <span class="hint">למקצועות עם מיומנויות באחוזים</span></h2>
                {rows}
              </div>""" + spells_day_panel()
    if key == "fighter":
        return """<div class="panel" style="display:flex; flex-direction:column; flex:1">
                <h2 class="box-title">אויבים שהבסתי</h2>
                <div class="lined-box"><div class="lines"></div></div>
              </div>"""
    if key == "thief":
        return thief_skills_panel(2) + """<div class="note-box"><b>דקירה מאחור:</b> מאחורי יריב שלא שם לב אליכם,
                <span class="num-ltr">+4</span> להתקפה ונזק כפול. רק בנשק לקרב פנים אל פנים.</div>"""
    if key == "cleric":
        return spells_day_panel(
            '<div class="turn"><span class="label">האל שלי</span><div class="write"></div></div>',
            "מדרגה 2, לפי עמוד 2") + f"""<div class="note-box"><b>גירוש אל-מתים:</b> מניפים סמל קדוש ומגלגלים ק20.
                בודקים בטבלה בעמוד 2. נכשלתם? אפשר לנסות שוב רק אחרי תור שלם.</div>
              <div class="note-box"><b>רשימת הלחשים</b> נמצאת {cfg['spell_where']}.</div>"""
    if key == "mu":
        return spells_day_panel(
            '<div class="turn"><span class="label">המורה שלי</span><div class="write"></div></div>',
            "לפי עמוד 2") + f"""<div class="note-box"><b>ספר הלחשים</b> נמצא {cfg['spell_where']}.
                בלי שריון ובלי מגן!</div>"""
    raise KeyError(key)


def page_one(cfg, total):
    key = cfg.get("key")
    name = cfg.get("name")
    brand_right = f'<span class="class-tag">{name}</span>' if name else '<span class="sys">בייסיק פנטזי</span>'
    id_row = (field("שם השחקן") + field("גזע") + field("מקצוע", name) + field("דרגה"))
    strip = ""
    if key:
        strip = f"""<div class="strip">
            <div><span class="label">קוביית פגיעה</span><b>{cfg['hd']} לכל דרגה</b></div>
            <div><span class="label">תכונה עיקרית</span><b>{cfg['prime']}</b></div>
            <div><span class="label">שריון</span><b>{cfg['armor']}</b></div>
            <div><span class="label">נשקים</span><b>{cfg['weapons']}</b></div>
          </div>"""
    saves = STD_SAVES
    ref = 2 if key else None
    inner = f"""      <header class="hd">
        <div class="hd-main">
          <div class="brand"><h1>דף דמות</h1>{brand_right}</div>
          <div class="field name"><span class="label">שם הדמות</span><div class="write"></div></div>
          <div class="id-grid">{id_row}</div>
          <div class="id-grid two">{field("נקודות ניסיון")}{field("נקודות ניסיון לדרגה הבאה")}</div>
        </div>
        <div class="portrait"><span class="hint">ציירו כאן את הדמות</span></div>
      </header>
      {strip}
      <div class="body">
        <div class="col">
          {abilities_panel()}
          {saves_panel(saves, ref)}
        </div>
        <div class="col">
          {combat_strip()}
          {HOWTO}
          {weapons_panel(4 if key else 5)}
          <div class="two-up" style="flex:1; min-height:0">
            {race_panel()}
            <div class="col" style="gap:.9em">
              {class_box(key, total, cfg)}
            </div>
          </div>
        </div>
      </div>"""
    return page(1, total, inner, "דף דמות")


# ---------------------------------------------------------------- reference page

def progression_table(levels):
    """Level table: XP, hit dice, attack bonus, the five saves, and spells per day when the class casts."""
    if isinstance(levels, str):
        levels = DATA[levels]["levels"]
    n_sp = len(levels[0].get("spells", []))
    head1 = ("<tr><th rowspan=2>דרגה</th><th rowspan=2>נקודות ניסיון</th><th rowspan=2>קוביות<br>פגיעה</th>"
             "<th rowspan=2>תוסף<br>התקפה</th>"
             '<th class="grp sep" colspan=5>גלגולי הצלה</th>'
             + (f'<th class="grp sep" colspan={n_sp}>לחשים ביום, לפי עוצמה</th>' if n_sp else "") + "</tr>")
    short = ["מוות /<br>רעל", "שרביטי<br>קסם", "שיתוק /<br>התאבנות", "נשיפת<br>דרקון", "לחשים"]
    head2 = ("<tr>" + "".join(f'<th{" class=sep" if i == 0 else ""}>{n}</th>' for i, n in enumerate(short))
             + "".join(f'<th{" class=sep" if i == 0 else ""}>{i + 1}</th>' for i in range(n_sp))
             + "</tr>")
    body = ""
    for r in levels:
        body += (f'<tr><td class="lv">{r["level"]}</td><td>{r["xp"]}</td><td><span class="num-ltr">{r["hd"]}</span></td><td>{signed(r["ab"])}</td>'
                 + "".join(f'<td{" class=sep" if i == 0 else ""}>{s}</td>' for i, s in enumerate(r["saves"]))
                 + "".join(f'<td{" class=sep" if i == 0 else ""}>{s}</td>' for i, s in enumerate(r.get("spells", [])))
                 + "</tr>")
    return f'<table><thead>{head1}{head2}</thead><tbody>{body}</tbody></table>'


def skills_table(names, table):
    """Percent table for thief-like skills: table maps level (str) -> list of percents."""
    head = "<tr><th>דרגה</th>" + "".join(f"<th>{s}</th>" for s in names) + "</tr>"
    body = "".join(f'<tr><td class="lv">{lv}</td>' + "".join(f"<td>{v}%</td>" for v in table[str(lv)]) + "</tr>"
                   for lv in range(1, 21))
    return f"<table><thead>{head}</thead><tbody>{body}</tbody></table>"


def second_table(key):
    if key == "thief":
        return "מיומנויות גנב (אחוזים)", skills_table(SKILLS, DATA["thief"]["skills"]), ""
    if key == "cleric":
        c = DATA["cleric"]
        head = ("<tr><th rowspan=2>דרגת<br>כוהן</th>" + "".join(f"<th>{n}</th>" for n in c["turn_header"]) + "</tr><tr>"
                + "".join(f'<th>{h} קב״פ</th>' for h in c["turn_hd"]) + "</tr>")
        body = "".join(f'<tr><td class="lv">{lv}</td>' + "".join(f"<td>{v}</td>" for v in c["turn"][str(lv)]) + "</tr>"
                       for lv in range(1, 21))
        legend = "מספר = צריך לגלגל בק20 לפחות את המספר. <b>ג</b> = גירוש אוטומטי. <b>נ</b> = גירוש ונזק. <b>לא</b> = אי אפשר."
        return "גירוש אל-מתים", f"<table><thead>{head}</thead><tbody>{body}</tbody></table>", legend
    return None


def page_ref(cfg, total):
    key = cfg["key"]
    about = "".join(f"<li>{a}</li>" for a in cfg["about"])
    sec = cfg["second"] if "second" in cfg else second_table(key)
    sec_html = ""
    if sec:
        title, table, legend = sec
        leg = f'<p class="legend">{legend}</p>' if legend else ""
        sec_html = f'<div class="panel ref"><h2 class="box-title">{title}</h2>{table}{leg}</div>'
    inner = f"""      <header class="hd2">
        <h1>טבלת ה{cfg['name']}</h1>
        <p class="find-row" style="margin:0">מוצאים את השורה של <b>הדרגה שלכם</b> ומעתיקים את המספרים לעמוד 1. כשעולים דרגה, חוזרים לכאן.</p>
      </header>
      <div class="panel"><h2 class="box-title">מה ה{cfg['name']} יודע לעשות</h2><ul class="bullets">{about}</ul></div>
      <div class="panel ref"><h2 class="box-title">עלייה בדרגה <span class="hint">דרגות 1–20</span></h2>{progression_table(cfg.get("levels") or key)}</div>
      {sec_html}"""
    return page(2, total, inner, f"טבלת ה{cfg['name']}")


# ---------------------------------------------------------------- inventory + spells

def page_inventory(n, total):
    def rows(k):
        return "".join('<tr><td></td><td></td><td class="wt"></td><td></td></tr>' for _ in range(k))
    inner = f"""      <header class="hd2">
        <h1>ציוד ומטען</h1>
        {field("שם הדמות")}
      </header>
      <div class="inv-wrap">
        <div class="panel" style="display:flex; flex-direction:column">
          <table class="inv">
            <thead><tr><th>פריט</th><th class="c num">כמות</th><th class="c wt">משקל (ק״ג)</th><th class="notes">הערות</th></tr></thead>
            <tbody>
              {rows(30)}
              <tr class="group"><td colspan="4">על החיה או בעגלה</td></tr>{rows(4)}
            </tbody>
            <tfoot><tr><td colspan="2">סה״כ משקל שהדמות נושאת</td><td class="wt"></td><td></td></tr></tfoot>
          </table>
        </div>
        <div class="col">
          <div class="panel armor-rows">
            <h2 class="box-title">שריון ומגן</h2>
            <div class="row head"><span>פריט</span><span>דירוג</span><span>משקל</span></div>
            <div class="row"><div class="write"></div><div class="write"></div><div class="write"></div></div>
            <div class="row"><div class="write"></div><div class="write"></div><div class="write"></div></div>
          </div>
          <div class="panel">
            <h2 class="box-title">מטבעות</h2>
            <div class="coins">
              <div class="coin"><div class="disc">מ״פ</div><div class="cell"></div><span class="hint">פלטינה</span></div>
              <div class="coin"><div class="disc">מ״ז</div><div class="cell"></div><span class="hint">זהב</span></div>
              <div class="coin"><div class="disc">מ״א</div><div class="cell"></div><span class="hint">אלקטרום</span></div>
              <div class="coin"><div class="disc">מ״כ</div><div class="cell"></div><span class="hint">כסף</span></div>
              <div class="coin"><div class="disc">מ״נ</div><div class="cell"></div><span class="hint">נחושת</span></div>
            </div>
          </div>
          <div class="panel">
            <h2 class="box-title">עומס</h2>
            <div class="load"><span class="check"><i></i> עומס קל</span><span class="check"><i></i> עומס כבד</span></div>
            <div class="field" style="margin-top:.5em"><span class="label">תנועה עם העומס</span><div class="write"></div></div>
          </div>
          <div class="panel" style="display:flex; flex-direction:column; flex:1; min-height:0">
            <h2 class="box-title">הערות <span class="hint">חפצים קסומים: מטענים, מילות הפעלה, מה החפץ עושה</span></h2>
            <div class="lined-box"><div class="lines"></div></div>
          </div>
        </div>
      </div>"""
    return page(n, total, inner, "ציוד")


LEVEL_KEYS = {"קוסם": "magic_user_level", "כוהן": "cleric_level"}


def load_spells(level_key):
    """Spells of one class from he/allSpells.qmd: {level: [(name, range, duration, reversible)]}."""
    qmd = SPELLS.read_text(encoding="utf-8")
    out = {}
    for block in re.findall(r'<div class="spell"[^>]*>(.*?)\n</div>', qmd, re.S):
        m = re.search(r"^## (.+?)\s*$", block, re.M)
        heading = m.group(1).strip()
        props = {}
        for para in block[m.end():].strip().split("\n\n")[:3]:
            para = para.strip()
            if para.startswith("טווח:"):
                props["range"] = para.split(":", 1)[1].strip()
            elif para.startswith("משך:"):
                props["duration"] = para.split(":", 1)[1].strip()
            else:
                for cls, lv in re.findall(r"(כוהן|קוסם) (\d+)", para):
                    props[LEVEL_KEYS[cls]] = int(lv)
        if level_key not in props:
            continue
        name = heading.replace("*", "").strip()
        rng = re.sub(r"(\d)--(\d)", r"\1–\2", props.get("range", ""))
        dur = re.sub(r"(\d)--(\d)", r"\1–\2", props.get("duration", ""))
        out.setdefault(props[level_key], []).append((name, rng, dur, heading.endswith("*")))
    for lv in out:
        out[lv].sort(key=lambda s: s[0])
    return out


def spellbook_chunks(spells, capacity=40):
    """Split levels into pages; a level never breaks across pages. Each level costs its rows + a header row."""
    pages, cur, used = [], [], 0
    for lv in sorted(spells):
        cost = len(spells[lv]) + 1
        if cur and used + cost > capacity:
            pages.append(cur)
            cur, used = [], 0
        cur.append(lv)
        used += cost
    if cur:
        pages.append(cur)
    return pages


def page_spellbook_list(n, total, spells, levels, first, cfg, last=False, custom_rows=8):
    """Checklist of every spell the class can cast: book + memorized for arcane casters, prepared today for divine."""
    book = cfg["spell_mode"] == "book"
    ncols = 5 if book else 4
    start_name, start_tag = cfg.get("start_spell", (None, None))
    rows = ""
    for lv in levels:
        rows += f'<tr class="group"><td colspan="{ncols}">לחשים מעוצמה {lv}</td></tr>'
        for name, rng, dur, rev in spells[lv]:
            tags = ""
            if name == start_name:
                tags += f' <span class="tag">{start_tag}</span>'
            if rev:
                tags += ' <span class="tag light">הפיך</span>'
            boxes = '<td class="chk"><i></i></td>' * (2 if book else 1)
            rows += f'<tr>{boxes}<td class="sname">{name}{tags}</td><td>{rng}</td><td>{dur}</td></tr>'
    title = cfg["spell_title"]
    hint = f'<p class="howto">{cfg["spell_hint"]}</p>' if first else ""
    inner = f"""      <header class="hd2">
        <h1>{title}</h1>
        {field("שם הדמות")}
      </header>
      {hint}
      <div class="panel">
        <table class="spell-list">
          <thead><tr>
            {spell_heads(book)}
            <th>שם הלחש</th>
            <th style="width:11em">טווח</th>
            <th style="width:10em">משך</th>
          </tr></thead>
          <tbody>{rows}</tbody>
        </table>
      </div>{custom_spells_panel(cfg, custom_rows) if last else ""}"""
    return page(n, total, inner, title)


def spell_heads(book):
    if book:
        return '<th class="c" style="width:3.2em">בספר</th><th class="c" style="width:3.6em">שיננתי</th>'
    return '<th class="c" style="width:4.6em">הכנתי היום</th>'


def custom_spells_panel(cfg, n_rows):
    """Blank rows for spells that are not in the rulebook."""
    book = cfg["spell_mode"] == "book"
    title, hint = cfg["custom"]
    boxes = '<td class="chk"><i></i></td>' * (2 if book else 1)
    body = "".join(f"<tr>{boxes}<td></td><td></td><td></td><td></td></tr>" for _ in range(n_rows))
    return f"""
      <div class="panel custom-spells">
        <h2 class="box-title">{title} <span class="hint">{hint}</span></h2>
        <table class="spell-list">
          <thead><tr>
            {spell_heads(book)}
            <th class="c" style="width:3.6em">עוצמה</th>
            <th>שם הלחש ומה הוא עושה</th>
            <th style="width:9em">טווח</th>
            <th style="width:8em">משך</th>
          </tr></thead>
          <tbody>{body}</tbody>
        </table>
      </div>"""


# ---------------------------------------------------------------- assemble

def sheet_pages(key, cfg=None):
    if key is None and cfg is None:
        return [page_one({"key": None}, 2), page_inventory(2, 2)]
    cfg = dict(cfg or CLASSES[key], key=key)
    spells = cfg.get("spells")
    if spells is None and key in ("mu", "cleric"):
        spells = load_spells("magic_user_level" if key == "mu" else "cleric_level")
    if spells:
        chunks = spellbook_chunks(spells, cfg.get("spell_capacity", 40))
        total = 3 + len(chunks)
        cfg["spell_where"] = f"בעמודים 4–{total}" if len(chunks) > 1 else "בעמוד 4"
        pages = [page_one(cfg, total), page_ref(cfg, total), page_inventory(3, total)]
        custom_rows = cfg.get("custom_rows", 6 if key == "mu" else 14)
        pages += [page_spellbook_list(4 + i, total, spells, lv, i == 0, cfg, i == len(chunks) - 1, custom_rows)
                  for i, lv in enumerate(chunks)]
        return pages
    total = 3
    return [page_one(cfg, total), page_ref(cfg, total), page_inventory(3, total)]


def document(title, body, note):
    return f"""<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Assistant:wght@400;600;700&display=swap">
<style>
{CSS}
</style>
</head>
<body>
<div class="desk" dir="rtl" lang="he">
  <p class="screen-note">{note}</p>
{body}
</div>
</body>
</html>
"""


def print_note(pages):
    return (f'<a href="../printable_sheets.html">← חזרה לדפי הדמות</a><br>'
            f"{pages} עמודים בגודל A4. להדפסה: Ctrl+P ← גודל נייר A4, שוליים: ללא. "
            "להדפסה דו-צדדית: הפכו לאורך הצד הארוך.")


def main():
    OUT.mkdir(exist_ok=True)
    blank = sheet_pages(None)
    (OUT / "blank.html").write_text(
        document("דף דמות בייסיק פנטזי", "".join(blank), print_note(len(blank))),
        encoding="utf-8", newline="\n")
    print("wrote blank.html", len(blank), "pages")
    for key in ["fighter", "thief", "cleric", "mu"]:
        cfg = CLASSES[key]
        pages = sheet_pages(key)
        (OUT / cfg["file"]).write_text(
            document(f"דף דמות {cfg['name']}", "".join(pages), print_note(len(pages))),
            encoding="utf-8", newline="\n")
        print("wrote", cfg["file"], len(pages), "pages")
    import sys
    import extra_classes
    for key, cfg in extra_classes.build(sys.modules[__name__]).items():
        pages = sheet_pages(key, cfg)
        (OUT / cfg["file"]).write_text(
            document(f"דף דמות {cfg['name']}", "".join(pages), print_note(len(pages))),
            encoding="utf-8", newline="\n")
        print("wrote", cfg["file"], len(pages), "pages")


if __name__ == "__main__":
    main()
