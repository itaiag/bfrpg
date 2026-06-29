-- dice-he.lua — translate English dice notation to Hebrew, LTR-isolated.
-- 2d6+2 -> <span dir="ltr">2ק6+2</span>  (runs on the Hebrew build only)
--
-- The Hebrew die letter ק is a strong RTL character; sitting among LTR digits it
-- would be reordered by the bidi algorithm. Wrapping the whole expression in a
-- dir="ltr" span isolates it as one LTR run so it renders left-to-right.
local DIE = "ק"

-- Wrap the whole dice expression (count? + d + sides + optional ± modifier)
-- so the entire thing is one isolated LTR run.
local function wrap(count, sides, modifier)
  local html = '<span dir="ltr">' .. count .. DIE .. sides .. (modifier or "") .. '</span>'
  return pandoc.RawInline('html', html)
end

function Str(el)
  local s = el.text
  -- cheap pre-check; bail out if no "<digits>d<digits>" anywhere
  if not s:find("%f[%w]%d*d%d") then return nil end

  local out, pos = {}, 1
  while true do
    -- find next dice token: optional count, 'd', sides, optional +/- modifier
    local a, b, count, sides, modifier =
      s:find("%f[%w](%d*)d(%d+)([%+%-]%d+)", pos)
    if not a then
      a, b, count, sides = s:find("%f[%w](%d*)d(%d+)", pos)
      modifier = nil
    end
    if not a then break end
    if a > pos then table.insert(out, pandoc.Str(s:sub(pos, a - 1))) end
    table.insert(out, wrap(count, sides, modifier))
    pos = b + 1
  end
  if pos == 1 then return nil end                  -- nothing matched after all
  if pos <= #s then table.insert(out, pandoc.Str(s:sub(pos))) end
  return out
end
