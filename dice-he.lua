-- dice-he.lua — render dice notation in Hebrew, LTR-isolated.
--   2d6+2  -> <span dir="ltr">2ק6+2</span>   (English source: d -> ק)
--   2ק6+2  -> <span dir="ltr">2ק6+2</span>   (already-Hebrew source: just isolate)
--
-- Runs on the Hebrew build only. The Hebrew die letter ק is a strong RTL
-- character; among LTR digits the bidi algorithm reorders it (2ק6 -> "26ק").
-- Wrapping the whole expression in a dir="ltr" span isolates it as one LTR run
-- so it renders left-to-right. Source files mix both forms, so we handle both.
local DIE = "ק"

-- Candidate patterns, tried at each position; the earliest (then longest) wins.
--  d-form: count optional, guarded by %f[%w] so it can't start mid-word (and so
--          a bare d20 still matches, since 'd' is a word char).
--  ק-form: count required (a digit on each side of ק) so we never match the
--          very common Hebrew letter ק inside ordinary words.
local PATTERNS = {
  "%f[%w](%d*)d(%d+)([%+%-]%d+)",
  "%f[%w](%d*)d(%d+)",
  "(%d+)ק(%d+)([%+%-]%d+)",
  "(%d+)ק(%d+)",
  "%f[%w](%d*)d(%%)",   -- percentile die: d% -> ק%
  "(%d*)ק(%%)",         -- already-Hebrew percentile: ק%
}

local function nextDice(s, pos)
  local best
  for _, pat in ipairs(PATTERNS) do
    local a, b, count, sides, modifier = s:find(pat, pos)
    if a and (not best or a < best.a or (a == best.a and b > best.b)) then
      best = { a = a, b = b, count = count, sides = sides, modifier = modifier }
    end
  end
  return best
end

local function atom(s)
  -- An isolated LTR atom: keeps multi-digit numbers / +modifier internally LTR
  -- (100 stays 100, not 001) while acting as a single unit for ordering.
  return '<span dir="ltr">' .. s .. '</span>'
end

local function wrap(count, sides, modifier)
  -- Emit count, ק, sides and modifier as SEPARATE atoms in that source order. The
  -- .dice container is RTL (see custom-rtl.css), so it flips the token order
  -- visually: count on the right (read first in Hebrew), then ק, then sides, then
  -- modifier on the left. Each number atom stays internally LTR. Sides and modifier
  -- must be separate — grouping them ("8+2") puts the modifier digit next to ק and
  -- reads as a swapped 9d2+8 instead of 9d8+2.
  local parts = {}
  if count ~= '' then parts[#parts + 1] = atom(count) end
  parts[#parts + 1] = DIE
  parts[#parts + 1] = atom(sides)
  if modifier and modifier ~= '' then
    -- Split the modifier into its sign and number as separate atoms. Read RTL the
    -- sign must come right after the sides and the number on the far left, so that
    -- +1 reads as "+1" (not "1+") and +10 keeps its digits (not "01").
    parts[#parts + 1] = '<span class="mod" dir="ltr">' .. modifier:sub(1, 1) .. '</span>'
    parts[#parts + 1] = atom(modifier:sub(2))
  end
  local html = '<span class="dice">' .. table.concat(parts) .. '</span>'
  return pandoc.RawInline('html', html)
end

function Str(el)
  local s = el.text
  local out, pos = {}, 1
  while true do
    local m = nextDice(s, pos)
    if not m then break end
    if m.a > pos then table.insert(out, pandoc.Str(s:sub(pos, m.a - 1))) end
    table.insert(out, wrap(m.count, m.sides, m.modifier))
    pos = m.b + 1
  end
  if pos == 1 then return nil end                  -- nothing matched; leave as-is
  if pos <= #s then table.insert(out, pandoc.Str(s:sub(pos))) end
  return out
end
