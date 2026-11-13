/**
 * Dungeon generator — every Hebrew string the page shows.
 * Kept apart from the logic so another language can be added as one more file.
 * Terms follow translator/glossary.json.
 */
export const t = {
  form: {
    size: 'גודל המבוך',
    sizes: {
      small: 'קטן (8 חדרים במפלס)',
      medium: 'בינוני (15 חדרים במפלס)',
      large: 'גדול (25 חדרים במפלס)',
    },
    levels: 'מספר מפלסים',
    partyCount: 'מספר הדמויות',
    partyLevel: 'דרגה ממוצעת',
    classes: 'מקצועות בחבורה',
    classNames: { fighter: 'לוחם', cleric: 'כוהן', magicUser: 'קוסם', thief: 'גנב' },
    seed: 'קוד מבוך',
    seedHint: 'ריק = מבוך חדש',
    generate: 'צרי מבוך',
  },
  seedUsed: 'קוד המבוך (הזיני אותו שוב כדי לקבל את אותו מבוך):',
  level: {
    titleOne: 'מפת המבוך (דרגת מבוך {dl})',
    titleMany: 'מפלס {n} (דרגת מבוך {dl})',
  },
  doors: {
    door: 'דלת',
    stuck: 'דלת תקועה',
    locked: 'דלת נעולה',
    secret: 'דלת סודית',
    arch: 'מעבר פתוח',
  },
  legend: {
    stairsUp: 'מדרגות למעלה',
    stairsDown: 'מדרגות למטה',
    scale: "כל משבצת היא 3 מ'. לחיצה על חדר במפה מקפיצה אל התיאור שלו.",
  },
  directions: { north: 'צפון', south: 'דרום', east: 'מזרח', west: 'מערב' },
  features: {
    entrance: 'הכניסה למבוך: מדרגות אל פני השטח',
    stairsUp: 'מדרגות למעלה אל מפלס {level}',
    stairsDown: 'מדרגות למטה אל מפלס {level}',
  },
  card: {
    room: 'חדר {n}',
    size: "{w} × {h} מ'",
    exits: 'יציאות',
    leadsToOne: 'אל חדר {rooms}',
    leadsToMany: 'אל חדרים {rooms}',
  },
};
