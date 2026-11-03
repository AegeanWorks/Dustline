from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:5173/'

def box_of(pg):
    return pg.evaluate("() => { const c = document.getElementById('game'); const r = c.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }")

def gclick(pg, box, gx, gy):
    pg.mouse.click(box['x'] + gx / 960 * box['w'], box['y'] + gy / 600 * box['h'])

with sync_playwright() as p:
    b = p.chromium.launch()
    # desktop states
    pg = b.new_page(viewport={'width': 1100, 'height': 750})
    pg.goto(URL, wait_until='networkidle')
    pg.wait_for_timeout(900)
    box = box_of(pg)
    gclick(pg, box, 480, 267)  # play -> setup (tab 0 arsenal)
    pg.wait_for_timeout(700)
    pg.screenshot(path='shots/s4-setup-default.png')
    # weapon: RAILGUN is 5th card: x=36+4*178=748 center 833, y=128+36=164
    gclick(pg, box, 833, 164)
    pg.wait_for_timeout(400)
    pg.screenshot(path='shots/s4-setup-weapon.png')
    # operator: ARCANIST 6th (row 2): x=36+2*298=632 center 777, y=300+30=330
    gclick(pg, box, 777, 330)
    pg.wait_for_timeout(400)
    pg.screenshot(path='shots/s4-setup-operator.png')
    # tab 1 field, then map: GLASS WASTES 7th: x=808 center 870, y=130+36=166
    gclick(pg, box, 476, 82)
    pg.wait_for_timeout(400)
    gclick(pg, box, 870, 166)
    pg.wait_for_timeout(400)
    pg.screenshot(path='shots/s4-setup-map.png')
    # tab 2 rules, then mutators + mutation: GLASS (36,130) c182,162; SWARM (336,130) c482,162
    gclick(pg, box, 772, 82)
    pg.wait_for_timeout(400)
    gclick(pg, box, 182, 162)
    pg.wait_for_timeout(250)
    gclick(pg, box, 482, 162)
    pg.wait_for_timeout(250)
    # mutation: OVERCLOCK 4th: x=36+3*178=570 center 656, y=304+28=332
    gclick(pg, box, 656, 332)
    pg.wait_for_timeout(400)
    pg.screenshot(path='shots/s4-setup-mutators.png')
    print('desktop states ok')
    pg.close()
    # small screen
    ps = b.new_page(viewport={'width': 390, 'height': 700})
    ps.goto(URL, wait_until='networkidle')
    ps.wait_for_timeout(900)
    box = box_of(ps)
    ps.mouse.click(box['x'] + 480 / 960 * box['w'], box['y'] + 267 / 600 * box['h'])
    ps.wait_for_timeout(700)
    ps.screenshot(path='shots/s4-setup-small.png')
    print('small ok')
    ps.close()
    # touch / mobile in-run controls
    ctx = b.new_context(viewport={'width': 390, 'height': 700}, has_touch=True, is_mobile=True)
    pt = ctx.new_page()
    pt.goto(URL, wait_until='networkidle')
    pt.wait_for_timeout(900)
    box = box_of(pt)
    pt.touchscreen.tap(box['x'] + 480 / 960 * box['w'], box['y'] + 267 / 600 * box['h'])
    pt.wait_for_timeout(700)
    pt.screenshot(path='shots/s4-setup-touch.png')
    # deploy via tap (DEPLOY footer y470 h40 -> center 490)
    pt.touchscreen.tap(box['x'] + 480 / 960 * box['w'], box['y'] + 490 / 600 * box['h'])
    pt.wait_for_timeout(2500)
    pt.screenshot(path='shots/s4-game-touch.png')
    print('touch ok')
    ctx.close()
    b.close()
