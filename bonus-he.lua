-- bonus-he.lua — render unary +N / -N bonuses sign-on-left in the RTL Hebrew build.
--
-- In RTL Hebrew text the Unicode bidi algorithm reorders a leading sign, so "+2"
-- displays as "2+" (sign on the wrong side). Wrapping the signed number in a
-- dir="ltr" span isolates it as one LTR run, so it renders as "+2" / "-2" — the
-- Hebrew convention of the sign on the left. (This matches dice-he.lua's approach
-- and the project's existing ~280 uses of <span dir="ltr">.)
--
-- A sign is treated as a unary bonus only when it is NOT preceded by:
--   * a digit  → "3+2" (HD sum) or "3-7" (numeric range)        — left untouched
--   * a letter → "מ-3" / "בני-מחצית" (Hebrew prefix maqaf)       — left untouched (minus)
-- i.e. only a sign at a token boundary (start, or after "(" etc.) is wrapped.
-- This is what makes minus safe to auto-handle: every ambiguous minus (range or
-- maqaf) has a digit or letter on its left and is therefore skipped.
--
-- Code / OJS blocks are never visited (Pandoc gives this filter only Str nodes),
-- and dice modifiers are skipped for free (the sign there follows a digit).
--
-- Both the ASCII hyphen-minus and the typographic U+2212 MINUS SIGN are handled;
-- the sources mix them. U+2212 is multi-byte UTF-8, so (like × in dice-he.lua) it
-- needs its own pattern rather than a slot in the [%+%-] char set.

local MINUS = '\226\136\146'  -- U+2212 MINUS SIGN

local function atom(s)
  return pandoc.RawInline('html', '<span dir="ltr">' .. s .. '</span>')
end

-- True when the byte before position `a` "binds" the sign, meaning it is part of a
-- larger token (range / HD sum / maqaf prefix) rather than a unary bonus.
local function bound(s, a, sign)
  if a == 1 then return false end
  local c = s:byte(a - 1)
  if c >= 48 and c <= 57 then return true end                       -- digit (both signs)
  if c == 45 or c == 43 then
    -- another sign: only binds if this is a digit-rooted chain, e.g. "3--5"
    -- en-dash range. A sign preceded by a maqaf hyphen after a letter (e.g.
    -- "ו-+3") is NOT such a chain, so it must not be treated as bound.
    return s:sub(1, a - 1):find('%d[%+%-]+$') ~= nil
  end
  -- Only the ASCII hyphen doubles as a maqaf prefix ("מ-3"); U+2212 never does,
  -- so a letter to its left does not bind it ("ב־−1" is still a bonus).
  if sign == '-' then
    if c >= 128 then return true end                                -- UTF-8 (Hebrew) letter
    if (c >= 65 and c <= 90) or (c >= 97 and c <= 122) then return true end -- ASCII letter
  end
  return false
end

-- Next signed-number candidate at or after `pos`: ASCII +N/-N or U+2212 N,
-- whichever starts earlier.
local function nextSigned(s, pos)
  local a, b, sign, num = s:find('([%+%-])(%d+)', pos)
  local c, d, unum = s:find(MINUS .. '(%d+)', pos)
  if c and (not a or c < a) then return c, d, MINUS, unum end
  return a, b, sign, num
end

function Str(el)
  local s = el.text
  local out = {}
  local last, spos, changed = 1, 1, false
  while true do
    local a, b, sign, num = nextSigned(s, spos)
    if not a then break end
    if bound(s, a, sign) then
      spos = a + 1
    else
      if a > last then table.insert(out, pandoc.Str(s:sub(last, a - 1))) end
      table.insert(out, atom(sign .. num))
      last, spos, changed = b + 1, b + 1, true
    end
  end
  if not changed then return nil end
  if last <= #s then table.insert(out, pandoc.Str(s:sub(last))) end
  return out
end
