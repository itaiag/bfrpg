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

local function atom(s)
  return pandoc.RawInline('html', '<span dir="ltr">' .. s .. '</span>')
end

-- True when the byte before position `a` "binds" the sign, meaning it is part of a
-- larger token (range / HD sum / maqaf prefix) rather than a unary bonus.
local function bound(s, a, sign)
  if a == 1 then return false end
  local c = s:byte(a - 1)
  if c >= 48 and c <= 57 then return true end                       -- digit (both signs)
  if c == 45 or c == 43 then return true end                        -- another sign, e.g. "3--5" en-dash range
  if sign == '-' then
    if c >= 128 then return true end                                -- UTF-8 (Hebrew) letter
    if (c >= 65 and c <= 90) or (c >= 97 and c <= 122) then return true end -- ASCII letter
  end
  return false
end

function Str(el)
  local s = el.text
  local out = {}
  local last, spos, changed = 1, 1, false
  while true do
    local a, b, sign, num = s:find('([%+%-])(%d+)', spos)
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
